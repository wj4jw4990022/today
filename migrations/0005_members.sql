-- 健康餐會員與訂閱系統（開發規劃第 2 步）：會員、訂閱、預約、錢包、配送點、推薦、補償，加上登入與 Email 驗證用的兩張表。
-- 欄位對照需求文件第十一節（中文名稱見 src/db.js）。所有規則數字仍放在 health_settings，不寫在表裡。

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL UNIQUE,            -- 會員ID，例 M261105-ABCD
  line_id TEXT NOT NULL UNIQUE,              -- LINE 登入的使用者識別碼（一個 LINE 帳號一個會員）
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',            -- 純文字，保留開頭的 0
  phone_verified INTEGER NOT NULL DEFAULT 0, -- 店員首次確認收款時核對手機後勾選
  email TEXT NOT NULL DEFAULT '',
  email_norm TEXT NOT NULL DEFAULT '',       -- 比對用：小寫、Gmail 去掉點號與 + 後綴
  email_verified_at TEXT NOT NULL DEFAULT '',
  referral_code TEXT NOT NULL UNIQUE,        -- 6 碼推薦碼
  referred_by TEXT NOT NULL DEFAULT '',      -- 推薦人會員ID
  ever_subscribed INTEGER NOT NULL DEFAULT 0,
  terms_agreed_at TEXT NOT NULL DEFAULT '',
  registered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '正常',        -- 正常／停用／已刪除
  note TEXT NOT NULL DEFAULT ''
);
-- 一支手機、一個 Email 只能一個帳號（空白不算）
CREATE UNIQUE INDEX members_phone ON members(phone) WHERE phone <> '';
CREATE UNIQUE INDEX members_email ON members(email_norm) WHERE email_norm <> '';

CREATE TABLE member_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,                    -- 存雜湊值，不存原始登入憑證
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL                -- 毫秒時間戳
);
CREATE INDEX member_sessions_member ON member_sessions(member_id);

CREATE TABLE email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX email_codes_member ON email_codes(member_id, sent_at);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  meals INTEGER NOT NULL,                    -- 方案餐數（8／12／20）
  remaining INTEGER NOT NULL,                -- 剩餘餐數
  plan_amount INTEGER NOT NULL,              -- 方案金額
  referral_discount INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL,              -- 實付金額
  pay_method TEXT NOT NULL DEFAULT '',       -- 現金／轉帳／LINE Pay
  transfer_last5 TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  pause_start TEXT NOT NULL DEFAULT '',
  pause_end TEXT NOT NULL DEFAULT '',
  upgrade_size TEXT NOT NULL DEFAULT '',     -- 整期升級後的份量（空白＝基本餐）
  upgrade_main TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '待付款',      -- 待付款／使用中／暫停／已到期／已取消／已續訂
  renew_from TEXT NOT NULL DEFAULT '',       -- 續訂來源訂閱ID
  settle_amount INTEGER,                     -- 到期或取消的結算金額
  settle_method TEXT NOT NULL DEFAULT '',    -- 轉入錢包／退現金
  created_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX subscriptions_member ON subscriptions(member_id, status);
CREATE INDEX subscriptions_status ON subscriptions(status);

CREATE TABLE reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  res_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  sub_id TEXT NOT NULL,
  date TEXT NOT NULL,                        -- YYYY-MM-DD
  slot TEXT NOT NULL,                        -- 中午／晚上
  pickup TEXT NOT NULL DEFAULT '自取',        -- 自取／配送
  point_id TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL,
  main TEXT NOT NULL,
  sauce TEXT NOT NULL DEFAULT '',
  addons TEXT NOT NULL DEFAULT '',           -- 加購項目（品項ID，逗號分隔）
  upgrade_amount INTEGER NOT NULL DEFAULT 0, -- 這一餐要從錢包扣的升級差額
  addon_amount INTEGER NOT NULL DEFAULT 0,
  list_price INTEGER,                        -- 預約當下的單點原價（結算用）
  charge_status TEXT NOT NULL DEFAULT '未扣款', -- 未扣款／已扣款／餘額不足改回基本餐
  status TEXT NOT NULL DEFAULT '已預約',      -- 已預約／已取消／已鎖定／已取餐／未取餐作廢／店家補償／配送改自取
  picked_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
-- 同一位會員、同一天、同一時段只能有一份（取消的不算）
CREATE UNIQUE INDEX reservations_one_per_slot ON reservations(member_id, date, slot) WHERE status <> '已取消';
CREATE INDEX reservations_day ON reservations(date, slot, status);
CREATE INDEX reservations_sub ON reservations(sub_id);

CREATE TABLE wallet_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rec_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  at TEXT NOT NULL,
  type TEXT NOT NULL,                        -- 儲值／退款轉入／推薦獎勵／升級扣款／加購扣款／獎勵收回／人工調整／退現金
  amount INTEGER NOT NULL,                   -- 入帳正數、扣款負數；餘額＝已入帳紀錄加總
  refundable INTEGER NOT NULL DEFAULT 1,     -- 可退現金（儲值、退款轉入）或僅限消費（推薦獎勵）
  pay_method TEXT NOT NULL DEFAULT '',
  transfer_last5 TEXT NOT NULL DEFAULT '',
  ref_id TEXT NOT NULL DEFAULT '',           -- 對應的預約／訂閱／推薦紀錄
  handled_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '待確認',      -- 待確認／已入帳／已取消
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX wallet_member ON wallet_ledger(member_id, status);

CREATE TABLE delivery_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  distance_km REAL NOT NULL DEFAULT 0,
  slots TEXT NOT NULL DEFAULT '中午,晚上',
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rec_id TEXT NOT NULL UNIQUE,
  referrer_id TEXT NOT NULL,
  new_member_id TEXT NOT NULL UNIQUE,        -- 一位新會員只算一次
  new_sub_id TEXT NOT NULL DEFAULT '',
  picked_count INTEGER NOT NULL DEFAULT 0,
  reward INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '等待中',      -- 等待中／已發放／超過上限／已取消
  granted_at TEXT NOT NULL DEFAULT '',
  count_month TEXT NOT NULL DEFAULT '',      -- 計入月份 YYYY-MM
  cancel_reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX referrals_referrer ON referrals(referrer_id, count_month);

CREATE TABLE compensations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rec_id TEXT NOT NULL UNIQUE,
  res_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT '',
  handled_by TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

-- 會員系統總開關：FALSE＝健康餐頁的訂閱按鈕顯示「即將開放」
INSERT OR IGNORE INTO health_settings (key, value, note, status) VALUES ('會員系統開放', 'FALSE', '會員登入與訂閱購買上線後改成 TRUE', '');
