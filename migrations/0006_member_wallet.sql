-- 2026-11-06 會員與錢包（後台優先）：LINE 還沒串好，會員先由店員在後台建立，所以 LINE 識別碼改成可以留空。
-- SQLite 不能直接改欄位限制，所以重建 members 表（資料原樣搬過去）。

CREATE TABLE members_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL UNIQUE,
  line_id TEXT,                              -- LINE 登入識別碼；店員建立的會員先留空（NULL），綁定 LINE 後才有
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_verified INTEGER NOT NULL DEFAULT 0,
  email TEXT NOT NULL DEFAULT '',
  email_norm TEXT NOT NULL DEFAULT '',
  email_verified_at TEXT NOT NULL DEFAULT '',
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT NOT NULL DEFAULT '',
  ever_subscribed INTEGER NOT NULL DEFAULT 0,
  terms_agreed_at TEXT NOT NULL DEFAULT '',
  registered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '正常',
  note TEXT NOT NULL DEFAULT ''
);
INSERT INTO members_new SELECT id, member_id, NULLIF(line_id, ''), name, phone, phone_verified, email, email_norm, email_verified_at, referral_code, referred_by, ever_subscribed, terms_agreed_at, registered_at, status, note FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;
CREATE UNIQUE INDEX members_line ON members(line_id) WHERE line_id IS NOT NULL AND line_id <> '';
CREATE UNIQUE INDEX members_phone ON members(phone) WHERE phone <> '';
CREATE UNIQUE INDEX members_email ON members(email_norm) WHERE email_norm <> '';

CREATE INDEX wallet_member_id ON wallet_ledger(member_id, id);

-- 儲值與紅利的設定（可在後台「規則與價格」修改）
INSERT OR IGNORE INTO health_settings (key, value, note, status) VALUES
  ('儲值金額選項', '1400,1980,3100,1000,2000,3000,5000', '後台儲值的固定金額按鈕，逗號分隔', '待主管批准'),
  ('自訂儲值上限', '10000', '自訂金額單筆上限（元），避免多打一個 0', '待主管批准');
UPDATE health_settings SET note = '新會員用推薦碼購買第一期，存入的紅利（只能消費、不可退現金）' WHERE key LIKE '新會員折扣_%';
UPDATE health_settings SET note = '新會員取餐滿指定餐數後，推薦人得到的紅利（只能消費、不可退現金）' WHERE key = '推薦人獎勵';
