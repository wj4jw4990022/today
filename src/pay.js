import { UserError, clean, nowStamp, rid } from './util.js';
import { needAll } from './service.js';
import { settings, walletOf, currentSub, buyPlan, topupOptions } from './members.js';

/**
 * 會員自己訂閱（2026-11-06，草圖 m39）
 * - 錢包夠：會員直接用錢包購買／續訂。
 * - 錢包不夠或只想儲值：送出付款申請（轉帳填末五碼／LINE Pay／門市付現），店員在後台「收款確認」後入帳；「儲值並購買」同時開通方案。
 * - 「未收到」＝申請作廢，不動錢包。每位會員同時只能有一筆待確認。
 */
const PAY = ['轉帳', 'LINE Pay', '門市付現'];
const num = (v, d) => { const n = Number(String(v === undefined || v === null ? '' : v).replace(/,/g, '')); return isNaN(n) || String(v).trim() === '' ? d : n; };
const plansOf = (st) => [8, 12, 20].map((n) => ({ meals: n, total: num(st['方案' + n + '餐_總價'], 0), per: num(st['方案' + n + '餐_每餐'], 0), bonus: num(st['新會員折扣_' + n + '餐'], 0) })).filter((x) => x.total > 0);
const view = (r) => ({ id: r['申請ID'], kind: r['類型'], amount: r['金額'], meals: r['餐數'], code: r['推薦碼'], method: r['付款方式'], last5: r['末五碼'], status: r['狀態'], at: String(r['建立時間']).slice(0, 16), by: r['處理人員'], doneAt: String(r['處理時間']).slice(0, 16), note: r['備註'] });

async function checkCode(c, m, code) {
  if (!code) return null;
  if (m['曾訂閱']) throw new UserError('推薦碼只限第一次訂閱使用');
  const ref = await c.db.first('會員', { 推薦碼: code });
  if (!ref || ref['狀態'] !== '正常') throw new UserError('找不到這個推薦碼');
  if (ref['會員ID'] === m['會員ID'] || (ref['手機'] && ref['手機'] === m['手機'])) throw new UserError('不能使用自己的推薦碼');
  return ref;
}

export const payMemberApi = {
  async payInfo(c, m) {
    const st = await settings(c), sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] }));
    const pend = (await c.db.all('付款申請', { 會員ID: m['會員ID'], 狀態: '待確認' }))[0];
    return {
      plans: plansOf(st), days: num(st['每期天數'], 30), ever: !!m['曾訂閱'], topup: topupOptions(st),
      sub: sub ? { left: sub['剩餘餐數'], meals: sub['方案餐數'], end: sub['到期日'], status: sub['狀態'] } : null,
      wallet: walletOf(await c.db.all('錢包紀錄', { 會員ID: m['會員ID'] })),
      howto: { 轉帳: String(st['轉帳資訊'] || '').trim() || '請洽門市索取轉帳帳號', 'LINE Pay': String(st['LINE Pay說明'] || '請到門市用 LINE Pay 付款'), 門市付現: String(st['門市付現說明'] || '請到門市付現') },
      pending: pend ? view(pend) : null
    };
  },
  /** 錢包夠：直接購買或續訂 */
  async payBuy(c, m, p) {
    if (await c.db.first('付款申請', { 會員ID: m['會員ID'], 狀態: '待確認' })) throw new UserError('你有一筆付款確認中的申請，請等店員確認或先取消');
    const sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] }));
    if (sub && sub['狀態'] !== '使用中') throw new UserError('方案暫停中，不能續訂');
    return buyPlan(c, m, { meals: p.meals, code: clean(p.code, 10).toUpperCase() }, '會員');
  },
  /** 送出付款申請：kind＝儲值並購買（金額＝方案價－錢包餘額）或 儲值（固定金額） */
  async payRequest(c, m, p) {
    if (await c.db.first('付款申請', { 會員ID: m['會員ID'], 狀態: '待確認' })) throw new UserError('你已經有一筆付款確認中的申請');
    const st = await settings(c), method = clean(p.method, 12), last5 = clean(p.last5, 5);
    if (PAY.indexOf(method) < 0) throw new UserError('請選擇付款方式');
    if (method === '轉帳' && !/^\d{5}$/.test(last5)) throw new UserError('請填寫轉帳帳號末五碼');
    let kind, amount, meals = 0, code = '';
    if (p.kind === '儲值並購買') {
      const plan = plansOf(st).find((x) => x.meals === num(p.meals, 0)); if (!plan) throw new UserError('請選擇方案');
      const sub = currentSub(await c.db.all('訂閱', { 會員ID: m['會員ID'] })); if (sub && sub['狀態'] !== '使用中') throw new UserError('方案暫停中，不能續訂');
      code = clean(p.code, 10).toUpperCase(); if (code) { if (sub) throw new UserError('推薦碼只限第一次訂閱使用'); await checkCode(c, m, code); }
      const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: m['會員ID'] }));
      amount = plan.total - wal.total; if (amount <= 0) throw new UserError('錢包已經足夠，可以直接用錢包購買');
      kind = '儲值並購買'; meals = plan.meals;
    } else {
      amount = num(p.amount, 0); if (topupOptions(st).indexOf(amount) < 0) throw new UserError('請選擇儲值金額');
      kind = '儲值';
    }
    await c.db.insert('付款申請', { 申請ID: 'P' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: m['會員ID'], 類型: kind, 金額: amount, 餐數: meals, 推薦碼: code, 付款方式: method, 末五碼: method === '轉帳' ? last5 : '', 狀態: '待確認', 建立時間: nowStamp() });
    return { ok: true };
  },
  async payCancel(c, m) {
    const r = await c.db.first('付款申請', { 會員ID: m['會員ID'], 狀態: '待確認' });
    if (!r) throw new UserError('沒有待確認的申請');
    await c.db.update('付款申請', r._row, { 狀態: '已取消', 處理人員: '會員', 處理時間: nowStamp() });
    return { ok: true };
  }
};

export const payOps = {
  async adminPayList(c, p, a) {
    needAll(a);
    const [rows, ms] = await Promise.all([c.db.all('付款申請'), c.db.all('會員')]);
    const nm = {}; ms.forEach((x) => { nm[x['會員ID']] = { name: x['姓名'], phone: x['手機'] }; });
    const codeOwner = {}; ms.forEach((x) => { codeOwner[x['推薦碼']] = x['姓名']; });
    const out = (r) => Object.assign(view(r), { member: nm[r['會員ID']] || { name: r['會員ID'], phone: '' }, memberId: r['會員ID'], codeOwner: codeOwner[r['推薦碼']] || '' });
    return { pending: rows.filter((r) => r['狀態'] === '待確認').map(out), done: rows.filter((r) => r['狀態'] !== '待確認').sort((x, y) => y._row - x._row).slice(0, 30).map(out) };
  },
  async adminPayCount(c, p, a) { needAll(a); return { n: (await c.db.all('付款申請', { 狀態: '待確認' })).length }; },
  /** 確認收款：入帳（儲值），「儲值並購買」接著用錢包開通方案；未收到：作廢 */
  async adminPayHandle(c, p, a) {
    needAll(a);
    const r = await c.db.first('付款申請', { 申請ID: clean(p.reqId, 30) });
    if (!r || r['狀態'] !== '待確認') throw new UserError('找不到這筆待確認的申請');
    if (!p.ok) { await c.db.update('付款申請', r._row, { 狀態: '未收到', 處理人員: a.email, 處理時間: nowStamp(), 備註: clean(p.note, 200) }); return { ok: true }; }
    const m = await c.db.first('會員', { 會員ID: r['會員ID'] });
    if (!m) throw new UserError('找不到這位會員');
    await c.db.insert('錢包紀錄', { 紀錄ID: 'W' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: m['會員ID'], 時間: nowStamp(), 類型: '儲值', 金額: r['金額'], 可退現金: true, 付款方式: r['付款方式'] === '門市付現' ? '現金' : r['付款方式'], 轉帳末五碼: r['末五碼'], 對應ID: r['申請ID'], 經手人員: a.email, 狀態: '已入帳', 備註: '網站付款申請' });
    let msg = '已入帳 ' + r['金額'] + ' 元';
    await c.db.update('付款申請', r._row, { 狀態: '已確認', 處理人員: a.email, 處理時間: nowStamp() });
    if (r['類型'] === '儲值並購買') {
      try { await buyPlan(c, m, { meals: r['餐數'], code: r['推薦碼'] }, a.email); msg += '，已開通 ' + r['餐數'] + ' 餐方案'; }
      catch (e) { if (!(e instanceof UserError)) throw e; msg += '，但開通方案失敗：' + e.message + '（錢已在錢包，可在會員頁面手動購買）'; await c.db.update('付款申請', r._row, { 備註: '開通失敗：' + e.message }); }
    }
    return { ok: true, msg };
  }
};
