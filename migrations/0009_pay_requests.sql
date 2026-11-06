-- 2026-11-06 會員自己訂閱：網站送出付款申請（儲值／儲值並購買方案），店員在後台「收款確認」後入帳與開通
CREATE TABLE pay_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  req_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  meals INTEGER NOT NULL DEFAULT 0,
  code TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL,
  last5 TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '待確認',
  created_at TEXT NOT NULL,
  handled_by TEXT NOT NULL DEFAULT '',
  handled_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX pay_requests_status ON pay_requests(status, id);
CREATE INDEX pay_requests_member ON pay_requests(member_id, status);
INSERT OR IGNORE INTO health_settings (key, value, note, status) VALUES
  ('轉帳資訊', '', '會員選轉帳時顯示（銀行、分行、帳號、戶名）；留白＝顯示「請洽門市索取轉帳帳號」', ''),
  ('LINE Pay說明', '請到門市用 LINE Pay 付款，店員確認後開通', '會員選 LINE Pay 時顯示', ''),
  ('門市付現說明', '請到門市付現，店員確認後開通', '會員選到門市付現時顯示', '');
