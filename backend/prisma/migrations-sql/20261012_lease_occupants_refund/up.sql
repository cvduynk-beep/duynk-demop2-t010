-- P07 · Hợp đồng thuê: người cùng cư trú + tài khoản nhận hoàn cọc (mã hoá AES-256-GCM ở backend, không lưu số TK dạng rõ).
-- Chỉ THÊM cột nullable / có mặc định ⇒ không đụng dữ liệu hiện có. Chạy: npx prisma db execute --file prisma/migrations-sql/20261012_lease_occupants_refund/up.sql --schema prisma/schema.prisma
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS occupants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS refund_account_enc text;
-- Tài khoản hoàn cọc đã lưu của khách để điền sẵn lần thuê sau (khách xoá được ở trang tài khoản).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refund_account_enc text;
