-- Rollback cọc v2 · bỏ các cột chốt nhanh (mất thông tin chu kỳ / giá đã chốt của các cọc chốt nhanh; `amount` giữ nguyên).
ALTER TABLE holding_deposits DROP COLUMN IF EXISTS quote_expires_at;
ALTER TABLE holding_deposits DROP COLUMN IF EXISTS quoted_monthly_rent;
ALTER TABLE holding_deposits DROP COLUMN IF EXISTS fast_close_cycle;
ALTER TABLE holding_deposits DROP COLUMN IF EXISTS base_amount;
