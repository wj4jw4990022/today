import { nowStamp, rid } from './util.js';
import { walletOf } from './members.js';

/**
 * 付款自己分配（2026-11-07，使用者決定）：一筆訂單＝用紅利 B＋用錢包 W＋取餐時付現 C。
 * - 下單時 B、W 只預留（不寫錢包紀錄），截單時才扣：錢包紀錄「訂餐・紅利」「訂餐・錢包」。
 * - 金額變少（取消便當、整期升級後差額變小、店家補償、截單重算配送費）：先減現場付，再減錢包，最後紅利。
 *   還沒扣款＝直接改數字；已扣款＝錢包退回（紅利退回紅利）；現場付已收現金＝退到錢包（可退現金）。
 * - 截單時才多出來的錢（配送點未達門檻且願付配送費、送地址取消到不滿免運）：這筆有現場付就加到現場付，
 *   沒有就從錢包扣（先扣紅利），錢包不夠就加到現場付。
 */
const num = (v, d) => { const s = String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim(); const n = Number(s); return s === '' || isNaN(n) ? d : n; };
const led = (c, memberId, type, amount, o) => c.db.insert('錢包紀錄', Object.assign({ 紀錄ID: 'W' + Date.now().toString(36).toUpperCase() + rid(3), 會員ID: memberId, 時間: nowStamp(), 類型: type, 金額: amount, 可退現金: true, 狀態: '已入帳' }, o || {}));

/** 一個便當在訂單裡要付的錢：單點＝單點價×份數＋加購；方案餐＝升級差額＋加購（不小於 0） */
export const lineAmt = (r) => r['類別'] === '單點' ? num(r['單點原價'], 0) * num(r['份數'], 1) + num(r['加購金額'], 0) : Math.max(0, num(r['升級差額'], 0) + num(r['加購金額'], 0));
export const isSplit = (o) => !!(o && o['分帳']);
export const parts = (o) => ({ bonus: num(o['用紅利'], 0), wallet: num(o['用錢包'], 0), cash: num(o['應收現金'], 0) });

/** 訂單金額變少 amt：先減現場付、再減錢包、最後紅利 */
export async function reduceOrder(c, o, amt, why, by) {
  amt = Math.max(0, Math.round(amt)); if (!amt || !o) return;
  o = await c.db.first('訂單', { 訂單ID: o['訂單ID'] }); if (!o) return;
  let { bonus, wallet, cash } = parts(o);
  const dc = Math.min(cash, amt); amt -= dc;
  const dw = Math.min(wallet, amt); amt -= dw;
  const db = Math.min(bonus, amt);
  const charged = !!o['已扣款'], paidCash = !!o['已收現金'];
  if (charged && dw > 0) await led(c, o['會員ID'], '退款轉入', dw, { 可退現金: true, 對應ID: o['訂單ID'], 經手人員: by, 備註: why + '（退回錢包）' });
  if (charged && db > 0) await led(c, o['會員ID'], '退款轉入', db, { 可退現金: false, 對應ID: o['訂單ID'], 經手人員: by, 備註: why + '（退回紅利）' });
  if (paidCash && dc > 0) await led(c, o['會員ID'], '退款轉入', dc, { 可退現金: true, 對應ID: o['訂單ID'], 經手人員: by, 備註: why + '（已付現金，退到錢包）' });
  const upd = { 用紅利: bonus - db, 用錢包: wallet - dw };
  if (!paidCash) { upd['應收現金'] = cash - dc; if (cash - dc <= 0 && o['付款方式'] === '現付') upd['付款方式'] = '錢包'; }
  await c.db.update('訂單', o._row, upd);
}

/** 截單時多出來的錢 amt：有現場付就加到現場付；沒有就從錢包扣（先扣紅利），不夠就加到現場付 */
export async function addToOrder(c, o, amt, type, why, by) {
  amt = Math.max(0, Math.round(amt)); if (!amt || !o) return '';
  o = await c.db.first('訂單', { 訂單ID: o['訂單ID'] }); if (!o) return '';
  const toCash = async () => { await c.db.update('訂單', o._row, { 應收現金: num(o['應收現金'], 0) + amt, 付款方式: '現付', 備註: (o['備註'] ? o['備註'] + '；' : '') + why + '：現場加收 ' + amt + ' 元' }); return '現付'; };
  if (num(o['應收現金'], 0) > 0 && !o['已收現金']) return toCash();
  const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: o['會員ID'] }));
  if (wal.total < amt) return toCash();
  await led(c, o['會員ID'], type, -amt, { 對應ID: o['訂單ID'], 經手人員: by, 備註: why });
  return '已扣款';
}

/** 截單：把訂單的紅利、錢包部分真的扣掉（扣不到的部分改成現場付） */
export async function chargeOrder(c, o, by) {
  o = await c.db.first('訂單', { 訂單ID: o['訂單ID'] });
  if (!isSplit(o) || o['已扣款'] || o['狀態'] === '已取消') return;
  let { bonus, wallet, cash } = parts(o);
  const wal = walletOf(await c.db.all('錢包紀錄', { 會員ID: o['會員ID'] }));
  const sb = Math.max(0, bonus - Math.max(0, wal.bonus)), sw = Math.max(0, wallet - Math.max(0, wal.cash)); // 店員調整過錢包時可能不夠
  bonus -= sb; wallet -= sw;
  const note = o['日期'] + ' ' + o['時段'] + ' 訂餐';
  if (bonus > 0) await led(c, o['會員ID'], '訂餐・紅利', -bonus, { 可退現金: false, 對應ID: o['訂單ID'], 經手人員: by, 備註: note });
  if (wallet > 0) await led(c, o['會員ID'], '訂餐・錢包', -wallet, { 對應ID: o['訂單ID'], 經手人員: by, 備註: note });
  const upd = { 已扣款: true, 用紅利: bonus, 用錢包: wallet };
  if (sb + sw > 0) Object.assign(upd, { 應收現金: cash + sb + sw, 付款方式: '現付', 備註: (o['備註'] ? o['備註'] + '；' : '') + '截單時錢包不足 ' + (sb + sw) + ' 元，改現場付' });
  await c.db.update('訂單', o._row, upd);
}
