import { UserError, clean, nowStamp, isDate, weekday, rid, isTrue } from './util.js';
import { needAll } from './service.js';
import { settings, walletOf, currentSub, subUpg } from './members.js';
import { rules, menu, ledgerAdd, slotCounts, points, threshold, feeOf, runCutoff, closeOrderIfEmpty } from './orders.js';

/**
 * 逐步訂餐（2026-11-06，草圖 m41）：一筆訂單＝同一天、同一時段、同一個取餐方式，可以有多個便當。
 * - 便當：最多一個用方案（每時段 1 份，扣 1 餐，升級加購截單時扣），其餘為單點。
 * - 單點付款：錢包（立即扣）或取餐時付現（每位會員同時最多 N 筆未取、沒來 M 次關閉）。
 * - 取餐：門市自取／固定配送點（截單時湊份數，未達門檻：勾了願付配送費就照送收一次，否則改自取）／自己的地址（依行政區，同一筆滿門檻免運，否則收配送費，下單時就確定）。
 */
const SLOTS = ['中午', '晚上'];
const num = (v, d) => { const s = String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim(); const n = Number(s); return s === '' || isNaN(n) ? d : n; };
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

export async function areas(c, all) {
  return (await c.db.all('配送行政區')).filter((a) => all || a['啟用']).sort((x, y) => (num(x['排序'], 999) - num(y['排序'], 999))).map((a) => ({ area: a['行政區'], km: num(a['距離公里'], 0), on: !!a['啟用'], order: num(a['排序'], 999), note: a['備註'] }));
}
async function cashOpen(c, memberId) {
  return (await c.db.all('訂單', { 會員ID: memberId, 付款方式: '現付' })).filter((o) => o['狀態'] !== '已取消' && !o['已收現金'] && !/沒來已記/.test(o['備註'])).length;
}

/** 訂餐畫面要的額外資料：行政區（含運費與門檻）、常用地址、付現狀態 */
export async function order2Extra(c, m) {
  const st = await settings(c);
  return {
    areas: (await areas(c, false)).filter((a) => threshold(st, a.km) !== null).map((a) => ({ area: a.area, km: a.km, fee: feeOf(st, a.km), min: threshold(st, a.km) })),
    addresses: (await c.db.all('常用地址', { 會員ID: m['會員ID'] })).map((x) => ({ id: x['地址ID'], label: x['名稱'], area: x['行政區'], address: x['地址'], recipient: x['收件人'], phone: x['電話'], note: x['備註'] })),
    cash: { blocked: !!m['付現停用'], open: await cashOpen(c, m['會員ID']), limit: num(st['付現未取上限'], 2) },
    feeOf: { 2: num(st['配送費_2公里內'], 30), 5: num(st['配送費_2至5公里'], 50), 8: num(st['配送費_5至8公里'], 80) }
  };
}

export async function createOrder2(c, m, p, by) {
  await runCutoff(c);
  const st = await settings(c), R = rules(st), { items, addons } = await menu(c);
  // 改期：舊的訂單（或單筆預約）在新訂單成立後才取消；檢查時把舊的會退回的錢、餐數、份數先算進來
  let old = [], oldKey = clean(p.replace, 30);
  if (oldKey) {
    old = (await c.db.all('預約', { 會員ID: m['會員ID'] })).filter((r) => (r['訂單ID'] === oldKey || r['預約ID'] === oldKey) && r['狀態'] !== '已取消');
    if (!old.length) throw new UserError('找不到要改期的訂單');
    if (old.some((r) => r['狀態'] !== '已預約')) throw new UserError('原本的訂單已經截單鎖定，不能改期');
  }
  const oldO = oldKey ? await c.db.first('訂單', { 訂單ID: old[0]['訂單ID'] || '-' }) : null;
  const oldCredit = old.filter((r) => r['類別'] === '單點').reduce((t, r) => t + num(r['付款金額'], 0), 0) + (oldO && oldO['配送費狀態'] === '已扣款' ? num(oldO['配送費'], 0) : 0);
  const oldIds = old.map((r) => r['預約ID']);
  const date = clean(p.date, 10), slot = clean(p.slot, 4);
  if (!isDate(date)) throw new UserError('請選擇日期');
  if (SLOTS.indexOf(slot) < 0) throw new UserError('請選擇中午或晚上');
  if (date <= R.lockDate) throw new UserError(date <= R.today ? '不能預約今天以前的餐' : '已經過了截單時間（前一天 ' + R.cut + '），請改訂後天以後');
  if (date > addDays(R.today, R.maxDays)) throw new UserError('最多只能預約 ' + R.maxDays + ' 天內的餐');
  if (R.closed.indexOf(weekday(date)) >= 0) throw new UserError('這天公休');
  // 便當
  const lines = (Array.isArray(p.lines) ? p.lines : []).slice(0, 20).map((l) => {
    const it = items.find((i) => i['品項ID'] === clean(l.itemId, 30)); if (!it) throw new UserError('便當不存在或已下架');
    const sauce = addons.find((a) => a['類型'] === '醬汁' && a['品項ID'] === clean(l.sauce, 30) && (a['名稱'] !== '松露醬' || isTrue(st['松露醬開放']))); if (!sauce) throw new UserError('請幫每個便當選醬汁');
    const drinks = [...new Set((Array.isArray(l.drinks) ? l.drinks : []).map((x) => clean(x, 30)))].map((id) => addons.find((a) => a['類型'] === '飲品' && a['品項ID'] === id && num(a['加購價'], null) !== null));
    if (drinks.some((d) => !d)) throw new UserError('加購品項不存在或尚未開放');
    const qty = Math.floor(num(l.qty, 1)); if (!(qty >= 1 && qty <= 20)) throw new UserError('份數請填 1～20');
    const addUnit = (isTrue(sauce['免費']) ? 0 : num(sauce['加購價'], 0)) + drinks.reduce((s, d) => s + num(d['加購價'], 0), 0);
    return { it, sauce, drinks, qty, addUnit, sub: !!l.useSub };
  });
  if (!lines.length) throw new UserError('請至少選一個便當');
  const subLines = lines.filter((l) => l.sub);
  if (subLines.length > 1 || (subLines[0] && subLines[0].qty !== 1)) throw new UserError('方案每個時段只能用 1 份，其他請用單點');
  const total = lines.reduce((s, l) => s + l.qty, 0);
  if (R.cap[slot]) { const used = ((await slotCounts(c, date, date))[date + '|' + slot] || 0) - old.filter((r) => r['日期'] === date && r['時段'] === slot).reduce((t, r) => t + num(r['份數'], 1), 0); if (used + total > R.cap[slot]) throw new UserError('這個時段只剩 ' + Math.max(0, R.cap[slot] - used) + ' 份'); }
  let sub = null, up = { value: 0 };
  if (subLines.length) {
    sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] }));
    if (!sub || sub['狀態'] !== '使用中') throw new UserError('沒有使用中的方案，請改用單點');
    if (date < String(sub['開始日']) || date > String(sub['到期日'])) throw new UserError('這天不在方案期間（' + sub['開始日'] + '～' + sub['到期日'] + '）');
    if (sub['暫停起日'] && date >= String(sub['暫停起日']) && date <= String(sub['暫停迄日'])) throw new UserError('這天在暫停期間');
    if (num(sub['剩餘餐數'], 0) + old.filter((r) => r['類別'] === '訂閱').length < 1) throw new UserError('方案的餐數已經用完，請改用單點');
    if ((await c.db.all('預約', { 會員ID: m['會員ID'], 日期: date, 時段: slot, 類別: '訂閱' })).some((r) => r['狀態'] !== '已取消' && oldIds.indexOf(r['預約ID']) < 0)) throw new UserError('這個時段已經用方案訂過一份了');
    up = await subUpg(c, sub);
  }
  // 取餐方式
  const pick = ['自取', '配送點', '地址'].indexOf(p.pickup) >= 0 ? p.pickup : '自取';
  const o = { 取餐方式: pick === '配送點' ? '配送' : pick, 配送點ID: '', 行政區: '', 地址: '', 收件人: '', 電話: '', 地址備註: '', 距離公里: 0, 願付配送費: !!p.feeOk, 配送費: 0, 配送費狀態: '' };
  let pointName = '';
  if (pick === '配送點') {
    const pt = (await points(c, st, false)).find((x) => x.id === clean(p.pointId, 30));
    if (!pt || pt.min === null) throw new UserError('請選擇配送點');
    if (pt.slots.indexOf(slot) < 0) throw new UserError('「' + pt.name + '」' + slot + '不配送');
    Object.assign(o, { 配送點ID: pt.id, 距離公里: pt.km }); pointName = pt.name;
  } else if (pick === '地址') {
    const a = p.addr || {}, ar = (await areas(c, false)).find((x) => x.area === clean(a.area, 10));
    if (!ar || threshold(st, ar.km) === null) throw new UserError('這個行政區目前不提供配送');
    const address = clean(a.address, 120), recipient = clean(a.recipient, 30), phone = clean(a.phone, 20).replace(/[\s-]/g, '');
    if (address.length < 4) throw new UserError('請填寫配送地址');
    if (!recipient) throw new UserError('請填寫收件人');
    if (!/^0\d{8,9}$/.test(phone)) throw new UserError('請填寫收件人電話');
    const min = threshold(st, ar.km), fee = total >= min ? 0 : feeOf(st, ar.km);
    Object.assign(o, { 行政區: ar.area, 地址: address, 收件人: recipient, 電話: phone, 地址備註: clean(a.note, 100), 距離公里: ar.km, 願付配送費: true, 配送費: fee, 配送費狀態: fee ? '' : '免運' });
    if (a.save) {
      const list = await c.db.all('常用地址', { 會員ID: m['會員ID'] });
      if (!list.some((x) => x['地址'] === address && x['行政區'] === ar.area) && list.length < 10) await c.db.insert('常用地址', { 地址ID: 'AD' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: m['會員ID'], 名稱: clean(a.label, 20) || ar.area, 行政區: ar.area, 地址: address, 收件人: recipient, 電話: phone, 備註: clean(a.note, 100), 建立時間: nowStamp() });
    }
  }
  // 付款
  const singles = lines.filter((l) => !l.sub), singleTotal = singles.reduce((s, l) => s + (num(l.it['單點價'], 0) + l.addUnit) * l.qty, 0);
  const pay = p.pay === '現付' ? '現付' : '錢包';
  const feeNow = pick === '地址' ? o['配送費'] : 0;
  // 付現訂單：方案那份的升級差額＋加購也在取餐時一起付（使用者 11/7 決定 3A）；淨額是退款時仍退到錢包
  const subCash = pay === '現付' && subLines[0] ? Math.max(0, num(subLines[0].it['訂閱加價'], 0) - up.value + subLines[0].addUnit) : 0;
  if (pay === '現付') {
    if (!singles.length && !feeNow && !subCash) throw new UserError('這筆沒有需要付現的金額');
    if (m['付現停用']) throw new UserError('你的「取餐時付現」已停用（沒來取餐次數過多），請改用錢包付款或洽門市');
    if ((await cashOpen(c, m['會員ID'])) - (oldO && oldO['付款方式'] === '現付' ? 1 : 0) >= num(st['付現未取上限'], 2)) throw new UserError('你已經有 ' + num(st['付現未取上限'], 2) + ' 筆付現訂單還沒取餐，請改用錢包付款');
  } else {
    const need = singleTotal + feeNow, wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: m['會員ID'] }));
    if (wal.total + oldCredit < need) throw new UserError('錢包餘額不足：需要 ' + need.toLocaleString() + ' 元，目前 ' + wal.total.toLocaleString() + ' 元' + (oldCredit ? '（含原訂單退回 ' + oldCredit + ' 元）' : ''));
  }
  // 改期：檢查都通過了，先取消舊的（退回錢與餐數），再寫入新的
  if (old.length) {
    const { orderMemberApi } = await import('./orders.js');
    for (const r of old) await orderMemberApi.orderCancel(c, m, { resId: r['預約ID'] }).catch(async (e) => { throw e; });
    if (oldO) await closeOrderIfEmpty(c, oldO['訂單ID'], by);
  }
  const oid = 'O' + Date.now().toString(36).toUpperCase() + rid(3), now = nowStamp();
  const wal0 = walletOf(await c.db.all('錢包紀錄', { 會員ID: m['會員ID'] }));
  let bonusLeft = wal0.bonus;
  await c.db.insert('訂單', Object.assign(o, { 訂單ID: oid, 會員ID: m['會員ID'], 日期: date, 時段: slot, 付款方式: pay, 應收現金: pay === '現付' ? singleTotal + feeNow + subCash : 0, 狀態: '已預約', 建立時間: now, 建立者: by, 配送費狀態: feeNow ? (pay === '現付' ? '現付' : '已扣款') : o['配送費狀態'] }));
  for (const l of lines) {
    const resId = 'B' + Date.now().toString(36).toUpperCase() + rid(4), price = num(l.it['單點價'], 0);
    const row = { 預約ID: resId, 訂單ID: oid, 會員ID: m['會員ID'], 日期: date, 時段: slot, 取餐方式: o['取餐方式'], 配送點ID: o['配送點ID'], 份量: l.it['份量'], 主菜: l.it['主菜'], 品項ID: l.it['品項ID'], 醬汁: l.sauce['名稱'], 加購項目: l.drinks.map((d) => d['品項ID']).join(','), 單點原價: price, 份數: l.qty, 狀態: '已預約', 建立時間: now, 建立者: by, 備註: l.drinks.length ? '加購：' + l.drinks.map((d) => d['名稱']).join('、') : '' };
    if (l.sub) {
      Object.assign(row, { 類別: '訂閱', 訂閱ID: sub['訂閱ID'], 升級差額: num(l.it['訂閱加價'], 0) - up.value, 加購金額: l.addUnit, 扣款狀態: subCash ? '取餐付現' : '未扣款' });
      await c.db.insert('預約', row);
      await c.env.DB.prepare('UPDATE subscriptions SET remaining = remaining - 1 WHERE sub_id = ? AND remaining > 0').bind(sub['訂閱ID']).run();
    } else {
      const amt = (price + l.addUnit) * l.qty, b = pay === '錢包' ? Math.min(bonusLeft, amt) : 0; bonusLeft -= b;
      Object.assign(row, { 類別: '單點', 訂閱ID: '', 升級差額: 0, 加購金額: l.addUnit * l.qty, 付款金額: pay === '錢包' ? amt : 0, 用掉紅利: b, 扣款狀態: pay === '錢包' ? '已扣款' : '取餐付現' });
      await c.db.insert('預約', row);
    }
  }
  if (pay === '錢包') {
    if (singleTotal) await ledgerAdd(c, m['會員ID'], '單點扣款', -singleTotal, { 對應ID: oid, 經手人員: by, 備註: date + ' ' + slot + ' 單點 ' + singles.reduce((s, l) => s + l.qty, 0) + ' 份' });
    if (feeNow) await ledgerAdd(c, m['會員ID'], '配送費扣款', -feeNow, { 對應ID: oid, 經手人員: by, 備註: date + ' ' + slot + ' 送到 ' + o['行政區'] + '（未滿 ' + threshold(st, o['距離公里']) + ' 份）' });
  }
  return { ok: true, orderId: oid, total, fee: feeNow, cashDue: pay === '現付' ? singleTotal + feeNow + subCash : 0, pointName };
}

export const order2MemberApi = {
  orderCreate2: (c, m, p) => createOrder2(c, m, p, '會員'),
  async addrDelete(c, m, p) { const x = await c.db.first('常用地址', { 地址ID: clean(p.id, 30), 會員ID: m['會員ID'] }); if (x) await c.db.remove('常用地址', x._row); return { ok: true }; }
};

export const order2Ops = {
  async adminOrderCreate2(c, p, a) { needAll(a); const m = await c.db.first('會員', { 會員ID: clean(p.memberId, 30) }); if (!m || m['狀態'] !== '正常') throw new UserError('找不到這位會員'); return createOrder2(c, m, p, a.email); },
  async adminAreas(c, p, a) { needAll(a); const st = await settings(c); return { areas: (await areas(c, true)).map((x) => Object.assign(x, { fee: feeOf(st, x.km), min: threshold(st, x.km) })) }; },
  async adminSaveArea(c, p, a) {
    needAll(a);
    const v = p.area || {}, area = clean(v.area, 10), km = num(v.km, NaN);
    if (!area) throw new UserError('請填寫行政區'); if (!(km >= 0)) throw new UserError('請填寫距離');
    const vals = { 行政區: area, 距離公里: km, 啟用: !!v.on, 排序: Math.floor(num(v.order, 999)), 備註: clean(v.note, 100) };
    const hit = await c.db.first('配送行政區', { 行政區: clean(v.orig || area, 10) });
    if (hit) await c.db.update('配送行政區', hit._row, vals); else await c.db.insert('配送行政區', vals);
    return { ok: true };
  },
  async adminDeleteArea(c, p, a) { needAll(a); const hit = await c.db.first('配送行政區', { 行政區: clean(p.area, 10) }); if (hit) await c.db.remove('配送行政區', hit._row); return { ok: true }; },
  /** 付現訂單：收到現金 */
  async adminOrderCash(c, p, a) {
    needAll(a);
    const o = await c.db.first('訂單', { 訂單ID: clean(p.orderId, 30) }); if (!o || o['付款方式'] !== '現付') throw new UserError('找不到這筆付現訂單');
    if (o['已收現金']) throw new UserError('這筆已經收過現金');
    await c.db.update('訂單', o._row, { 已收現金: true, 收款人員: a.email, 備註: (o['備註'] ? o['備註'] + '；' : '') + '已收現金 ' + num(o['應收現金'], 0) + ' 元 ' + nowStamp() });
    return { ok: true };
  },
  /** 重新開放某位會員的付現 */
  async adminCashUnblock(c, p, a) { needAll(a); const m = await c.db.first('會員', { 會員ID: clean(p.memberId, 30) }); if (!m) throw new UserError('找不到這位會員'); await c.db.update('會員', m._row, { 付現停用: false, 付現沒來次數: 0 }); return { ok: true }; },
  async adminOrderCancelWhole(c, p, a) { needAll(a); return cancelWhole(c, null, p.orderId, a.email); }
};
export async function cancelWhole(c, m, orderId, by) {
  const o = await c.db.first('訂單', { 訂單ID: clean(orderId, 30) });
  if (!o || (m && o['會員ID'] !== m['會員ID'])) throw new UserError('找不到這筆訂單');
  const rows = (await c.db.all('預約', { 訂單ID: o['訂單ID'] })).filter((r) => r['狀態'] !== '已取消');
  if (rows.some((r) => r['狀態'] !== '已預約')) throw new UserError('已經截單鎖定，不能取消（請洽門市）');
  const { orderMemberApi } = await import('./orders.js');
  for (const r of rows) await (m ? orderMemberApi.orderCancel(c, m, { resId: r['預約ID'] }) : (await import('./orders.js')).orderOps.adminOrderCancel(c, { resId: r['預約ID'] }, { all: true, email: by }));
  await closeOrderIfEmpty(c, o['訂單ID'], by);
  return { ok: true };
}
order2MemberApi.orderCancelWhole = (c, m, p) => cancelWhole(c, m, p.orderId, '會員');
