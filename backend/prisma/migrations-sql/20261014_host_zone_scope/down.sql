-- Rollback phạm vi phân khu: mọi Host quay về chỉ phân khu chính (`assigned_zone`, không bị đụng).
ALTER TABLE field_hosts DROP COLUMN IF EXISTS managed_zones;
ALTER TABLE field_hosts DROP COLUMN IF EXISTS zone_scope;
DROP TYPE IF EXISTS "HostZoneScope";
