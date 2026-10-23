// API 與網站在同一個網址（Cloudflare Worker），所以用相對路徑 /api。
// 留空時，網站會用 demo-data.js 的範例資料運作（只能預覽，不會真的寫入訂位）。
window.SITE_CONFIG = {
  API_URL: '/api',
  GOOGLE_CLIENT_ID: '710397716792-qt19bsl3d8mfugvve8qgca0fedeccudl.apps.googleusercontent.com'   // 後台登入用，見 README
};
