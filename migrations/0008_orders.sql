-- 2026-11-06 訂餐（唯一入口 order.html）：訂閱與單點共用預約表。
-- kind：訂閱／單點；qty：份數（單點可多份）；item_id：便當品項；bonus_used：單點付款時用掉的紅利（取消時退回紅利）
ALTER TABLE reservations ADD COLUMN kind TEXT NOT NULL DEFAULT '訂閱';
ALTER TABLE reservations ADD COLUMN qty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reservations ADD COLUMN item_id TEXT NOT NULL DEFAULT '';
ALTER TABLE reservations ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN bonus_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
-- 同一位會員、同一天同一時段：訂閱只能一份（單點可以多筆）
DROP INDEX IF EXISTS reservations_one_per_slot;
CREATE UNIQUE INDEX reservations_one_sub_per_slot ON reservations(member_id, date, slot) WHERE status <> '已取消' AND kind = '訂閱';
CREATE INDEX reservations_member ON reservations(member_id, date);

INSERT OR IGNORE INTO health_settings (key, value, note, status) VALUES
  ('中午份數上限', '30', '每天中午最多幾份（訂閱＋單點合計，留白＝不限）', '待主管批准'),
  ('晚上份數上限', '20', '每天晚上最多幾份（訂閱＋單點合計，留白＝不限）', '待主管批准'),
  ('可預約天數', '14', '最多可以預約幾天後的餐', '待主管批准'),
  ('中午自取時段', '11:30-13:30', '門市自取時間', '待主管批准'),
  ('晚上自取時段', '17:30-19:30', '門市自取時間', '待主管批准'),
  ('公休日', '週三', '不能預約的星期（可填多個，例：週三、週日）', '待主管批准'),
  ('截單時間', '20:00', '前一天幾點截單', '待主管批准'),
  ('推薦發放取餐數', '3', '新會員取餐滿幾餐，推薦人才得紅利', '待主管批准'),
  ('推薦每月上限人數', '10', '每位推薦人每月最多計幾人', '待主管批准');
UPDATE health_settings SET value = '30' WHERE key = '中午份數上限' AND value = '';
UPDATE health_settings SET value = '20' WHERE key = '晚上份數上限' AND value = '';
