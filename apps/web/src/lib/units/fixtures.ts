import type { TenantUnit } from "@/lib/tenant/types";

/**
 * DỮ LIỆU MẪU cho test và cho fallback CÓ CỜ (`ALLOW_MOCK_FALLBACK=true`, chỉ ngoài production) — xem `./source.ts`.
 * Viết đúng kiểu `TenantUnit` mà `GET /properties/units` trả, nên đi qua cùng `toUnit` như dữ liệu thật (một nguồn type).
 * KHÔNG import file này từ luồng thật; mọi chỗ hiển thị dữ liệu này đều gắn `source: "mock"`.
 */
const base = (patch: Partial<TenantUnit> & Pick<TenantUnit, "code" | "building" | "floor" | "door" | "layout" | "rent">): TenantUnit => ({
  zoneName: "The Sapphire 1",
  layoutLabel: patch.layout === "Studio" ? "Studio" : patch.layout,
  bedrooms: patch.layout === "Studio" ? 0 : Number(patch.layout[0]),
  bathrooms: patch.layout === "2PN" || patch.layout === "3PN" ? 2 : 1,
  areaM2: 30,
  direction: null,
  view: null,
  furnishing: "full",
  items: ["ac", "fridge", "washer", "bed"],
  marketAvg: patch.rent,
  managementFee: 285_000,
  parkingFeeEstimate: 150_000,
  utilityCostEstimate: 300_000,
  status: "available",
  lock: "smart",
  photos: [],
  interest24h: 0,
  petFriendly: false,
  minMonths: 6,
  verifiedAt: "2026-10-01T00:00:00.000Z",
  holdHours: 48,
  activeViewingAt: null,
  securityDeposit: patch.rent,
  holdingDeposit: patch.rent, // cọc v2: khoản cọc khi chốt căn = Tiền cọc bảo đảm
  highlights: [],
  inventory: [],
  ...patch,
});

export const FIXTURE_UNITS: readonly TenantUnit[] = [
  base({ code: "MOCK-S1.02-0701", building: "S1.02", floor: 7, door: "01", layout: "Studio", rent: 5_500_000, areaM2: 32 }),
  base({ code: "MOCK-S1.05-1203", building: "S1.05", floor: 12, door: "03", layout: "1PN", rent: 7_000_000, areaM2: 45, managementFee: 427_500 }),
  base({ code: "MOCK-S2.05-1808", building: "S2.05", zoneName: "The Sapphire 2", floor: 18, door: "08", layout: "2PN", rent: 9_500_000, areaM2: 64, managementFee: 608_000 }),
];
