import { ChatCriteria, ChatRecommendation } from './chat.types';
import { vnd } from './chat-knowledge';

/**
 * Lời đáp cho lượt tìm căn. Danh sách + thứ tự + số liệu LUÔN là của matchmaker; LLM chỉ được viết lời giải thích
 * trên đúng dữ liệu đó, và lời giải thích bị kiểm lại (mã căn, thứ tự, số tiền, luật cứng) trước khi trả cho khách.
 */

export const REPLY_MAX_CHARS = 1200;

const LAYOUT_TEXT: Record<string, string> = { Studio: 'Studio', '1PN': '1 phòng ngủ', '2PN': '2 phòng ngủ', '3PN': '3 phòng ngủ' };

// System prompt: backend/prompts/vinny/<VINNY_PROMPT_VERSION>/ (core + explain), nạp bởi vinny-prompt.ts.

export function buildUserPrompt(message: string, criteria: ChatCriteria, recs: ChatRecommendation[], scan: { scanned: number; matched: number }): string {
  const data = {
    tieuChi: {
      nganSachAllIn: criteria.budget ?? null,
      layout: criteria.layouts,
      soNguoi: criteria.household.persons,
      xeMay: criteria.household.motorbikes,
      oTo: criteria.household.cars,
    },
    daQuet: scan.scanned,
    khop: scan.matched,
    can: recs.map((r) => ({
      rank: r.rank,
      unitCode: r.unitCode,
      toa: r.buildingCode,
      phanKhu: r.zoneName ?? null,
      layout: r.layout,
      dienTichM2: r.areaM2,
      tang: r.floor ?? null,
      giaThue: r.allInCost.baseRent,
      phiQuanLy: r.allInCost.managementFee,
      phiGuiXe: r.allInCost.parkingFee,
      dienNuocUocTinh: r.allInCost.utilityCost,
      allInMoiThang: r.allInCost.allInTotal,
      tietKiemMoiThang: r.comparison.savingAmount,
      phanTramTietKiem: r.comparison.savingPercentage,
      canHoi: r.comparison.isBargain,
    })),
  };
  return `CÂU_KHÁCH:\n<<<\n${message}\n>>>\n\nDỮ_LIỆU (JSON, đã xếp hạng):\n${JSON.stringify(data)}`;
}

// ─── Kiểm lời giải thích của LLM ────────────────────────────────────────────────────────────

/** Mã căn dạng `VHOP-S1.02-0701` hoặc viết tắt `S1.02-0701`. */
export const CODE_RE = /\b(?:VHOP-)?((?:S[12]\.\d{2}|ZR[12]|R1\.02|P[34]|BE3|H[12]|M[23])-[0-9]{2}[0-9A-Z]{2,3})\b/gi;

/** Luật cứng (AGENTS.md) — port từ ai-engine/app/policy.py: câu KHẲNG ĐỊNH điều bị cấm (không có phủ định liền trước). */
/**
 * MỌI chuỗi dạng mã căn "VHOP-…" (kể cả toà không có thật như S9.99) — `CODE_RE` chỉ bắt toà đã biết nên không đủ để
 * chặn mã bịa. Nhóm 1 = phần sau "VHOP-" (cùng dạng khoá với `CODE_RE`).
 */
export const ANY_VHOP_CODE_RE = /\bVHOP-([A-Z0-9][A-Z0-9.]{0,9}-[0-9A-Z]{2,6})\b/gi;

/** Nhãn khối nội bộ backend gửi cho model (TRẠNG_THÁI, LỊCH_SỬ, CÂU_KHÁCH, DỮ_LIỆU, NGÔN_NGỮ_TRẢ_LỜI). */
export const INTERNAL_LABEL_RE = /(NGÔN_NGỮ_TRẢ_LỜI|TRẠNG_THÁI|LỊCH_SỬ|CÂU_KHÁCH|DỮ_LIỆU)\s*:?/;

/**
 * Model lite đôi khi chép lại nhãn gợi ý ở ĐẦU câu ("NGÔN_NGỮ_TRẢ_LỜI: English I found…", đo trên UI 2026-10-16) ⇒ bỏ
 * phần đó. Nhãn còn sót ở chỗ khác ⇒ caller coi là lộ nội bộ và bỏ cả câu.
 */
export function stripEchoedLabels(text: string): string {
  return text.replace(/^\s*(?:(?:NGÔN_NGỮ_TRẢ_LỜI|TRẠNG_THÁI)\s*:\s*[^\n(]*?(?:English|tiếng Anh|khách (?:đã|chưa) đăng nhập)\b(?:\s*\([^)]*\))?[\s.:-]*)+/i, '').trim();
}

export const NEGATION = /không|chẳng|chưa|thay vì|khác với|tuyệt đối|\b(?:not|no|never|without|instead of)\b/i;
export const FORBIDDEN: RegExp[] = [
  /trừ\s+(?:thẳng\s+)?vào\s+(?:tiền\s+)?thuê/gi,
  /ký\s+(?:một\s+)?thỏa\s+thuận\s+(?:đặt\s+)?cọc\s+riêng/gi,
  /lockbox|hộp\s+khóa|ổ\s+khóa\s+thông\s+minh|smart[\s-]?lock|\biot\b|quét\s+(?:mã\s+)?QR\s+(?:ở|tại)\s+sảnh/gi,
  /VinStay\s+(?:sẽ\s+)?(?:cử|tự|nhận|trực\s+tiếp)\s+(?:thợ\s+)?sửa|VinStay\s+chịu\s+(?:chi\s+phí\s+)?sửa/gi,
];

export function affirmed(rx: RegExp, text: string): boolean {
  for (const m of text.matchAll(rx)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index).split(/[.;!?\n]/).pop() ?? '';
    if (!NEGATION.test(before)) return true;
  }
  return false;
}

/** Số tiền trong câu: "7.950.000", "7,95 triệu", "8tr", "450.000đ". Trả VNĐ. */
export function moneyMentions(text: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase();
  for (const m of t.matchAll(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(triệu|tr)\b/g)) out.push(Math.round(Number(m[1].replace(',', '.')) * 1_000_000));
  for (const m of t.matchAll(/\b(\d{1,3}(?:\.\d{3})+)(?:\s*(?:đ|vnđ|vnd|đồng))?/g)) {
    const n = Number(m[1].replace(/\./g, ''));
    if (n >= 10_000) out.push(n);
  }
  return out;
}

function allowedMoney(criteria: ChatCriteria, recs: ChatRecommendation[]): number[] {
  const base: number[] = [];
  if (criteria.budget) base.push(criteria.budget);
  for (const r of recs) {
    const c = r.allInCost;
    base.push(c.baseRent, c.managementFee, c.parkingFee, c.utilityCost, c.allInTotal, r.comparison.savingAmount, r.comparison.marketAllInEstimate);
    if (criteria.budget) base.push(Math.max(0, criteria.budget - c.allInTotal));
  }
  return base.filter((n) => n > 0);
}

/** Cho phép cách viết làm tròn tự nhiên ("7,95 triệu" cho 7.950.000; "8 triệu" chỉ khi số gốc tròn triệu). */
export function moneyMatches(mentioned: number, allowed: number[]): boolean {
  return allowed.some((a) => {
    if (mentioned === a) return true;
    for (const step of [10_000, 100_000]) {
      if ([Math.round, Math.floor, Math.ceil].some((f) => f(a / step) * step === mentioned)) return true;
    }
    return false;
  });
}

export type ExplainCheck = { ok: true; text: string } | { ok: false; why: 'unknown_unit' | 'order' | 'money' | 'policy' | 'length' | 'leak' };

/** `extraMoney`: số tiền khác được phép nhắc (vd cọc giữ chỗ do backend thu). */
export function checkExplanation(raw: string, criteria: ChatCriteria, recs: ChatRecommendation[], extraMoney: number[] = []): ExplainCheck {
  // Khung chat hiển thị văn bản thuần ⇒ bỏ markdown model hay chèn (tiêu đề, in đậm, nghiêng, code).
  const text = stripEchoedLabels(raw.replace(/^#+\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/^\s*\*\s+/gm, '• ').trim());
  if (!text || text.length > REPLY_MAX_CHARS) return { ok: false, why: 'length' };
  if (INTERNAL_LABEL_RE.test(text)) return { ok: false, why: 'leak' };

  const rankOf = new Map(recs.map((r) => [r.unitCode.toUpperCase().replace(/^VHOP-/, ''), r.rank]));
  let lastRank = 0;
  const seen = new Set<string>();
  for (const m of text.matchAll(ANY_VHOP_CODE_RE)) if (!rankOf.has(m[1].toUpperCase())) return { ok: false, why: 'unknown_unit' };
  for (const m of text.matchAll(CODE_RE)) {
    const key = m[1].toUpperCase();
    const rank = rankOf.get(key);
    if (rank == null) return { ok: false, why: 'unknown_unit' };
    if (!seen.has(key)) {
      if (rank < lastRank) return { ok: false, why: 'order' };
      lastRank = rank;
      seen.add(key);
    }
  }

  const allowed = [...allowedMoney(criteria, recs), ...extraMoney];
  if (moneyMentions(text).some((n) => !moneyMatches(n, allowed))) return { ok: false, why: 'money' };
  if (FORBIDDEN.some((rx) => affirmed(rx, text))) return { ok: false, why: 'policy' };
  return { ok: true, text };
}

// ─── Lời đáp tất định (khi không có / không dùng được LLM) ───────────────────────────────────

export function templateReply(criteria: ChatCriteria, recs: ChatRecommendation[], scan: { scanned: number; matched: number }): string {
  const budgetText = criteria.budget ? ` có All-in không vượt ${vnd(criteria.budget)}đ` : ' khớp điều kiện của bạn';
  const lead = `Mình đã quét ${scan.scanned} căn đang mở tại Ocean Park 1 và giữ lại ${scan.matched} căn${budgetText}.`;
  const top = recs[0];
  if (!top) return lead;
  const saving = top.comparison.savingPercentage > 0 ? `, thấp hơn giá tham chiếu cùng phân khu ${top.comparison.savingPercentage}%` : '';
  return (
    `${lead} Phù hợp nhất là căn ${top.unitCode} (${LAYOUT_TEXT[top.layout] ?? top.layout}, ${top.areaM2}m², toà ${top.buildingCode}): ` +
    `All-in ${vnd(top.allInCost.allInTotal)}đ/tháng${saving}. Danh sách đã xếp theo mức tiết kiệm rồi đến All-in — bấm vào thẻ căn để xem chi tiết và đặt lịch xem.`
  );
}

export function noMatchReply(criteria: ChatCriteria, scanned: number, cheapest: { unitCode: string; allInTotal: number } | null): string {
  const lead = `Mình đã quét ${scanned} căn đang mở nhưng chưa có căn nào khớp đủ điều kiện.`;
  if (cheapest && criteria.budget && cheapest.allInTotal > criteria.budget) {
    return `${lead} Căn rẻ nhất khớp các điều kiện còn lại là ${cheapest.unitCode} với All-in ${vnd(cheapest.allInTotal)}đ/tháng, cao hơn ngân sách ${vnd(cheapest.allInTotal - criteria.budget)}đ. Bạn thử nâng ngân sách hoặc bớt một điều kiện nhé.`;
  }
  return `${lead} Bạn thử bớt tầng, đồ dùng hoặc mở rộng phân khu nhé.`;
}

export const RECOMMEND_DOWN_REPLY =
  'Mình chưa tải được danh sách căn lúc này nên chưa thể gợi ý căn cụ thể. Bạn thử lại sau ít phút, hoặc mở "Xem tất cả căn" để duyệt danh mục nhé.';

export const CLARIFY_REPLY =
  'Mình chưa bắt được đủ thông tin để lọc căn. Bạn cho mình ngân sách tối đa mỗi tháng và loại căn (Studio, 1, 2 hoặc 3 phòng ngủ) nhé. Ví dụ: "Studio dưới 8 triệu ở Masteri".';

export const GREETING_REPLY =
  'Chào bạn! Bạn cho mình biết ngân sách mỗi tháng và loại căn muốn thuê nhé, mình lọc căn thật đang mở tại Ocean Park 1 trong khoảng 30 giây.';

export const REFUSAL_REPLY =
  'Mình chỉ hỗ trợ tìm và thuê căn hộ tại Vinhomes Ocean Park 1 thôi — bạn cho mình ngân sách và loại căn để mình lọc giúp nhé.';
