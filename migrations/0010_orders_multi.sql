-- 2026-11-06 逐步訂餐（草圖 m41）：一筆訂單可以有多個便當；取餐付現；配送費；送到自己的地址（依行政區）
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  pickup TEXT NOT NULL DEFAULT '自取',
  point_id TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  addr_note TEXT NOT NULL DEFAULT '',
  km REAL NOT NULL DEFAULT 0,
  fee_ok INTEGER NOT NULL DEFAULT 0,
  fee INTEGER NOT NULL DEFAULT 0,
  fee_status TEXT NOT NULL DEFAULT '',
  pay TEXT NOT NULL DEFAULT '錢包',
  cash_due INTEGER NOT NULL DEFAULT 0,
  cash_paid INTEGER NOT NULL DEFAULT 0,
  cash_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '已預約',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX orders_day ON orders(date, slot);
CREATE INDEX orders_member ON orders(member_id, status);
ALTER TABLE reservations ADD COLUMN order_id TEXT NOT NULL DEFAULT '';
CREATE INDEX reservations_order ON reservations(order_id);
CREATE TABLE member_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  addr_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX member_addresses_member ON member_addresses(member_id);
CREATE TABLE delivery_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL UNIQUE,
  km REAL NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 999,
  note TEXT NOT NULL DEFAULT ''
);
-- 預設行政區（起點漢口街 200 號，距離為估計值，後台可改；超過 8 公里＝不送）
INSERT OR IGNORE INTO delivery_areas (area, km, enabled, sort_order, note) VALUES
  ('三民區', 1.5, 1, 1, '估計'), ('新興區', 1.5, 1, 2, '估計'),
  ('前金區', 3, 1, 3, '估計'), ('苓雅區', 3.5, 1, 4, '估計'), ('鹽埕區', 4, 1, 5, '估計'), ('鼓山區', 5, 1, 6, '估計'),
  ('左營區', 7, 1, 7, '估計'), ('前鎮區', 7, 1, 8, '估計'),
  ('鳳山區', 9, 0, 9, '估計超過 8 公里，不送'), ('楠梓區', 12, 0, 10, '估計超過 8 公里，不送');
ALTER TABLE members ADD COLUMN cash_noshow INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN cash_blocked INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO health_settings (key, value, note, status) VALUES
  ('配送費_2公里內', '30', '沒達到免運門檻時的配送費（一筆訂單收一次）', '待主管批准'),
  ('配送費_2至5公里', '50', '同上', '待主管批准'),
  ('配送費_5至8公里', '80', '同上', '待主管批准'),
  ('付現未取上限', '2', '每位會員同時最多幾筆還沒取餐的付現訂單', '待主管批准'),
  ('付現沒來關閉次數', '2', '付現訂單沒來取餐累計幾次，關閉這位會員的付現', '待主管批准');
