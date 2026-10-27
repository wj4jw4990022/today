// 小工具（由 Apps Script 版移植）
export class UserError extends Error {}

export function clean(s, max) { return String(s === undefined || s === null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }

const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
export function tpe(d) {
  const p = {}; FMT.formatToParts(d || new Date()).forEach((x) => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  return p;
}
export const todayStr = () => { const p = tpe(); return `${p.year}-${p.month}-${p.day}`; };
export const nowHm = () => { const p = tpe(); return `${p.hour}:${p.minute}`; };
export const nowStamp = () => { const p = tpe(); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
export const nowMinute = () => nowStamp().slice(0, 16);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00+08:00'));
export const isHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00+08:00') - new Date(a + 'T00:00:00+08:00')) / 86400000);
export const weekday = (s) => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[tpe(new Date(s + 'T12:00:00+08:00')).weekday]; // 0=週日

export function parseClosed(txt) {
  const map = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }, out = [], re = /[週周]([一二三四五六日天])/g;
  txt = String(txt || ''); let m;
  while ((m = re.exec(txt))) out.push(map[m[1]]);
  return out;
}
export function parseSlots(txt) {
  const seen = {}, out = [];
  String(txt || '').split(/[,，、\s]+/).forEach((t) => {
    t = t.trim();
    if (/^\d:\d{2}$/.test(t)) t = '0' + t;
    if (isHm(t) && !seen[t]) { seen[t] = 1; out.push(t); }
  });
  return out.sort();
}
export const parseGallery = (txt) => String(txt || '').split(/\s+/).filter((u) => /^https:\/\//.test(u) || /^\/img\/[\w-]+$/.test(u)).slice(0, 12);
export function hoursText(s, closed) {
  const a = String(s['營業開始'] || ''), b = String(s['營業結束'] || '');
  if (!isHm(a) || !isHm(b)) return String(s['營業時間'] || '');
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  return a + '–' + b + (closed && closed.length ? '，' + closed.map((n) => '週' + names[n]).join('、') + '公休' : '');
}
// 圖片或連結：https 網址，或本站上傳的 /img/xxxx
export const httpsOnly = (u) => { u = String(u || '').trim(); return /^https:\/\/[^\s]+$/.test(u) ? u : ''; };
export const imgUrl = (u) => { u = String(u || '').trim(); return /^https:\/\/[^\s]+$/.test(u) || /^\/img\/[\w-]+$/.test(u) ? u : ''; };
export const BTN_MODES = { 預約: 'book', 電話: 'tel', 不顯示: 'none' };
export function shopContact(s) {
  return { btnText: clean(s['按鈕文字'], 10) || '預約', btnMode: BTN_MODES[String(s['按鈕模式'] || '預約')] || 'book',
    phone: clean(s['電話'], 30), ig: httpsOnly(s['Instagram']), fb: httpsOnly(s['Facebook']), line: httpsOnly(s['LINE']) };
}
export const isTrue = (v) => v === true || v === 1 || String(v).toUpperCase() === 'TRUE';
export const escapeHtml = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const byOrder = (a, b) => (Number(a['排序']) || 999) - (Number(b['排序']) || 999);
export const shopOrder = (a, b) => (Number(a['排序']) || 0) - (Number(b['排序']) || 0) || a._row - b._row;
export const rid =(n) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
