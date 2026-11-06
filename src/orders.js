import { UserError, clean, todayStr, nowHm, nowStamp, isDate, isHm, weekday, parseClosed, rid, imgUrl, isTrue, byOrder } from './util.js';
import { needAll } from './service.js';
import { settings, walletOf, currentSub, consumedOf } from './members.js';

/**
 * 訂餐（2026-11-06，草圖 m37）：order.html 是唯一的訂餐入口，會員自己訂與店員代訂共用同一套規則。
 * - 訂閱：每時段 1 份，預約時扣 1 餐；升級差額與加購在截單時從錢包扣（不夠就改回基本餐、取消加購）。
 * - 單點：可多份，預約當下從錢包扣單點價（先扣紅利）；截單前取消全額退回（紅利退回紅利）。
 * - 截單：前一天「截單時間」後鎖定；公休日不能訂；每天中午／晚上份數上限（訂閱＋單點合計）。
 * - 取餐：已取餐／未取餐作廢（照常扣）／店家補償（訂閱加回 1 餐、單點退回錢包）。
 * - 推薦：新會員「已取餐」滿 N 餐，推薦人得紅利（每月上限 M 人）。
 */
const SHOP = 'h1', SLOTS = ['中午', '晚上'];
const num = (v, d) => { const s = String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim(); const n = Number(s); return s === '' || isNaN(n) ? d : n; };
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const LIVE = ['已預約', '已鎖定', '已取餐', '未取餐作廢'];

function rules(st) {
  const cut = isHm(String(st['截單時間'] || '')) ? String(st['截單時間']) : '20:00';
  const today = todayStr(), lockDate = nowHm() >= cut ? addDays(today, 1) : today; // 這一天（含）以前都已鎖定
  return {
    cut, today, lockDate, maxDays: num(st['可預約天數'], 14), closed: parseClosed(st['公休日'] || '週三'),
    cap: { 中午: num(st['中午份數上限'], 0), 晚上: num(st['晚上份數上限'], 0) },
    pickup: { 中午: String(st['中午自取時段'] || '11:30-13:30'), 晚上: String(st['晚上自取時段'] || '17:30-19:30') },
    refN: num(st['推薦發放取餐數'], 3), refCap: num(st['推薦每月上限人數'], 10), refReward: num(st['推薦人獎勵'], 0)
  };
}
async function menu(c) {
  const items = (await c.db.all('健康餐品項', { 店家ID: SHOP })).filter((r) => isTrue(r['顯示'])).sort(byOrder);
  const addons = (await c.db.all('加購品項', { 店家ID: SHOP })).filter((r) => isTrue(r['顯示'])).sort(byOrder);
  return { items, addons };
}
async function ledgerAdd(c, memberId, type, amount, o) {
  await c.db.insert('錢包紀錄', Object.assign({ 紀錄ID: 'W' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: memberId, 時間: nowStamp(), 類型: type, 金額: amount, 可退現金: true, 狀態: '已入帳' }, o || {}));
}
async function slotCounts(c, from, to) {
  const r = await c.env.DB.prepare("SELECT date, slot, SUM(qty) AS n FROM reservations WHERE date >= ? AND date <= ? AND status IN ('已預約','已鎖定','已取餐','未取餐作廢') GROUP BY date, slot").bind(from, to).all();
  const m = {}; (r.results || []).forEach((x) => { m[x.date + '|' + x.slot] = x.n; });
  return m;
}

/* ---------- 截單：鎖定已過截單時間的預約；訂閱的升級與加購從錢包扣 ---------- */
export async function runCutoff(c) {
  const st = await settings(c), R = rules(st);
  const rows = (await c.db.all('預約', { 狀態: '已預約' })).filter((r) => String(r['日期']) <= R.lockDate);
  await runExpiry(c);
  if (!rows.length) return 0;
  const { items } = await menu(c);
  const base = items.find((i) => !num(i['訂閱加價'], 0)) || items[0];
  for (const r of rows.sort((a, b) => a._row - b._row)) {
    const upd = { 狀態: '已鎖定', 修改時間: nowStamp() };
    if (r['類別'] === '訂閱') {
      const due = num(r['升級差額'], 0) + num(r['加購金額'], 0);
      if (due > 0) {
        const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: r['會員ID'] }));
        if (wal.total >= due) {
          await ledgerAdd(c, r['會員ID'], '升級加購扣款', -due, { 對應ID: r['預約ID'], 經手人員: '系統', 備註: r['日期'] + ' ' + r['時段'] + '：' + r['份量'] + ' ' + r['主菜'] + (r['加購項目'] ? '＋加購' : '') });
          upd['扣款狀態'] = '已扣款';
        } else {
          Object.assign(upd, { 份量: base['份量'], 主菜: base['主菜'], 品項ID: base['品項ID'], 單點原價: num(base['單點價'], 0), 升級差額: 0, 加購金額: 0, 加購項目: '', 扣款狀態: '餘額不足改回基本餐', 備註: (r['備註'] ? r['備註'] + '；' : '') + '截單時錢包不足 ' + due + ' 元，改回基本餐' });
        }
      } else upd['扣款狀態'] = '已扣款';
    }
    await c.db.update('預約', r._row, upd);
  }
  return rows.length;
}

/* ---------- 結算：中途取消或到期 ---------- */
export async function settlePreview(c, sub) {
  const used = await consumedOf(c, sub['訂閱ID']), paid = Number(sub['實付金額']) || 0, by = {};
  used.rows.forEach((r) => { const k = r['份量'] + ' ' + r['主菜'] + '|' + (Number(r['單點原價']) || 0); by[k] = (by[k] || 0) + 1; });
  const open = (await c.db.all('預約', { 訂閱ID: sub['訂閱ID'] })).filter((r) => r['狀態'] === '已預約').length;
  return { subId: sub['訂閱ID'], paid, usedN: used.n, used: used.value, detail: Object.keys(by).map((k) => ({ item: k.split('|')[0], price: Number(k.split('|')[1]), n: by[k] })), open, amount: Math.max(0, paid - used.value) };
}
async function settle(c, sub, status, method, by, reason) {
  for (const r of (await c.db.all('預約', { 訂閱ID: sub['訂閱ID'] })).filter((x) => x['狀態'] === '已預約')) await c.db.update('預約', r._row, { 狀態: '已取消', 修改時間: nowStamp(), 備註: (r['備註'] ? r['備註'] + '；' : '') + '方案' + status + '，自動取消' });
  const pv = await settlePreview(c, sub);
  await c.db.update('訂閱', sub._row, { 狀態: status, 剩餘餐數: 0, 結算金額: pv.amount, 結算方式: method, 備註: (sub['備註'] ? sub['備註'] + '；' : '') + status + '結算：實付 ' + pv.paid + ' − 已用 ' + pv.used + '（' + pv.usedN + ' 餐）＝ ' + pv.amount + (reason ? '（' + reason + '）' : '') + ' by ' + by });
  if (pv.amount > 0) {
    await ledgerAdd(c, sub['會員ID'], '退款轉入', pv.amount, { 可退現金: true, 對應ID: sub['訂閱ID'], 經手人員: by, 備註: '方案' + status + '結算' });
    if (method === '退現金') await ledgerAdd(c, sub['會員ID'], '退現金', -pv.amount, { 對應ID: sub['訂閱ID'], 經手人員: by, 備註: '方案' + status + '結算直接退現金' + (reason ? '：' + reason : '') });
  }
  return pv;
}
/** 到期沒續訂：到期日隔天自動結算，餘額轉入錢包 */
export async function runExpiry(c) {
  const today = todayStr(); let n = 0;
  for (const s of (await c.db.all('訂閱', { 狀態: '使用中' })).filter((x) => x['到期日'] && String(x['到期日']) < today)) { await settle(c, s, '已到期', '轉入錢包', '系統', ''); n++; }
  return n;
}

/* ---------- 訂餐畫面資料 ---------- */
async function orderInfo(c, m) {
  await runCutoff(c);
  const st = await settings(c), R = rules(st), { items, addons } = await menu(c);
  const first = addDays(R.lockDate, 1), last = addDays(R.today, R.maxDays);
  const cnt = await slotCounts(c, first, last), days = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const closed = R.closed.indexOf(weekday(d)) >= 0;
    days.push({ date: d, wd: weekday(d), closed, slots: SLOTS.map((s) => ({ slot: s, pickup: R.pickup[s], left: R.cap[s] ? Math.max(0, R.cap[s] - (cnt[d + '|' + s] || 0)) : null })) });
  }
  const subs = await c.db.all('訂閱', { 會員ID: m['會員ID'] }), sub = currentSub(subs);
  const mine = (await c.db.all('預約', { 會員ID: m['會員ID'] })).filter((r) => r['狀態'] !== '已取消' && String(r['日期']) >= R.today);
  return {
    member: { id: m['會員ID'], name: m['姓名'] },
    wallet: walletOf(await c.db.all('錢包紀錄', { 會員ID: m['會員ID'] })),
    sub: sub ? { id: sub['訂閱ID'], left: sub['剩餘餐數'], meals: sub['方案餐數'], start: sub['開始日'], end: sub['到期日'], status: sub['狀態'] } : null,
    cutoff: R.cut, days,
    items: items.map((i) => ({ id: i['品項ID'], size: i['份量'], main: i['主菜'], mainDesc: i['主菜內容'], name: i['品名'], desc: i['介紹'], kcal: num(i['熱量'], 0), protein: num(i['蛋白質'], 0), carb: num(i['碳水'], 0), fat: num(i['脂肪'], 0), price: num(i['單點價'], 0), upg: num(i['訂閱加價'], 0), image: imgUrl(i['圖片網址']) })),
    sauces: addons.filter((a) => a['類型'] === '醬汁' && (a['名稱'] !== '松露醬' || isTrue(st['松露醬開放']))).map((a) => ({ id: a['品項ID'], name: a['名稱'], price: isTrue(a['免費']) ? 0 : num(a['加購價'], 0) })),
    drinks: addons.filter((a) => a['類型'] === '飲品' && num(a['加購價'], null) !== null).map((a) => ({ id: a['品項ID'], name: a['名稱'], price: num(a['加購價'], 0), protein: num(a['蛋白質'], 0), image: imgUrl(a['圖片網址']) })),
    mine: mine.map(resView).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot))
  };
}
function resView(r) {
  return { id: r['預約ID'], date: String(r['日期']), slot: r['時段'], kind: r['類別'], qty: num(r['份數'], 1), size: r['份量'], main: r['主菜'], itemId: r['品項ID'], sauce: r['醬汁'], addons: r['加購項目'], upg: num(r['升級差額'], 0), addonAmt: num(r['加購金額'], 0), paid: num(r['付款金額'], 0), status: r['狀態'], charge: r['扣款狀態'], note: r['備註'] };
}

/* ---------- 訂餐 ---------- */
async function createOrder(c, m, p, by) {
  await runCutoff(c);
  const st = await settings(c), R = rules(st), { items, addons } = await menu(c);
  const date = clean(p.date, 10), slot = clean(p.slot, 4), kind = p.kind === '單點' ? '單點' : '訂閱';
  if (!isDate(date)) throw new UserError('請選擇日期');
  if (SLOTS.indexOf(slot) < 0) throw new UserError('請選擇中午或晚上');
  if (date <= R.lockDate) throw new UserError(date <= R.today ? '不能預約今天以前的餐' : '已經過了截單時間（前一天 ' + R.cut + '），請改訂後天以後');
  if (date > addDays(R.today, R.maxDays)) throw new UserError('最多只能預約 ' + R.maxDays + ' 天內的餐');
  if (R.closed.indexOf(weekday(date)) >= 0) throw new UserError('這天公休');
  const it = items.find((i) => i['品項ID'] === clean(p.itemId, 30));
  if (!it) throw new UserError('請選擇便當');
  const sauce = addons.find((a) => a['類型'] === '醬汁' && a['品項ID'] === clean(p.sauce, 30) && (a['名稱'] !== '松露醬' || isTrue(st['松露醬開放'])));
  if (!sauce) throw new UserError('請選擇醬汁');
  const drinks = [...new Set((Array.isArray(p.addons) ? p.addons : []).map((x) => clean(x, 30)))].map((id) => addons.find((a) => a['類型'] === '飲品' && a['品項ID'] === id && num(a['加購價'], null) !== null));
  if (drinks.some((d) => !d)) throw new UserError('加購品項不存在或尚未開放');
  const qty = kind === '單點' ? Math.floor(num(p.qty, 1)) : 1;
  if (!(qty >= 1 && qty <= 20)) throw new UserError('份數請填 1～20');
  const addonUnit = (isTrue(sauce['免費']) ? 0 : num(sauce['加購價'], 0)) + drinks.reduce((s, d) => s + num(d['加購價'], 0), 0);
  if (R.cap[slot]) {
    const used = (await slotCounts(c, date, date))[date + '|' + slot] || 0;
    if (used + qty > R.cap[slot]) throw new UserError('這個時段只剩 ' + Math.max(0, R.cap[slot] - used) + ' 份，請改其他時段');
  }
  const resId = 'B' + Date.now().toString(36).toUpperCase() + rid(3), price = num(it['單點價'], 0);
  const row = { 預約ID: resId, 會員ID: m['會員ID'], 日期: date, 時段: slot, 取餐方式: '自取', 份量: it['份量'], 主菜: it['主菜'], 品項ID: it['品項ID'], 醬汁: sauce['名稱'], 加購項目: drinks.map((d) => d['品項ID']).join(','), 單點原價: price, 類別: kind, 份數: qty, 狀態: '已預約', 建立時間: nowStamp(), 建立者: by, 備註: drinks.length ? '加購：' + drinks.map((d) => d['名稱']).join('、') : '' };
  if (kind === '訂閱') {
    const subs = await c.db.all('訂閱', { 會員ID: m['會員ID'] }), sub = currentSub(subs);
    if (!sub || sub['狀態'] !== '使用中') throw new UserError('沒有使用中的方案，可以改用單點');
    if (date < String(sub['開始日']) || date > String(sub['到期日'])) throw new UserError('這天不在方案期間（' + sub['開始日'] + '～' + sub['到期日'] + '）');
    if (num(sub['剩餘餐數'], 0) < 1) throw new UserError('方案的餐數已經用完，可以改用單點');
    if ((await c.db.all('預約', { 會員ID: m['會員ID'], 日期: date, 時段: slot, 類別: '訂閱' })).some((r) => r['狀態'] !== '已取消')) throw new UserError('這個時段已經用方案訂過一份了（要多訂請用單點）');
    Object.assign(row, { 訂閱ID: sub['訂閱ID'], 升級差額: num(it['訂閱加價'], 0), 加購金額: addonUnit, 扣款狀態: '未扣款' });
    await c.db.insert('預約', row);
    await c.env.DB.prepare('UPDATE subscriptions SET remaining = remaining - 1 WHERE sub_id = ? AND remaining > 0').bind(sub['訂閱ID']).run();
  } else {
    const total = (price + addonUnit) * qty, wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: m['會員ID'] }));
    if (wal.total < total) throw new UserError('錢包餘額不足：需要 ' + total.toLocaleString() + ' 元，目前 ' + wal.total.toLocaleString() + ' 元');
    Object.assign(row, { 訂閱ID: '', 升級差額: 0, 加購金額: addonUnit * qty, 付款金額: total, 用掉紅利: Math.min(wal.bonus, total), 扣款狀態: '已扣款' });
    await c.db.insert('預約', row);
    await ledgerAdd(c, m['會員ID'], '單點扣款', -total, { 對應ID: resId, 經手人員: by, 備註: date + ' ' + slot + '：' + it['份量'] + ' ' + it['主菜'] + ' ×' + qty });
  }
  return { ok: true, resId };
}

/** 退回：訂閱加回 1 餐；單點退回錢包（用掉的紅利退回紅利） */
async function giveBack(c, r, why, by) {
  if (r['類別'] === '訂閱') {
    if (r['訂閱ID']) await c.env.DB.prepare('UPDATE subscriptions SET remaining = remaining + 1 WHERE sub_id = ?').bind(r['訂閱ID']).run();
    if (r['扣款狀態'] === '已扣款') { const paid = num(r['升級差額'], 0) + num(r['加購金額'], 0); if (paid > 0) await ledgerAdd(c, r['會員ID'], '退款轉入', paid, { 可退現金: true, 對應ID: r['預約ID'], 經手人員: by, 備註: why + '：退回升級加購' }); }
    return;
  }
  const paid = num(r['付款金額'], 0), bonus = Math.min(num(r['用掉紅利'], 0), paid);
  if (bonus > 0) await ledgerAdd(c, r['會員ID'], '退款轉入', bonus, { 可退現金: false, 對應ID: r['預約ID'], 經手人員: by, 備註: why + '（紅利）' });
  if (paid - bonus > 0) await ledgerAdd(c, r['會員ID'], '退款轉入', paid - bonus, { 可退現金: true, 對應ID: r['預約ID'], 經手人員: by, 備註: why });
}
async function cancelOrder(c, m, resId, by) {
  await runCutoff(c);
  const r = await c.db.first('預約', { 預約ID: clean(resId, 30) });
  if (!r || (m && r['會員ID'] !== m['會員ID'])) throw new UserError('找不到這筆預約');
  if (r['狀態'] !== '已預約') throw new UserError(r['狀態'] === '已取消' ? '這筆已經取消了' : '已經截單鎖定，不能取消（請洽門市）');
  await c.db.update('預約', r._row, { 狀態: '已取消', 修改時間: nowStamp(), 備註: (r['備註'] ? r['備註'] + '；' : '') + '取消 by ' + by });
  await giveBack(c, r, '取消預約', by);
  return { ok: true };
}

/* ---------- 推薦紅利：新會員已取餐滿 N 餐 ---------- */
async function checkReferral(c, memberId, R) {
  const ref = await c.db.first('推薦紀錄', { 新會員ID: memberId });
  if (!ref || ref['狀態'] !== '等待中') return;
  const picked = (await c.db.all('預約', { 會員ID: memberId, 狀態: '已取餐' })).filter((r) => r['類別'] === '訂閱').length;
  const upd = { 新會員已取餐數: picked };
  if (picked >= R.refN) {
    const month = todayStr().slice(0, 7);
    const done = (await c.db.all('推薦紀錄', { 推薦人會員ID: ref['推薦人會員ID'], 計入月份: month })).filter((x) => x['狀態'] === '已發放').length;
    const reward = num(ref['獎勵金額'], 0) || R.refReward;
    Object.assign(upd, { 計入月份: month, 發放日期: todayStr(), 狀態: done >= R.refCap ? '超過上限' : '已發放' });
    if (done < R.refCap && reward > 0) await ledgerAdd(c, ref['推薦人會員ID'], '推薦紅利', reward, { 可退現金: false, 對應ID: ref['紀錄ID'], 經手人員: '系統', 備註: '推薦 ' + memberId + ' 取餐滿 ' + R.refN + ' 餐' });
  }
  await c.db.update('推薦紀錄', ref._row, upd);
}

/* ---------- 前台（會員，用 cookie） ---------- */
export const orderMemberApi = {
  orderInfo: (c, m) => orderInfo(c, m),
  orderCreate: (c, m, p) => createOrder(c, m, p, '會員'),
  orderCancel: (c, m, p) => cancelOrder(c, m, p.resId, '會員')
};

/* ---------- 後台 ---------- */
export const orderOps = {
  async adminOrderInfo(c, p, a) { needAll(a); const m = await c.db.first('會員', { 會員ID: clean(p.memberId, 30) }); if (!m || m['狀態'] !== '正常') throw new UserError('找不到這位會員'); return orderInfo(c, m); },
  async adminOrderCreate(c, p, a) { needAll(a); const m = await c.db.first('會員', { 會員ID: clean(p.memberId, 30) }); if (!m || m['狀態'] !== '正常') throw new UserError('找不到這位會員'); return createOrder(c, m, p, a.email); },
  /** 測試用：直接記一筆「今天已取餐」的訂閱餐（扣 1 餐），用來測試推薦紅利與結算 */
  async adminTestMeal(c, p, a) {
    needAll(a);
    const m = await c.db.first('會員', { 會員ID: clean(p.memberId, 30) }); if (!m) throw new UserError('找不到這位會員');
    const sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] }));
    if (!sub || sub['狀態'] !== '使用中') throw new UserError('這位會員沒有使用中的方案');
    if (num(sub['剩餘餐數'], 0) < 1) throw new UserError('方案餐數已用完');
    const { items } = await menu(c), base = items.find((i) => !num(i['訂閱加價'], 0)) || items[0];
    const resId = 'T' + Date.now().toString(36).toUpperCase() + rid(3);
    await c.db.insert('預約', { 預約ID: resId, 會員ID: m['會員ID'], 訂閱ID: sub['訂閱ID'], 日期: todayStr(), 時段: '測試-' + rid(4), 取餐方式: '自取', 份量: base['份量'], 主菜: base['主菜'], 品項ID: base['品項ID'], 醬汁: '', 單點原價: num(base['單點價'], 0), 類別: '訂閱', 份數: 1, 升級差額: 0, 加購金額: 0, 扣款狀態: '已扣款', 狀態: '已取餐', 取餐時間: nowStamp(), 建立時間: nowStamp(), 建立者: a.email, 備註: '測試：已用餐＋1' });
    await c.env.DB.prepare('UPDATE subscriptions SET remaining = remaining - 1 WHERE sub_id = ? AND remaining > 0').bind(sub['訂閱ID']).run();
    await checkReferral(c, m['會員ID'], rules(await settings(c)));
    const ref = await c.db.first('推薦紀錄', { 新會員ID: m['會員ID'] });
    return { ok: true, picked: ref ? num(ref['新會員已取餐數'], 0) : null, refStatus: ref ? ref['狀態'] : '' };
  },
  async adminSettlePreview(c, p, a) { needAll(a); const sub = currentSub(await c.db.all('訂閱', { 會員ID: clean(p.memberId, 30) })); if (!sub) throw new UserError('沒有使用中的方案'); return settlePreview(c, sub); },
  async adminCancelPlan(c, p, a) {
    needAll(a); await runCutoff(c);
    const sub = currentSub(await c.db.all('訂閱', { 會員ID: clean(p.memberId, 30) })), method = p.method === '退現金' ? '退現金' : '轉入錢包', reason = clean(p.reason, 200);
    if (!sub) throw new UserError('沒有使用中的方案'); if (!reason) throw new UserError('請填寫取消原因');
    return settle(c, sub, '已取消', method, a.email, reason);
  },
  async adminOrderCancel(c, p, a) { needAll(a); return cancelOrder(c, null, p.resId, a.email); },
  /** 某一天的預約、備餐統計，以及前後幾天的份數 */
  async adminDay(c, p, a) {
    needAll(a);
    await runCutoff(c);
    const st = await settings(c), R = rules(st), date = isDate(String(p.date || '')) ? String(p.date) : addDays(R.today, 1);
    const from = addDays(R.today, -1), to = addDays(R.today, 13), cnt = await slotCounts(c, from, to), strip = [];
    for (let d = from; d <= to; d = addDays(d, 1)) strip.push({ date: d, wd: weekday(d), closed: R.closed.indexOf(weekday(d)) >= 0, n: (cnt[d + '|中午'] || 0) + (cnt[d + '|晚上'] || 0) });
    const [rows, ms, adds] = await Promise.all([c.db.all('預約', { 日期: date }), c.db.all('會員'), c.db.all('加購品項', { 店家ID: SHOP })]);
    const name = {}; ms.forEach((x) => { name[x['會員ID']] = x['姓名'] + '（' + x['手機'] + '）'; });
    const an = {}; adds.forEach((x) => { an[x['品項ID']] = x['名稱']; });
    const live = rows.filter((r) => r['狀態'] !== '已取消');
    const prep = {}; const drinks = {};
    live.filter((r) => r['狀態'] !== '店家補償').forEach((r) => {
      const k = r['時段'] + '|' + r['份量'] + ' ' + r['主菜'], q = num(r['份數'], 1);
      prep[k] = prep[k] || { slot: r['時段'], item: r['份量'] + ' ' + r['主菜'], n: 0, sauce: {} };
      prep[k].n += q; prep[k].sauce[r['醬汁']] = (prep[k].sauce[r['醬汁']] || 0) + q;
      String(r['加購項目'] || '').split(',').filter(Boolean).forEach((id) => { const dk = r['時段'] + '|' + (an[id] || id); drinks[dk] = (drinks[dk] || 0) + q; });
    });
    return {
      date, wd: weekday(date), locked: date <= R.lockDate, closed: R.closed.indexOf(weekday(date)) >= 0, cutoff: R.cut, cap: R.cap, pickup: R.pickup, strip,
      prep: Object.values(prep).sort((x, y) => (x.slot + x.item).localeCompare(y.slot + y.item)),
      drinks: Object.keys(drinks).map((k) => ({ slot: k.split('|')[0], name: k.split('|')[1], n: drinks[k] })),
      list: live.map((r) => Object.assign(resView(r), { member: name[r['會員ID']] || r['會員ID'], memberId: r['會員ID'], addonNames: String(r['加購項目'] || '').split(',').filter(Boolean).map((id) => an[id] || id).join('、'), by: r['建立者'] })).sort((x, y) => (x.slot + x.id).localeCompare(y.slot + y.id))
    };
  },
  /** 取餐標記：已取餐／未取餐作廢／店家補償（補償要原因；訂閱加回 1 餐、單點退回錢包） */
  async adminMarkPickup(c, p, a) {
    needAll(a);
    await runCutoff(c);
    const r = await c.db.first('預約', { 預約ID: clean(p.resId, 30) }), to = clean(p.status, 10), reason = clean(p.reason, 200);
    if (!r) throw new UserError('找不到這筆預約');
    if (['已取餐', '未取餐作廢', '店家補償'].indexOf(to) < 0) throw new UserError('狀態不正確');
    if (r['狀態'] === '已取消' || r['狀態'] === '店家補償') throw new UserError('這筆是「' + r['狀態'] + '」，不能再改');
    if (r['狀態'] === '已預約') throw new UserError('還沒截單，不能標記取餐');
    if (String(r['日期']) > todayStr()) throw new UserError('取餐日還沒到');
    if (to === '店家補償' && !reason) throw new UserError('店家補償請填寫原因');
    await c.db.update('預約', r._row, { 狀態: to, 取餐時間: to === '已取餐' ? nowStamp() : '', 修改時間: nowStamp() });
    if (to === '店家補償') {
      await giveBack(c, r, '店家補償', a.email);
      await c.db.insert('補償紀錄', { 紀錄ID: 'C' + Date.now().toString(36).toUpperCase() + rid(3), 預約ID: r['預約ID'], 會員ID: r['會員ID'], 原因: reason, 處理方式: r['類別'] === '訂閱' ? '加回 1 餐' : '退回錢包', 處理人員: a.email, 時間: nowStamp() });
    }
    await checkReferral(c, r['會員ID'], rules(await settings(c)));
    return { ok: true };
  }
};
