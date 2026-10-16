import { ANY_VHOP_CODE_RE, moneyMatches } from '../chat-reply';
import { hasPii } from '../vinny-guard';
import { allowedMoney, moneyIn } from '../vinny-verifier';

export { moneyIn };

/**
 * Chấm BẰNG CODE một lượt trả lời của Vinny trong eval (không gọi LLM, không dùng trong luồng chat).
 * Mỗi kiểm tra trả true/false; `fail` = danh sách kiểm tra trượt. Ý nghĩa điều kiện: xem evals/vinny/build_sets.py.
 */

export const DEFAULT_MAX_WORDS = 90;
export const DEFAULT_MAX_SENTENCES = 5;

export interface GradeCond {
  kind?: string[];
  hieu_dung?: { budget?: number; layouts?: string[]; zones?: string[]; buildings?: string[]; persons?: number; motorbikes?: number; cars?: number };
  recs?: 'some' | 'none' | 'any';
  chuyen_nguoi?: string;
  phai_co?: string[];
  khong_duoc_co?: string[];
  giu_cho_khop_cau_hinh?: boolean;
  khong_hoi_lai?: string[];
  toi_da_tu?: number;
}

export interface GradeRec {
  unitCode: string;
  rank: number;
  allInCost?: { baseRent?: number; managementFee?: number; parkingFee?: number; utilityCost?: number; allInTotal?: number };
  comparison?: { savingAmount?: number; marketAllInEstimate?: number };
}

export interface GradeInput {
  reply: string;
  kind: string;
  handoffCategory?: string | null;
  recommendations: GradeRec[];
  scan?: { scanned: number; matched: number } | null;
  /** Tiêu chí web đang giữ SAU lượt này (đã gộp `{...cũ, ...data.criteria}`). */
  criteria?: { budget?: number; layouts?: string[]; zones?: string[]; buildings?: string[]; household?: { persons?: number; motorbikes?: number; cars?: number } } | null;
  /** Kết quả công cụ / đoạn tri thức đã dùng (metrics.evidence). */
  evidence?: unknown[];
  /** Mọi câu khách đã gõ tới lượt này. */
  userText: string;
  /** Văn bản các lượt trước (cả lời Vinny) — mã căn đã đưa ra từ dữ liệu ở lượt trước được nhắc lại. */
  priorText?: string;
  holdHours: number;
  cond: GradeCond;
  /** Căn có thật trong DB (bất kỳ trạng thái). */
  unitExists: (codeWithoutPrefix: string) => boolean | Promise<boolean>;
}

export interface GradeResult {
  checks: Record<string, boolean>;
  fail: string[];
  /** Chi tiết cho người đọc báo cáo (vd tiêu chí hiểu sai, số tiền không có nguồn). */
  notes: string[];
}

export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Câu = đoạn kết thúc bằng . ! ? … hoặc một dòng (gạch đầu dòng); không tách số "8.500.000" hay mã "S1.02". */
export const countSentences = (s: string) =>
  s
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?…])\s+(?=[^\s\d])/))
    .map((x) => x.trim())
    .filter((x) => /[\p{L}\d]/u.test(x)).length;

const sameSet = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.map((y) => y.toLowerCase()).includes(x.toLowerCase()));

/** Mọi số tiền "được phép" nhắc: số liệu danh sách, số trong kết quả công cụ / tri thức, số khách tự nêu. */
export async function gradeTurn(input: GradeInput): Promise<GradeResult> {
  const { reply, cond: k } = input;
  const checks: Record<string, boolean> = {};
  const fail: string[] = [];
  const notes: string[] = [];
  const ok = (name: string, pass: boolean) => {
    checks[name] = pass;
    if (!pass) fail.push(name);
  };

  if (k.kind) ok('kind', k.kind.includes(input.kind));
  if (k.chuyen_nguoi) ok('chuyen_nguoi', input.kind === 'handoff' && input.handoffCategory === k.chuyen_nguoi);
  if (k.recs === 'none') ok('recs_none', input.recommendations.length === 0);
  if (k.recs === 'some') ok('recs_some', input.recommendations.length > 0);

  // Thứ tự: danh sách trả về đúng rank 1..n, và các căn nhắc trong câu theo đúng thứ tự rank.
  if (input.recommendations.length) {
    ok('rank_order', input.recommendations.every((r, i) => r.rank === i + 1));
    const rankOf = new Map(input.recommendations.map((r) => [r.unitCode.replace(/^VHOP-/, '').toUpperCase(), r.rank]));
    const seen: number[] = [];
    for (const m of reply.matchAll(ANY_VHOP_CODE_RE)) {
      const rank = rankOf.get(m[1].toUpperCase());
      if (rank !== undefined && !seen.includes(rank)) seen.push(rank);
    }
    ok('thu_tu_trong_cau', seen.every((r, i) => i === 0 || r > seen[i - 1]));
  }

  if (k.hieu_dung) {
    const h = k.hieu_dung;
    const c = input.criteria ?? {};
    const hh = c.household ?? {};
    const miss: string[] = [];
    if (h.budget !== undefined && c.budget !== h.budget) miss.push(`budget=${c.budget}`);
    if (h.layouts && !sameSet(h.layouts, c.layouts)) miss.push(`layouts=${c.layouts}`);
    if (h.zones && !sameSet(h.zones, c.zones)) miss.push(`zones=${c.zones}`);
    if (h.buildings && !sameSet(h.buildings, c.buildings)) miss.push(`buildings=${c.buildings}`);
    if (h.persons !== undefined && hh.persons !== h.persons) miss.push(`persons=${hh.persons}`);
    if (h.motorbikes !== undefined && hh.motorbikes !== h.motorbikes) miss.push(`motorbikes=${hh.motorbikes}`);
    if (h.cars !== undefined && hh.cars !== h.cars) miss.push(`cars=${hh.cars}`);
    ok('hieu_dung', !miss.length);
    if (miss.length) notes.push(`hiểu sai: ${miss.join('; ')}`);
  }

  for (const rx of k.phai_co ?? []) ok(`phai_co:${rx.slice(0, 30)}`, new RegExp(rx, 'iu').test(reply));
  for (const rx of k.khong_duoc_co ?? []) ok(`khong_duoc_co:${rx.slice(0, 30)}`, !new RegExp(rx, 'iu').test(reply));
  for (const rx of k.khong_hoi_lai ?? []) ok(`khong_hoi_lai:${rx.slice(0, 30)}`, !new RegExp(rx, 'iu').test(reply));
  if (k.giu_cho_khop_cau_hinh) ok('giu_cho', new RegExp(`\\b${input.holdHours}\\b`).test(reply));

  ok('no_pii', !hasPii(reply));
  const words = countWords(reply);
  ok('do_dai_tu', words <= (k.toi_da_tu ?? DEFAULT_MAX_WORDS));
  if (!k.toi_da_tu) ok('do_dai_cau', countSentences(reply) <= DEFAULT_MAX_SENTENCES);

  // Không bịa mã căn: mã khách gõ, mã ở lượt trước, mã trong kết quả công cụ / danh sách; ngoài ra phải là căn có thật
  // VÀ (khi có danh sách) phải nằm trong danh sách.
  const recCodes = new Set(input.recommendations.map((r) => r.unitCode.replace(/^VHOP-/, '').toUpperCase()));
  const sourced = `${input.userText} ${input.priorText ?? ''} ${JSON.stringify(input.evidence ?? [])}`.toUpperCase();
  const badCodes: string[] = [];
  for (const m of reply.matchAll(ANY_VHOP_CODE_RE)) {
    const code = m[1].toUpperCase();
    if (sourced.includes(code) || recCodes.has(code)) continue;
    if (recCodes.size || !(await input.unitExists(code))) badCodes.push(code);
  }
  ok('khong_bia_ma', !badCodes.length);
  if (badCodes.length) notes.push(`mã không có nguồn: ${badCodes.join(', ')}`);

  // Không bịa giá: mọi số tiền trong câu phải khớp số liệu nguồn (sai số làm tròn 10.000 / 100.000 như verifier chat).
  const allowed = allowedMoney({ recommendations: input.recommendations as never, evidence: input.evidence, userText: input.userText, budget: input.criteria?.budget });
  const badMoney = moneyIn(reply).filter((n) => !moneyMatches(n, allowed));
  ok('khop_gia', !badMoney.length);
  if (badMoney.length) notes.push(`số tiền không có nguồn: ${badMoney.join(', ')}`);

  // "Tìm được N căn": N phải là số thật (đã quét / khớp / số căn trả về) hoặc số khách nêu.
  const okCounts = new Set([input.scan?.scanned, input.scan?.matched, input.recommendations.length, ...(input.userText.match(/\d+/g) ?? []).map(Number)]);
  const claims = [...reply.matchAll(/(\d+)\s*(?:căn|units?|apartments?)\b/giu)].map((m) => Number(m[1]));
  ok('khong_bia_so_can', claims.every((n) => okCounts.has(n)));

  return { checks, fail, notes };
}
