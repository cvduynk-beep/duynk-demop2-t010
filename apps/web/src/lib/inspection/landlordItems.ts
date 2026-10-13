/**
 * "Tình trạng nội thất bàn giao" — món chủ nhà tick nhanh lúc ký gửi (ConsignWizard) ⇄ mã hạng mục bảng kê 32 món
 * (catalog backend `inspection.catalog.ts`). Chủ nhà chọn món ⇒ web gửi `inventoryCodes`; màn thẩm định tick sẵn đúng
 * các mã đó và hiện banner "Đã tự động liên kết từ hồ sơ ký gửi". NGUỒN DUY NHẤT của bảng map ở web.
 */
export interface LandlordItem {
  key: string;
  label: string;
  icon: string;
  /** Mã hạng mục catalog (1..32) tương ứng. */
  codes: string[];
}

export const LANDLORD_ITEMS: LandlordItem[] = [
  { key: "ac", label: "Điều hòa Inverter", icon: "❄️", codes: ["23", "24"] },
  { key: "fridge", label: "Tủ lạnh", icon: "🧊", codes: ["8"] },
  { key: "washer", label: "Máy giặt", icon: "🧺", codes: ["21"] },
  { key: "kitchen", label: "Bếp từ & Hút mùi", icon: "🍳", codes: ["6", "7"] },
  { key: "heater", label: "Bình nóng lạnh", icon: "🚿", codes: ["17"] },
  { key: "bed", label: "Giường & Đệm", icon: "🛏️", codes: ["13", "14"] },
  { key: "wardrobe", label: "Tủ quần áo", icon: "🚪", codes: ["15"] },
  { key: "sofa", label: "Sofa phòng khách", icon: "🛋️", codes: ["1", "2"] },
  { key: "dining", label: "Bàn ăn & Ghế", icon: "🍽️", codes: ["12"] },
  { key: "curtains", label: "Rèm cửa & Giàn phơi", icon: "🪟", codes: ["5", "22"] },
];

/** Món chủ nhà tick ⇒ mã catalog (không trùng, theo thứ tự số). */
export function landlordItemsToCodes(keys: readonly string[]): string[] {
  const picked = new Set(keys);
  const codes = new Set(LANDLORD_ITEMS.filter((i) => picked.has(i.key)).flatMap((i) => i.codes));
  return [...codes].sort((a, b) => Number(a) - Number(b));
}

/** Mã catalog chủ nhà khai ⇒ tên món chủ nhà đã tick (món có ÍT NHẤT một mã nằm trong danh sách). */
export function landlordItemLabels(codes: readonly string[]): string[] {
  const has = new Set(codes);
  return LANDLORD_ITEMS.filter((i) => i.codes.some((c) => has.has(c))).map((i) => i.label);
}
