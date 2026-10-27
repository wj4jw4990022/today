import { Db } from './db.js';
import { UserError, clean } from './util.js';
import { publicData, availability, book, contact, adminOf } from './service.js';
import { adminOps } from './admin.js';
import { healthOps, publicMenu } from './health.js';

const OPS = { ...adminOps, ...healthOps };
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: JSON_HEADERS });

async function handleApi(request, c) {
  try {
    if (request.method === 'GET') {
      const p = Object.fromEntries(new URL(request.url).searchParams);
      if (p.action === 'public') return json({ ok: true, data: await publicData(c) });
      if (p.action === 'healthMenu') return json({ ok: true, data: await publicMenu(c) });
      if (p.action === 'availability') return json({ ok: true, data: await availability(c, clean(p.shopId, 20), clean(p.date, 10)) });
      return json({ ok: true, data: 'zhirizi api' });
    }
    if (request.method !== 'POST') return json({ ok: false, error: '不支援的請求' }, 405);
    let p; try { p = JSON.parse(await request.text() || '{}'); } catch (e) { throw new UserError('資料格式不正確'); }
    switch (p.action) {
      case 'book': return json({ ok: true, data: await book(c, p) });
      case 'contact': return json({ ok: true, data: await contact(c, p) });
      default: {
        if (String(p.action).indexOf('admin') !== 0) throw new UserError('未知的操作');
        const a = await adminOf(c, p.idToken), fn = OPS[p.action];
        if (!fn) throw new UserError('未知的後台操作');
        try { return json({ ok: true, data: await fn(c, p, a) }); }
        catch (e) {
          if (e instanceof UserError) throw e;
          console.error(p.action + '：' + (e && e.stack || e));
          throw new UserError('後台發生錯誤（' + p.action + '）：' + String(e && e.message || e).slice(0, 160)); // 只有已登入的管理員看得到
        }
      }
    }
  } catch (err) {
    if (err instanceof UserError) return json({ ok: false, error: err.message });
    console.error(err && err.stack || err);
    return json({ ok: false, error: '系統發生錯誤，請稍後再試' });
  }
}

/** 本站上傳的圖片：/img/<編號>，可長期快取（編號每次上傳都不同） */
async function handleImage(request, c, id) {
  const row = await c.env.DB.prepare('SELECT mime, data_b64 FROM images WHERE image_id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bin = Uint8Array.from(atob(row.data_b64), (ch) => ch.charCodeAt(0));
  return new Response(bin, { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

/** 首頁的網頁標題、說明、分享預覽圖：由後台「首頁 › 搜尋與分享預覽」決定（搜尋引擎與 LINE 分享只讀原始 HTML，所以在伺服器端換） */
async function seoRewrite(res, c, url) {
  try {
    const rows = (await c.env.DB.prepare("SELECT field, text, image_url FROM site_content WHERE page='首頁' AND field IN ('網頁標題','網頁說明','分享圖片')").all()).results || [];
    const v = {}; rows.forEach((r) => { v[r.field] = r; });
    const title = v['網頁標題'] && v['網頁標題'].text, desc = v['網頁說明'] && v['網頁說明'].text, img = v['分享圖片'] && v['分享圖片'].image_url;
    if (!title && !desc && !img) return res;
    const abs = (u) => (u.startsWith('/') ? url.origin + u : u);
    let r = new HTMLRewriter();
    if (title) r = r.on('title', { element: (e) => e.setInnerContent(title) }).on('meta[property="og:title"]', { element: (e) => e.setAttribute('content', title) });
    if (desc) r = r.on('meta[name="description"]', { element: (e) => e.setAttribute('content', desc) }).on('meta[property="og:description"]', { element: (e) => e.setAttribute('content', desc) });
    if (img) r = r.on('meta[property="og:image"]', { element: (e) => e.setAttribute('content', abs(img)) });
    return r.transform(res);
  } catch (e) { console.error(e); return res; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const c = { env, db: new Db(env.DB), later: (p) => ctx.waitUntil(p.catch((e) => console.error(e))) };
    if (url.pathname === '/api') return handleApi(request, c);
    const m = /^\/img\/([\w-]+)$/.exec(url.pathname);
    if (m) return handleImage(request, c, m[1]);
    const res = await env.ASSETS.fetch(request);
    if ((url.pathname === '/' || url.pathname === '/index.html') && typeof HTMLRewriter !== 'undefined' && (res.headers.get('content-type') || '').includes('text/html')) return seoRewrite(res, c, url);
    return res;
  }
};
