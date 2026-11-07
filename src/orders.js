import { UserError, clean, todayStr, nowHm, nowStamp, isDate, isHm, weekday, parseClosed, rid, imgUrl, isTrue, byOrder } from './util.js';
import { needAll } from './service.js';
import { settings, walletOf, walletFull, currentSub, consumedOf, subUpg } from './members.js';

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

export function rules(st) {
  const cut = isHm(String(st['截單時間'] || '')) ? String(st['截單時間']) : '20:00';
  const today = todayStr(), lockDate = nowHm() >= cut ? addDays(today, 1) : today; // 這一天（含）以前都已鎖定
  return {
    cut, today, lockDate, maxDays: num(st['可預約天數'], 14), closed: parseClosed(st['公休日'] || '週三'),
    cap: { 中午: num(st['中午份數上限'], 0), 晚上: num(st['晚上份數上限'], 0) },
    pickup: { 中午: String(st['中午自取時段'] || '11:30-13:30'), 晚上: String(st['晚上自取時段'] || '17:30-19:30') },
    refN: num(st['推薦發放取餐數'], 3), refCap: num(st['推薦每月上限人數'], 10), refReward: num(st['推薦人獎勵'], 0)
  };
}
/** 配送門檻：依距離分級（設定「配送門檻_*」「配送最遠公里」）；超過最遠距離回 null */
export function feeOf(st, km) { km = Number(km) || 0; return km <= 2 ? num(st['配送費_2公里內'], 30) : km <= 5 ? num(st['配送費_2至5公里'], 50) : num(st['配送費_5至8公里'], 80); }
export function threshold(st, km) {
  km = Number(km) || 0; const far = num(st['配送最遠公里'], 8);
  if (km > far) return null;
  if (km <= 2) return num(st['配送門檻_2公里內'], 3);
  if (km <= 5) return num(st['配送門檻_2至5公里'], 5);
  return num(st['配送門檻_5至8公里'], 10);
}
export async function points(c, st, all) {
  return (await c.db.all('配送點')).filter((p) => all || p['啟用']).map((p) => ({ id: p['配送點ID'], name: p['名稱'], address: p['地址'], km: num(p['距離公里'], 0), slots: String(p['可配送時段'] || '中午,晚上').split(/[,，、\s]+/).filter(Boolean), on: !!p['啟用'], note: p['備註'], min: threshold(st, p['距離公里']) }));
}
export async function pointCounts(c, from, to) {
  const r = await c.env.DB.prepare("SELECT date, slot, point_id, SUM(qty) AS n FROM reservations WHERE pickup = '配送' AND date >= ? AND date <= ? AND status IN ('已預約','已鎖定','已取餐','未取餐作廢') GROUP BY date, slot, point_id").bind(from, to).all();
  const m = {}; (r.results || []).forEach((x) => { m[x.date + '|' + x.slot + '|' + x.point_id] = x.n; });
  return m;
}
export async function menu(c) {
  const items = (await c.db.all('健康餐品項', { 店家ID: SHOP })).filter((r) => isTrue(r['顯示'])).sort(byOrder);
  const addons = (await c.db.all('加購品項', { 店家ID: SHOP })).filter((r) => isTrue(r['顯示'])).sort(byOrder);
  return { items, addons };
}
export async function ledgerAdd(c, memberId, type, amount, o) {
  await c.db.insert('錢包紀錄', Object.assign({ 紀錄ID: 'W' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: memberId, 時間: nowStamp(), 類型: type, 金額: amount, 可退現金: true, 狀態: '已入帳' }, o || {}));
}
export async function slotCounts(c, from, to) {
  const r = await c.env.DB.prepare("SELECT date, slot, SUM(qty) AS n FROM reservations WHERE date >= ? AND date <= ? AND status IN ('已預約','已鎖定','已取餐','未取餐作廢') GROUP BY date, slot").bind(from, to).all();
  const m = {}; (r.results || []).forEach((x) => { m[x.date + '|' + x.slot] = x.n; });
  return m;
}

/* ---------- 截單：鎖定已過截單時間的預約；訂閱的升級與加購從錢包扣 ---------- */
export async function runCutoff(c) {
  const st = await settings(c), R = rules(st);
  await runExpiry(c); // 先結算到期的方案（會取消它們沒吃的預約），再抓要鎖定的預約
  const rows = (await c.db.all('預約', { 狀態: '已預約' })).filter((r) => String(r['日期']) <= R.lockDate);
  if (!rows.length) return 0;
  const { items } = await menu(c);
  const base = items.find((i) => !num(i['訂閱加價'], 0)) || items[0];
  // 配送：同一配送點、同一天、同一時段的份數沒達到門檻 → 改門市自取
  const pts = {}; (await points(c, st, true)).forEach((p) => { pts[p.id] = p; });
  const grp = {}; rows.filter((r) => r['取餐方式'] === '配送').forEach((r) => { const k = r['日期'] + '|' + r['時段'] + '|' + r['配送點ID']; grp[k] = (grp[k] || 0) + num(r['份數'], 1); });
  const toSelf = {}; Object.keys(grp).forEach((k) => { const p = pts[k.split('|')[2]]; if (!p || !p.on || p.min === null || grp[k] < p.min) toSelf[k] = p ? (p.on ? '只有 ' + grp[k] + ' 份，未達 ' + p.min + ' 份' : '配送點已停用') : '配送點不存在'; });
  // 未達門檻、但訂單勾了「願意付配送費」：照送，收一次配送費（錢包不足改自取）
  const keepOrder = {};
  for (const k of Object.keys(toSelf)) {
    const p = pts[k.split('|')[2]]; if (!p || !p.on || p.min === null) continue;
    const oids = [...new Set(rows.filter((r) => r['日期'] + '|' + r['時段'] + '|' + r['配送點ID'] === k && r['訂單ID']).map((r) => r['訂單ID']))];
    for (const oid of oids) {
      const o = await c.db.first('訂單', { 訂單ID: oid }); if (!o || !o['願付配送費'] || o['配送費狀態']) continue;
      const fee = feeOf(st, p.km);
      if (o['付款方式'] === '現付') { await c.db.update('訂單', o._row, { 配送費: fee, 配送費狀態: '現付', 應收現金: num(o['應收現金'], 0) + fee }); keepOrder[oid] = 1; continue; }
      const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: o['會員ID'] }));
      if (wal.total >= fee) { await ledgerAdd(c, o['會員ID'], '配送費扣款', -fee, { 對應ID: oid, 經手人員: '系統', 備註: o['日期'] + ' ' + o['時段'] + ' ' + p.name + '：未達 ' + p.min + ' 份，付配送費' }); await c.db.update('訂單', o._row, { 配送費: fee, 配送費狀態: '已扣款' }); keepOrder[oid] = 1; }
      else await c.db.update('訂單', o._row, { 配送費狀態: '錢包不足改自取' });
    }
  }
  // 送到地址：截單時重算免運（同一位會員、同一天、同一時段、同一個地址合併；取消後不到門檻要補收、多筆只收一次）
  const toSelfOrder = await settleAddressFees(c, st, rows);
  for (const oid of [...new Set(rows.filter((r) => r['取餐方式'] === '配送' && toSelf[r['日期'] + '|' + r['時段'] + '|' + r['配送點ID']] && !keepOrder[r['訂單ID']] && r['訂單ID']).map((r) => r['訂單ID']))]) {
    const o = await c.db.first('訂單', { 訂單ID: oid }); if (o && o['取餐方式'] === '配送') await c.db.update('訂單', o._row, { 取餐方式: '自取', 配送點ID: '' });
  }
  for (const r of rows.sort((a, b) => a._row - b._row)) {
    const upd = { 狀態: '已鎖定', 修改時間: nowStamp() };
    const gk = r['日期'] + '|' + r['時段'] + '|' + r['配送點ID'];
    if (r['取餐方式'] === '地址' && toSelfOrder[r['訂單ID']]) Object.assign(upd, { 取餐方式: '自取', 備註: (r['備註'] ? r['備註'] + '；' : '') + '錢包不足以補收配送費，改門市自取' });
    if (r['取餐方式'] === '配送' && toSelf[gk] && !keepOrder[r['訂單ID']]) Object.assign(upd, { 取餐方式: '自取', 配送點ID: '', 備註: (r['備註'] ? r['備註'] + '；' : '') + '配送改自取（' + (pts[r['配送點ID']] ? pts[r['配送點ID']].name + '：' : '') + toSelf[gk] + '）' });
    if (r['類別'] === '訂閱' && r['扣款狀態'] === '取餐付現') { /* 升級與加購已算進訂單的應收現金 */ }
    else if (r['類別'] === '訂閱') {
      const due = num(r['升級差額'], 0) + num(r['加購金額'], 0);
      if (due < 0) { // 整期升級後改訂較便宜的組合：退差額
        await ledgerAdd(c, r['會員ID'], '退款轉入', -due, { 可退現金: true, 對應ID: r['預約ID'], 經手人員: '系統', 備註: r['日期'] + ' ' + r['時段'] + '：整期升級改訂 ' + r['份量'] + ' ' + r['主菜'] + '，退差額' });
        upd['扣款狀態'] = '已扣款';
      } else if (due > 0) {
        const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: r['會員ID'] }));
        if (wal.total >= due) {
          await ledgerAdd(c, r['會員ID'], '升級加購扣款', -due, { 對應ID: r['預約ID'], 經手人員: '系統', 備註: r['日期'] + ' ' + r['時段'] + '：' + r['份量'] + ' ' + r['主菜'] + (r['加購項目'] ? '＋加購' : '') });
          upd['扣款狀態'] = '已扣款';
        } else {
          const up = await subUpg(c, await c.db.first('訂閱', { 訂閱ID: r['訂閱ID'] })), b = up.item || base;
          Object.assign(upd, { 份量: b['份量'], 主菜: b['主菜'], 品項ID: b['品項ID'], 單點原價: num(b['單點價'], 0), 升級差額: 0, 加購金額: 0, 加購項目: '', 扣款狀態: '餘額不足改回基本餐', 備註: (r['備註'] ? r['備註'] + '；' : '') + '截單時錢包不足 ' + due + ' 元，改回基本餐' });
        }
      } else upd['扣款狀態'] = '已扣款';
    }
    await c.db.update('預約', r._row, upd);
  }
  return rows.length;
}


/** 送到地址的配送費在截單時重算：同一位會員＋日期＋時段＋行政區＋地址為一組，份數（未取消）達門檻免運，否則整組只收一次。
 *  先把各筆已收的配送費退回（錢包退款／付現從應收扣掉），再向第一筆收一次（錢包不足：整組改自取）。回傳要改自取的訂單。 */
async function settleAddressFees(c, st, rows) {
  const oids = [...new Set(rows.filter((r) => r['取餐方式'] === '地址' && r['訂單ID']).map((r) => r['訂單ID']))];
  const out = {}; if (!oids.length) return out;
  const groups = {};
  for (const oid of oids) { const o = await c.db.first('訂單', { 訂單ID: oid }); if (!o || o['狀態'] === '已取消') continue; const k = [o['會員ID'], o['日期'], o['時段'], o['行政區'], o['地址']].join('|'); (groups[k] = groups[k] || []).push(o); }
  // 同組裡也可能有這次還沒輪到鎖定的訂單（同一天同一時段一定一起鎖定，所以不用另外找）
  for (const k of Object.keys(groups)) {
    const list = groups[k].sort((a, b) => a._row - b._row), km = num(list[0]['距離公里'], 0), min = threshold(st, km), fee = feeOf(st, km);
    let qty = 0; for (const o of list) qty += (await c.db.all('預約', { 訂單ID: o['訂單ID'] })).filter((r) => r['狀態'] !== '已取消').reduce((t, r) => t + num(r['份數'], 1), 0);
    const want = min !== null && qty >= min ? 0 : fee;
    const paid = list.map((o) => (o['配送費狀態'] === '已扣款' || o['配送費狀態'] === '現付') ? num(o['配送費'], 0) : 0);
    if (paid[0] === want && paid.slice(1).every((x) => !x)) { for (const o of list) if (!want && o['配送費狀態'] !== '免運') await c.db.update('訂單', o._row, { 配送費狀態: '免運' }); continue; }
    for (let i = 0; i < list.length; i++) {
      const o = list[i]; if (!paid[i]) continue;
      if (o['配送費狀態'] === '已扣款') await ledgerAdd(c, o['會員ID'], '退款轉入', paid[i], { 可退現金: true, 對應ID: o['訂單ID'], 經手人員: '系統', 備註: '截單重算配送費，先退回' });
      await c.db.update('訂單', o._row, { 配送費: 0, 配送費狀態: '免運', 應收現金: o['配送費狀態'] === '現付' ? Math.max(0, num(o['應收現金'], 0) - paid[i]) : num(o['應收現金'], 0) });
      o['應收現金'] = o['配送費狀態'] === '現付' ? Math.max(0, num(o['應收現金'], 0) - paid[i]) : o['應收現金']; o['配送費狀態'] = '免運';
    }
    if (!want) continue;
    const first = list[0], note = '截單重算：共 ' + qty + ' 份，未滿 ' + min + ' 份，收配送費（同組只收一次）';
    if (first['付款方式'] === '現付') { await c.db.update('訂單', first._row, { 配送費: want, 配送費狀態: '現付', 應收現金: num(first['應收現金'], 0) + want, 備註: (first['備註'] ? first['備註'] + '；' : '') + note }); continue; }
    const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: first['會員ID'] }));
    if (wal.total >= want) { await ledgerAdd(c, first['會員ID'], '配送費扣款', -want, { 對應ID: first['訂單ID'], 經手人員: '系統', 備註: note }); await c.db.update('訂單', first._row, { 配送費: want, 配送費狀態: '已扣款' }); }
    else for (const o of list) { out[o['訂單ID']] = 1; await c.db.update('訂單', o._row, { 取餐方式: '自取', 配送費狀態: '錢包不足改自取' }); }
  }
  return out;
}

/* ---------- 結算：中途取消或到期 ---------- */
export async function settlePreview(c, sub) {
  const used = await consumedOf(c, sub['訂閱ID']), paid = Number(sub['實付金額']) || 0, by = {};
  used.rows.forEach((r) => { const k = r['份量'] + ' ' + r['主菜'] + '|' + (Number(r['單點原價']) || 0); by[k] = (by[k] || 0) + 1; });
  const open = (await c.db.all('預約', { 訂閱ID: sub['訂閱ID'] })).filter((r) => r['狀態'] === '已預約').length;
  return { subId: sub['訂閱ID'], paid, usedN: used.n, used: used.value, detail: Object.keys(by).map((k) => ({ item: k.split('|')[0], price: Number(k.split('|')[1]), n: by[k] })), open, amount: Math.max(0, paid - used.value) };
}
async function settle(c, sub, status, method, by, reason) {
  const up = await subUpg(c, sub), openN = (await c.db.all('預約', { 訂閱ID: sub['訂閱ID'] })).filter((x) => x['狀態'] === '已預約').length, unused = (Number(sub['剩餘餐數']) || 0) + openN;
  if (up.value > 0 && unused > 0) await ledgerAdd(c, sub['會員ID'], '退款轉入', up.value * unused, { 可退現金: true, 對應ID: sub['訂閱ID'], 經手人員: by, 備註: '方案' + status + '：整期升級未用 ' + unused + ' 餐退回' });
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
  const { order2Extra } = await import('./order2.js');
  await runCutoff(c);
  const st = await settings(c), R = rules(st), { items, addons } = await menu(c);
  const first = addDays(R.lockDate, 1), last = addDays(R.today, R.maxDays);
  const cnt = await slotCounts(c, first, last), days = [], pcnt = await pointCounts(c, first, last), pl = await points(c, st, false);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const closed = R.closed.indexOf(weekday(d)) >= 0;
    days.push({ date: d, wd: weekday(d), closed, slots: SLOTS.map((s) => ({ slot: s, pickup: R.pickup[s], left: R.cap[s] ? Math.max(0, R.cap[s] - (cnt[d + '|' + s] || 0)) : null })) });
  }
  const subs = await c.db.all('訂閱', { 會員ID: m['會員ID'] }), sub = currentSub(subs);
  const mine = (await c.db.all('預約', { 會員ID: m['會員ID'] })).filter((r) => r['狀態'] !== '已取消' && String(r['日期']) >= R.today);
  return {
    member: { id: m['會員ID'], name: m['姓名'] },
    wallet: await walletFull(c, m['會員ID']),
    sub: sub ? Object.assign({ id: sub['訂閱ID'], left: sub['剩餘餐數'], meals: sub['方案餐數'], start: sub['開始日'], end: sub['到期日'], status: sub['狀態'], pauseStart: String(sub['暫停起日'] || ''), pauseEnd: String(sub['暫停迄日'] || ''), upgSize: sub['整期升級份量'], upgMain: sub['整期升級主菜'] }, { upgValue: (await subUpg(c, sub)).value }) : null,
    cutoff: R.cut, days,
    items: items.map((i) => ({ id: i['品項ID'], size: i['份量'], main: i['主菜'], mainDesc: i['主菜內容'], name: i['品名'], desc: i['介紹'], kcal: num(i['熱量'], 0), protein: num(i['蛋白質'], 0), carb: num(i['碳水'], 0), fat: num(i['脂肪'], 0), price: num(i['單點價'], 0), upg: num(i['訂閱加價'], 0), image: imgUrl(i['圖片網址']) })),
    sauces: addons.filter((a) => a['類型'] === '醬汁' && (a['名稱'] !== '松露醬' || isTrue(st['松露醬開放']))).map((a) => ({ id: a['品項ID'], name: a['名稱'], price: isTrue(a['免費']) ? 0 : num(a['加購價'], 0) })),
    drinks: addons.filter((a) => a['類型'] === '飲品' && num(a['加購價'], null) !== null).map((a) => ({ id: a['品項ID'], name: a['名稱'], price: num(a['加購價'], 0), protein: num(a['蛋白質'], 0), image: imgUrl(a['圖片網址']) })),
    mine: mine.map(resView).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot)),
    points: pl.filter((p) => p.min !== null), pointCount: pcnt,
    eta: { 中午: String(st['中午預計送達時段'] || ''), 晚上: String(st['晚上預計送達時段'] || '') },
    extra: await order2Extra(c, m)
  };
}
function resView(r) {
  return { orderId: r['訂單ID'], pickup: r['取餐方式'], pointId: r['配送點ID'], id: r['預約ID'], date: String(r['日期']), slot: r['時段'], kind: r['類別'], qty: num(r['份數'], 1), size: r['份量'], main: r['主菜'], itemId: r['品項ID'], sauce: r['醬汁'], addons: r['加購項目'], upg: num(r['升級差額'], 0), addonAmt: num(r['加購金額'], 0), paid: num(r['付款金額'], 0), status: r['狀態'], charge: r['扣款狀態'], note: r['備註'] };
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
  let pickup = '自取', pointId = '';
  if (p.pickup === '配送') {
    const pt = (await points(c, st, false)).find((x) => x.id === clean(p.pointId, 30));
    if (!pt || pt.min === null) throw new UserError('請選擇配送點');
    if (pt.slots.indexOf(slot) < 0) throw new UserError('「' + pt.name + '」' + slot + '不配送');
    pickup = '配送'; pointId = pt.id;
  }
  const resId = 'B' + Date.now().toString(36).toUpperCase() + rid(3), price = num(it['單點價'], 0);
  const row = { 預約ID: resId, 會員ID: m['會員ID'], 日期: date, 時段: slot, 取餐方式: pickup, 配送點ID: pointId, 份量: it['份量'], 主菜: it['主菜'], 品項ID: it['品項ID'], 醬汁: sauce['名稱'], 加購項目: drinks.map((d) => d['品項ID']).join(','), 單點原價: price, 類別: kind, 份數: qty, 狀態: '已預約', 建立時間: nowStamp(), 建立者: by, 備註: drinks.length ? '加購：' + drinks.map((d) => d['名稱']).join('、') : '' };
  if (kind === '訂閱') {
    const subs = await c.db.all('訂閱', { 會員ID: m['會員ID'] }), sub = currentSub(subs);
    if (!sub || sub['狀態'] !== '使用中') throw new UserError('沒有使用中的方案，可以改用單點');
    if (date < String(sub['開始日']) || date > String(sub['到期日'])) throw new UserError('這天不在方案期間（' + sub['開始日'] + '～' + sub['到期日'] + '）');
    if (num(sub['剩餘餐數'], 0) < 1) throw new UserError('方案的餐數已經用完，可以改用單點');
    if (sub['暫停起日'] && date >= String(sub['暫停起日']) && date <= String(sub['暫停迄日'])) throw new UserError('這天在暫停期間（' + sub['暫停起日'] + '～' + sub['暫停迄日'] + '）');
    if ((await c.db.all('預約', { 會員ID: m['會員ID'], 日期: date, 時段: slot, 類別: '訂閱' })).some((r) => r['狀態'] !== '已取消')) throw new UserError('這個時段已經用方案訂過一份了（要多訂請用單點）');
    const up = await subUpg(c, sub), hold = Math.max(0, num(it['訂閱加價'], 0) - up.value + addonUnit), av = (await walletFull(c, m['會員ID'])).avail;
    if (hold > av.total) throw new UserError('錢包可用餘額不足：升級／加購要先預留 ' + hold + ' 元，目前可用 ' + av.total.toLocaleString() + ' 元');
    Object.assign(row, { 訂閱ID: sub['訂閱ID'], 升級差額: num(it['訂閱加價'], 0) - up.value, 加購金額: addonUnit, 扣款狀態: '未扣款' });
    await c.db.insert('預約', row);
    await c.env.DB.prepare('UPDATE subscriptions SET remaining = remaining - 1 WHERE sub_id = ? AND remaining > 0').bind(sub['訂閱ID']).run();
  } else {
    const total = (price + addonUnit) * qty, wal = (await walletFull(c, m['會員ID'])).avail;
    if (wal.total < total) throw new UserError('錢包可用餘額不足：需要 ' + total.toLocaleString() + ' 元，目前 ' + wal.total.toLocaleString() + ' 元');
    Object.assign(row, { 訂閱ID: '', 升級差額: 0, 加購金額: addonUnit * qty, 付款金額: total, 用掉紅利: Math.min(wal.bonus, total), 扣款狀態: '已扣款' });
    await c.db.insert('預約', row);
    await ledgerAdd(c, m['會員ID'], '單點扣款', -total, { 對應ID: resId, 經手人員: by, 備註: date + ' ' + slot + '：' + it['份量'] + ' ' + it['主菜'] + ' ×' + qty });
  }
  return { ok: true, resId };
}

/** 退回：訂閱加回 1 餐；單點退回錢包（用掉的紅利退回紅利） */
/** 付現便當的金額：單點＝(單點價×份數)＋加購；方案餐＝升級差額＋加購（不小於 0） */
const cashOf = (r) => r['類別'] === '單點' ? num(r['單點原價'], 0) * num(r['份數'], 1) + num(r['加購金額'], 0) : Math.max(0, num(r['升級差額'], 0) + num(r['加購金額'], 0));
export async function giveBack(c, r, why, by) {
  if (r['扣款狀態'] === '取餐付現') { // 還沒收現金：從應收扣掉；已經收了：退到錢包
    const amt = cashOf(r), o = r['訂單ID'] && await c.db.first('訂單', { 訂單ID: r['訂單ID'] });
    if (amt > 0 && o) {
      if (o['已收現金']) await ledgerAdd(c, r['會員ID'], '退款轉入', amt, { 可退現金: true, 對應ID: r['預約ID'], 經手人員: by, 備註: why + '（已付現金，退到錢包）' });
      else await c.db.update('訂單', o._row, { 應收現金: Math.max(0, num(o['應收現金'], 0) - amt) });
    }
    if (r['類別'] === '訂閱' && r['訂閱ID']) await c.env.DB.prepare('UPDATE subscriptions SET remaining = remaining + 1 WHERE sub_id = ?').bind(r['訂閱ID']).run();
    return;
  }
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
  if (r['訂單ID']) await closeOrderIfEmpty(c, r['訂單ID'], by);
  return { ok: true };
}
/** 訂單裡的便當都取消了：訂單標記取消；已用錢包付的配送費退回 */
export async function closeOrderIfEmpty(c, oid, by) {
  const o = await c.db.first('訂單', { 訂單ID: oid }); if (!o || o['狀態'] === '已取消') return;
  if ((await c.db.all('預約', { 訂單ID: oid })).some((x) => x['狀態'] !== '已取消')) return;
  if (o['配送費狀態'] === '已扣款' && num(o['配送費'], 0) > 0) await ledgerAdd(c, o['會員ID'], '退款轉入', num(o['配送費'], 0), { 可退現金: true, 對應ID: oid, 經手人員: by, 備註: '訂單取消，退配送費' });
  await c.db.update('訂單', o._row, { 狀態: '已取消', 應收現金: 0 });
}

/* ---------- 推薦紅利：新會員已取餐滿 N 餐 ---------- */
export async function checkReferral(c, memberId, R) {
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

/* ---------- 暫停、整期升級 ---------- */
async function pausePlan(c, m, p, by) {
  await runCutoff(c);
  const st = await settings(c), R = rules(st), sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] }));
  if (!sub || sub['狀態'] !== '使用中') throw new UserError('沒有使用中的方案');
  if (num(sub['剩餘餐數'], 0) < 1) throw new UserError('方案已經沒有剩餘餐數');
  if (sub['暫停起日']) throw new UserError('這一期已經暫停過（' + sub['暫停起日'] + '～' + sub['暫停迄日'] + '）');
  const start = clean(p.start, 10), days = Math.floor(num(p.days, 0)), max = num(st['暫停最多天數'], 7);
  if (!isDate(start)) throw new UserError('請選擇暫停開始日');
  if (start <= R.lockDate) throw new UserError('最早只能從 ' + addDays(R.lockDate, 1) + ' 開始暫停');
  if (start > String(sub['到期日'])) throw new UserError('開始日超過方案到期日');
  if (!(days >= 1 && days <= max)) throw new UserError('暫停天數請選 1～' + max + ' 天');
  const end = addDays(start, days - 1), newEnd = addDays(String(sub['到期日']), days);
  let n = 0;
  for (const r of (await c.db.all('預約', { 訂閱ID: sub['訂閱ID'] })).filter((x) => x['狀態'] === '已預約' && String(x['日期']) >= start && String(x['日期']) <= end)) {
    await c.db.update('預約', r._row, { 狀態: '已取消', 修改時間: nowStamp(), 備註: (r['備註'] ? r['備註'] + '；' : '') + '方案暫停，自動取消' });
    await giveBack(c, r, '方案暫停', by); n++;
  }
  await c.db.update('訂閱', sub._row, { 暫停起日: start, 暫停迄日: end, 到期日: newEnd, 備註: (sub['備註'] ? sub['備註'] + '；' : '') + '暫停 ' + start + '～' + end + '（' + days + ' 天）by ' + by });
  return { ok: true, start, end, newEnd, canceled: n };
}
async function upgradePlan(c, m, p, by) {
  await runCutoff(c);
  const sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] }));
  if (!sub || sub['狀態'] !== '使用中') throw new UserError('沒有使用中的方案');
  const it = (await c.db.all('健康餐品項', { 份量: clean(p.size, 20), 主菜: clean(p.main, 20) })).filter((x) => isTrue(x['顯示']))[0];
  if (!it) throw new UserError('請選擇要升級的組合');
  const cur = await subUpg(c, sub), val = num(it['訂閱加價'], 0), diff = val - cur.value;
  if (diff <= 0) throw new UserError(cur.value ? '只能升級到比目前（' + sub['整期升級份量'] + ' ' + sub['整期升級主菜'] + '）更高的組合' : '請選擇需要加價的組合');
  const open = (await c.db.all('預約', { 訂閱ID: sub['訂閱ID'] })).filter((x) => x['狀態'] === '已預約' && x['類別'] === '訂閱');
  const n = num(sub['剩餘餐數'], 0) + open.length, total = diff * n;
  if (n < 1) throw new UserError('沒有可以升級的餐');
  if (p.preview) return { diff, n, total, left: num(sub['剩餘餐數'], 0), open: open.length };
  // 已預約、用錢包付的餐：升級後預留會變少，先算回來
  const freed = open.filter((r) => r['扣款狀態'] === '未扣款').reduce((t, r) => t + Math.max(0, num(r['升級差額'], 0) + num(r['加購金額'], 0)) - Math.max(0, num(r['升級差額'], 0) - diff + num(r['加購金額'], 0)), 0);
  const wal = (await walletFull(c, m['會員ID'])).avail;
  if (wal.total + freed < total) throw new UserError('錢包可用餘額不足：需要 ' + total.toLocaleString() + ' 元，目前可用 ' + (wal.total + freed).toLocaleString() + ' 元');
  await ledgerAdd(c, m['會員ID'], '升級扣款', -total, { 對應ID: sub['訂閱ID'], 經手人員: by, 備註: '整期升級 ' + it['份量'] + ' ' + it['主菜'] + '：' + diff + ' × ' + n + ' 餐' });
  await c.db.update('訂閱', sub._row, { 整期升級份量: it['份量'], 整期升級主菜: it['主菜'], 備註: (sub['備註'] ? sub['備註'] + '；' : '') + '整期升級 ' + it['份量'] + ' ' + it['主菜'] + ' by ' + by });
  for (const r of open) {
    const nu = num(r['升級差額'], 0) - diff, upd = { 升級差額: nu };
    if (r['扣款狀態'] === '取餐付現') { // 付現的餐：應收減少；變成要退錢時改由截單退到錢包
      const before = cashOf(r), after = Math.max(0, nu + num(r['加購金額'], 0)), o = r['訂單ID'] && await c.db.first('訂單', { 訂單ID: r['訂單ID'] });
      if (o && before > after) await c.db.update('訂單', o._row, { 應收現金: Math.max(0, num(o['應收現金'], 0) - (before - after)) });
      if (nu + num(r['加購金額'], 0) <= 0) upd['扣款狀態'] = '未扣款';
    }
    await c.db.update('預約', r._row, upd);
  }
  return { ok: true, diff, n, total };
}

/* ---------- 前台（會員，用 cookie） ---------- */
export const orderMemberApi = {
  orderInfo: (c, m) => orderInfo(c, m),
  orderCreate: (c, m, p) => createOrder(c, m, p, '會員'),
  orderCancel: (c, m, p) => cancelOrder(c, m, p.resId, '會員'),
  planPause: (c, m, p) => pausePlan(c, m, p, '會員'),
  planUpgrade: (c, m, p) => upgradePlan(c, m, p, '會員')
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
  async adminPoints(c, p, a) { needAll(a); const st = await settings(c); return { points: await points(c, st, true), far: num(st['配送最遠公里'], 8), eta: { 中午: st['中午預計送達時段'] || '', 晚上: st['晚上預計送達時段'] || '' } }; },
  /** 新增／修改配送點；停用時，還沒截單的配送預約改門市自取 */
  async adminSavePoint(c, p, a) {
    needAll(a);
    const st = await settings(c), v = p.point || {}, name = clean(v.name, 40), km = num(v.km, NaN), slots = (Array.isArray(v.slots) ? v.slots : String(v.slots || '').split(/[,，、\s]+/)).filter((x) => SLOTS.indexOf(x) >= 0);
    if (!name) throw new UserError('請填寫配送點名稱');
    if (!(km >= 0)) throw new UserError('請填寫與門市的距離（公里）');
    if (threshold(st, km) === null) throw new UserError('超過 ' + num(st['配送最遠公里'], 8) + ' 公里不提供配送');
    if (!slots.length) throw new UserError('請至少選一個可配送時段');
    const vals = { 名稱: name, 地址: clean(v.address, 120), 距離公里: km, 可配送時段: slots.join(','), 啟用: !!v.on, 備註: clean(v.note, 200) };
    let id = clean(v.id, 30);
    if (id) { const hit = await c.db.first('配送點', { 配送點ID: id }); if (!hit) throw new UserError('找不到這個配送點'); await c.db.update('配送點', hit._row, vals); }
    else { id = 'DP' + Date.now().toString(36).toUpperCase(); await c.db.insert('配送點', Object.assign(vals, { 配送點ID: id })); }
    let moved = 0;
    for (const r of (await c.db.all('預約', { 配送點ID: id })).filter((x) => x['狀態'] === '已預約' && (!vals['啟用'] || slots.indexOf(x['時段']) < 0))) { await c.db.update('預約', r._row, { 取餐方式: '自取', 配送點ID: '', 修改時間: nowStamp(), 備註: (r['備註'] ? r['備註'] + '；' : '') + '配送點停用或取消該時段，改門市自取' }); moved++; }
    return { ok: true, id, moved };
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
    const pmap = {}; (await points(c, st, true)).forEach((x) => { pmap[x.id] = x; });
    const omap = {}; (await c.db.all('訂單', { 日期: date })).forEach((o) => { omap[o['訂單ID']] = o; });
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
      points: (function () { const g = {}; live.filter((r) => r['取餐方式'] === '配送' && r['狀態'] !== '店家補償').forEach((r) => { const k = r['時段'] + '|' + r['配送點ID'], pt = pmap[r['配送點ID']] || { name: r['配送點ID'], address: '', min: 0 }; g[k] = g[k] || { slot: r['時段'], name: pt.name, address: pt.address, min: pt.min, n: 0 }; g[k].n += num(r['份數'], 1); }); return Object.values(g); })(),
      cash: Object.values(omap).filter((o) => o['付款方式'] === '現付' && o['狀態'] !== '已取消').map((o) => ({ orderId: o['訂單ID'], member: name[o['會員ID']] || o['會員ID'], slot: o['時段'], due: num(o['應收現金'], 0), paid: !!o['已收現金'], pickup: o['取餐方式'] })),
      addrs: Object.values(omap).filter((o) => o['取餐方式'] === '地址' && o['狀態'] !== '已取消').map((o) => ({ orderId: o['訂單ID'], slot: o['時段'], member: name[o['會員ID']] || o['會員ID'], area: o['行政區'], address: o['地址'], recipient: o['收件人'], phone: o['電話'], note: o['地址備註'], fee: num(o['配送費'], 0), n: live.filter((r) => r['訂單ID'] === o['訂單ID'] && r['狀態'] !== '店家補償').reduce((t, r) => t + num(r['份數'], 1), 0) })),
      list: live.map((r) => Object.assign(resView(r), { pay: omap[r['訂單ID']] ? omap[r['訂單ID']]['付款方式'] : '錢包', addr: omap[r['訂單ID']] && omap[r['訂單ID']]['取餐方式'] === '地址' ? omap[r['訂單ID']]['行政區'] + ' ' + omap[r['訂單ID']]['地址'] : '', pointName: pmap[r['配送點ID']] ? pmap[r['配送點ID']].name : '', member: name[r['會員ID']] || r['會員ID'], memberId: r['會員ID'], addonNames: String(r['加購項目'] || '').split(',').filter(Boolean).map((id) => an[id] || id).join('、'), by: r['建立者'] })).sort((x, y) => (x.slot + x.id).localeCompare(y.slot + y.id))
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
    const st2 = await settings(c);
    if (to === '未取餐作廢' && r['訂單ID']) {
      const o = await c.db.first('訂單', { 訂單ID: r['訂單ID'] });
      if (o && o['付款方式'] === '現付' && !/沒來已記/.test(o['備註'])) {
        const m = await c.db.first('會員', { 會員ID: r['會員ID'] }), n = num(m['付現沒來次數'], 0) + 1, lim = num(st2['付現沒來關閉次數'], 2);
        await c.db.update('會員', m._row, { 付現沒來次數: n, 付現停用: n >= lim ? true : m['付現停用'] });
        await c.db.update('訂單', o._row, { 備註: (o['備註'] ? o['備註'] + '；' : '') + '沒來已記' });
      }
    }
    await checkReferral(c, r['會員ID'], rules(st2));
    return { ok: true };
  }
};
