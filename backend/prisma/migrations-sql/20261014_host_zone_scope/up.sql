-- Phạm vi phân khu của Field Host (nhận ca pool + xem). Phân khu chính vẫn là `assigned_zone` (tự giao ca theo phân khu chính).
-- `SELECTED` = phân khu chính + `managed_zones`; `ALL` = mọi phân khu, kể cả phân khu tạo sau (wildcard).
-- Mặc định SELECTED + mảng rỗng ⇒ Host hiện có giữ nguyên hành vi (chỉ phân khu chính), không cần chép dữ liệu.
-- Chạy: npx prisma db execute --file prisma/migrations-sql/20261014_host_zone_scope/up.sql --schema prisma/schema.prisma
DO $$ BEGIN
  CREATE TYPE "HostZoneScope" AS ENUM ('ALL', 'SELECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE field_hosts ADD COLUMN IF NOT EXISTS zone_scope "HostZoneScope" NOT NULL DEFAULT 'SELECTED';
ALTER TABLE field_hosts ADD COLUMN IF NOT EXISTS managed_zones text[] NOT NULL DEFAULT '{}';
