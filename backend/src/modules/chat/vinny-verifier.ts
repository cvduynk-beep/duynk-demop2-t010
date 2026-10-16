import { ANY_VHOP_CODE_RE, INTERNAL_LABEL_RE, moneyMatches, moneyMentions } from './chat-reply';
import { hasPii } from './vinny-guard';
import { collectFacts } from './vinny-tools';

/**
 * Verifier sau khi Gemini viết (Bước 3C.2), bằng CODE. CHƯA BẬT vào luồng chat (2026-10-16) — luồng hiện tại vẫn dùng
 * `checkExplanation` / `checkAgentAnswer`. Bật ở Giai đoạn 3 sau khi được duyệt.
 *
 * Quy trình đề xuất khi bật: `verifyReply` ⇒ `pass` dùng nguyên câu; `cut` dùng `cleaned` (đã cắt câu sai) + log cảnh báo;
 * `regenerate` ⇒ sinh lại (tối đa 2 lần, kèm danh sách lỗi), vẫn sai ⇒ câu dự phòng tất định.
 */

export type VerifyIssueType = 'ma_can' | 'gia' | 'thu_tu' | 'pii' | 'gio_giu' | 'ngay' | 'noi_bo';

export interface VerifyIssue {
  type: VerifyIssueType;
  /** Giá trị sai (mã căn, số tiền, ngày, số giờ). Không chứa PII (với `pii` chỉ ghi loại). */
  value: string;
  /** Câu chứa lỗi (để cắt). */
  sentence: string;
}

export interface VerifySource {
  /** Danh sách recommend ĐÃ XẾP HẠNG (thứ tự = rank). */
  recommendations: { unitCode: string; rank: number; allInCost?: Record<string, number | undefined>; comparison?: Record<string, unknown> }[];
  /** Kết quả công cụ / đoạn tri thức đã dùng trong lượt. */
  evidence?: unknown[];
  /** Lời khách (mã căn, số tiền, ngày khách tự nêu không phải bịa). */
  userText: string;
  /** Lời Vinny các lượt trước (mã căn đã đưa từ dữ liệu ở lượt trước được nhắc lại). */
  priorText?: string;
  /** Ngân sách khách đang lọc (câu "vượt ngân sách X" là phép tính hợp lệ). */
  budget?: number;
  /** Giờ giữ căn theo hold-policy đang cấu hình. */
  holdHours: number;
}

export interface VerifyResult {
  ok: boolean;
  action: 'pass' | 'cut' | 'regenerate';
  issues: VerifyIssue[];
  /** Câu đã cắt các câu sai (chỉ khi action = cut). */
  cleaned: string | null;
}

/** Số tiền trong câu: cách viết Việt (8.500.000đ, 8,5 triệu) + Anh (5,896,500 VND, 8.5 million). */
export function moneyIn(text: string): number[] {
  const out = moneyMentions(text);
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g)) out.push(Number(m[1].replace(/,/g, '')));
  for (const m of text.toLowerCase().matchAll(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(million|mil)\b/g)) out.push(Math.round(Number(m[1].replace(',', '.')) * 1_000_000));
  return out.filter((n) => n >= 10_000);
}

/** Mọi số tiền "có nguồn": số liệu danh sách, số trong kết quả công cụ / tri thức, số khách nêu, chênh lệch với ngân sách. */
export function allowedMoney(src: Pick<VerifySource, 'recommendations' | 'evidence' | 'userText' | 'budget'>): number[] {
  const out: number[] = [];
  for (const r of src.recommendations) {
    for (const v of Object.values(r.allInCost ?? {})) if (typeof v === 'number') out.push(v);
    for (const v of Object.values(r.comparison ?? {})) if (typeof v === 'number') out.push(v);
  }
  out.push(...collectFacts(src.evidence ?? []).numbers);
  out.push(...moneyIn(JSON.stringify(src.evidence ?? [])));
  out.push(...moneyIn(src.userText));
  if (src.budget) out.push(src.budget, ...out.map((n) => Math.abs(n - src.budget!)));
  return out.filter((n) => n >= 10_000);
}

/** Tách câu: theo dòng, rồi theo . ! ? … — không tách "8.500.000" hay "S1.02". */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?…])\s+(?=[^\s\d])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?(?!\d)|\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g;
/** Khoá "ngày/tháng" theo lịch Việt Nam; ISO có giờ (UTC) được đổi sang UTC+7 trước. */
const dateKey = (m: RegExpMatchArray) => {
  if (!m[1]) return `${Number(m[5])}/${Number(m[6])}`;
  if (!m[4]) return `${Number(m[3])}/${Number(m[2])}`;
  const vn = new Date(Date.parse(`${m[1]}-${m[2]}-${m[3]}${m[4].endsWith('Z') ? m[4] : `${m[4]}Z`}`) + 7 * 3_600_000);
  return `${vn.getUTCDate()}/${vn.getUTCMonth() + 1}`;
};
const HOLD_RE = /giữ (?:căn |chỗ )?(?:riêng )?(?:trong )?(\d{1,3})\s*(?:giờ|tiếng|h\b)|(?:held|hold)[^.]{0,30}?(\d{1,3})\s*(?:hours|h\b)/giu;

export function verifyReply(reply: string, src: VerifySource): VerifyResult {
  const issues: VerifyIssue[] = [];
  const sentences = splitSentences(reply);
  const recCodes = new Map(src.recommendations.map((r) => [r.unitCode.replace(/^VHOP-/, '').toUpperCase(), r.rank]));
  const sourcedText = `${src.userText} ${src.priorText ?? ''} ${JSON.stringify(src.evidence ?? [])}`.toUpperCase();
  const allowed = allowedMoney(src);
  const sourcedDates = new Set([...`${src.userText} ${JSON.stringify(src.evidence ?? [])}`.matchAll(DATE_RE)].map(dateKey));

  for (const s of sentences) {
    for (const m of s.matchAll(ANY_VHOP_CODE_RE)) {
      const code = m[1].toUpperCase();
      if (!recCodes.has(code) && !sourcedText.includes(code)) issues.push({ type: 'ma_can', value: `VHOP-${code}`, sentence: s });
    }
    for (const n of moneyIn(s)) if (!moneyMatches(n, allowed)) issues.push({ type: 'gia', value: String(n), sentence: s });
    for (const m of s.matchAll(DATE_RE)) if (!sourcedDates.has(dateKey(m))) issues.push({ type: 'ngay', value: m[0], sentence: s });
    for (const m of s.matchAll(HOLD_RE)) {
      const h = Number(m[1] ?? m[2]);
      if (h !== src.holdHours) issues.push({ type: 'gio_giu', value: String(h), sentence: s });
    }
    if (hasPii(s)) issues.push({ type: 'pii', value: 'pii', sentence: s });
    if (INTERNAL_LABEL_RE.test(s)) issues.push({ type: 'noi_bo', value: 'nhan_noi_bo', sentence: s });
  }

  // Thứ tự: các căn của danh sách được nhắc theo đúng rank tăng dần.
  const ranks: number[] = [];
  for (const m of reply.matchAll(ANY_VHOP_CODE_RE)) {
    const r = recCodes.get(m[1].toUpperCase());
    if (r !== undefined && !ranks.includes(r)) ranks.push(r);
  }
  if (ranks.some((r, i) => i > 0 && r < ranks[i - 1])) issues.push({ type: 'thu_tu', value: ranks.join('>'), sentence: '' });

  if (!issues.length) return { ok: true, action: 'pass', issues, cleaned: null };
  // PII / lộ nội bộ / sai thứ tự không sửa được bằng cách cắt câu ⇒ sinh lại.
  if (issues.some((i) => ['pii', 'noi_bo', 'thu_tu'].includes(i.type))) return { ok: false, action: 'regenerate', issues, cleaned: null };
  const bad = new Set(issues.map((i) => i.sentence));
  const kept = sentences.filter((s) => !bad.has(s));
  // Cắt quá nửa câu ⇒ câu còn lại vô nghĩa, sinh lại.
  if (!kept.length || kept.length < sentences.length / 2) return { ok: false, action: 'regenerate', issues, cleaned: null };
  return { ok: false, action: 'cut', issues, cleaned: kept.join(' ') };
}
