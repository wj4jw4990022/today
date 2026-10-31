import { UserError, clean, todayStr, nowStamp, isHm, parseClosed, parseSlots, parseGallery, hoursText, shopContact, httpsOnly, imgUrl, BTN_MODES, isTrue, byOrder, shopOrder } from './util.js';
import { PAGES, FIELD_BY_KEY } from './pagefields.js';
import { shopById, settingsMap, needShop, needAll, throttle } from './service.js';

const STATUS = ['待確認', '已確認', '已取消', '已到店'];
const HALL_SHOP = { 漢口總店: 'h1', 黃埔二店: 'p' };
const FIXED_SHOPS = ['h1', 'p']; // 有專屬頁面（餐點、首頁卡片）的店，不能刪除或隱藏

export const adminOps = {
  async adminInit(c, p, a) {
    const sm = await settingsMap(c), today = todayStr(), stat = {};
    (await c.db.all('訂位')).forEach((b) => {
      const o = stat[b['店家ID']] = stat[b['店家ID']] || { today: 0, pending: 0 };
      if (b['狀態'] === '已取消') return;
      if (b['日期'] === today) o.today++;
      if (b['狀態'] === '待確認' && b['日期'] >= today) o.pending++;
    });
    const shops = (await c.db.all('店家')).filter((s) => a.can(s['店家ID'])).sort(shopOrder).map((s) => {
      const st = sm[s['店家ID']] || {}, cl = parseClosed(st['公休日']);
      return {
        hoursStart: String(s['營業開始'] || ''), hoursEnd: String(s['營業結束'] || ''), showHours: isTrue(s['首頁顯示營業時間']), itemsTitle: s['項目標題'] || '服務項目',
        hoursPreview: hoursText(s, cl), contact: shopContact(s), raw: { btnText: s['按鈕文字'] || '', btnMode: String(s['按鈕模式'] || '預約'), phone: s['電話'] || '', ig: s['Instagram'] || '', fb: s['Facebook'] || '', line: s['LINE'] || '' },
        todayCount: (stat[s['店家ID']] || {}).today || 0, pendingCount: (stat[s['店家ID']] || {}).pending || 0,
        visible: s['前台顯示'], id: s['店家ID'], hall: s['館別'], floor: s['樓層'], name: s['店名'], type: s['類型'], open: isTrue(s['開放預約']),
        hours: s['營業時間'], intro: s['介紹'], tagline: s['一句話介紹'] || '', image: s['圖片網址'], gallery: parseGallery(s['相簿圖片']), note: s['備註'],
        slots: parseSlots(st['可預約時段']), cap: Number(st['每時段名額']) || 1, maxParty: Number(st['單筆人數上限']) || 1,
        closed: parseClosed(st['公休日']), advance: Number(st['可提前預約天數']) || 30, email: st['通知Email'] || '', line: st['通知LINE'] || ''
      };
    });
    return { email: a.email, all: a.all, shops };
  },
  async adminBookings(c, p, a) {
    const rows = (await c.db.all('訂位')).filter((b) => a.can(b['店家ID']) && (!p.shopId || b['店家ID'] === p.shopId));
    rows.sort((x, y) => (y['日期'] + y['時段']).localeCompare(x['日期'] + x['時段']));
    return rows.slice(0, 500).map((b) => ({ id: b['訂位編號'], created: b['建立時間'], shopId: b['店家ID'], shop: b['店名'], date: b['日期'], slot: b['時段'], party: b['人數'], name: b['姓名'], phone: b['電話'], email: b['Email'], status: b['狀態'], note: b['備註'] }));
  },
  async adminSetBookingStatus(c, p, a) {
    if (STATUS.indexOf(p.status) < 0) throw new UserError('狀態不正確');
    const b = await c.db.first('訂位', { 訂位編號: p.id });
    if (!b) throw new UserError('找不到這筆訂位');
    needShop(a, b['店家ID']);
    await c.db.update('訂位', b._row, { 狀態: p.status });
    return { ok: true };
  },
  async adminSetShopOpen(c, p, a) {
    needShop(a, p.shopId);
    const s = await shopById(c, p.shopId);
    await c.db.update('店家', s._row, { 開放預約: !!p.open });
    return { ok: true };
  },
  async adminSaveShop(c, p, a) {
    needShop(a, p.shopId);
    const s = await shopById(c, p.shopId), patch = {}, f = p.fields || {};
    ['店名', '類型', '營業時間', '介紹', '一句話介紹', '備註'].forEach((k) => { if (f[k] !== undefined) patch[k] = clean(f[k], k === '介紹' ? 1000 : k === '一句話介紹' ? 40 : 500); });
    if (f['圖片網址'] !== undefined) { const u = clean(f['圖片網址'], 500); if (u && !imgUrl(u)) throw new UserError('圖片網址必須是 https 開頭'); patch['圖片網址'] = u; }
    if (f['相簿圖片'] !== undefined) patch['相簿圖片'] = parseGallery(Array.isArray(f['相簿圖片']) ? f['相簿圖片'].join(' ') : f['相簿圖片']).join(' ');
    if (f['營業開始'] !== undefined || f['營業結束'] !== undefined) {
      const h1 = clean(f['營業開始'], 5), h2 = clean(f['營業結束'], 5);
      if ((h1 || h2) && !(isHm(h1) && isHm(h2))) throw new UserError('營業時間請填完整的開始與結束（例如 11:00、20:00），或兩格都留白');
      patch['營業開始'] = h1; patch['營業結束'] = h2;
    }
    if (f['按鈕文字'] !== undefined) patch['按鈕文字'] = clean(f['按鈕文字'], 10) || '預約';
    if (f['按鈕模式'] !== undefined) { if (!BTN_MODES[f['按鈕模式']]) throw new UserError('按鈕模式不正確'); patch['按鈕模式'] = f['按鈕模式']; }
    if (f['電話'] !== undefined) { const ph = clean(f['電話'], 30); if (ph && !/^[0-9+\-\s()#]+$/.test(ph)) throw new UserError('電話格式不正確'); patch['電話'] = ph; }
    ['Instagram', 'Facebook', 'LINE'].forEach((k) => {
      if (f[k] === undefined) return;
      const u = clean(f[k], 300); if (u && !httpsOnly(u)) throw new UserError(k + ' 連結需以 https:// 開頭');
      patch[k] = u;
    });
    if (f['首頁顯示營業時間'] !== undefined) patch['首頁顯示營業時間'] = !!f['首頁顯示營業時間'];
    if (f['項目標題'] !== undefined) patch['項目標題'] = clean(f['項目標題'], 12) || '服務項目';
    if (f['樓層'] !== undefined) { needAll(a); patch['樓層'] = clean(f['樓層'], 30); if (!patch['樓層']) throw new UserError('樓層不能空白'); }
    if (f['前台顯示'] !== undefined) { needAll(a); if (!f['前台顯示'] && FIXED_SHOPS.indexOf(s['店家ID']) >= 0) throw new UserError('這間店是網站固定頁面，不能隱藏'); patch['前台顯示'] = !!f['前台顯示']; }
    if (patch['店名'] !== undefined && !patch['店名']) throw new UserError('店名不能空白');
    await c.db.update('店家', s._row, patch);
    return { ok: true };
  },
  /* ---------- 店家排列、新增、刪除（總管理員） ---------- */
  async adminShopOrder(c, p, a) {
    needAll(a);
    const ids = Array.isArray(p.ids) ? p.ids.map((x) => String(x)) : [];
    if (!ids.length || new Set(ids).size !== ids.length) throw new UserError('順序資料不正確');
    const rows = (await c.db.all('店家')).sort(shopOrder), by = {}; rows.forEach((r) => { by[r['店家ID']] = r; });
    ids.forEach((id) => { if (!by[id]) throw new UserError('找不到店家：' + clean(id, 20)); });
    let k = 0; // 這些店原本佔的位置依新順序重排，其他店不動，最後整份重新編號
    const out = rows.map((r) => (ids.indexOf(r['店家ID']) >= 0 ? by[ids[k++]] : r));
    for (let i = 0; i < out.length; i++) if (Number(out[i]['排序']) !== i + 1) await c.db.update('店家', out[i]._row, { 排序: i + 1 });
    return { ok: true };
  },
  async adminAddShop(c, p, a) {
    needAll(a);
    const hall = clean(p.hall, 20) || '漢口總店', floor = clean(p.floor, 30), name = clean(p.name, 40), type = clean(p.type, 30);
    if (hall !== '漢口總店') throw new UserError('目前只能在漢口總店新增店家');
    if (!floor) throw new UserError('請填寫樓層，例如 3F 或 3F 後段');
    if (!name) throw new UserError('請填寫店名');
    const rows = await c.db.all('店家'), id = 's' + Date.now().toString(36), max = rows.reduce((m, r) => Math.max(m, Number(r['排序']) || 0, r._row), 0);
    await c.db.insert('店家', { 店家ID: id, 館別: hall, 樓層: floor, 店名: name, 類型: type, 開放預約: false, 營業時間: '', 備註: '', 介紹: '', 圖片網址: '', 相簿圖片: '', 營業開始: '', 營業結束: '', 首頁顯示營業時間: false, 項目標題: '服務項目', 按鈕文字: '預約', 按鈕模式: '預約', 電話: '', Instagram: '', Facebook: '', LINE: '', 一句話介紹: '', 前台顯示: false, 排序: max + 1 });
    await c.db.insert('訂位設定', { 店家ID: id, 店名: name, 可預約時段: '', 每時段名額: 1, 單筆人數上限: 4, 公休日: '無', 可提前預約天數: 30, 通知Email: '', 通知LINE: '', 備註: '' });
    return { id };
  },
  async adminDeleteShop(c, p, a) {
    needAll(a);
    const id = String(p.shopId || '');
    if (FIXED_SHOPS.indexOf(id) >= 0) throw new UserError('這間店是網站固定頁面，不能刪除');
    const s = await shopById(c, id);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM service_items WHERE shop_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM booking_settings WHERE shop_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM shops WHERE id = ?').bind(s._row)
    ]);
    return { ok: true }; // 訂位紀錄保留
  },
  async adminSaveSettings(c, p, a) {
    needShop(a, p.shopId);
    const row = await c.db.first('訂位設定', { 店家ID: p.shopId });
    if (!row) throw new UserError('找不到這間店的設定');
    const f = p.fields || {}, patch = {};
    if (f.slots !== undefined) patch['可預約時段'] = parseSlots(Array.isArray(f.slots) ? f.slots.join(',') : f.slots).join(',');
    if (f.cap !== undefined) { const v = parseInt(f.cap, 10); if (!(v >= 1 && v <= 200)) throw new UserError('每時段名額需為 1–200'); patch['每時段名額'] = v; }
    if (f.maxParty !== undefined) { const v = parseInt(f.maxParty, 10); if (!(v >= 1 && v <= 100)) throw new UserError('單筆人數上限需為 1–100'); patch['單筆人數上限'] = v; }
    if (f.advance !== undefined) { const v = parseInt(f.advance, 10); if (!(v >= 1 && v <= 365)) throw new UserError('可提前天數需為 1–365'); patch['可提前預約天數'] = v; }
    if (f.closed !== undefined) { const names = ['日', '一', '二', '三', '四', '五', '六']; patch['公休日'] = (f.closed || []).map((n) => '週' + names[n]).join('、') || '無'; }
    if (f.email !== undefined) patch['通知Email'] = clean(f.email, 300);
    if (f.line !== undefined) patch['通知LINE'] = clean(f.line, 80);
    await c.db.update('訂位設定', row._row, patch);
    return { ok: true };
  },
  /* ---------- 頁面內容（前台各頁的標題、說明、按鈕文字、圖片） ---------- */
  async adminPageFields(c, p, a) {
    needAll(a);
    const rows = (await c.env.DB.prepare('SELECT page, field, text, image_url FROM site_content').all()).results || [];
    const values = {}; rows.forEach((r) => { values[r.page + '|' + r.field] = { text: r.text, image: r.image_url }; });
    const hist = (await c.env.DB.prepare('SELECT id, batch, key, label, old_text, new_text, old_image, new_image, changed_by, changed_at, restored FROM content_history ORDER BY id DESC LIMIT 60').all()).results || [];
    return { pages: PAGES, values, history: hist };
  },
  async adminSavePageContent(c, p, a) {
    needAll(a);
    const list = Array.isArray(p.changes) ? p.changes.slice(0, 120) : [];
    if (!list.length) throw new UserError('沒有任何修改');
    const batch = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at = nowStamp(), cur = {};
    ((await c.env.DB.prepare('SELECT page, field, text, image_url FROM site_content').all()).results || []).forEach((r) => { cur[r.page + '|' + r.field] = r; });
    const stmts = [];
    for (const ch of list) {
      const f = FIELD_BY_KEY[String(ch.key)];
      if (!f) throw new UserError('不認得的欄位：' + clean(ch.key, 40));
      const [pg, fd] = f.key.split('|'), old = cur[f.key] || { text: '', image_url: '' };
      let text = old.text, image = old.image_url;
      if (f.type === 'image') {
        image = clean(ch.image, 500); if (image && !imgUrl(image)) throw new UserError('「' + f.label + '」的圖片網址必須是 https 開頭或本站上傳的圖片');
      } else {
        text = f.type === 'long' || f.type === 'list' ? String(ch.text === undefined || ch.text === null ? '' : ch.text).replace(/\r/g, '').trim().slice(0, 3000) : clean(ch.text, 200);
        if (f.type === 'url' && text && !httpsOnly(text)) throw new UserError('「' + f.label + '」必須是 https 開頭的網址');
        if (!f.opt && !text) text = ''; // 非選填欄位清空＝回到預設文字
      }
      const effOld = f.type !== 'image' && !f.opt ? (old.text || f.def) : old.text, effNew = f.type !== 'image' && !f.opt ? (text || f.def) : text;
      if (effNew === effOld && image === old.image_url) continue; // 與目前前台顯示的一樣就不算修改
      stmts.push(c.env.DB.prepare('INSERT INTO site_content (page, block, field, text, image_url) VALUES (?,?,?,?,?) ON CONFLICT(page, field) DO UPDATE SET text=excluded.text, image_url=excluded.image_url').bind(pg, '', fd, text, image));
      stmts.push(c.env.DB.prepare('INSERT INTO content_history (batch, key, label, old_text, new_text, old_image, new_image, changed_by, changed_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(batch, f.key, f.label, old.text, text, old.image_url, image, a.email, at));
    }
    if (!stmts.length) throw new UserError('沒有任何變更');
    await c.env.DB.batch(stmts);
    return { saved: stmts.length / 2 };
  },
  async adminRestoreContent(c, p, a) {
    needAll(a);
    const h = await c.env.DB.prepare('SELECT * FROM content_history WHERE id = ?').bind(Number(p.id) || 0).first();
    if (!h) throw new UserError('找不到這筆紀錄');
    const f = FIELD_BY_KEY[h.key]; if (!f) throw new UserError('這個欄位已不存在');
    const [pg, fd] = h.key.split('|');
    const cur = (await c.env.DB.prepare('SELECT text, image_url FROM site_content WHERE page=? AND field=?').bind(pg, fd).first()) || { text: '', image_url: '' };
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO site_content (page, block, field, text, image_url) VALUES (?,?,?,?,?) ON CONFLICT(page, field) DO UPDATE SET text=excluded.text, image_url=excluded.image_url').bind(pg, '', fd, h.old_text, h.old_image),
      c.env.DB.prepare('INSERT INTO content_history (batch, key, label, old_text, new_text, old_image, new_image, changed_by, changed_at, restored) VALUES (?,?,?,?,?,?,?,?,?,1)').bind('r' + Date.now().toString(36), h.key, h.label, cur.text, h.old_text, cur.image_url, h.old_image, a.email, nowStamp())
    ]);
    return { ok: true };
  },
  async adminMenuList(c, p, a) {
    const shopId = HALL_SHOP[p.hall]; if (!shopId) throw new UserError('館別不正確');
    needShop(a, shopId);
    return (await c.db.all('餐點', { 館別: p.hall })).sort(byOrder).map((r) => ({ id: r['餐點ID'], cat: r['分類'], name: r['品名'], desc: r['介紹'], price: r['價格'], image: r['圖片網址'], on: isTrue(r['供應中']), order: r['排序'] }));
  },
  async adminSaveMenu(c, p, a) {
    const shopId = HALL_SHOP[p.hall]; if (!shopId) throw new UserError('館別不正確');
    needShop(a, shopId);
    const it = p.item || {}, name = clean(it.name, 60);
    if (!name) throw new UserError('請填寫品名');
    const image = clean(it.image, 500); if (image && !imgUrl(image)) throw new UserError('圖片網址必須是 https 開頭');
    const vals = { 館別: p.hall, 分類: clean(it.cat, 30), 品名: name, 介紹: clean(it.desc, 300), 價格: clean(it.price, 20), 圖片網址: image, 供應中: !!it.on, 排序: parseInt(it.order, 10) || 999 };
    if (it.id) {
      const hit = await c.db.first('餐點', { 餐點ID: it.id, 館別: p.hall });
      if (!hit) throw new UserError('找不到這個品項');
      await c.db.update('餐點', hit._row, vals);
    } else { vals['餐點ID'] = 'M' + Date.now().toString(36).toUpperCase(); await c.db.insert('餐點', vals); }
    return { ok: true };
  },
  async adminItemList(c, p, a) {
    needShop(a, p.shopId);
    return (await c.db.all('服務項目', { 店家ID: p.shopId })).sort(byOrder).map((r) => ({ id: r['項目ID'], cat: r['分類'], name: r['名稱'], desc: r['介紹'], price: r['價格'], image: r['圖片網址'], on: isTrue(r['顯示']), order: r['排序'] }));
  },
  async adminSaveItem(c, p, a) {
    needShop(a, p.shopId); await shopById(c, p.shopId);
    const it = p.item || {}, name = clean(it.name, 60);
    if (!name) throw new UserError('請填寫名稱');
    const image = clean(it.image, 500); if (image && !imgUrl(image)) throw new UserError('圖片網址必須是 https 開頭');
    const vals = { 店家ID: p.shopId, 分類: clean(it.cat, 30), 名稱: name, 介紹: clean(it.desc, 400), 價格: clean(it.price, 30), 圖片網址: image, 顯示: !!it.on, 排序: parseInt(it.order, 10) || 999 };
    if (it.id) {
      const hit = await c.db.first('服務項目', { 項目ID: it.id, 店家ID: p.shopId });
      if (!hit) throw new UserError('找不到這個項目');
      await c.db.update('服務項目', hit._row, vals);
    } else { vals['項目ID'] = 'S' + Date.now().toString(36).toUpperCase(); await c.db.insert('服務項目', vals); }
    return { ok: true };
  },
  async adminDeleteItem(c, p, a) {
    needShop(a, p.shopId);
    const hit = await c.db.first('服務項目', { 項目ID: p.id, 店家ID: p.shopId });
    if (hit) await c.db.remove('服務項目', hit._row);
    return { ok: true };
  },
  async adminDeleteMenu(c, p, a) {
    const shopId = HALL_SHOP[p.hall]; if (!shopId) throw new UserError('館別不正確');
    needShop(a, shopId);
    const hit = await c.db.first('餐點', { 餐點ID: p.id, 館別: p.hall });
    if (hit) await c.db.remove('餐點', hit._row);
    return { ok: true };
  },
  /** 上傳圖片：存進資料庫，網址是 /img/<編號>（相對網址，換網域也不受影響） */
  async adminUploadImage(c, p, a) {
    const t = String(p.target || ''); let m;
    if ((m = /^shop:(\w+)$/.exec(t))) needShop(a, m[1]);
    else if ((m = /^menu:(.+)$/.exec(t))) { const sid = HALL_SHOP[m[1]]; if (!sid) throw new UserError('館別不正確'); needShop(a, sid); }
    else if (/^(health|addon|veg):[\w-]+$/.test(t)) needShop(a, 'h1'); // 健康餐：品項、加購、本週蔬菜
    else if (t === 'content') needAll(a);
    else throw new UserError('上傳目標不正確');
    await throttle(c, 'up_' + a.email, 150, 3600, '上傳次數過多，請一小時後再試'); // 每張新圖會上傳兩次（原圖＋裁切後）
    const b64 = String(p.data || '');
    if (!b64) throw new UserError('沒有收到圖片');
    if (b64.length > 2000000) throw new UserError('圖片太大（上限約 1.4 MB，請換較小的圖）');
    let head;
    try { head = Uint8Array.from(atob(b64.slice(0, 24)), (ch) => ch.charCodeAt(0)); } catch (e) { throw new UserError('圖片資料不正確'); }
    const kind = sniffImage(head);
    if (!kind) throw new UserError('只接受 JPG、PNG、WebP 圖片');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    /* 裁切後的圖：記下原圖編號與裁切範圍（原圖座標，rot 為 0/90/180/270），之後可重新裁切 */
    let origId = null, crop = null;
    if (p.origId) {
      origId = String(p.origId);
      if (!/^[a-z0-9]{6,24}$/.test(origId)) throw new UserError('原圖編號不正確');
      const k = p.crop || {}, n = (v) => { const x = Number(v); if (!isFinite(x) || x < 0 || x > 100000) throw new UserError('裁切範圍不正確'); return Math.round(x); };
      crop = JSON.stringify({ x: n(k.x), y: n(k.y), w: n(k.w), h: n(k.h), rot: [0, 90, 180, 270].indexOf(Number(k.rot)) >= 0 ? Number(k.rot) : 0 });
    }
    const size = Math.floor(b64.length * 3 / 4), at = nowStamp();
    try {
      await c.env.DB.prepare('INSERT INTO images (image_id, mime, data_b64, size, uploaded_by, created_at, orig_id, crop) VALUES (?,?,?,?,?,?,?,?)').bind(id, kind.mime, b64, size, a.email, at, origId, crop).run();
    } catch (e) {
      if (!/orig_id|crop|no such column/i.test(String(e && e.message))) throw e;
      /* 資料庫還沒套用 0004：照舊存圖（只是之後不能沿用原圖重新裁切） */
      await c.env.DB.prepare('INSERT INTO images (image_id, mime, data_b64, size, uploaded_by, created_at) VALUES (?,?,?,?,?,?)').bind(id, kind.mime, b64, size, a.email, at).run();
    }
    return { url: '/img/' + id, name: t.replace(/[^\w-]+/g, '_') + '.' + kind.ext };
  },
  /** 重新裁切用：查本站圖片的原圖與上次的裁切範圍；舊圖沒有原圖紀錄就用它自己當原圖 */
  async adminImageInfo(c, p, a) {
    const m = /^\/img\/([\w-]+)$/.exec(String(p.url || ''));
    if (!m) throw new UserError('只有本站上傳的圖片可以重新裁切');
    let r = null;
    try { r = await c.env.DB.prepare('SELECT image_id, orig_id, crop FROM images WHERE image_id = ?').bind(m[1]).first(); }
    catch (e) { r = await c.env.DB.prepare('SELECT image_id FROM images WHERE image_id = ?').bind(m[1]).first(); }
    if (!r) throw new UserError('找不到這張圖片');
    let crop = null; try { crop = r.crop ? JSON.parse(r.crop) : null; } catch (e) { crop = null; }
    return { orig: '/img/' + (r.orig_id || r.image_id), crop: r.orig_id ? crop : null };
  },
  async adminInquiries(c, p, a) {
    needAll(a);
    return (await c.db.all('合作洽談')).reverse().slice(0, 200).map((r) => ({ row: r._row, time: r['時間'], type: r['類型'], org: r['單位名稱'], name: r['聯絡人'], phone: r['電話'], email: r['Email'], message: r['內容'], status: r['狀態'] }));
  },
  async adminSetInquiryStatus(c, p, a) {
    needAll(a);
    const hit = (await c.db.all('合作洽談')).filter((r) => r._row === Number(p.row))[0];
    if (!hit) throw new UserError('找不到這筆資料');
    await c.db.update('合作洽談', hit._row, { 狀態: clean(p.status, 10) || '新' });
    return { ok: true };
  }
};

function sniffImage(b) {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}
