-- 2026-11-06 LINE 登入：會員自己用 LINE 註冊；手機和門市會員相同時先記「待合併」，由店員審核合併。
-- pending_phone：待合併的會員填的手機（和門市會員相同，所以不能放在 phone 欄）
ALTER TABLE members ADD COLUMN pending_phone TEXT NOT NULL DEFAULT '';
-- 已登入 LINE、還沒填完資料的人，用這兩欄暫存
ALTER TABLE member_sessions ADD COLUMN line_id TEXT NOT NULL DEFAULT '';
ALTER TABLE member_sessions ADD COLUMN line_name TEXT NOT NULL DEFAULT '';
-- LINE 登入防偽造用的一次性代碼
CREATE TABLE line_states (state TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
