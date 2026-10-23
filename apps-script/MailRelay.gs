/**
 * 寄信中繼（過渡方案）：Cloudflare Worker 不能直接寄信，
 * 由這支 Apps Script 代寄。之後可改用 Resend / MailChannels 等服務取代。
 *
 * 設定步驟：
 * 1. script.google.com 新增專案，貼上本檔
 * 2. 專案設定 → 指令碼屬性 → 新增 RELAY_KEY = 一組自訂長密碼
 * 3. 部署 → 新增部署 → 網頁應用程式（執行身分：我；存取：所有人）
 * 4. 把部署網址存成 Worker 的 MAIL_RELAY_URL，RELAY_KEY 存成 MAIL_RELAY_KEY
 */
function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var m = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('RELAY_KEY');
    if (!key || m.key !== key) return out({ ok: false, error: 'forbidden' });
    if (!m.to || !m.subject) return out({ ok: false, error: 'bad request' });
    MailApp.sendEmail({
      to: m.to, subject: m.subject, body: m.body || '', htmlBody: m.htmlBody || undefined,
      name: m.name || '致日子'
    });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
