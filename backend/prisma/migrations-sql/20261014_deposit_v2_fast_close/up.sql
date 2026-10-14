-- Cọc v2 · khách trả thẳng Tiền cọc bảo đảm (thay cọc giữ chỗ 2.000.000đ) + Chốt nhanh (giảm giá thuê theo chu kỳ, giảm ~5% cọc).
-- Chỉ THÊM cột nullable ⇒ không đụng dữ liệu hiện có (cọc cũ 2.000.000đ giữ nguyên `amount`).
-- Chạy: npx prisma db execute --file prisma/migrations-sql/20261014_deposit_v2_fast_close/up.sql --schema prisma/schema.prisma
-- Cọc trước khi giảm chốt nhanh (NULL = không chốt nhanh, `amount` là số phải trả).
ALTER TABLE holding_deposits ADD COLUMN IF NOT EXISTS base_amount numeric(12,2);
-- Chu kỳ thanh toán đã cam kết khi chốt nhanh (1 | 3 | 6 tháng); ký HĐ bắt buộc đúng chu kỳ này.
ALTER TABLE holding_deposits ADD COLUMN IF NOT EXISTS fast_close_cycle integer;
-- Giá thuê tháng đã chốt (đã giảm, ≥ giá sàn) ⇒ ghi vào contracts.monthly_rent_price khi ký.
ALTER TABLE holding_deposits ADD COLUMN IF NOT EXISTS quoted_monthly_rent numeric(12,2);
-- Hạn ưu đãi chốt nhanh (tạo cọc + 24 giờ). Tiền về sau mốc này ⇒ hoàn tiền, ưu đãi mất.
ALTER TABLE holding_deposits ADD COLUMN IF NOT EXISTS quote_expires_at timestamptz;
