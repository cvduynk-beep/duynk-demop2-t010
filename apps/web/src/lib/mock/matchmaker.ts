import { allInCost, DEFAULT_HOUSEHOLD, isBargain, savingsPct, type CostBreakdown } from "./cost";
import { vnd, vndShort } from "./format";
import type { CriteriaState } from "./types";
import {
  FURNISHING_LABEL,
  ITEM_LABEL,
  LAYOUT_LABEL,
  UNITS,
  ZONES,
  getUnitCondition,
  unitAddress,
  zoneById,
  type Furnishing,
  type ItemKey,
  type LayoutKind,
  type Unit,
  type UnitStatus,
  type ZoneId,
} from "./units";

export const emptyCriteria = (): CriteriaState => ({
  layouts: [],
  zones: [],
  buildings: [],
  items: [],
  household: { ...DEFAULT_HOUSEHOLD },
});

export const FLOOR_LABEL = { low: "Tầng thấp (1–10)", mid: "Tầng trung (11–20)", high: "Tầng cao (21+)" } as const;

const floorBand = (floor: number): "low" | "mid" | "high" => (floor <= 10 ? "low" : floor <= 20 ? "mid" : "high");

// ─── Phân tích câu chat ──────────────────────────────────────────────────────────────────────

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

function parseBudget(text: string): number | undefined {
  const t = fold(text);
  const values: number[] = [];
  // 7tr5 · 7,5 triệu · 8 trieu · 8tr · 8 củ · 8m · 8tr/thang · 8m/thang
  for (const m of t.matchAll(/(\d{1,2})(?:[.,](\d{1,2}))?\s*(?:tr|trieu|cu|m\b)\s*(\d)?(?![a-z])/g)) {
    const whole = Number(m[1]);
    const frac = m[2] ? Number(`0.${m[2]}`) : m[3] ? Number(`0.${m[3]}`) : 0;
    values.push((whole + frac) * 1_000_000);
  }
  // 10.000.000 · 8000000
  for (const m of t.matchAll(/\b(\d{1,3}(?:[.,]\d{3}){2,}|\d{7,8})\b/g)) {
    values.push(Number(m[1].replace(/[.,]/g, "")));
  }
  const plausible = values.filter((v) => v >= 3_000_000 && v <= 60_000_000);
  return plausible.length ? Math.max(...plausible) : undefined;
}

const LAYOUT_PATTERNS: [LayoutKind, RegExp][] = [
  ["Studio", /studio|stu\b|can\s*don\b/],
  ["1PN", /\b1\s*(pn|n2?\b|phong\s*ngu\b|phong\b|ngu\b)|mot\s*(pn|phong\s*ngu|phong|ngu)|1\s*bed/],
  ["2PN", /\b2\s*(pn|n2?\b|phong\s*ngu\b|phong\b|ngu\b)|hai\s*(pn|phong\s*ngu|phong|ngu)|2\s*bed/],
  ["3PN", /\b3\s*(pn|n2?\b|phong\s*ngu\b|phong\b|ngu\b)|ba\s*(pn|phong\s*ngu|phong|ngu)|3\s*bed/],
];

const ITEM_PATTERNS: [ItemKey, RegExp][] = [
  ["ac", /dieu hoa|may lanh/],
  ["fridge", /tu lanh/],
  ["washer", /may giat/],
  ["kitchen", /\bbep\b|hut mui/],
  ["heater", /nong lanh/],
  ["bed", /giuong|nem\b/],
  ["wardrobe", /tu quan ao|tu do/],
  ["sofa", /sofa/],
  ["tv", /\btv\b|tivi|smart tv/],
  ["curtain", /\brem\b/],
  ["balcony", /ban cong|logia|lo gia/],
];

const ZONE_PATTERNS: [ZoneId, RegExp][] = [
  ["sapphire1", /sapphire\s*1\b|\bs1\b/],
  ["sapphire2", /sapphire\s*2\b|\bs2\b/],
  ["zenpark", /zenpark|zen park|\bzr\b/],
  ["pavilion", /pavilion/],
  ["masteri", /masteri|waterfront/],
];

/** Từ khoá tìm kiếm chung: khách chỉ gõ ngắn như "tìm căn", "thuê căn", "căn hộ", "xem phòng", "rổ hàng", "giá rẻ"... */
const GENERAL_SEARCH_RE =
  /\b(tim\s*(can|phong|nha|cho|can\s*ho)|thue\s*(can|phong|nha|cho|can\s*ho)|xem\s*(can|phong|nha|ro\s*hang|danh\s*sach|can\s*ho)|can\s*ho|phong\s*tro|ro\s*hang|danh\s*sach|co\s*can|con\s*can|gia\s*re|can\s*re|re\s*nhat|can\s*hoi|can\s*dep|ocean\s*park|vinhomes|bat\s*dau|loc\s*can|tim\s*giup|tu\s*van\s*(thue|can)?|cho\s*xem|tat\s*ca\s*can|kiem\s*can|muon\s*thue|can\s*thue)\b/;

export interface ParsedQuery {
  patch: CriteriaState;
  hasSearchSignal: boolean;
}

/** Trích tiêu chí tìm căn từ một câu tiếng Việt (bỏ dấu, chịu lỗi gõ tắt như "2n2", "7tr5"). */
export function parseQuery(text: string, base: CriteriaState): ParsedQuery {
  const t = fold(text);
  const c: CriteriaState = { ...base, layouts: [...base.layouts], zones: [...base.zones], buildings: [...base.buildings], items: [...base.items], household: { ...base.household } };
  let signal = false;

  const budget = parseBudget(text);
  if (budget) {
    c.budget = budget;
    signal = true;
  }

  const layouts = LAYOUT_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (layouts.length) {
    c.layouts = layouts;
    signal = true;
  }

  const buildings = [...text.toUpperCase().matchAll(/\b(S[12]\.\d{2}|ZR[12]|R1\.02|P[34]|H[12]|M[23])\b/g)].map((m) => m[1]);
  const knownBuildings = buildings.filter((b) => ZONES.some((z) => z.buildings.includes(b)));
  if (knownBuildings.length) {
    c.buildings = [...new Set(knownBuildings)];
    signal = true;
  }
  const zones = ZONE_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (zones.length && !knownBuildings.length) {
    c.zones = zones;
    signal = true;
  }

  if (/tang cao|tang tren cao|view cao/.test(t)) {
    c.floor = "high";
    signal = true;
  } else if (/tang thap/.test(t)) {
    c.floor = "low";
    signal = true;
  } else if (/tang trung/.test(t)) {
    c.floor = "mid";
    signal = true;
  }

  if (/full do|full noi that|day du noi that/.test(t)) {
    c.furnishing = "full";
    signal = true;
  } else if (/nha trong|khong do/.test(t)) {
    c.furnishing = "empty";
    signal = true;
  } else if (/noi that co ban/.test(t)) {
    c.furnishing = "basic";
    signal = true;
  }

  const items = ITEM_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (items.length) {
    c.items = [...new Set([...c.items, ...items])];
    signal = true;
  }

  if (/thu cung|nuoi (cho|meo)|\bpet\b/.test(t)) {
    c.pets = true;
    signal = true;
  }

  const persons = t.match(/(\d)\s*(nguoi|ng\b|ban)/);
  if (persons) {
    c.household.persons = Math.min(6, Number(persons[1]));
    // Nếu có từ ngữ tìm kiếm hoặc đề cập phòng/căn, kích hoạt tìm kiếm
    if (/can|phong|thue|tim|o\b/.test(t)) signal = true;
  } else if (/mot minh|1 minh/.test(t)) {
    c.household.persons = 1;
    if (/can|phong|thue|tim|o\b/.test(t)) signal = true;
  } else if (/vo chong|cap doi|hai nguoi/.test(t)) {
    c.household.persons = 2;
    if (/can|phong|thue|tim|o\b/.test(t)) signal = true;
  } else if (/gia dinh/.test(t)) {
    c.household.persons = 3;
    if (/can|phong|thue|tim|o\b/.test(t)) signal = true;
  }

  const bikes = t.match(/(\d)\s*xe may/);
  if (bikes) c.household.motorbikes = Math.min(4, Number(bikes[1]));
  if (/o to|oto|xe hoi/.test(t)) c.household.cars = Math.max(1, c.household.cars);

  // Nhận diện câu hỏi có yếu tố giá (rẻ nhất, thấp nhất, tiết kiệm, ưu thế về giá...)
  const PRICE_PRIORITY_RE = /\b(gia\s*re|re\s*nhat|thap\s*nhat|gia\s*thap|gia\s*tot|tiet\s*kiem|uu\s*the\s*ve\s*gia|re\b|it\s*tien|chi\s*phi\s*thap|ngan\s*sach\s*thap|gia\s*mem|can\s*hoi)\b/;
  if (PRICE_PRIORITY_RE.test(t)) {
    c.sortByPrice = true;
    signal = true;
  }

  // Nhận diện câu hỏi cần nội thất mới (tình trạng >= 85%, mới tinh, mới nhận...)
  const NEW_FURNISHING_RE = /\b(noi\s*that\s*moi|do\s*moi|moi\s*tinh|nha\s*moi|moi\s*nhan|do\s*moi\s*cao|noi\s*that\s*xin|noi\s*that\s*dep|85%|85\s*phan\s*tram|moi\s*100%|moi\s*hoan\s*toan)\b/;
  if (NEW_FURNISHING_RE.test(t)) {
    c.preferNewFurnishing = true;
    signal = true;
  }

  // Nhận diện yêu cầu gần vị trí / tiện ích cụ thể
  const NEAR_PATTERNS: [string, RegExp, ZoneId[]][] = [
    ["Biển hồ Ocean Park", /gan\s*(bien\s*ho|ho\b|bien\s*nuoc\s*man|bien)|view\s*bien\s*ho/, ["sapphire1", "masteri"]],
    ["Vincom Mega Mall", /gan\s*(vincom|mega\s*mall|trung\s*tam\s*thuong\s*mai|tttm)/, ["sapphire2", "sapphire1"]],
    ["Đại học VinUni", /gan\s*(vinuni|vin\s*uni|dai\s*hoc|truong\s*dai\s*hoc)/, ["sapphire2", "zenpark"]],
    ["Công viên Nhật Bản", /gan\s*(cong\s*vien\s*nhat|vuon\s*nhat|zenpark|zen\s*park)/, ["zenpark"]],
    ["Trạm VinBus", /gan\s*(vinbus|vin\s*bus|tram\s*xe\s*bus|ben\s*xe)/, ["zenpark", "sapphire2"]],
    ["Trường Vinschool", /gan\s*(vinschool|vin\s*school|truong\s*hoc)/, ["sapphire1"]],
    ["Bến du thuyền", /gan\s*(ben\s*du\s*thuyen|du\s*thuyen|pho\s*di\s*bo\s*ven\s*ho)/, ["masteri"]],
  ];
  for (const [name, re, zones] of NEAR_PATTERNS) {
    if (re.test(t)) {
      c.nearLocation = name;
      signal = true;
      if (c.zones.length === 0) {
        c.zones = zones;
      }
      break;
    }
  }

  // Nhận diện từ khoá tìm kiếm chung (tìm căn, thuê căn, xem phòng, rổ hàng, giá rẻ...)
  if (!signal && GENERAL_SEARCH_RE.test(t)) {
    signal = true;
  }

  return { patch: c, hasSearchSignal: signal };
}

// ─── Tìm & xếp hạng ─────────────────────────────────────────────────────────────────────────

export interface MatchResult {
  unit: Unit;
  cost: CostBreakdown;
  savings: number;
  score: number;
  reasons: string[];
}

export function hasCriteria(c: CriteriaState): boolean {
  return !!(
    c.budget ||
    c.layouts.length ||
    c.zones.length ||
    c.buildings.length ||
    c.floor ||
    c.furnishing ||
    c.items.length ||
    c.pets ||
    c.sortByPrice ||
    c.preferNewFurnishing ||
    c.nearLocation
  );
}

export interface StatusLookup {
  (u: Unit): UnitStatus;
}

function passes(u: Unit, c: CriteriaState, ignoreBudget = false): boolean {
  if (c.layouts.length && !c.layouts.includes(u.layout)) return false;
  if (c.buildings.length) {
    if (!c.buildings.includes(u.building)) return false;
  } else if (c.zones.length && !c.zones.includes(u.zoneId)) return false;
  if (c.floor && floorBand(u.floor) !== c.floor) return false;
  if (c.furnishing && u.furnishing !== c.furnishing) return false;
  if (c.items.length && !c.items.every((i) => u.items.includes(i))) return false;
  if (c.pets && !u.petFriendly) return false;
  if (!ignoreBudget && c.budget && allInCost(u, c.household).total > c.budget) return false;
  return true;
}

export function searchUnits(c: CriteriaState, statusOf: StatusLookup, unitsList?: Unit[]): MatchResult[] {
  const out: MatchResult[] = [];
  const list = unitsList && unitsList.length > 0 ? unitsList : UNITS;
  for (const unit of list) {
    if (statusOf(unit) !== "available") continue;
    if (!passes(unit, c)) continue;
    const cost = allInCost(unit, c.household);
    const sv = savingsPct(unit);
    const cond = getUnitCondition(unit);
    const reasons: string[] = [];

    if (isBargain(unit)) reasons.push(`Rẻ hơn mặt bằng toà ${sv}% cùng layout`);
    else if (sv > 0) reasons.push(`Thấp hơn giá trung bình toà ${sv}%`);
    if (c.budget) reasons.push(`All-in ${vndShort(cost.total)}, dưới ngân sách ${vndShort(c.budget - cost.total)}`);
    const matched = c.items.filter((i) => unit.items.includes(i));
    if (matched.length) reasons.push(`Có ${matched.map((i) => ITEM_LABEL[i].toLowerCase()).join(", ")} như bạn cần`);
    if (c.pets && unit.petFriendly) reasons.push("Chủ nhà cho nuôi thú cưng");
    if (c.floor) reasons.push(`${FLOOR_LABEL[c.floor]} — tầng ${unit.floor}`);

    // Thêm lý do nội thất mới (>= 85%)
    if (c.preferNewFurnishing && cond >= 85) {
      reasons.push(`Nội thất đạt độ mới ${cond}% (chuẩn mới ≥ 85%) theo Hộ chiếu kiểm định`);
    }

    // Thêm lý do vị trí gần nhất
    if (c.nearLocation) {
      reasons.push(`Vị trí gần ${c.nearLocation} — chỉ 2–4 phút di chuyển`);
    } else if (c.buildings.length && c.buildings.includes(unit.building)) {
      reasons.push(`Đúng toà ${unit.building} bạn yêu cầu`);
    }

    reasons.push(`${unit.view} · hướng ${unit.direction}`);

    let score =
      sv * 1.2 +
      (c.budget ? 10 * (1 - cost.total / c.budget) : 0) +
      matched.length * 2 +
      (isBargain(unit) ? 6 : 0) +
      (unit.interest24h >= 3 ? 1 : 0);

    // Trọng số ưu tiên nội thất mới
    if (c.preferNewFurnishing) {
      score += cond >= 85 ? 150 + (cond - 85) * 5 : -50;
    }

    // Trọng số ưu tiên vị trí gần
    if (c.nearLocation) {
      score += 80;
    }
    if (c.buildings.length && c.buildings.includes(unit.building)) {
      score += 100;
    }

    out.push({ unit, cost, savings: sv, score, reasons });
  }

  // 1. Nếu ưu tiên nội thất mới: xếp các căn >= 85% lên đầu tiên (độ mới cao nhất trước)
  if (c.preferNewFurnishing) {
    return out.sort((a, b) => {
      const condA = getUnitCondition(a.unit);
      const condB = getUnitCondition(b.unit);
      const aIsNew = condA >= 85;
      const bIsNew = condB >= 85;
      if (aIsNew !== bIsNew) {
        return aIsNew ? -1 : 1;
      }
      if (condA !== condB) {
        return condB - condA; // Độ mới giảm dần
      }
      return b.score - a.score;
    });
  }

  // 2. Khi có yếu tố giá: Gợi ý căn giá thấp nhất lên đầu tiên, sau đó đến các điều kiện khác
  if (c.sortByPrice) {
    return out.sort((a, b) => {
      // 1. Ưu tiên All-in Cost thấp nhất lên đầu
      if (a.cost.total !== b.cost.total) {
        return a.cost.total - b.cost.total;
      }
      // 2. Nếu bằng giá, ưu tiên mức tiết kiệm so với phân khu (Căn hời do chủ nhà cập nhật giá tốt)
      if (b.savings !== a.savings) {
        return b.savings - a.savings;
      }
      // 3. Sau đó mới xét đến các tiêu chí tiện nghi, tầng, điểm khớp khác
      return b.score - a.score;
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Khi không có kết quả: gợi ý cách nới điều kiện để có căn. */
export function relaxHint(c: CriteriaState, statusOf: StatusLookup): string {
  const cheapest = UNITS.filter((u) => statusOf(u) === "available" && passes(u, c, true))
    .map((u) => ({ u, total: allInCost(u, c.household).total }))
    .sort((a, b) => a.total - b.total)[0];
  if (cheapest && c.budget) {
    const gap = cheapest.total - c.budget;
    return `Căn rẻ nhất khớp các điều kiện còn lại là ${unitAddress(cheapest.u)} với All-in ${vnd(cheapest.total)}đ/tháng, cao hơn ngân sách ${vndShort(gap)}. Bạn thử nâng ngân sách hoặc bớt một điều kiện nhé.`;
  }
  return "Chưa có căn nào khớp đủ các điều kiện này. Bạn thử bớt tầng, đồ dùng hoặc mở rộng phân khu nhé.";
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
  if (c.zones.length) chips.push({ key: "zones", label: c.zones.map((z) => zoneById(z).short).join(", "), clear: (x) => ({ ...x, zones: [] }) });
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
  else if (c.zones.length) parts.push(`ở ${c.zones.map((z) => zoneById(z).short).join(", ")}`);
  if (c.budget) parts.push(`tổng chi phí tối đa ${vndShort(c.budget)}/tháng`);
  if (c.floor) parts.push(FLOOR_LABEL[c.floor].split(" (")[0].toLowerCase());
  if (c.items.length) parts.push(`có ${c.items.map((i) => ITEM_LABEL[i].toLowerCase()).join(", ")}`);
  if (c.pets) parts.push("cho nuôi thú cưng");
  return parts.join(" ") + ".";
}

// ─── Hỏi đáp nhanh (không phải tìm căn) ─────────────────────────────────────────────────────

interface Faq {
  test: RegExp;
  answer: string;
}

const FAQS: Faq[] = [
  {
    test: /all.?in|chi phi|phi gi|gia gom|bao gom|phat sinh/,
    answer:
      "All-in Cost là tổng chi phí thực tế mỗi tháng, gồm 4 khoản: tiền thuê + phí quản lý (diện tích × 9.500đ) + phí gửi xe (150.000đ/xe máy, 1.250.000đ/ô tô) + dự toán điện nước (300.000đ/người). Mọi căn trên VinStay đều hiển thị đủ 4 khoản, nên không có phụ phí ẩn khi vào ở.",
  },
  {
    test: /coc|dat coc|giu cho|2 trieu|2tr|hoan/,
    answer:
      "Cọc giữ chỗ là 2.000.000đ, thanh toán qua VietQR sau khi bạn xem phòng và ưng ý. Căn được khoá giữ chỗ mặc định 48 giờ (tuỳ căn 12–72 giờ) cho bạn. Khi ký hợp đồng thuê, đúng 2.000.000đ này được chuyển 100% thành Tiền cọc bảo đảm tài sản, không trừ vào tiền thuê tháng đầu, và hoàn lại khi thanh lý sau khi đối soát hiện trạng.",
  },
  {
    test: /phi quan ly|bql|ban quan ly/,
    answer:
      "Phí quản lý của Vinhomes tính theo diện tích thông thủy, khoảng 9.500đ/m². Ví dụ căn 45m² là 427.500đ/tháng. Khoản này đã nằm sẵn trong All-in Cost của từng căn.",
  },
  {
    test: /xem nha|xem phong|dat lich|hen|lich xem/,
    answer:
      "Bạn chọn khung giờ (sáng 08:30–11:30 hoặc chiều 14:00–18:00), xác thực số điện thoại bằng mã 4 số gửi qua Zalo, rồi Field Host của khu sẽ nhận lịch trong 3 phút. Trước giờ hẹn 10 phút mình nhắn Zalo kèm nút “Tôi đã có mặt tại sảnh”, Host xuống sảnh đón và đưa bạn lên phòng trong khoảng 60 giây.",
  },
  {
    test: /hop dong|ky so|cccd|can cuoc|ocr/,
    answer:
      "Sau khi cọc, bạn chụp 2 mặt CCCD một lần duy nhất. AI đọc thông tin trong khoảng 5 giây và tự điền Hợp đồng thuê chính thức; bạn ký điện tử bằng chữ ký tay trên điện thoại đã xác thực OTP Zalo. Dữ liệu được mã hoá AES-256 theo Nghị định 13/2023/NĐ-CP và ảnh gốc không gửi cho môi giới hay chủ nhà.",
  },
  {
    test: /tho|sua chua|hong hoc|bao tri/,
    answer:
      "VinStay và Field Host không nhận sửa chữa. Khi có sự cố, Host giới thiệu danh bạ thợ ngoài uy tín tại Ocean Park; bạn và thợ tự thoả thuận giá và trách nhiệm trực tiếp.",
  },
  {
    test: /^(xin )?chao|^hello|^hi\b|cam on/,
    answer: "Chào bạn! Bạn cho mình biết ngân sách mỗi tháng và loại căn muốn thuê nhé, mình lọc trong khoảng 30 giây.",
  },
];

export function faqAnswer(text: string): string | undefined {
  const t = fold(text);
  return FAQS.find((f) => f.test.test(t))?.answer;
}

export const CLARIFY_REPLY =
  "Mình chưa bắt được đủ thông tin để lọc căn. Bạn cho mình thêm ngân sách tối đa mỗi tháng và loại căn (Studio, 1, 2 hoặc 3 phòng ngủ) nhé. Ví dụ: “Studio dưới 8 triệu ở Masteri”.";

export const SAMPLE_PROMPTS = [
  "Studio dưới 8 triệu, có điều hòa và tủ lạnh",
  "Căn 2 phòng ngủ ở Sapphire 2, ngân sách 11 triệu, 2 người",
  "Chi phí All-in gồm những gì?",
  "1 phòng ngủ cho nuôi mèo, tầng cao, khoảng 9 triệu",
];

export function searchReply(total: number, kept: number, c: CriteriaState, top: MatchResult | undefined): string {
  if (!kept) return "";
  const hasSpecific = hasCriteria(c);
  const budgetText = c.budget ? ` có All-in Cost không vượt ${vnd(c.budget)}đ` : hasSpecific ? " khớp điều kiện của bạn" : " đang mở sẵn sàng đón bạn";
  const lead = hasSpecific
    ? `Mình đã quét ${total} căn đang mở tại Ocean Park 1 và giữ lại ${kept} căn${budgetText}.`
    : `Mình gửi bạn danh sách ${kept} căn hộ thật đang mở tại Ocean Park 1.`;

  let pick = "";
  if (top) {
    if (c.preferNewFurnishing) {
      const topCond = getUnitCondition(top.unit);
      pick = ` Để đáp ứng yêu cầu nội thất mới, mình đã ưu tiên các căn có tình trạng kiểm định từ 85% trở lên. Nổi bật nhất là ${unitAddress(top.unit)} đạt độ mới ${topCond}% theo Hộ chiếu bàn giao số, All-in ${vnd(top.cost.total)}đ/tháng.`;
    } else if (c.nearLocation) {
      pick = ` Ưu tiên theo vị trí gần ${c.nearLocation}, nổi bật nhất là ${unitAddress(top.unit)} (chỉ 2–4 phút di chuyển), All-in ${vnd(top.cost.total)}đ/tháng.`;
    } else if (c.sortByPrice) {
      pick = ` Căn có giá All-in thấp nhất hiện tại là ${unitAddress(top.unit)}: chỉ ${vnd(top.cost.total)}đ/tháng${top.savings > 0 ? `, tiết kiệm ${top.savings}% so với mặt bằng cùng phân khu` : ""}. Mình đã xếp căn giá thấp nhất lên đầu tiên, các căn phía sau được sắp xếp dần theo mức giá và mức độ tiện nghi nâng cao để bạn dễ đối chiếu.`;
    } else {
      pick = ` Gợi ý nổi bật nhất là ${unitAddress(top.unit)}: All-in ${vnd(top.cost.total)}đ/tháng${top.savings > 0 ? `, thấp hơn mặt bằng toà ${top.savings}%` : ""}. Danh sách bên cạnh đã xếp theo độ khớp và mức tiết kiệm — bạn có thể đặt lịch xem ngay trong thẻ căn.`;
    }
  }
  return lead + pick;
}

// ─── Điều phối một lượt hội thoại ─────────────────────────────────────────────────────────────

export type Interpretation =
  | { kind: "search"; criteria: CriteriaState; results: MatchResult[]; total: number; reply: string }
  | { kind: "answer"; reply: string };

/** Hiểu một tin nhắn: tìm căn (kèm kết quả) hoặc trả lời câu hỏi thường gặp, hoặc hỏi lại cho rõ. */
export function interpret(text: string, base: CriteriaState, searched: boolean, statusOf: StatusLookup, unitsList?: Unit[]): Interpretation {
  const { patch, hasSearchSignal } = parseQuery(text, base);
  let signal = hasSearchSignal;
  const t = fold(text);

  // Câu tiếp nối sau khi đã có kết quả: "rẻ hơn nữa", "tăng ngân sách"
  if (searched && patch.budget) {
    if (/re hon|thap hon|giam/.test(t) && !hasSearchSignal) {
      patch.budget = Math.round((patch.budget * 0.9) / 100_000) * 100_000;
      signal = true;
    } else if (/cao hon|tang ngan sach|nang ngan sach/.test(t) && !hasSearchSignal) {
      patch.budget = Math.round((patch.budget * 1.15) / 100_000) * 100_000;
      signal = true;
    }
  }

  const faq = faqAnswer(text);
  const wantsSearch = signal || (!faq && hasCriteria(patch));

  if (!wantsSearch) return { kind: "answer", reply: faq ?? CLARIFY_REPLY };

  const list = unitsList && unitsList.length > 0 ? unitsList : UNITS;
  const total = list.filter((u) => statusOf(u) === "available").length;
  const results = searchUnits(patch, statusOf, list);
  const reply = results.length ? searchReply(total, results.length, patch, results[0]) : `Mình đã quét ${total} căn đang mở nhưng chưa có căn nào khớp. ${relaxHint(patch, statusOf)}`;
  return { kind: "search", criteria: patch, results, total, reply };
}
