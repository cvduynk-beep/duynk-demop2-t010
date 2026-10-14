/**
 * Phạm vi phân khu của Field Host — NGUỒN DUY NHẤT cho câu hỏi "Host này có được thấy / nhận ca pool của phân khu X không".
 * Quyết định 2026-10-14:
 * - Một quyền duy nhất = phạm vi nhận ca pool + xem (không tách xem / sửa).
 * - `all` là wildcard: gồm cả phân khu tạo sau, không phải gán lại.
 * - `selected` = phân khu chính (`assignedZone`) ∪ `managedZones`. Phân khu chính luôn nằm trong phạm vi.
 * - Tự giao ca (tầng 1 xem phòng, giao ca thẩm định) và "Host phụ trách" vẫn CHỈ theo phân khu chính — KHÔNG dùng hàm này.
 * Hàm thuần: thiếu field (dữ liệu trước migration, fixture cũ) ⇒ coi như `selected` + rỗng = chỉ phân khu chính.
 */
export type ZoneScope = 'all' | 'selected';

export interface HostZoneScopeSource {
  assignedZone: string;
  zoneScope?: string | null;
  managedZones?: readonly string[] | null;
}

export const MANAGED_ZONES_MAX = 50;

export function zoneScopeOf(h: HostZoneScopeSource): ZoneScope {
  return h.zoneScope === 'ALL' || h.zoneScope === 'all' ? 'all' : 'selected';
}

/** Phân khu chính khớp theo quy ước cũ (`assignedZone` CHỨA tên phân khu của tòa); phân khu thêm khớp đúng tên. */
export function coversZone(h: HostZoneScopeSource, zoneName: string): boolean {
  if (!zoneName) return false;
  if (zoneScopeOf(h) === 'all') return true;
  if (h.assignedZone.includes(zoneName)) return true;
  return (h.managedZones ?? []).includes(zoneName);
}

/** Dạng trả ra API: `zones` = các phân khu hiệu lực khi `selected` (phân khu chính đứng đầu, không trùng). */
export function zoneScopeView(h: HostZoneScopeSource): { zoneScope: ZoneScope; managedZones: string[]; zones: string[] | null } {
  const managed = [...new Set((h.managedZones ?? []).filter((z) => z && z !== h.assignedZone))];
  const scope = zoneScopeOf(h);
  return { zoneScope: scope, managedZones: managed, zones: scope === 'all' ? null : [h.assignedZone, ...managed] };
}

/** `version` cho ghi có điều kiện: đổi khi phạm vi đổi. Không chứa dữ liệu nhạy cảm. */
export function zoneScopeVersion(h: HostZoneScopeSource): string {
  const v = zoneScopeView(h);
  return `${v.zoneScope}:${[...v.managedZones].sort().join('|')}`;
}
