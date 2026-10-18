import { fold } from './chat-criteria';

/**
 * Bảng chuẩn hoá cách người Việt viết khi tìm thuê căn (Bước 3A.2) — bằng CODE, không để LLM đoán.
 * CHƯA BẬT vào luồng chat (2026-10-16): chỉ dùng để đo offline; bật ở Giai đoạn 3 sau khi được duyệt.
 *
 * `normalizeVi(text, now)` trả:
 * - `text`: câu đã chuẩn hoá (không dấu, viết thường) để bộ phân tích tiêu chí hiện có (`parseMessage`) hiểu được;
 * - `slots`: các ô đọc thêm mà bộ phân tích hiện có chưa đọc (ngày dọn vào, diện tích tối thiểu, khoảng giá);
 * - `ambiguities`: chỗ còn mơ hồ ⇒ PHẢI hỏi lại (vd "5 triệu 1 tuần" — VinStay chỉ cho thuê theo tháng), không đoán;
 * - `applied`: id các luật đã áp (để log/đo, không chứa nội dung khách).
 * Ngày tính theo giờ Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè).
 */

export interface ViRule {
  id: string;
  /** Mẫu trên câu ĐÃ bỏ dấu, viết thường. */
  pattern: RegExp;
  replace: string | ((substring: string, ...groups: string[]) => string);
  /** "Khách viết" → "hiểu là" (để người duyệt đọc bảng). */
  vi: string;
}

/** Thứ tự = độ ưu tiên (sửa chính tả trước, rồi viết tắt, rồi tiền). */
export const VI_RULES: ViRule[] = [
  // Sai chính tả / gõ thiếu
  { id: 'typo_trieu', pattern: /\b(chieu|trieuj|trieeu|trệu|treu)\b/g, replace: 'trieu', vi: '"chiệu", "treu" → triệu' },
  { id: 'typo_zenpark', pattern: /\bzen\s*(pak|pac|parck|parks)\b|\bzenpak\b|\bzen park\b/g, replace: 'zenpark', vi: '"zenpak", "zen park" → The Zenpark' },
  { id: 'typo_sapphire', pattern: /\b(saphia|saphire|sapphia|sapphie|sapphir|safia)\b/g, replace: 'sapphire', vi: '"saphia", "saphire" → Sapphire' },
  { id: 'typo_pavilion', pattern: /\b(pavillion|pavilon|pavilions|pav)\b/g, replace: 'pavilion', vi: '"pavillion", "pav" → The Pavilion' },
  { id: 'typo_masteri', pattern: /\b(mastery|masterri|mt waterfront|mwf)\b/g, replace: 'masteri', vi: '"mastery", "mwf" → Masteri Waterfront' },
  { id: 'typo_beverly', pattern: /\b(beverli|bevely|beverlly|bv)\b/g, replace: 'beverly', vi: '"beverli", "bv" → The Beverly (toà BE3)' },
  { id: 'alias_beverly', pattern: /\bbeverly\b/g, replace: 'BE3', vi: 'Beverly → toà BE3' },
  { id: 'alias_zenpark', pattern: /\b(zp|zen)\b(?!\s*park)/g, replace: 'zenpark', vi: '"zp", "zen" → The Zenpark' },
  { id: 'alias_sapphire', pattern: /\bsapphire\s*(1|2)\b/g, replace: 'sapphire $1', vi: '"sapphire1" → Sapphire 1' },
  // Viết tắt
  { id: 'abbr_pn', pattern: /\b(\d)\s*(?:p\.?n|phong|ngu|bed|br|bedroom|bedrooms)\b/g, replace: '$1pn', vi: '"2 pn", "2 phòng", "2 ngủ", "2BR" → 2 phòng ngủ' },
  { id: 'abbr_studio', pattern: /\b(stu|std|can ho studio|phong studio)\b/g, replace: 'studio', vi: '"stu", "std" → Studio' },
  { id: 'abbr_nt_full', pattern: /\b(nt|noi that)\s*(full|day du|dd|xin)\b|\bfull\s*(nt|noi that|do)\b/g, replace: 'full noi that', vi: '"nt full", "full đồ" → nội thất đầy đủ' },
  { id: 'abbr_nt_basic', pattern: /\b(nt|noi that)\s*(co ban|cb)\b/g, replace: 'noi that co ban', vi: '"nt cb" → nội thất cơ bản' },
  { id: 'abbr_dt', pattern: /\bdt\b/g, replace: 'dien tich', vi: '"dt" → diện tích' },
  { id: 'abbr_nguoi', pattern: /\b(\d)\s*ng\b/g, replace: '$1 nguoi', vi: '"2 ng" → 2 người' },
  { id: 'abbr_vc', pattern: /\b(2\s*)?vc\b|\bhai vo chong\b/g, replace: 'vo chong', vi: '"2vc" → vợ chồng (2 người)' },
  { id: 'abbr_xe', pattern: /\b(\d)\s*(xm|xe)\b(?!\s*(may|hoi|o to))/g, replace: '$1 xe may', vi: '"2xm", "2 xe" → 2 xe máy' },
  { id: 'abbr_oto', pattern: /\b(oto|o\.to|xe hoi|xe 4 banh)\b/g, replace: 'o to', vi: '"oto", "xe 4 bánh" → ô tô' },
  // Tiền
  { id: 'money_ruoi', pattern: /\b(\d{1,3})\s*(?:trieu|tr|cu)\s*ruoi\b/g, replace: (_m, n) => `${n},5 trieu`, vi: '"7 triệu rưỡi", "7tr rưỡi" → 7.500.000' },
  { id: 'money_cu', pattern: /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*cu\b/g, replace: '$1 trieu', vi: '"5 củ" → 5.000.000' },
  { id: 'money_k', pattern: /\b(\d{1,3})\s*(?:k|nghin|ngan)\b/g, replace: (_m, n) => `${Number(n) * 1000}`, vi: '"500k", "500 nghìn" → 500.000' },
]

export interface ViSlots {
  /** Khoảng giá "7-8 củ" / "7 đến 8 triệu" ⇒ trần = số lớn, sàn = số nhỏ. */
  budgetMin?: number;
  budgetMax?: number;
  /** "dt trên 45m2" ⇒ diện tích tối thiểu. */
  minAreaM2?: number;
  /** Ngày dọn vào dự kiến (YYYY-MM-DD theo giờ Việt Nam). */
  moveInDate?: string;
}

export type ViAmbiguity = 'chu_ky_thue' | 'ngay_khong_ro' | 'gia_khong_ro_don_vi';

export interface ViNormalized {
  text: string;
  slots: ViSlots;
  ambiguities: ViAmbiguity[];
  applied: string[];
}

const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** "Bây giờ" theo lịch Việt Nam (ngày-tháng-năm, thứ). */
function vnToday(now: Date) {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
}
const iso = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Ngày dọn vào từ cách nói tương đối. Không chắc ⇒ undefined + ambiguity `ngay_khong_ro`. */
export function parseMoveIn(foldedText: string, now: Date): { date?: string; ambiguous?: boolean } {
  const t = foldedText;
  const { y, m, d, dow } = vnToday(now);
  if (/\bhom nay\b/.test(t)) return { date: iso(y, m, d) };
  if (/\b(ngay mai|mai)\b(?! (kia|mot))/.test(t) && /\b(don|vao|o|chuyen|thue|nhan)\b/.test(t)) return { date: iso(y, m, d + 1) };
  // Cuối tuần = thứ Bảy.
  if (/cuoi tuan (nay|toi)?\b(?! sau)/.test(t) && !/cuoi tuan sau/.test(t)) return { date: iso(y, m, d + ((6 - dow + 7) % 7)) };
  if (/cuoi tuan sau/.test(t)) return { date: iso(y, m, d + ((6 - dow + 7) % 7) + 7) };
  if (/\btuan sau\b|\btuan toi\b/.test(t)) return { date: iso(y, m, d + ((1 - dow + 7) % 7 || 7)) };
  if (/\bthang sau\b|\bthang toi\b/.test(t) && !/(dau|giua|cuoi) thang/.test(t)) return { date: iso(y, m + 1, 1) };
  const startMonth = t.match(/\b(dau|giua|cuoi) thang (\d{1,2})\b/);
  if (startMonth) {
    const mm = Number(startMonth[2]);
    if (mm < 1 || mm > 12) return { ambiguous: true };
    const yy = mm < m ? y + 1 : y;
    const day = startMonth[1] === 'dau' ? 1 : startMonth[1] === 'giua' ? 15 : lastDay(yy, mm);
    return { date: iso(yy, mm, day) };
  }
  const relMonth = t.match(/\b(dau|giua|cuoi) thang (sau|toi|nay)\b/);
  if (relMonth) {
    const mm = relMonth[2] === 'nay' ? m : m + 1;
    const yy = mm > 12 ? y + 1 : y;
    const m2 = ((mm - 1) % 12) + 1;
    const day = relMonth[1] === 'dau' ? 1 : relMonth[1] === 'giua' ? 15 : lastDay(yy, m2);
    return { date: iso(yy, m2, day) };
  }
  const dm = t.match(/\bngay (\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b|\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (dm) {
    const dd = Number(dm[1] ?? dm[4]);
    const mm = Number(dm[2] ?? dm[5]);
    const yy0 = dm[3] ?? dm[6];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= lastDay(y, mm)) {
      const yy = yy0 ? Number(yy0) : mm < m || (mm === m && dd < d) ? y + 1 : y;
      return { date: iso(yy, mm, dd) };
    }
  }
  const onlyDay = t.match(/\bngay (\d{1,2})\b(?! (nguoi|thang|tuan))/);
  if (onlyDay && /\b(don|vao o|chuyen|nhan nha|thue tu)\b/.test(t)) {
    const dd = Number(onlyDay[1]);
    if (dd < 1 || dd > 31) return { ambiguous: true };
    // "ngày 25" ⇒ tháng này nếu chưa qua, không thì tháng sau.
    return dd >= d ? { date: iso(y, m, dd) } : { date: iso(y, m + 1, dd) };
  }
  if (/\b(sap toi|som nhat co the|cang som cang tot|asap)\b/.test(t)) return {};
  return {};
}

export function normalizeVi(text: string, now: Date = new Date()): ViNormalized {
  let t = fold(text).replace(/\s+/g, ' ').trim();
  const applied: string[] = [];
  const ambiguities: ViAmbiguity[] = [];
  const slots: ViSlots = {};

  // Khoảng giá đọc TRƯỚC khi rút gọn tiền (cần cả 2 đầu).
  const range = t.match(/\b(\d{1,3}(?:[.,]\d)?)\s*(?:tr|trieu|cu)?\s*(?:-|den|toi|~)\s*(\d{1,3}(?:[.,]\d)?)\s*(tr|trieu|cu)\b/);
  if (range) {
    const a = Number(range[1].replace(',', '.')) * 1_000_000;
    const b = Number(range[2].replace(',', '.')) * 1_000_000;
    if (a > 0 && b > 0) {
      slots.budgetMin = Math.round(Math.min(a, b));
      slots.budgetMax = Math.round(Math.max(a, b));
      applied.push('money_range');
    }
  }

  for (const r of VI_RULES) {
    const before = t;
    t = typeof r.replace === 'string' ? t.replace(r.pattern, r.replace) : t.replace(r.pattern, r.replace as (s: string, ...g: string[]) => string);
    if (t !== before) applied.push(r.id);
  }
  // Khoảng giá ⇒ để bộ phân tích hiện có đọc đúng trần (nó lấy số lớn nhất).
  if (slots.budgetMax && !/\btrieu\b/.test(t.slice(t.lastIndexOf(String(slots.budgetMax / 1_000_000))))) t = `${t} ${slots.budgetMax / 1_000_000} trieu`;

  const area = t.match(/\b(?:dien tich|rong)\s*(?:tren|hon|tu|>|>=|toi thieu|it nhat)?\s*(\d{2,3})\s*(?:m2|m²|m\b|met vuong)/);
  if (area) {
    slots.minAreaM2 = Number(area[1]);
    applied.push('area_min');
  }

  // Chu kỳ thuê: VinStay chỉ cho thuê theo tháng ⇒ "x triệu / tuần|ngày|đêm" phải hỏi lại, không đoán.
  if (/\b\d+(?:[.,]\d+)?\s*(?:trieu|tr|k|cu)?\s*(?:\/|mot|1|moi)\s*(tuan|ngay|dem)\b|\bthue (theo )?(ngay|tuan|dem)\b|\bngan ngay\b/.test(t)) ambiguities.push('chu_ky_thue');
  // Có số mà không có đơn vị tiền và không phải số người/xe/tầng/phòng/diện tích ⇒ hỏi lại (vd "tầm 8").
  if (/\b(tam|khoang|duoi|toi da|max|tren)\s+\d{1,2}\b(?!\s*(pn|nguoi|xe|tang|m2|m\b|trieu|tr\b|thang|ngay|gio|phong|ngu|\/|-|[.,]\d))/.test(t)) ambiguities.push('gia_khong_ro_don_vi');

  const move = parseMoveIn(t, now);
  if (move.date) {
    slots.moveInDate = move.date;
    applied.push('move_in');
  }
  if (move.ambiguous) ambiguities.push('ngay_khong_ro');

  return { text: t, slots, ambiguities: [...new Set(ambiguities)], applied };
}
