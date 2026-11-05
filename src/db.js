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
  每週蔬菜: { t: 'weekly_veg', c: { 週起始日: 'week_start', 固定蔬菜: 'fixed', 輪替蔬菜1: 'rotating1', 輪替蔬菜2: 'rotating2', 圖片網址: 'image_url', 更新人員: 'updated_by', 更新時間: 'updated_at' }, b: [], n: [] },
  // 會員與訂閱（2026-11-05，migrations/0005_members.sql）
  會員: { t: 'members', c: { 會員ID: 'member_id', LINEID: 'line_id', 姓名: 'name', 手機: 'phone', 手機已驗證: 'phone_verified', Email: 'email', Email比對: 'email_norm', Email已驗證時間: 'email_verified_at', 推薦碼: 'referral_code', 推薦人會員ID: 'referred_by', 曾訂閱: 'ever_subscribed', 條款同意時間: 'terms_agreed_at', 註冊時間: 'registered_at', 狀態: 'status', 備註: 'note' }, b: ['手機已驗證', '曾訂閱'], n: [] },
  會員登入: { t: 'member_sessions', c: { 憑證: 'token', 會員ID: 'member_id', 建立時間: 'created_at', 到期: 'expires_at' }, b: [], n: ['到期'] },
  Email驗證碼: { t: 'email_codes', c: { 會員ID: 'member_id', Email: 'email', 驗證碼雜湊: 'code_hash', 寄出: 'sent_at', 到期: 'expires_at', 錯誤次數: 'attempts', 已使用: 'used' }, b: ['已使用'], n: ['寄出', '到期', '錯誤次數'] },
  訂閱: { t: 'subscriptions', c: { 訂閱ID: 'sub_id', 會員ID: 'member_id', 方案餐數: 'meals', 剩餘餐數: 'remaining', 方案金額: 'plan_amount', 推薦折扣: 'referral_discount', 實付金額: 'paid_amount', 付款方式: 'pay_method', 轉帳末五碼: 'transfer_last5', 收款確認人員: 'confirmed_by', 收款時間: 'paid_at', 開始日: 'start_date', 到期日: 'end_date', 暫停起日: 'pause_start', 暫停迄日: 'pause_end', 整期升級份量: 'upgrade_size', 整期升級主菜: 'upgrade_main', 狀態: 'status', 續訂來源訂閱ID: 'renew_from', 結算金額: 'settle_amount', 結算方式: 'settle_method', 建立時間: 'created_at', 備註: 'note' }, b: [], n: ['方案餐數', '剩餘餐數', '方案金額', '推薦折扣', '實付金額', '結算金額'] },
  預約: { t: 'reservations', c: { 預約ID: 'res_id', 會員ID: 'member_id', 訂閱ID: 'sub_id', 日期: 'date', 時段: 'slot', 取餐方式: 'pickup', 配送點ID: 'point_id', 份量: 'size', 主菜: 'main', 醬汁: 'sauce', 加購項目: 'addons', 升級差額: 'upgrade_amount', 加購金額: 'addon_amount', 單點原價: 'list_price', 扣款狀態: 'charge_status', 狀態: 'status', 取餐時間: 'picked_at', 建立時間: 'created_at', 修改時間: 'updated_at', 備註: 'note' }, b: [], n: ['升級差額', '加購金額', '單點原價'] },
  錢包紀錄: { t: 'wallet_ledger', c: { 紀錄ID: 'rec_id', 會員ID: 'member_id', 時間: 'at', 類型: 'type', 金額: 'amount', 可退現金: 'refundable', 付款方式: 'pay_method', 轉帳末五碼: 'transfer_last5', 對應ID: 'ref_id', 經手人員: 'handled_by', 狀態: 'status', 備註: 'note' }, b: ['可退現金'], n: ['金額'] },
  配送點: { t: 'delivery_points', c: { 配送點ID: 'point_id', 名稱: 'name', 地址: 'address', 距離公里: 'distance_km', 可配送時段: 'slots', 啟用: 'enabled', 備註: 'note' }, b: ['啟用'], n: ['距離公里'] },
  推薦紀錄: { t: 'referrals', c: { 紀錄ID: 'rec_id', 推薦人會員ID: 'referrer_id', 新會員ID: 'new_member_id', 新會員訂閱ID: 'new_sub_id', 新會員已取餐數: 'picked_count', 獎勵金額: 'reward', 狀態: 'status', 發放日期: 'granted_at', 計入月份: 'count_month', 取消原因: 'cancel_reason', 備註: 'note' }, b: [], n: ['新會員已取餐數', '獎勵金額'] },
  補償紀錄: { t: 'compensations', c: { 紀錄ID: 'rec_id', 預約ID: 'res_id', 會員ID: 'member_id', 原因: 'reason', 處理方式: 'action', 處理人員: 'handled_by', 時間: 'at', 備註: 'note' }, b: [], n: [] }
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
