import { UserError, clean, todayStr, nowStamp, rid } from './util.js';
import { needAll } from './service.js';

/**
 * 健康餐會員與錢包（後台優先，2026-11-06）
 * - LINE 還沒串好：會員由店員在後台建立、儲值、用錢包購買訂閱方案。
 * - 訂閱方案一律從錢包扣款；儲值只有固定金額或自訂金額（自訂要填原因、有上限）。
 * - 錢包紀錄只新增不修改。餘額依紀錄順序重算，分成「可退現金」與「紅利」（只能消費）；扣款先扣紅利。
 * - 推薦：新會員用推薦碼買第一期 → 照原價扣款，另外存入紅利；推薦人的紅利等新會員取餐滿 N 餐才發（之後的步驟）。
 * 所有操作只有總管理員可以用。
 */

export async function settings(c) {
  const m = {};
  (await c.db.all('健康餐設定')).forEach((r) => { m[r['設定項目']] = r['值']; });
  return m;
}
const num = (v, def) => { const s = String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim(); const n = Number(s); return s === '' || isNaN(n) ? def : n; };
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const PAY = ['現金', '轉帳', 'LINE Pay'];
const ACTIVE = ['使用中', '暫停'];
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除 0／O、1／I

export function normEmail(e) {
  e = String(e || '').trim().toLowerCase();
  const m = /^([^@]+)@(gmail\.com|googlemail\.com)$/.exec(e);
  if (m) return m[1].split('+')[0].replace(/\./g, '') + '@gmail.com';
  return e;
}
export function topupOptions(st) {
  return String(st['儲值金額選項'] || '1400,1980,3100,1000,2000,3000,5000').split(/[,，\s]+/).map((x) => num(x, 0)).filter((x) => x > 0 && Number.isInteger(x));
}

/** 依紀錄順序重算錢包：可退現金、紅利。只算「已入帳」 */
export function walletOf(rows) {
  let cash = 0, bonus = 0;
  rows.filter((r) => r['狀態'] === '已入帳').sort((a, b) => a._row - b._row).forEach((r) => {
    const amt = Number(r['金額']) || 0, type = r['類型'];
    if (amt >= 0) { if (r['可退現金']) cash += amt; else bonus += amt; return; }
    let out = -amt;
    if (type === '退現金') { cash -= out; return; }
    if (type === '紅利收回' || type === '獎勵收回') { bonus -= out; return; }
    if (type === '人工調整') { if (r['可退現金']) cash -= out; else bonus -= out; return; }
    const fromBonus = Math.min(bonus, out); bonus -= fromBonus; cash -= out - fromBonus; // 消費：先扣紅利
  });
  return { total: cash + bonus, cash, bonus };
}

async function member(c, memberId) {
  const m = await c.db.first('會員', { 會員ID: clean(memberId, 30) });
  if (!m || m['狀態'] === '已刪除') throw new UserError('找不到這位會員');
  return m;
}
const ledgerOf = (c, memberId) => c.db.all('錢包紀錄', { 會員ID: memberId });
export const currentSub = (subs) => subs.filter((s) => ACTIVE.indexOf(s['狀態']) >= 0).sort((a, b) => b._row - a._row)[0] || null;
async function ledger(c, memberId, type, amount, o) {
  await c.db.insert('錢包紀錄', Object.assign({ 紀錄ID: 'W' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: memberId, 時間: nowStamp(), 類型: type, 金額: amount, 可退現金: true, 狀態: '已入帳' }, o || {}));
}

/** 會員編號：M＋建立日期（YYMMDD）＋4 碼英數字，例 M261106-SK6Y；推薦碼 6 碼英數字。兩者都不重複、不能修改 */
export async function newIds(c) {
  const d = todayStr().slice(2).replace(/-/g, '');
  const pick = (n) => { let x = ''; for (let j = 0; j < n; j++) x += CODE_CH[Math.floor(Math.random() * CODE_CH.length)]; return x; };
  for (let i = 0; i < 20; i++) {
    const id = 'M' + d + '-' + pick(4), code = pick(6);
    if (!(await c.db.first('會員', { 會員ID: id })) && !(await c.db.first('會員', { 推薦碼: code }))) return { id, code };
  }
  throw new UserError('產生會員編號失敗，請再試一次');
}

function summary(m, wal, sub) {
  return {
    id: m['會員ID'], name: m['姓名'], phone: m['手機'], email: m['Email'], note: m['備註'], code: m['推薦碼'], line: !!m['LINEID'],
    phoneOk: !!m['手機已驗證'], status: m['狀態'], ever: !!m['曾訂閱'], referredBy: m['推薦人會員ID'], since: m['註冊時間'],
    wallet: wal, sub: sub ? { id: sub['訂閱ID'], meals: sub['方案餐數'], left: sub['剩餘餐數'], start: sub['開始日'], end: sub['到期日'], status: sub['狀態'] } : null
  };
}

export const memberOps = {
  /** 會員清單（含錢包餘額與目前方案）；q＝姓名、手機、Email、會員編號關鍵字 */
  async adminMemberList(c, p, a) {
    needAll(a);
    const st = await settings(c), kw = clean(p.q, 60).toLowerCase();
    const [ms, led, subs] = await Promise.all([c.db.all('會員'), c.db.all('錢包紀錄'), c.db.all('訂閱')]);
    const list = ms.filter((m) => m['狀態'] !== '已刪除' && m['狀態'] !== '待合併').filter((m) => !kw || [m['姓名'], m['手機'], m['Email'], m['會員ID'], m['推薦碼']].some((v) => String(v).toLowerCase().indexOf(kw) >= 0))
      .sort((x, y) => y._row - x._row)
      .map((m) => summary(m, walletOf(led.filter((r) => r['會員ID'] === m['會員ID'])), currentSub(subs.filter((s) => s['會員ID'] === m['會員ID']))));
    const plans = [8, 12, 20].map((n) => ({ meals: n, total: num(st['方案' + n + '餐_總價'], 0), bonus: num(st['新會員折扣_' + n + '餐'], 0) })).filter((x) => x.total > 0);
    return { members: list, topup: topupOptions(st), customMax: num(st['自訂儲值上限'], 10000), plans, days: num(st['每期天數'], 30), referrerBonus: num(st['推薦人獎勵'], 0), referrerMeals: num(st['推薦發放取餐數'], 3) };
  },
  /** 單一會員：資料、錢包、錢包紀錄、訂閱紀錄 */
  async adminMemberGet(c, p, a) {
    needAll(a);
    const m = await member(c, p.memberId);
    const [led, subs, refs] = await Promise.all([ledgerOf(c, m['會員ID']), c.db.all('訂閱', { 會員ID: m['會員ID'] }), c.db.all('推薦紀錄', { 推薦人會員ID: m['會員ID'] })]);
    const s = summary(m, walletOf(led), currentSub(subs));
    s.ledger = led.sort((x, y) => y._row - x._row).map((r) => ({ id: r['紀錄ID'], at: String(r['時間']).slice(0, 16), type: r['類型'], amount: r['金額'], refundable: !!r['可退現金'], method: r['付款方式'], last5: r['轉帳末五碼'], ref: r['對應ID'], by: r['經手人員'], status: r['狀態'], note: r['備註'] }));
    s.subs = subs.sort((x, y) => y._row - x._row).map((x) => ({ id: x['訂閱ID'], meals: x['方案餐數'], left: x['剩餘餐數'], paid: x['實付金額'], start: x['開始日'], end: x['到期日'], status: x['狀態'] }));
    s.referrals = refs.map((r) => ({ newMember: r['新會員ID'], status: r['狀態'], picked: r['新會員已取餐數'] }));
    return s;
  },
  /** 新增或修改會員（店員代建）。沒有 memberId＝新增 */
  async adminSaveMember(c, p, a) {
    needAll(a);
    const v = p.member || {}, name = clean(v.name, 30), phone = clean(v.phone, 20).replace(/[\s-]/g, ''), email = clean(v.email, 120), note = clean(v.note, 300);
    if (!name) throw new UserError('請填寫姓名');
    if (!/^09\d{8}$/.test(phone)) throw new UserError('手機請填 09 開頭的 10 碼數字');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError('Email 格式不正確');
    const en = email ? normEmail(email) : '';
    const all = (await c.db.all('會員')).filter((m) => m['會員ID'] !== v.memberId && m['狀態'] !== '已刪除');
    const dupW = all.find((m) => m['待合併手機'] === phone); if (dupW) throw new UserError('這支手機有一筆 LINE 會員在「待合併」，請先處理');
    const dupP = all.find((m) => m['手機'] === phone); if (dupP) throw new UserError('這支手機已經是會員（' + dupP['姓名'] + '・' + dupP['會員ID'] + '）');
    const dupE = en && all.find((m) => m['Email比對'] === en); if (dupE) throw new UserError('這個 Email 已經是會員（' + dupE['姓名'] + '・' + dupE['會員ID'] + '）');
    const vals = { 姓名: name, 手機: phone, Email: email, Email比對: en, 備註: note };
    if (v.memberId) {
      const m = await member(c, v.memberId);
      if (m['Email比對'] !== en) vals['Email已驗證時間'] = '';
      await c.db.update('會員', m._row, vals);
      return { ok: true, memberId: m['會員ID'] };
    }
    const ids = await newIds(c);
    await c.db.insert('會員', Object.assign(vals, { 會員ID: ids.id, 推薦碼: ids.code, 註冊時間: nowStamp(), 狀態: '正常', 備註: note || ('店員建立：' + a.email) }));
    return { ok: true, memberId: ids.id };
  },
  /** 儲值：固定金額，或自訂金額（必填原因、不超過上限）。店員按下即入帳 */
  async adminTopup(c, p, a) {
    needAll(a);
    const m = await member(c, p.memberId), st = await settings(c);
    const amt = num(p.amount, 0), custom = !!p.custom, reason = clean(p.reason, 200), method = clean(p.method, 10), last5 = clean(p.last5, 5);
    if (!Number.isInteger(amt) || amt <= 0) throw new UserError('請選擇或輸入儲值金額');
    if (custom) {
      const max = num(st['自訂儲值上限'], 10000);
      if (amt > max) throw new UserError('自訂金額單筆最多 ' + max.toLocaleString() + ' 元');
      if (!reason) throw new UserError('自訂金額請填寫原因');
    } else if (topupOptions(st).indexOf(amt) < 0) throw new UserError('請從固定金額中選擇，或改用自訂金額');
    if (PAY.indexOf(method) < 0) throw new UserError('請選擇付款方式');
    if (method === '轉帳' && !/^\d{5}$/.test(last5)) throw new UserError('轉帳請填寫末五碼');
    await ledger(c, m['會員ID'], '儲值', amt, { 付款方式: method, 轉帳末五碼: method === '轉帳' ? last5 : '', 經手人員: a.email, 備註: custom ? '自訂金額：' + reason : '' });
    return { ok: true };
  },
  /** 用錢包購買方案；推薦碼只限第一次訂閱，新會員得紅利 */
  async adminBuyPlan(c, p, a) {
    needAll(a);
    const m = await member(c, p.memberId), st = await settings(c), meals = num(p.meals, 0);
    const price = num(st['方案' + meals + '餐_總價'], 0);
    if (!price) throw new UserError('請選擇方案');
    const subs = await c.db.all('訂閱', { 會員ID: m['會員ID'] });
    if (currentSub(subs)) throw new UserError('這位會員還有使用中的方案（續訂功能之後開放）');
    const wal = walletOf(await ledgerOf(c, m['會員ID']));
    if (wal.total < price) throw new UserError('錢包餘額不足：還差 ' + (price - wal.total).toLocaleString() + ' 元，請先儲值');
    let referrer = null; const code = clean(p.code, 10).toUpperCase();
    if (code) {
      if (m['曾訂閱'] || subs.length) throw new UserError('推薦碼只限第一次訂閱使用');
      referrer = await c.db.first('會員', { 推薦碼: code });
      if (!referrer || referrer['狀態'] !== '正常') throw new UserError('找不到這個推薦碼');
      if (referrer['會員ID'] === m['會員ID'] || (referrer['手機'] && referrer['手機'] === m['手機'])) throw new UserError('不能使用自己的推薦碼');
      if (await c.db.first('推薦紀錄', { 新會員ID: m['會員ID'] })) throw new UserError('這位會員已經用過推薦碼');
    }
    const days = num(st['每期天數'], 30), start = todayStr(), subId = 'S' + Date.now().toString(36).toUpperCase() + rid(3);
    await c.db.insert('訂閱', { 訂閱ID: subId, 會員ID: m['會員ID'], 方案餐數: meals, 剩餘餐數: meals, 方案金額: price, 推薦折扣: 0, 實付金額: price, 付款方式: '錢包', 收款確認人員: a.email, 收款時間: nowStamp(), 開始日: start, 到期日: addDays(start, days - 1), 狀態: '使用中', 建立時間: nowStamp() });
    await ledger(c, m['會員ID'], '購買方案', -price, { 對應ID: subId, 經手人員: a.email, 備註: meals + ' 餐方案' });
    const upd = { 曾訂閱: true };
    let bonus = 0;
    if (referrer) {
      bonus = num(st['新會員折扣_' + meals + '餐'], 0);
      upd['推薦人會員ID'] = referrer['會員ID'];
      await c.db.insert('推薦紀錄', { 紀錄ID: 'R' + Date.now().toString(36).toUpperCase() + rid(3), 推薦人會員ID: referrer['會員ID'], 新會員ID: m['會員ID'], 新會員訂閱ID: subId, 新會員已取餐數: 0, 獎勵金額: num(st['推薦人獎勵'], 0), 狀態: '等待中' });
      if (bonus > 0) await ledger(c, m['會員ID'], '推薦紅利', bonus, { 可退現金: false, 對應ID: subId, 經手人員: '系統', 備註: '使用推薦碼 ' + code });
    }
    await c.db.update('會員', m._row, upd);
    return { ok: true, subId, bonus };
  },
  /** 人工調整：正數加、負數減；必填原因；預設算紅利（不可退），更正儲值登錄錯誤時可勾「可退現金」 */
  async adminWalletAdjust(c, p, a) {
    needAll(a);
    const m = await member(c, p.memberId), amt = num(p.amount, 0), reason = clean(p.reason, 200), cash = !!p.refundable;
    if (!Number.isInteger(amt) || amt === 0) throw new UserError('請輸入調整金額（整數，扣除請用負數）');
    if (Math.abs(amt) > 100000) throw new UserError('調整金額太大');
    if (!reason) throw new UserError('請填寫調整原因');
    const wal = walletOf(await ledgerOf(c, m['會員ID']));
    if (amt < 0 && (cash ? wal.cash : wal.bonus) < -amt) throw new UserError('扣除金額超過' + (cash ? '可退現金' : '紅利') + '餘額');
    await ledger(c, m['會員ID'], '人工調整', amt, { 可退現金: cash, 經手人員: a.email, 備註: reason });
    return { ok: true };
  },
  /** 退現金：只能退「可退現金」的部分（紅利不能退） */
  async adminRefundCash(c, p, a) {
    needAll(a);
    const m = await member(c, p.memberId), amt = num(p.amount, 0), reason = clean(p.reason, 200), method = clean(p.method, 10);
    if (!Number.isInteger(amt) || amt <= 0) throw new UserError('請輸入退款金額');
    if (!reason) throw new UserError('請填寫退款原因');
    if (PAY.indexOf(method) < 0) throw new UserError('請選擇退款方式');
    const wal = walletOf(await ledgerOf(c, m['會員ID']));
    if (amt > wal.cash) throw new UserError('最多只能退 ' + wal.cash.toLocaleString() + ' 元（紅利不能退現金）');
    await ledger(c, m['會員ID'], '退現金', -amt, { 付款方式: method, 經手人員: a.email, 備註: reason });
    return { ok: true };
  }
};
