import { FIELD_BY_KEY } from './pagefields.js';
import { UserError, clean, todayStr, nowHm, nowStamp, isDate, isHm, dayDiff, weekday, parseClosed, parseSlots, parseGallery, hoursText, shopContact, isTrue, byOrder, rid, tpe } from './util.js';
import { MailTemplate, sendMail, linePush } from './mail.js';

/* ---------- 限流：每個 key 在 ttl 秒內最多 limit 次 ---------- */
export async function throttle(c, key, limit, ttl, msg) {
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now - 3600).run();
  const r = await c.env.DB.prepare(
    'INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at < ? THEN 1 ELSE count + 1 END, expires_at = CASE WHEN expires_at < ? THEN ? ELSE expires_at END RETURNING count'
  ).bind(key, now + ttl, now, now, now + ttl).first();
  if (r.count > limit) throw new UserError(msg || '送出次數過多，請稍後再試');
}

/* ---------- 店家與設定 ---------- */
export async function shopById(c, id) {
  const s = await c.db.first('店家', { 店家ID: id });
  if (!s) throw new UserError('找不到這間店');
  return s;
}
export async function settingsMap(c) {
  const m = {};
  (await c.db.all('訂位設定')).forEach((r) => { m[r['店家ID']] = r; });
  return m;
}

/* ---------- 前台公開資料 ---------- */
export async function publicData(c) {
  const sm = await settingsMap(c);
  const itemsBy = {};
  (await c.db.all('服務項目')).filter((r) => isTrue(r['顯示'])).sort(byOrder)
    .forEach((r) => { (itemsBy[r['店家ID']] = itemsBy[r['店家ID']] || []).push({ id: r['項目ID'], cat: r['分類'], name: r['名稱'], desc: r['介紹'], price: r['價格'], image: r['圖片網址'] }); });
  const shops = (await c.db.all('店家')).map((s) => {
    const st = sm[s['店家ID']] || {}, cl = parseClosed(st['公休日']);
    const hs = isHm(String(s['營業開始'] || '')) && isHm(String(s['營業結束'] || ''));
    return {
      hoursStart: hs ? String(s['營業開始']) : '', hoursEnd: hs ? String(s['營業結束']) : '', showHours: hs && isTrue(s['首頁顯示營業時間']),
      itemsTitle: s['項目標題'] || '服務項目', items: itemsBy[s['店家ID']] || [], contact: shopContact(s),
      id: s['店家ID'], hall: s['館別'], floor: s['樓層'], name: s['店名'], type: s['類型'],
      open: isTrue(s['開放預約']), hours: hoursText(s, cl), note: s['備註'], intro: s['介紹'], tagline: clean(s['一句話介紹'], 40), image: s['圖片網址'], gallery: parseGallery(s['相簿圖片']),
      maxParty: Number(st['單筆人數上限']) || 8, advanceDays: Number(st['可提前預約天數']) || 30, closed: parseClosed(st['公休日'])
    };
  });
  const content = {}, rows = {};
  (await c.db.all('內容')).forEach((r) => { rows[r['頁面'] + '|' + r['欄位']] = r; });
  Object.keys(FIELD_BY_KEY).forEach((k) => { // 預設值 + 後台填寫的內容；留白的選填欄位保持空白（前台不顯示）
    const f = FIELD_BY_KEY[k], r = rows[k], txt = r ? String(r['內容'] || '') : '';
    content[k] = f.type === 'image' ? { text: '', image: r ? String(r['圖片網址'] || '') : '' } : { text: f.opt ? txt : (txt || f.def), image: '' };
  });
  const sp = shops.filter((x) => x.id === 'p')[0]; // 黃埔頁的電話、營業時間以店家資料為準
  if (sp) { content['黃埔二店|電話'] = { text: sp.contact.phone || '', image: '' }; content['黃埔二店|營業時間'] = { text: Z_hoursOrEmpty(sp), image: '' }; }
  const menu = (await c.db.all('餐點')).filter((r) => isTrue(r['供應中'])).sort(byOrder)
    .map((r) => ({ id: r['餐點ID'], hall: r['館別'], cat: r['分類'], name: r['品名'], desc: r['介紹'], price: r['價格'], image: r['圖片網址'] }));
  let healthOpen = false;
  try { const h = await c.db.first('健康餐設定', { 設定項目: '健康餐頁面開放' }); healthOpen = !!h && isTrue(h['值']); } catch (e) { /* 忽略 */ }
  return { shops, content, menu, healthOpen };
}

/* ---------- 訂位 ---------- */
async function usedMap(c, shopId, date) {
  const r = await c.env.DB.prepare("SELECT slot, COUNT(*) AS n FROM bookings WHERE shop_id = ? AND date = ? AND status != '已取消' GROUP BY slot").bind(shopId, date).all();
  const used = {}; r.results.forEach((x) => { used[x.slot] = x.n; });
  return used;
}
export async function availability(c, shopId, date) {
  if (!isDate(date)) throw new UserError('日期格式不正確');
  const shop = await shopById(c, shopId), st = (await settingsMap(c))[shopId] || {};
  const res = { shopId, date, open: isTrue(shop['開放預約']), slots: [], reason: '' };
  if (!res.open) { res.reason = '這間店目前暫停線上預約'; return res; }
  const diff = dayDiff(todayStr(), date), adv = Number(st['可提前預約天數']) || 30;
  if (diff < 0) { res.reason = '不能預約過去的日期'; return res; }
  if (diff > adv) { res.reason = '最多可提前 ' + adv + ' 天預約'; return res; }
  if (parseClosed(st['公休日']).indexOf(weekday(date)) >= 0) { res.reason = '這天公休'; return res; }
  const cap = Number(st['每時段名額']) || 1, slots = parseSlots(st['可預約時段']), used = await usedMap(c, shopId, date);
  const now = nowHm(), isToday = diff === 0;
  slots.forEach((t) => { if (isToday && t <= now) return; res.slots.push({ time: t, left: Math.max(0, cap - (used[t] || 0)) }); });
  if (!res.slots.length) res.reason = '這天沒有可預約的時段';
  return res;
}

export async function book(c, p) {
  if (clean(p.website)) return { id: 'OK' }; // honeypot
  const shopId = clean(p.shopId, 20), date = clean(p.date, 10), slot = clean(p.slot, 5);
  const name = clean(p.name, 40), phone = clean(p.phone, 20), email = clean(p.email, 80), note = clean(p.note, 300), party = parseInt(p.party, 10);
  if (!name) throw new UserError('請填寫姓名');
  if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) throw new UserError('請填寫正確的電話');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError('Email 格式不正確');
  await throttle(c, 'book_' + phone.replace(/\D/g, ''), 5, 3600);
  const shop = await shopById(c, shopId), st = (await settingsMap(c))[shopId] || {};
  const maxParty = Number(st['單筆人數上限']) || 8;
  if (!(party >= 1 && party <= maxParty)) throw new UserError('這間店單筆最多 ' + maxParty + ' 位，超過請來電洽詢');
  const av = await availability(c, shopId, date);
  if (!av.open || av.reason) throw new UserError(av.reason || '這間店目前暫停線上預約');
  const hit = av.slots.filter((s) => s.time === slot)[0];
  if (!hit) throw new UserError('這個時段無法預約');
  if (hit.left <= 0) throw new UserError('這個時段已額滿，請改選其他時段');
  const p2 = tpe(), id = 'B' + p2.year.slice(2) + p2.month + p2.day + '-' + rid(4), cap = Number(st['每時段名額']) || 1;
  const booking = { '訂位編號': id, '建立時間': nowStamp(), '店家ID': shopId, '店名': shop['店名'], '日期': date, '時段': slot, '人數': party, '姓名': name, '電話': phone, 'Email': email, '狀態': '待確認', '備註': note };
  // 名額檢查與寫入在同一個 SQL 內完成，同時預約也不會超賣
  const r = await c.env.DB.prepare(
    "INSERT INTO bookings (booking_no, created_at, shop_id, shop_name, date, slot, party, name, phone, email, status, note) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM bookings WHERE shop_id = ? AND date = ? AND slot = ? AND status != '已取消') < ?"
  ).bind(id, booking['建立時間'], shopId, booking['店名'], date, slot, party, name, phone, email, '待確認', note, shopId, date, slot, cap).run();
  if (!r.meta.changes) throw new UserError('這個時段已額滿，請改選其他時段');
  c.later(notifyBooking(c, booking, st));
  return { id, shop: booking['店名'], date, slot, party };
}

export async function contact(c, p) {
  if (clean(p.website)) return { ok: true };
  const o = { '時間': nowStamp(), '類型': clean(p.type, 30), '單位名稱': clean(p.org, 80), '聯絡人': clean(p.name, 40), '電話': clean(p.phone, 20), 'Email': clean(p.email, 80), '內容': clean(p.message, 2000), '狀態': '新' };
  if (!o['聯絡人'] || !o['內容']) throw new UserError('請填寫聯絡人與內容');
  if (!o['電話'] && !o['Email']) throw new UserError('電話或 Email 至少填一項');
  await throttle(c, 'contact_' + (o['電話'] || o['Email']).replace(/\W/g, ''), 5, 3600);
  await c.db.insert('合作洽談', o);
  c.later(notifyContact(c, o));
  return { ok: true };
}

/* ---------- 通知 ---------- */
async function notifyBooking(c, b, st) {
  const to = clean(st && st['通知Email'], 300);
  try {
    if (to) await sendMail(c.env, { to: to.replace(/[;；\s]+/g, ','), name: '致日子官網', subject: `【新訂位】${b['店名']} ${b['日期']} ${b['時段']}（${b['人數']} 位）`, body: MailTemplate.bookingText(b, 'shop'), htmlBody: MailTemplate.bookingHtml(b, 'shop') });
    if (b['Email']) await sendMail(c.env, { to: b['Email'], name: '致日子', subject: `【致日子】訂位已收到：${b['店名']} ${b['日期']} ${b['時段']}`, body: MailTemplate.bookingText(b, 'guest'), htmlBody: MailTemplate.bookingHtml(b, 'guest') });
  } catch (e) { console.error('寄信失敗：' + e); }
  await linePush(c.env, `新訂位 ${b['店名']}\n${b['日期']} ${b['時段']}・${b['人數']} 位\n${b['姓名']} ${b['電話']}`, st && st['通知LINE']);
}
async function notifyContact(c, o) {
  try {
    const admins = await c.db.all('管理員'), to = c.env.CONTACT_EMAIL || (admins[0] && admins[0]['Email']);
    if (to) await sendMail(c.env, { to, name: '致日子官網', subject: `【合作洽談】${o['單位名稱']} ${o['聯絡人']}`, body: ['類型：' + o['類型'], '單位：' + o['單位名稱'], '聯絡人：' + o['聯絡人'], '電話：' + o['電話'], 'Email：' + o['Email'], '', o['內容']].join('\n') });
  } catch (e) { console.error('寄信失敗：' + e); }
}

/* ---------- 後台權限（Google 登入）---------- */
const tokenCache = new Map();
export async function verifyToken(c, idToken) {
  if (!idToken) throw new UserError('請先登入');
  if (c.env.ALLOW_TEST_TOKENS === '1' && String(idToken).startsWith('test:')) return String(idToken).slice(5).toLowerCase(); // 只給自動測試用；正式環境絕對不要設定這個變數
  const hit = tokenCache.get(idToken);
  if (hit && hit.exp > Date.now()) return hit.email;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (r.status !== 200) throw new UserError('登入已失效，請重新登入');
  const t = await r.json();
  if (t.aud !== c.env.GOOGLE_CLIENT_ID) throw new UserError('登入驗證失敗');
  if (String(t.email_verified) !== 'true' || Number(t.exp) * 1000 < Date.now()) throw new UserError('登入已失效，請重新登入');
  const email = String(t.email).toLowerCase();
  if (tokenCache.size > 200) tokenCache.clear();
  tokenCache.set(idToken, { email, exp: Date.now() + 300000 });
  return email;
}
export async function adminOf(c, idToken) {
  const email = await verifyToken(c, idToken);
  const row = (await c.db.all('管理員')).filter((r) => String(r['Email']).toLowerCase() === email)[0];
  if (!row) throw new UserError('這個 Google 帳號沒有後台權限（' + email + '）');
  const scope = String(row['可管理店家'] || '').trim(), all = scope === '*', ids = all ? null : scope.split(/[,，\s]+/).filter(Boolean);
  return { email, all, ids, can: (shopId) => all || ids.indexOf(shopId) >= 0 };
}
export const needShop = (a, shopId) => { if (!a.can(shopId)) throw new UserError('你沒有這間店的權限'); };
export const needAll = (a) => { if (!a.all) throw new UserError('只有總管理員可以做這個操作'); };

function Z_hoursOrEmpty(s) { return /^(待補|)$/.test(String(s.hours || '').trim()) ? '' : s.hours; }
