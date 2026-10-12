-- Rollback P07 · bỏ các cột vừa thêm (mất dữ liệu người cùng cư trú / tài khoản hoàn cọc đã lưu trong các cột này).
ALTER TABLE profiles DROP COLUMN IF EXISTS refund_account_enc;
ALTER TABLE contracts DROP COLUMN IF EXISTS refund_account_enc;
ALTER TABLE contracts DROP COLUMN IF EXISTS occupants;
