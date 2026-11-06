import { UserError, clean, nowStamp, rid } from './util.js';
import { needAll } from './service.js';
import { settings, normEmail, walletOf, currentSub, newIds } from './members.js';

/**
 * 會員 LINE 登入與會員中心（2026-11-06，草圖 m33）
 * - /api/line/login → LINE 授權 → /api/line/callback → 設定登入 cookie → 回到 /member.html
 * - 第一次登入：填姓名、手機、Email（選填）、同意條款。手機和門市會員相同 → 記「待合併」，由店員在後台審核合併。
 * - 會員自己可改：姓名、Email。手機要找店員改（被店員判定「不是同一人」的會員，可以自己補填手機）。
 * 需要：wrangler.jsonc 的 LINE_LOGIN_CHANNEL_ID、Cloudflare Secret 的 LINE_LOGIN_SECRET。
 */
const COOKIE = 'zm', DAYS = 30;
const enc = new TextEncoder();
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function cookieOf(req, name) { const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.get('cookie') || ''); return m ? m[1] : ''; }
const setCookie = (v, maxAge) => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const redirect = (to, cookie) => { const h = new Headers({ location: to, 'cache-control': 'no-store' }); if (cookie) h.append('set-cookie', cookie); return new Response(null, { status: 302, headers: h }); };
const callbackUrl = (url) => url.origin + '/api/line/callback';

/** GET /api/line/login、/api/line/callback、/api/line/logout */
export async function handleLine(request, c, url) {
  const env = c.env;
  if (url.pathname === '/api/line/logout') {
    const t = cookieOf(request, COOKIE); if (t) await c.env.DB.prepare('DELETE FROM member_sessions WHERE token = ?').bind(await sha(t)).run();
    return redirect('/member.html', setCookie('', 0));
  }
  if (!env.LINE_LOGIN_CHANNEL_ID || !env.LINE_LOGIN_SECRET) return redirect('/member.html?err=' + encodeURIComponent('LINE 登入尚未設定完成，請稍後再試'));
  if (url.pathname === '/api/line/login') {
    const state = rand(16), now = Date.now();
    await env.DB.prepare('DELETE FROM line_states WHERE created_at < ?').bind(now - 600000).run();
    await env.DB.prepare('INSERT INTO line_states (state, created_at) VALUES (?, ?)').bind(state, now).run();
    const q = new URLSearchParams({ response_type: 'code', client_id: env.LINE_LOGIN_CHANNEL_ID, redirect_uri: callbackUrl(url), state, scope: 'profile openid', bot_prompt: 'normal' });
    return redirect('https://access.line.me/oauth2/v2.1/authorize?' + q);
  }
  if (url.pathname === '/api/line/callback') {
    const fail = (m) => redirect('/member.html?err=' + encodeURIComponent(m));
    const code = url.searchParams.get('code'), state = url.searchParams.get('state') || '';
    if (!code) return fail('LINE 登入已取消');
    const st = await env.DB.prepare('DELETE FROM line_states WHERE state = ? AND created_at > ? RETURNING state').bind(state, Date.now() - 600000).first();
    if (!st) return fail('登入逾時，請再按一次「用 LINE 登入」');
    const tok = await (await fetch('https://api.line.me/oauth2/v2.1/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(url), client_id: env.LINE_LOGIN_CHANNEL_ID, client_secret: env.LINE_LOGIN_SECRET }) })).json();
    if (!tok.id_token) { console.error('LINE token 失敗', JSON.stringify(tok).slice(0, 300)); return fail('LINE 登入失敗，請再試一次'); }
    const v = await (await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: tok.id_token, client_id: env.LINE_LOGIN_CHANNEL_ID }) })).json();
    if (!v.sub) { console.error('LINE verify 失敗', JSON.stringify(v).slice(0, 300)); return fail('LINE 登入失敗，請再試一次'); }
    return redirect('/member.html', setCookie(await startSession(c, v.sub, v.name || ''), DAYS * 86400));
  }
  return new Response('Not found', { status: 404 });
}

/** 建立登入；已是會員就綁會員，否則先記 LINE 識別碼，等填完資料 */
export async function startSession(c, lineId, lineName) {
  const m = await c.env.DB.prepare("SELECT member_id FROM members WHERE line_id = ? AND status <> '已刪除'").bind(lineId).first();
  const t = rand(24);
  await c.db.insert('會員登入', { 憑證: await sha(t), 會員ID: m ? m.member_id : '', 建立時間: nowStamp(), 到期: Date.now() + DAYS * 86400000, LINEID: lineId, LINE名稱: clean(lineName, 60) });
  return t;
}
async function sessionOf(c, req) {
  const t = cookieOf(req, COOKIE); if (!t) return null;
  const s = await c.db.first('會員登入', { 憑證: await sha(t) });
  if (!s || Number(s['到期']) < Date.now()) return null;
  return s;
}

function meView(m, led, subs) {
  const pending = m['狀態'] === '待合併', sub = pending ? null : currentSub(subs);
  return {
    registered: true, pending, id: m['會員ID'], name: m['姓名'], phone: pending ? m['待合併手機'] : m['手機'], phoneOk: !!m['手機已驗證'], email: m['Email'], code: m['推薦碼'],
    needPhone: !pending && !m['手機'],
    wallet: pending ? { total: 0, cash: 0, bonus: 0 } : walletOf(led),
    sub: sub ? { meals: sub['方案餐數'], left: sub['剩餘餐數'], start: sub['開始日'], end: sub['到期日'], status: sub['狀態'] } : null,
    ledger: pending ? [] : led.sort((x, y) => y._row - x._row).slice(0, 30).map((r) => ({ at: String(r['時間']).slice(0, 16), type: r['類型'], amount: r['金額'], refundable: !!r['可退現金'] }))
  };
}
function checkPhone(p) { p = clean(p, 20).replace(/[\s-]/g, ''); if (!/^09\d{8}$/.test(p)) throw new UserError('手機請填 09 開頭的 10 碼數字'); return p; }
function checkEmail(e) { e = clean(e, 120); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new UserError('Email 格式不正確'); return e; }
async function emailTaken(c, en, selfId) { return en && (await c.db.all('會員', { Email比對: en })).some((x) => x['會員ID'] !== selfId && x['狀態'] !== '已刪除'); }

/** 前台會員 API（action 以 member 開頭；用 cookie 判斷是誰） */
export async function memberApi(c, request, p) {
  const s = await sessionOf(c, request);
  const st = await settings(c);
  if (p.action === 'memberMe') {
    if (!s) return { login: false, lineReady: !!(c.env.LINE_LOGIN_CHANNEL_ID && c.env.LINE_LOGIN_SECRET) };
    if (!s['會員ID']) return { login: true, registered: false, lineName: s['LINE名稱'] };
    const m = await c.db.first('會員', { 會員ID: s['會員ID'] });
    if (!m || m['狀態'] === '已刪除') return { login: true, registered: false, lineName: s['LINE名稱'] };
    const [led, subs] = await Promise.all([c.db.all('錢包紀錄', { 會員ID: m['會員ID'] }), c.db.all('訂閱', { 會員ID: m['會員ID'] })]);
    return Object.assign({ login: true, lineName: s['LINE名稱'], referrerBonus: Number(st['推薦人獎勵']) || 0, referrerMeals: Number(st['推薦發放取餐數']) || 3 }, meView(m, led, subs));
  }
  if (!s) throw new UserError('請先用 LINE 登入');
  if (p.action === 'memberRegister') {
    if (s['會員ID']) throw new UserError('已經註冊過了');
    if (!p.agreeTerms || !p.agreePrivacy) throw new UserError('請勾選同意會員條款與隱私權政策');
    const name = clean(p.name, 30); if (!name) throw new UserError('請填寫姓名');
    const phone = checkPhone(p.phone), email = checkEmail(p.email), en = email ? normEmail(email) : '';
    if (await c.env.DB.prepare("SELECT 1 FROM members WHERE line_id = ? AND status <> '已刪除'").bind(s['LINEID']).first()) throw new UserError('這個 LINE 帳號已經是會員，請重新登入');
    if (await emailTaken(c, en, '')) throw new UserError('這個 Email 已經被其他會員使用');
    const all = (await c.db.all('會員')).filter((x) => x['狀態'] !== '已刪除');
    if (all.some((x) => x['待合併手機'] === phone)) throw new UserError('這支手機已經在等待店員合併，請洽門市');
    const store = all.find((x) => x['手機'] === phone);
    if (store && store['LINEID']) throw new UserError('這支手機已經綁定另一個 LINE 帳號，請洽門市');
    const ids = await newIds(c);
    await c.db.insert('會員', { 會員ID: ids.id, LINEID: s['LINEID'], 姓名: name, 手機: store ? '' : phone, 待合併手機: store ? phone : '', Email: email, Email比對: en, 推薦碼: ids.code, 條款同意時間: nowStamp(), 註冊時間: nowStamp(), 狀態: store ? '待合併' : '正常', 備註: 'LINE 註冊（' + s['LINE名稱'] + '）' });
    await c.env.DB.prepare('UPDATE member_sessions SET member_id = ? WHERE line_id = ?').bind(ids.id, s['LINEID']).run();
    return { ok: true, pending: !!store };
  }
  const m = s['會員ID'] && await c.db.first('會員', { 會員ID: s['會員ID'] });
  if (!m || m['狀態'] === '已刪除') throw new UserError('請先完成註冊');
  if (p.action === 'memberUpdate') {
    const name = clean(p.name, 30), email = checkEmail(p.email), en = email ? normEmail(email) : '';
    if (!name) throw new UserError('請填寫姓名');
    if (await emailTaken(c, en, m['會員ID'])) throw new UserError('這個 Email 已經被其他會員使用');
    const upd = { 姓名: name, Email: email, Email比對: en };
    if (en !== m['Email比對']) upd['Email已驗證時間'] = '';
    if (p.phone && m['狀態'] === '正常' && !m['手機']) { // 只有還沒有手機的會員（店員判定不是同一人）可以自己補填
      const ph = checkPhone(p.phone);
      if ((await c.db.all('會員')).some((x) => x['狀態'] !== '已刪除' && (x['手機'] === ph || x['待合併手機'] === ph))) throw new UserError('這支手機已經是其他會員，請洽門市');
      upd['手機'] = ph;
    }
    await c.db.update('會員', m._row, upd);
    return { ok: true };
  }
  throw new UserError('未知的操作');
}

/** 後台：待合併審核 */
export const mergeOps = {
  async adminMergeList(c, p, a) {
    needAll(a);
    const all = await c.db.all('會員'), led = await c.db.all('錢包紀錄'), subs = await c.db.all('訂閱');
    return all.filter((m) => m['狀態'] === '待合併').map((m) => {
      const s = all.find((x) => x['狀態'] !== '已刪除' && x['狀態'] !== '待合併' && x['手機'] === m['待合併手機']);
      const sub = s && currentSub(subs.filter((x) => x['會員ID'] === s['會員ID']));
      return {
        id: m['會員ID'], name: m['姓名'], phone: m['待合併手機'], email: m['Email'], at: m['註冊時間'], lineNote: m['備註'],
        store: s ? { id: s['會員ID'], name: s['姓名'], email: s['Email'], since: s['註冊時間'], wallet: walletOf(led.filter((r) => r['會員ID'] === s['會員ID'])).total, sub: sub ? sub['剩餘餐數'] + '/' + sub['方案餐數'] : '' } : null
      };
    });
  },
  /** 合併：LINE 綁到門市會員，LINE 新建的空白帳號刪除。不合併：LINE 會員改成一般會員，手機留空讓會員自己補填 */
  async adminMerge(c, p, a) {
    needAll(a);
    const m = await c.db.first('會員', { 會員ID: clean(p.memberId, 30) });
    if (!m || m['狀態'] !== '待合併') throw new UserError('找不到這筆待合併資料');
    if (p.merge) {
      const s = (await c.db.all('會員', { 手機: m['待合併手機'] })).find((x) => x['狀態'] === '正常');
      if (!s) throw new UserError('找不到手機相同的門市會員');
      if (s['LINEID']) throw new UserError('門市會員已經綁定其他 LINE 帳號');
      const line = m['LINEID'];
      await c.db.update('會員', m._row, { LINEID: '', 狀態: '已刪除', 待合併手機: '', 手機: '', Email: '', Email比對: '', 備註: '已合併到 ' + s['會員ID'] + '（' + a.email + ' ' + nowStamp() + '）' });
      const upd = { LINEID: line, 手機已驗證: true, 條款同意時間: m['條款同意時間'], 備註: (s['備註'] ? s['備註'] + '；' : '') + 'LINE 合併 ' + nowStamp() + ' by ' + a.email };
      if (!s['Email'] && m['Email']) { upd['Email'] = m['Email']; upd['Email比對'] = m['Email比對']; }
      await c.db.update('會員', s._row, upd);
      await c.env.DB.prepare('UPDATE member_sessions SET member_id = ? WHERE line_id = ?').bind(s['會員ID'], line).run();
      return { ok: true, memberId: s['會員ID'] };
    }
    await c.db.update('會員', m._row, { 狀態: '正常', 待合併手機: '', 備註: m['備註'] + '；店員判定不是同一人（' + a.email + '），請會員補填自己的手機' });
    return { ok: true, memberId: m['會員ID'] };
  }
};
