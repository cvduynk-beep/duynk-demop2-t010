import { ChatCriteria, ChatLayout } from './chat.types';

/**
 * Bộ phân tích câu chat TẤT ĐỊNH (không dùng LLM): trích ngân sách, layout, phân khu/toà, tầng, nội thất, đồ dùng,
 * thú cưng, hộ gia đình từ tiếng Việt bỏ dấu, chịu gõ tắt ("2n2", "7tr5"). Port từ apps/web/src/lib/tenant/matchmaker.ts
 * (parseQuery/interpret) để FE không còn tự phân tích + xếp hạng.
 */

export const DEFAULT_HOUSEHOLD = { persons: 1, motorbikes: 1, cars: 0 } as const;

export const emptyCriteria = (): ChatCriteria => ({
  layouts: [],
  zones: [],
  buildings: [],
  items: [],
  household: { ...DEFAULT_HOUSEHOLD },
});

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

const BUDGET_MIN = 3_000_000;
const BUDGET_MAX = 200_000_000;

export function parseBudget(text: string): number | undefined {
  const t = fold(text);
  const values: number[] = [];
  // 7tr5 · 7,5 triệu · 8 trieu · 8tr · 8 củ
  for (const m of t.matchAll(/(\d{1,3})(?:[.,](\d{1,2}))?\s*(?:tr|trieu|cu)\s*(\d)?(?![a-z])/g)) {
    const whole = Number(m[1]);
    const frac = m[2] ? Number(`0.${m[2]}`) : m[3] ? Number(`0.${m[3]}`) : 0;
    values.push(Math.round((whole + frac) * 1_000_000));
  }
  for (const m of t.matchAll(/(\d{1,3})(?:[.,](\d{1,2}))?\s*(?:million|millions|m)\b/g)) {
    const whole = Number(m[1]);
    const fraction = m[2] ? Number(`0.${m[2]}`) : 0;
    values.push(Math.round((whole + fraction) * 1_000_000));
  }
  // 10.000.000 · 8000000
  // Không dùng \b ở cuối: "10.000.000đ" sau khi bỏ dấu thành "...000d".
  for (const m of t.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{3}){2,}|\d{7,9})(?![\d.,]*\d)/g)) {
    values.push(Number(m[1].replace(/[.,]/g, '')));
  }
  const plausible = values.filter((v) => v >= BUDGET_MIN && v <= BUDGET_MAX);
  return plausible.length ? Math.max(...plausible) : undefined;
}

const LAYOUT_PATTERNS: [ChatLayout, RegExp][] = [
  ['Studio', /studio|stu\b/],
  ['1PN', /\b1\s*(pn|n2?\b|phong\s*ngu\b|ngu\b|bed(?:room)?s?\b|br\b)|mot phong ngu|one bedroom/],
  ['2PN', /\b2\s*(pn|n2?\b|phong\s*ngu\b|ngu\b|bed(?:room)?s?\b|br\b)|hai phong ngu|two bedrooms/],
  ['3PN', /\b3\s*(pn|n2?\b|phong\s*ngu\b|ngu\b|bed(?:room)?s?\b|br\b)|ba phong ngu|three bedrooms/],
];

const ITEM_PATTERNS: [string, RegExp][] = [
  ['ac', /dieu hoa|may lanh|air.?condition(?:er|ing)?|\bac\b/],
  ['fridge', /tu lanh|fridge|refrigerator/],
  ['washer', /may giat|washing machine|washer/],
  ['kitchen', /\bbep\b|hut mui|kitchen/],
  ['heater', /nong lanh|water heater/],
  ['bed', /giuong|nem\b|\bbed\b|mattress/],
  ['wardrobe', /tu quan ao|tu do|wardrobe/],
  ['sofa', /sofa/],
  ['tv', /\btv\b|tivi|smart tv/],
  ['curtain', /\brem\b/],
  ['balcony', /ban cong|logia|lo gia/],
];

const ZONE_PATTERNS: [string, RegExp][] = [
  ['sapphire1', /sapphire\s*1\b|\bs1\b/],
  ['sapphire2', /sapphire\s*2\b|\bs2\b/],
  ['zenpark', /zenpark|zen park|\bzr\b/],
  ['pavilion', /pavilion/],
  ['masteri', /masteri|waterfront/],
];

const BUILDING_RE = /\b(S[12]\.\d{2}|ZR[12]|R1\.02|P[34]|BE3|H[12]|M[23])\b/g;

export interface ParsedMessage {
  criteria: ChatCriteria;
  /** Ngân sách / layout / phân khu / toà — đủ để coi là câu tìm căn kể cả khi câu cũng giống câu hỏi quy chế. */
  strongSignal: boolean;
  /** Tầng / nội thất / đồ dùng / thú cưng / câu nối tiếp "rẻ hơn". */
  weakSignal: boolean;
}

const cloneCriteria = (c: ChatCriteria): ChatCriteria => ({
  ...c,
  layouts: [...c.layouts],
  zones: [...c.zones],
  buildings: [...c.buildings],
  items: [...c.items],
  household: { ...c.household },
});

/** Gộp câu chat vào tiêu chí hiện có (`base` = context FE gửi). */
export function parseMessage(text: string, base: ChatCriteria, searched: boolean): ParsedMessage {
  const t = fold(text);
  const c = cloneCriteria(base);
  let strong = false;
  let weak = false;

  const budget = parseBudget(text);
  if (budget) {
    c.budget = budget;
    strong = true;
  }

  const layouts = LAYOUT_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (layouts.length) {
    c.layouts = layouts;
    strong = true;
  }

  const buildings = [...new Set([...text.toUpperCase().matchAll(BUILDING_RE)].map((m) => m[1]))];
  if (buildings.length) {
    c.buildings = buildings;
    c.zones = [];
    strong = true;
  }
  const zones = ZONE_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (zones.length && !buildings.length) {
    c.zones = zones;
    c.buildings = [];
    strong = true;
  }

  if (/tang cao|tang tren cao|view cao|high floor|upper floor/.test(t)) {
    c.floor = 'high';
    weak = true;
  } else if (/tang thap|low floor/.test(t)) {
    c.floor = 'low';
    weak = true;
  } else if (/tang trung|mid floor|middle floor/.test(t)) {
    c.floor = 'mid';
    weak = true;
  }

  if (/full do|full noi that|day du noi that|fully furnished|furnished/.test(t)) {
    c.furnishing = 'full';
    weak = true;
  } else if (/nha trong|khong do|unfurnished|empty apartment/.test(t)) {
    c.furnishing = 'empty';
    weak = true;
  } else if (/noi that co ban|basic furnishing|partly furnished/.test(t)) {
    c.furnishing = 'basic';
    weak = true;
  }

  const items = ITEM_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (items.length) {
    c.items = [...new Set([...c.items, ...items])];
    weak = true;
  }

  if (/thu cung|nuoi (cho|meo)|\bpet\b/.test(t)) {
    c.pets = true;
    weak = true;
  }

  const persons = t.match(/(\d)\s*(nguoi|ng\b|people|persons?)/);
  if (persons) c.household.persons = Math.max(1, Math.min(6, Number(persons[1])));
  else if (/mot minh|1 minh/.test(t)) c.household.persons = 1;
  else if (/vo chong|cap doi|hai nguoi/.test(t)) c.household.persons = 2;
  else if (/gia dinh/.test(t)) c.household.persons = Math.max(3, c.household.persons);

  const bikes = t.match(/(\d)\s*(xe may|motorbikes?)/);
  if (bikes) c.household.motorbikes = Math.min(4, Number(bikes[1]));
  if (/o to|oto|xe hoi|\bcars?\b|automobile/.test(t)) c.household.cars = Math.max(1, c.household.cars);

  // Câu nối tiếp sau khi đã có kết quả: "rẻ hơn nữa", "tăng ngân sách".
  if (searched && c.budget && !budget) {
    if (/re hon|thap hon|giam/.test(t)) {
      c.budget = Math.max(BUDGET_MIN, Math.round((c.budget * 0.9) / 100_000) * 100_000);
      weak = true;
    } else if (/cao hon|tang ngan sach|nang ngan sach/.test(t)) {
      c.budget = Math.min(BUDGET_MAX, Math.round((c.budget * 1.15) / 100_000) * 100_000);
      weak = true;
    }
  }

  return { criteria: c, strongSignal: strong, weakSignal: weak };
}

export function hasCriteria(c: ChatCriteria): boolean {
  return !!(c.budget || c.layouts.length || c.zones.length || c.buildings.length || c.floor || c.furnishing || c.items.length || c.pets);
}

/** Câu ngoài phạm vi Ocean Park (AGENTS.md lớp 3) ⇒ từ chối 1 câu, không gọi LLM. */
export function isOffTopic(text: string): boolean {
  const t = fold(text);
  return /(giai|tinh) (giup )?(phuong trinh|bai toan|bai tap|dao ham|tich phan)|viet (giup )?(code|ma nguon|chuong trinh|bai tho|tho|bai van|van mau|essay)|lap trinh|\b(python|javascript|java|sql|html)\b|lam tho|bai tho|chinh tri|bau cu|tong thong|chung khoan|tien ao|crypto|bitcoin|dich (sang|giup|cau)|translate|du doan xo so|xo so|ca do/.test(
    t,
  );
}

export function isGreeting(text: string): boolean {
  const t = fold(text).trim();
  return /^(xin )?chao\b|^hello\b|^hi\b|^hey\b|^alo\b|^cam on\b|^thanks?\b/.test(t) && t.length <= 40;
}
