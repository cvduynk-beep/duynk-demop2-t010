-- Hoàn tác 20261015_buildings_sync: xoá các toà up.sql đã thêm, CHỈ khi toà chưa có căn nào (căn đã ký gửi vào toà mới thì giữ,
-- tránh gãy khoá ngoại units.building_id). Toà đã có từ trước (seed) không nằm trong danh sách này nên không bị đụng.
-- Chạy: npx prisma db execute --file prisma/migrations-sql/20261015_buildings_sync/down.sql --schema prisma/schema.prisma

DELETE FROM buildings b
WHERE b.building_code IN (
    'S1.06','S1.07','S1.09','S1.11',
    'S2.02','S2.03','S2.06','S2.08','S2.09','S2.10','S2.11','S2.15','S2.16','S2.17','S2.19',
    'R1.01','R1.03','R1.05',
    'P1','P2','P3',
    'M1','H2','H3'
  )
  AND NOT EXISTS (SELECT 1 FROM units u WHERE u.building_id = b.id);
