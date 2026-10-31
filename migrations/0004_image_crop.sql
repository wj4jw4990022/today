-- 圖片裁切：裁切後的圖片記錄原圖編號與裁切範圍，之後可以「重新裁切」不用重新上傳
ALTER TABLE images ADD COLUMN orig_id TEXT;
ALTER TABLE images ADD COLUMN crop TEXT;
