-- 店家排列與前台顯示：後台可調整順序、隱藏店家、新增店家
ALTER TABLE shops ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shops ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE shops SET sort_order = id;
