import { escapeHtml } from './util.js';

/** 訂位通知信模板（已與店主確認，請保留）。who = 'shop' 寄給店家；'guest' 寄給訂位客人 */
export const MailTemplate = {
  rows(b) { return [['店家', b['店名']], ['日期', b['日期']], ['時段', b['時段']], ['人數', b['人數'] + ' 位'], ['姓名', b['姓名']], ['電話', b['電話']], ['備註', b['備註'] || '（無）']]; },
  bookingText(b, who) {
    const intro = who === 'shop' ? '有一筆新的線上訂位。' : '我們已收到你的訂位，店家確認後會再與你聯絡。';
    const tail = who === 'shop' ? '請至後台確認或取消這筆訂位。' : '如需更改或取消，請直接與店家聯絡。';
    return [intro, ''].concat(this.rows(b).map((r) => r[0] + '：' + r[1]), ['', tail, '致日子官網']).join('\n');
  },
  bookingHtml(b, who) {
    const title = who === 'shop' ? '新訂位通知' : '訂位已收到';
    const tag = who === 'shop' ? 'NEW BOOKING · 新訂位' : 'THANK YOU · 謝謝你的預約';
    const intro = who === 'shop' ? '有一筆新的線上訂位。' : '我們已收到你的訂位，店家確認後會再與你聯絡。';
    const tail = who === 'shop' ? '請至後台確認或取消這筆訂位。' : '如需更改或取消，請直接與店家聯絡。';
    const td = 'padding:10px 0;border-bottom:1px solid #CFD6C4';
    const rows = this.rows(b).map((r) => `<tr><td style="${td};color:#5B6B5E;width:80px">${escapeHtml(r[0])}</td><td style="${td}">${escapeHtml(r[1])}</td></tr>`).join('');
    return `<div style="font-family:'Noto Sans TC',sans-serif;color:#17302A;background:#F2F1EA;padding:32px;max-width:520px">` +
      `<div style="font-size:12px;letter-spacing:.18em;color:#8A5A3B">${tag}</div>` +
      `<h2 style="font-weight:500;letter-spacing:.08em;margin:8px 0 16px">${title}</h2>` +
      `<p style="font-size:13px;color:#5B6B5E;line-height:1.9">${intro}</p>` +
      `<table style="border-top:1px solid #CFD6C4;border-collapse:collapse;width:100%;font-size:14px">${rows}</table>` +
      `<p style="font-size:13px;color:#5B6B5E;margin-top:20px">${tail}<br>致日子官網</p></div>`;
  }
};

/**
 * 寄信：Workers 本身不能寄信，過渡期委託 Apps Script 的「寄信中繼」（見 apps-script/MailRelay.gs）。
 * 之後有自訂網域，改成直接呼叫 Resend 等寄信服務，只需要改這個函式。
 */
export async function sendMail(env, m) {
  if (!env.MAIL_RELAY_URL || !env.MAIL_RELAY_KEY) { console.log('未設定寄信中繼，略過寄信：' + m.subject); return false; }
  const r = await fetch(env.MAIL_RELAY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: env.MAIL_RELAY_KEY, ...m }), redirect: 'follow' });
  if (!r.ok) throw new Error('寄信中繼回應 ' + r.status);
  return true;
}

/** LINE 官方帳號推播；沒設定 LINE_TOKEN 就不做任何事 */
export async function linePush(env, text, target) {
  const token = env.LINE_TOKEN; if (!token) return;
  const to = String(target || '').trim().slice(0, 80) || env.LINE_TO; if (!to) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ to, messages: [{ type: 'text', text }] }) });
  } catch (e) { console.error('LINE 推播失敗：' + e); }
}
