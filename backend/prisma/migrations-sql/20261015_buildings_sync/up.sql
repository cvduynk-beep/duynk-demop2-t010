-- Đồng bộ bảng buildings với danh sách toà Ocean Park 1 trong form ký gửi cũ (URBAN_PROJECTS, commit 1ff67f1) — 2026-10-15.
-- Lý do: form từng cho chọn toà không có trong DB ⇒ POST /landlord/consignments trả 400 "Tòa nhà không thuộc phân khu hỗ trợ".
-- Từ nay form lấy toà từ DB (GET /landlord/buildings) nên toà muốn nhận ký gửi phải có ở đây.
--
-- CHỈ THÊM toà còn thiếu (ON CONFLICT DO NOTHING). KHÔNG sửa toà đã có: đổi zone_name làm lệch phạm vi phân khu của
-- Field Host và điều phối; đổi total_floors có thể làm căn đã niêm yết vượt số tầng.
-- Lệch đã biết (giữ theo DB): BE3 trong form cũ nằm ở "The Pavilion", seed DB đặt ở "The Beverly"; BE-STU chỉ có trong DB.
--
-- ⚠ Số tầng và toạ độ sảnh của toà MỚI là XẤP XỈ: chép từ toà cùng phân khu đã có trong seed (seed_excel_units.ts).
-- Toạ độ sảnh dùng cho bản đồ / khoảng cách điều phối ⇒ Field Host/Admin cần cập nhật số thật sau.
--
-- Trước khi chạy: xem check.sql. Chạy:
--   npx prisma db execute --file prisma/migrations-sql/20261015_buildings_sync/up.sql --schema prisma/schema.prisma

BEGIN;

INSERT INTO buildings (id, building_code, zone_name, total_floors, lobby_latitude, lobby_longitude, created_at)
VALUES
  -- The Sapphire 1 (theo S1.02: 28 tầng)
  (gen_random_uuid(), 'S1.06', 'The Sapphire 1', 28, 20.998412, 105.945281, now()),
  (gen_random_uuid(), 'S1.07', 'The Sapphire 1', 28, 20.998412, 105.945281, now()),
  (gen_random_uuid(), 'S1.09', 'The Sapphire 1', 28, 20.998412, 105.945281, now()),
  (gen_random_uuid(), 'S1.11', 'The Sapphire 1', 28, 20.998412, 105.945281, now()),
  -- The Sapphire 2 (theo S2.01: 30 tầng)
  (gen_random_uuid(), 'S2.02', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.03', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.06', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.08', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.09', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.10', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.11', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.15', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.16', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.17', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  (gen_random_uuid(), 'S2.19', 'The Sapphire 2', 30, 20.996541, 105.942189, now()),
  -- The Zenpark (theo R1.02: 31 tầng)
  (gen_random_uuid(), 'R1.01', 'The Zenpark', 31, 20.991512, 105.938912, now()),
  (gen_random_uuid(), 'R1.03', 'The Zenpark', 31, 20.991512, 105.938912, now()),
  (gen_random_uuid(), 'R1.05', 'The Zenpark', 31, 20.991512, 105.938912, now()),
  -- The Pavilion (theo P4: 30 tầng)
  (gen_random_uuid(), 'P1', 'The Pavilion', 30, 20.993121, 105.937812, now()),
  (gen_random_uuid(), 'P2', 'The Pavilion', 30, 20.993121, 105.937812, now()),
  (gen_random_uuid(), 'P3', 'The Pavilion', 30, 20.993121, 105.937812, now()),
  -- Masteri Waterfront (M1 theo M2: 30 tầng · H2/H3 theo H1: 26 tầng)
  (gen_random_uuid(), 'M1', 'Masteri Waterfront', 30, 20.995123, 105.948912, now()),
  (gen_random_uuid(), 'H2', 'Masteri Waterfront', 26, 20.996123, 105.947812, now()),
  (gen_random_uuid(), 'H3', 'Masteri Waterfront', 26, 20.996123, 105.947812, now())
ON CONFLICT (building_code) DO NOTHING;

COMMIT;
