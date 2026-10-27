-- 頁面內容修改紀錄（可復原）
CREATE TABLE content_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  old_text TEXT NOT NULL DEFAULT '',
  new_text TEXT NOT NULL DEFAULT '',
  old_image TEXT NOT NULL DEFAULT '',
  new_image TEXT NOT NULL DEFAULT '',
  changed_by TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL DEFAULT '',
  restored INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_content_history_key ON content_history (key);

-- 清理：前台沒有用到、或改為由「店家資料」統一管理的欄位
DELETE FROM site_content WHERE (page='首頁' AND field IN ('標語','主圖')) OR (page='漢口總店' AND field IN ('簡介','營業時間','封面')) OR (page='黃埔二店' AND field IN ('簡介','營業時間','電話','封面','相片1','相片2','相片3'));
-- 文字欄位不需要圖片網址（舊資料每一列都帶了同一張圖）
UPDATE site_content SET image_url='' WHERE field NOT IN ('封面','主圖');
UPDATE site_content SET text='' WHERE text='待補';
