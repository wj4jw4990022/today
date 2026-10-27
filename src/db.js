// 資料存取層：只有這一層碰 D1。對外仍用中文欄位名的物件（和舊版 API 回傳格式一致），內部對應到英文欄位。
const T = {
  店家: { t: 'shops', c: { 店家ID: 'shop_id', 館別: 'hall', 樓層: 'floor', 店名: 'name', 類型: 'type', 開放預約: 'is_open', 營業時間: 'hours_text', 備註: 'note', 介紹: 'intro', 圖片網址: 'image_url', 相簿圖片: 'gallery', 營業開始: 'hours_start', 營業結束: 'hours_end', 首頁顯示營業時間: 'show_hours', 項目標題: 'items_title', 按鈕文字: 'btn_text', 按鈕模式: 'btn_mode', 電話: 'phone', Instagram: 'instagram', Facebook: 'facebook', LINE: 'line', 一句話介紹: 'tagline', 前台顯示: 'visible', 排序: 'sort_order' }, b: ['開放預約', '首頁顯示營業時間', '前台顯示'], n: ['排序'] },
  訂位設定: { t: 'booking_settings', c: { 店家ID: 'shop_id', 店名: 'shop_name', 可預約時段: 'slots', 每時段名額: 'capacity', 單筆人數上限: 'max_party', 公休日: 'closed_days', 可提前預約天數: 'advance_days', 通知Email: 'notify_email', 通知LINE: 'notify_line', 備註: 'note' }, b: [], n: ['每時段名額', '單筆人數上限', '可提前預約天數'] },
  訂位: { t: 'bookings', c: { 訂位編號: 'booking_no', 建立時間: 'created_at', 店家ID: 'shop_id', 店名: 'shop_name', 日期: 'date', 時段: 'slot', 人數: 'party', 姓名: 'name', 電話: 'phone', Email: 'email', 狀態: 'status', 備註: 'note' }, b: [], n: ['人數'] },
  內容: { t: 'site_content', c: { 頁面: 'page', 區塊: 'block', 欄位: 'field', 內容: 'text', 圖片網址: 'image_url', 備註: 'note' }, b: [], n: [] },
  餐點: { t: 'menu_items', c: { 餐點ID: 'item_id', 館別: 'hall', 分類: 'category', 品名: 'name', 介紹: 'description', 價格: 'price', 圖片網址: 'image_url', 供應中: 'available', 排序: 'sort_order' }, b: ['供應中'], n: ['排序'] },
  服務項目: { t: 'service_items', c: { 項目ID: 'item_id', 店家ID: 'shop_id', 分類: 'category', 名稱: 'name', 介紹: 'description', 價格: 'price', 圖片網址: 'image_url', 顯示: 'visible', 排序: 'sort_order' }, b: ['顯示'], n: ['排序'] },
  管理員: { t: 'admins', c: { Email: 'email', 可管理店家: 'scope', 備註: 'note' }, b: [], n: [] },
  合作洽談: { t: 'inquiries', c: { 時間: 'created_at', 類型: 'type', 單位名稱: 'org', 聯絡人: 'name', 電話: 'phone', Email: 'email', 內容: 'message', 狀態: 'status' }, b: [], n: [] },
  健康餐設定: { t: 'health_settings', c: { 設定項目: 'key', 值: 'value', 說明: 'note', 狀態: 'status' }, b: [], n: [] },
  健康餐品項: { t: 'health_items', c: { 品項ID: 'item_id', 店家ID: 'shop_id', 份量: 'size', 主菜: 'main', 主菜內容: 'main_desc', 飯克數: 'rice_g', 蔬菜克數: 'veg_g', 熱量: 'kcal', 蛋白質: 'protein', 碳水: 'carb', 脂肪: 'fat', 單點價: 'price', 訂閱加價: 'sub_extra', 品名: 'name', 介紹: 'description', 圖片網址: 'image_url', 顯示: 'visible', 排序: 'sort_order' }, b: ['顯示'], n: ['飯克數', '蔬菜克數', '熱量', '蛋白質', '碳水', '脂肪', '單點價', '訂閱加價', '排序'] },
  加購品項: { t: 'addon_items', c: { 品項ID: 'item_id', 店家ID: 'shop_id', 類型: 'type', 名稱: 'name', 內容: 'content', 蛋白質: 'protein', 加購價: 'price', 免費: 'is_free', 圖片網址: 'image_url', 顯示: 'visible', 排序: 'sort_order' }, b: ['免費', '顯示'], n: ['蛋白質', '加購價', '排序'] },
  每週蔬菜: { t: 'weekly_veg', c: { 週起始日: 'week_start', 固定蔬菜: 'fixed', 輪替蔬菜1: 'rotating1', 輪替蔬菜2: 'rotating2', 圖片網址: 'image_url', 更新人員: 'updated_by', 更新時間: 'updated_at' }, b: [], n: [] }
};
const q = (s) => '"' + s + '"';

export class Db {
  constructor(d1) { this.d1 = d1; }
  spec(name) { const s = T[name]; if (!s) throw new Error('未知的資料表：' + name); return s; }
  fromRow(s, row) {
    const o = { _row: row.id };
    for (const k in s.c) {
      let v = row[s.c[k]];
      if (s.b.includes(k)) v = v === 1 || v === true;
      else if (s.n.includes(k)) v = v === null || v === undefined ? '' : v;
      else v = v === null || v === undefined ? '' : v;
      o[k] = v;
    }
    return o;
  }
  toDb(s, k, v) {
    if (s.b.includes(k)) return v === true || v === 1 || String(v).toUpperCase() === 'TRUE' ? 1 : 0;
    if (s.n.includes(k)) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }
    return String(v === undefined || v === null ? '' : v);
  }
  /** 讀整張表（依 id 排序）。可用 where：{ 中文欄位: 值 } 做相等篩選（交給資料庫做） */
  async all(name, where) {
    const s = this.spec(name), ks = Object.keys(where || {});
    const sql = `SELECT * FROM ${q(s.t)}` + (ks.length ? ' WHERE ' + ks.map((k) => q(s.c[k]) + ' = ?').join(' AND ') : '') + ' ORDER BY id';
    const r = await this.d1.prepare(sql).bind(...ks.map((k) => this.toDb(s, k, where[k]))).all();
    return r.results.map((row) => this.fromRow(s, row));
  }
  async first(name, where) { return (await this.all(name, where))[0] || null; }
  /** 新增一列；沒有對應欄位的鍵會被忽略。回傳新列的 _row */
  async insert(name, obj) {
    const s = this.spec(name), ks = Object.keys(s.c).filter((k) => obj[k] !== undefined);
    const sql = `INSERT INTO ${q(s.t)} (${ks.map((k) => q(s.c[k])).join(',')}) VALUES (${ks.map(() => '?').join(',')})`;
    const r = await this.d1.prepare(sql).bind(...ks.map((k) => this.toDb(s, k, obj[k]))).run();
    return r.meta.last_row_id;
  }
  async update(name, id, patch) {
    const s = this.spec(name), ks = Object.keys(patch).filter((k) => s.c[k]);
    if (!ks.length) return;
    const sql = `UPDATE ${q(s.t)} SET ${ks.map((k) => q(s.c[k]) + ' = ?').join(',')} WHERE id = ?`;
    await this.d1.prepare(sql).bind(...ks.map((k) => this.toDb(s, k, patch[k])), id).run();
  }
  async remove(name, id) { await this.d1.prepare(`DELETE FROM ${q(this.spec(name).t)} WHERE id = ?`).bind(id).run(); }
}
