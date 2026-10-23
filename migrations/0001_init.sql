-- 致日子官網 資料庫（Cloudflare D1 / SQLite）
-- 命名：英文小寫底線。每張表都有自己的 id（自動遞增）與業務代號欄（UNIQUE），不使用任何試算表列號。
-- 布林存 0/1；金額與份數存整數；日期存 'YYYY-MM-DD'；時間存 'YYYY-MM-DD HH:MM:SS'（台北時間）。

CREATE TABLE shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL UNIQUE,
  hall TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  is_open INTEGER NOT NULL DEFAULT 1,
  hours_text TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  gallery TEXT NOT NULL DEFAULT '',
  hours_start TEXT NOT NULL DEFAULT '',
  hours_end TEXT NOT NULL DEFAULT '',
  show_hours INTEGER NOT NULL DEFAULT 0,
  items_title TEXT NOT NULL DEFAULT '服務項目',
  btn_text TEXT NOT NULL DEFAULT '預約',
  btn_mode TEXT NOT NULL DEFAULT '預約',
  phone TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  facebook TEXT NOT NULL DEFAULT '',
  line TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT ''
);

CREATE TABLE booking_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL UNIQUE,
  shop_name TEXT NOT NULL DEFAULT '',
  slots TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 1,
  max_party INTEGER NOT NULL DEFAULT 8,
  closed_days TEXT NOT NULL DEFAULT '',
  advance_days INTEGER NOT NULL DEFAULT 30,
  notify_email TEXT NOT NULL DEFAULT '',
  notify_line TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_no TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  party INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '待確認',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_bookings_slot ON bookings (shop_id, date, slot);

CREATE TABLE site_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  block TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (page, field)
);

CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  hall TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER
);

CREATE TABLE service_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  shop_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER
);

CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  org TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '新'
);

-- 健康餐 -------------------------------------------------
CREATE TABLE health_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT ''
);

CREATE TABLE health_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  shop_id TEXT NOT NULL DEFAULT 'h1',
  size TEXT NOT NULL,
  main TEXT NOT NULL,
  main_desc TEXT NOT NULL DEFAULT '',
  rice_g INTEGER,
  veg_g INTEGER,
  kcal INTEGER,
  protein INTEGER,
  carb INTEGER,
  fat INTEGER,
  price INTEGER,
  sub_extra INTEGER,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER,
  UNIQUE (shop_id, size, main)
);

CREATE TABLE addon_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  shop_id TEXT NOT NULL DEFAULT 'h1',
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  protein INTEGER,
  price INTEGER,
  is_free INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER
);

CREATE TABLE weekly_veg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL UNIQUE,
  fixed TEXT NOT NULL DEFAULT '',
  rotating1 TEXT NOT NULL DEFAULT '',
  rotating2 TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

-- 系統 ---------------------------------------------------
CREATE TABLE images (
  image_id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data_b64 TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
