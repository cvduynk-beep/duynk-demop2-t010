import type { LayoutKind, LockType, Unit, UnitStatus, ZoneId } from "@/lib/mock/units";
import { zoneOfBuilding } from "@/lib/mock/units";

/**
 * Chuyển đổi layout type từ Database Prisma sang LayoutKind của Frontend
 */
export function parseLayoutKind(layout: string | undefined): { layout: LayoutKind; layoutLabel: string } {
  if (!layout) return { layout: "2PN", layoutLabel: "2 phòng ngủ" };
  const upper = String(layout || "").toUpperCase();
  if (upper === "STUDIO") return { layout: "Studio", layoutLabel: "Studio" };
  if (upper === "ONE_BED_PLUS" || upper === "1PN+") return { layout: "1PN", layoutLabel: "1PN+" };
  if (upper === "ONE_BED" || upper === "1PN") return { layout: "1PN", layoutLabel: "1 phòng ngủ" };
  if (upper === "TWO_BED_ONE_BATH") return { layout: "2PN", layoutLabel: "2PN (1WC)" };
  if (upper === "TWO_BED_TWO_BATH" || upper === "2PN") return { layout: "2PN", layoutLabel: "2 phòng ngủ" };
  if (upper === "THREE_BED" || upper === "3PN") return { layout: "3PN", layoutLabel: "3 phòng ngủ" };
  return { layout: "2PN", layoutLabel: "2 phòng ngủ" };
}

/**
 * Adapter ánh xạ một bản ghi Căn hộ từ Database / Backend DTO sang Model Unit hiển thị trên giao diện
 */
export function mapDbUnitToFrontendUnit(dbUnit: any): Unit {
  const buildingCode = dbUnit?.building?.buildingCode || "S1.02";
  const zone = zoneOfBuilding(buildingCode);
  const { layout, layoutLabel } = parseLayoutKind(dbUnit?.layoutType);

  const unitCode = dbUnit?.unitCode || `VHOP-${buildingCode}-0804`;
  const codeParts = unitCode.split("-");
  const doorRaw = codeParts[2] || "01";
  const door = doorRaw.length >= 2 ? doorRaw.slice(-2) : doorRaw.padStart(2, "0");

  const bedrooms = layout === "Studio" ? 0 : layout === "1PN" ? 1 : layout === "2PN" ? 2 : 3;
  const bathrooms = dbUnit?.layoutType === "TWO_BED_TWO_BATH" || layout === "3PN" ? 2 : 1;

  const rent = Number(dbUnit?.baseRentPrice) || 6_000_000;
  const marketAvg = Number(dbUnit?.marketAvgPrice) || Math.round(rent * 1.12);
  const areaM2 = Number(dbUnit?.carpetAreaM2) || 45;

  let baseStatus: UnitStatus = "available";
  const rawStatus = String(dbUnit?.status || "").toUpperCase();
  if (rawStatus === "HOLDING") baseStatus = "holding";
  else if (rawStatus === "RENTED") baseStatus = "rented";

  const lock: LockType = dbUnit.doorLockType === "ELECTRONIC_PIN" ? "smart" : "physical";

  const mediaUrls: string[] = Array.isArray(dbUnit.media)
    ? dbUnit.media.map((m: any) => m.url).filter(Boolean)
    : [];

  return {
    id: dbUnit.id,
    code: unitCode,
    building: buildingCode,
    zoneId: zone.id,
    floor: Number(dbUnit.floorNumber) || 12,
    door,
    layout,
    layoutLabel,
    bedrooms,
    bathrooms,
    areaM2,
    direction: "Đông Nam",
    view: "Nội khu & công viên",
    furnishing: "full",
    rent,
    marketAvg,
    baseStatus,
    lock,
    landlordId: dbUnit.landlordId || "L1",
    images: Math.max(1, mediaUrls.length || 5),
    interest24h: 12,
    petFriendly: true,
    minMonths: 12,
    verifiedAt: dbUnit.updatedAt || new Date().toISOString(),
    title: `Căn ${layoutLabel} toà ${buildingCode} · Phân khu ${zone.name}`,
    description: `Căn hộ cao cấp tại ${zone.name}, toà ${buildingCode}. Đã qua kiểm định thực tế 100%, trang bị đầy đủ tiện nghi, sẵn sàng dọn vào ở ngay.`,
    items: ["ac", "fridge", "washer", "kitchen", "heater", "bed", "wardrobe", "sofa", "curtain", "balcony"],
    mediaUrls,
  };
}

/**
 * Fetch danh sách căn hộ từ Backend API (kèm cơ chế an toàn)
 */
export async function fetchUnitsFromApi(): Promise<Unit[]> {
  try {
    const res = await fetch("/api/v1/properties/units", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
    return list.map(mapDbUnitToFrontendUnit);
  } catch {
    return [];
  }
}
