/**
 * Phạm vi phân khu của Field Host — bản hiển thị, khớp `backend/src/modules/field-hosts/host-scope.ts`.
 * Backend mới là nơi quyết định quyền (bảng ca, nhận ca, thẩm định); ở web chỉ dùng cho UX (Sổ tay, mô tả phạm vi).
 */
export type ZoneScope = "all" | "selected";

export interface ZoneScopeFields {
  assignedZone: string;
  zoneScope: ZoneScope;
  managedZones: string[];
  /** Phân khu hiệu lực khi `selected` (phân khu chính đứng đầu); `null` = tất cả. */
  zones: string[] | null;
}

/** Danh sách phân khu hiệu lực theo lựa chọn đang sửa (phân khu chính luôn có). */
export function effectiveZones(assignedZone: string, scope: ZoneScope, managed: readonly string[]): string[] | null {
  if (scope === "all") return null;
  return [assignedZone, ...[...new Set(managed)].filter((z) => z && z !== assignedZone)];
}

export function scopeSummary(zones: string[] | null, totalZones: number): string {
  if (zones === null) return `Tất cả phân khu (${totalZones} hiện có, tự gồm phân khu mở sau này)`;
  return `${zones.length}/${totalZones} phân khu: ${zones.join(", ")}`;
}
