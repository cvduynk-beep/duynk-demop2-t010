-- Kiểm tra (CHỈ ĐỌC) bảng buildings so với danh sách toà Ocean Park 1 mà form ký gửi cũ ghi cứng (commit 1ff67f1, URBAN_PROJECTS).
-- Chạy: npx prisma db execute --file prisma/migrations-sql/20261015_buildings_sync/check.sql --schema prisma/schema.prisma
-- (prisma db execute không in kết quả SELECT ⇒ nên dán vào Supabase SQL Editor để xem bảng.)

WITH wanted(building_code, zone_name) AS (
  VALUES
    ('S1.01','The Sapphire 1'),('S1.02','The Sapphire 1'),('S1.03','The Sapphire 1'),('S1.05','The Sapphire 1'),
    ('S1.06','The Sapphire 1'),('S1.07','The Sapphire 1'),('S1.08','The Sapphire 1'),('S1.09','The Sapphire 1'),
    ('S1.10','The Sapphire 1'),('S1.11','The Sapphire 1'),('S1.12','The Sapphire 1'),
    ('S2.01','The Sapphire 2'),('S2.02','The Sapphire 2'),('S2.03','The Sapphire 2'),('S2.05','The Sapphire 2'),
    ('S2.06','The Sapphire 2'),('S2.07','The Sapphire 2'),('S2.08','The Sapphire 2'),('S2.09','The Sapphire 2'),
    ('S2.10','The Sapphire 2'),('S2.11','The Sapphire 2'),('S2.12','The Sapphire 2'),('S2.15','The Sapphire 2'),
    ('S2.16','The Sapphire 2'),('S2.17','The Sapphire 2'),('S2.18','The Sapphire 2'),('S2.19','The Sapphire 2'),
    ('R1.01','The Zenpark'),('R1.02','The Zenpark'),('R1.03','The Zenpark'),('R1.05','The Zenpark'),
    ('ZR1','The Zenpark'),('ZR2','The Zenpark'),
    ('P1','The Pavilion'),('P2','The Pavilion'),('P3','The Pavilion'),('P4','The Pavilion'),('BE3','The Pavilion'),
    ('M1','Masteri Waterfront'),('M2','Masteri Waterfront'),('M3','Masteri Waterfront'),
    ('H1','Masteri Waterfront'),('H2','Masteri Waterfront'),('H3','Masteri Waterfront')
)
SELECT
  COALESCE(w.building_code, b.building_code) AS building_code,
  w.zone_name                                AS zone_in_form,
  b.zone_name                                AS zone_in_db,
  b.total_floors,
  (SELECT count(*) FROM units u WHERE u.building_id = b.id) AS units,
  CASE
    WHEN b.id IS NULL                    THEN 'THIẾU trong DB → up.sql sẽ thêm'
    WHEN w.building_code IS NULL         THEN 'Chỉ có trong DB (giữ nguyên)'
    WHEN w.zone_name <> b.zone_name      THEN 'Lệch phân khu (giữ theo DB, xem ghi chú up.sql)'
    ELSE 'OK'
  END AS status
FROM wanted w
FULL OUTER JOIN buildings b ON b.building_code = w.building_code
ORDER BY status, zone_in_form NULLS LAST, building_code;
