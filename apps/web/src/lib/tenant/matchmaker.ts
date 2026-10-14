import { DEFAULT_HOUSEHOLD } from "@/lib/pricing/cost";
import { vndShort } from "@/lib/format";
import type { CriteriaState } from "@/lib/chat/types";
import { FURNISHING_LABEL, ITEM_LABEL, LAYOUT_LABEL, zoneById, type Furnishing } from "@/lib/units";

/**
 * Tiện ích GIAO DIỆN cho bộ lọc tìm căn (chip, câu mẫu, câu dựng từ bộ lọc). Không phân tích câu chat, không xếp hạng,
 * không có FAQ: các việc đó do backend làm (`POST /api/v1/chat`, `POST /api/v1/matchmaker/recommend`).
 */

export const emptyCriteria = (): CriteriaState => ({
  layouts: [],
  zones: [],
  buildings: [],
  items: [],
  household: { ...DEFAULT_HOUSEHOLD },
});

export const FLOOR_LABEL = { low: "Tầng thấp (1–10)", mid: "Tầng trung (11–20)", high: "Tầng cao (21+)" } as const;

export function hasCriteria(c: CriteriaState): boolean {
  return !!(c.budget || c.layouts.length || c.zones.length || c.buildings.length || c.floor || c.furnishing || c.items.length || c.pets);
}

// ─── Tóm tắt tiêu chí thành các "chip" ───────────────────────────────────────────────────────

export interface CriteriaChip {
  key: string;
  label: string;
  /** Hàm gỡ chip khỏi tiêu chí. */
  clear: (c: CriteriaState) => CriteriaState;
}

export function criteriaChips(c: CriteriaState): CriteriaChip[] {
  const chips: CriteriaChip[] = [];
  if (c.budget) chips.push({ key: "budget", label: `All-in ≤ ${vndShort(c.budget)}`, clear: (x) => ({ ...x, budget: undefined }) });
  if (c.layouts.length) chips.push({ key: "layouts", label: c.layouts.map((l) => (l === "Studio" ? "Studio" : LAYOUT_LABEL[l])).join(" / "), clear: (x) => ({ ...x, layouts: [] }) });
  if (c.buildings.length) chips.push({ key: "buildings", label: `Toà ${c.buildings.join(", ")}`, clear: (x) => ({ ...x, buildings: [] }) });
  if (c.zones.length) chips.push({ key: "zones", label: c.zones.map((z) => zoneById(z)?.short ?? z).join(", "), clear: (x) => ({ ...x, zones: [] }) });
  if (c.floor) chips.push({ key: "floor", label: FLOOR_LABEL[c.floor], clear: (x) => ({ ...x, floor: undefined }) });
  if (c.furnishing) chips.push({ key: "furnishing", label: FURNISHING_LABEL[c.furnishing as Furnishing], clear: (x) => ({ ...x, furnishing: undefined }) });
  if (c.items.length) chips.push({ key: "items", label: c.items.map((i) => ITEM_LABEL[i]).join(", "), clear: (x) => ({ ...x, items: [] }) });
  if (c.pets) chips.push({ key: "pets", label: "Nuôi thú cưng", clear: (x) => ({ ...x, pets: undefined }) });
  return chips;
}

/** Câu tự nhiên dựng từ bộ lọc khi khách chỉ bấm "Tìm căn" mà không gõ gì. */
export function sentenceFromCriteria(c: CriteriaState): string {
  const parts: string[] = ["Tìm giúp mình"];
  parts.push(c.layouts.length ? c.layouts.map((l) => (l === "Studio" ? "Studio" : `căn ${l.replace("PN", " phòng ngủ")}`)).join(" hoặc ") : "căn hộ");
  if (c.buildings.length) parts.push(`ở toà ${c.buildings.join(", ")}`);
  else if (c.zones.length) parts.push(`ở ${c.zones.map((z) => zoneById(z)?.short ?? z).join(", ")}`);
  if (c.budget) parts.push(`tổng chi phí tối đa ${vndShort(c.budget)}/tháng`);
  if (c.floor) parts.push(FLOOR_LABEL[c.floor].split(" (")[0].toLowerCase());
  if (c.items.length) parts.push(`có ${c.items.map((i) => ITEM_LABEL[i].toLowerCase()).join(", ")}`);
  if (c.pets) parts.push("cho nuôi thú cưng");
  return parts.join(" ") + ".";
}

export const SAMPLE_PROMPTS = [
  "Studio dưới 8 triệu, có điều hòa và tủ lạnh",
  "Căn 2 phòng ngủ ở Sapphire 2, ngân sách 11 triệu, 2 người",
  "Chi phí All-in gồm những gì?",
  "1 phòng ngủ cho nuôi mèo, tầng cao, khoảng 9 triệu",
];
