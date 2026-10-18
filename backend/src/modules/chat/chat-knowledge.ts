import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fold } from './chat-criteria';

/**
 * Lớp FAQ 0 đồng / 0ms (AGENTS.md lớp 2). Câu chữ quy trình đọc từ `ai-engine/knowledge/*.md` (tri thức đã kiểm, có
 * `sources:` trỏ về legal/ và code), số liệu thay vào từ DB (`fee_configs`) và nguồn duy nhất của backend — không có số
 * nào viết cứng ở đây.
 */

export interface KnowledgeTopic {
  topic: string;
  title: string;
  /** Câu trả lời ngắn (front matter `summary:`, Ops/Admin duyệt) — mở đầu câu FAQ thay vì đổ cả danh sách ý. */
  summary?: string;
  bullets: string[];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Dòng dặn bot ("Bot không tự tính…") là chỉ dẫn cho agent, không phải nội dung cho khách. */
const AGENT_ONLY_LINE = /\bbot\b|agent|công cụ (tìm|xem) căn|lượt trả lời/i;

export function parseKnowledgeFile(raw: string): KnowledgeTopic | null {
  const m = FRONT_MATTER.exec(raw);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.topic) return null;
  const bullets = m[2]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l && !AGENT_ONLY_LINE.test(l));
  return { topic: meta.topic, title: meta.title ?? meta.topic, summary: meta.summary || undefined, bullets };
}

/** Đọc mọi `*.md` không bắt đầu bằng `_` (loại `_sample.md`, `_conflicts.md`) — cùng quy ước với ai-engine. */
export function loadKnowledge(dir: string): Map<string, KnowledgeTopic> {
  const out = new Map<string, KnowledgeTopic>();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md') || name.startsWith('_')) continue;
    const parsed = parseKnowledgeFile(readFileSync(join(dir, name), 'utf-8'));
    if (parsed) out.set(parsed.topic, parsed);
  }
  return out;
}

/** Thứ tự = độ ưu tiên (cụ thể trước, chung sau). `fees` ⇒ kèm dòng biểu phí từ fee_configs. */
const ROUTES: { topic: string; test: RegExp; fees?: boolean }[] = [
  { topic: 'all_in', test: /phi gui xe|gui xe|phi xe|bai xe|do xe|parking/, fees: true },
  { topic: 'all_in', test: /phi quan ly|phi dich vu|phi bql|phi van hanh/, fees: true },
  // `\bhoan coc`: không khớp nhầm "chuyển k-hoản cọc".
  { topic: 'security_deposit', test: /coc bao dam|tien coc bao|\bhoan coc|\btru coc|security deposit/ },
  { topic: 'holding_expiry', test: /het han giu|qua han (coc|giu)|giu (can|cho) (duoc )?bao lau|bao lau (thi )?(het|mo lai)/ },
  { topic: 'first_to_pay', test: /nguoi khac (da )?coc|ai coc truoc|first.?to.?pay|dang co (nguoi|khach) xem|(2|hai|nhieu) (nguoi|khach) (cung )?(muon|thich|coc|giu|dat)( cung)? (1|mot)? ?can/ },
  { topic: 'fast_deposit', test: /coc nhanh|chot nhanh|khong can (di )?xem|chua xem (ma|da) coc|coc (truoc|luon) (khi|ma khong) xem|coc online|fast.?deposit/ },
  { topic: 'holding_deposit', test: /coc giu cho|dat coc|coc 2|2 ?trieu|2tr\b|vietqr|giu can|giu cho|tien coc|\bcoc\b/ },
  { topic: 'bql_rules', test: /noi quy|thu cung|nuoi (cho|meo)|on ao|gio yen tinh|pccc|sac xe dien|airbnb|cho thue lai|khoan tuong/ },
  { topic: 'contract', test: /hop dong|ky (hop dong|so|dien tu)|ekyc|cccd|can cuoc/ },
  { topic: 'maintenance', test: /sua chua|hong hoc|bi hong|\bhong\b.{0,20}\b(ai|sao|lam gi)\b|ai sua|bao tri|\btho\b|ro ri|chap dien|ro nuoc/ },
  { topic: 'move_out', test: /tra phong|tra nha|chuyen di|thanh ly|ket thuc hop dong/ },
  { topic: 'privacy', test: /bao mat|du lieu ca nhan|nghi dinh 13|thong tin ca nhan/ },
  { topic: 'viewing', test: /xem nha|xem phong|xem can|dat lich|lich xem|the thang may|don (tai|o) sanh|field host|host don|no.?show|\bma cua\b|mo cua|chia khoa/ },
  { topic: 'all_in', test: /all.?in|chi phi (thuc|hang thang|tong|an)|phi an|phat sinh|bao gom nhung|gom nhung (gi|khoan)/, fees: true },
  { topic: 'op1', test: /ocean park 1|\bop1\b|phan khu nao|nhung phan khu|gioi thieu (ve )?(vinstay|ocean park)/ },
];

export function routeFaq(text: string): { topic: string; fees: boolean } | null {
  const t = fold(text);
  const hit = ROUTES.find((r) => r.test.test(t));
  return hit ? { topic: hit.topic, fees: !!hit.fees } : null;
}

export interface FaqValues {
  holding_deposit?: string;
  hold_hours?: string;
  hold_hours_min?: string;
  hold_hours_max?: string;
}

const PLACEHOLDER = /\{(holding_deposit|hold_hours|hold_hours_min|hold_hours_max)\}/g;

export interface RenderFocus {
  /** Câu khách: chọn các ý trùng từ khoá nhiều nhất thay vì đổ cả chủ đề. */
  query: string;
  /** Trần số từ của phần ý (dòng biểu phí tính vào trần). Mặc định 80 (cộng câu mời hỏi tiếp ≈ 90 từ — persona Vinny). */
  budgetWords?: number;
  maxBullets?: number;
}

export const FAQ_MORE_LINE = 'Bạn cần chi tiết phần nào cứ hỏi tiếp mình nhé.';

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function fill(text: string, values: FaqValues): string | null {
  let missing = false;
  const out = text.replace(PLACEHOLDER, (_, k: keyof FaqValues) => {
    const v = values[k];
    if (v == null) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

/**
 * Thay biến; dòng còn biến chưa có giá trị bị BỎ (không đoán số). Có `focus` ⇒ chỉ giữ ≤ `maxBullets` ý liên quan nhất
 * trong trần `budgetWords` (ý đầu chủ đề được cộng nhẹ vì là ý tổng quát), in theo thứ tự gốc; bớt ý ⇒ thêm câu mời hỏi tiếp.
 */
export function renderTopic(t: KnowledgeTopic, values: FaqValues, feeLine?: string, focus?: RenderFocus): string {
  const lines = t.bullets.map((b) => fill(b, values)).filter((l): l is string => l !== null);
  const bullet = (ls: string[]) => ls.map((l) => `• ${l}`).join('\n');
  if (!focus) return `${t.title}\n${bullet(feeLine ? [...lines, feeLine] : lines)}`;

  // Có `summary` (đã thay đủ biến) ⇒ mở bằng câu tóm tắt, chỉ thêm ý KHỚP câu hỏi mà tóm tắt chưa nói.
  const summary = t.summary ? fill(t.summary, values) : null;
  const budget = focus.budgetWords ?? 80;
  const max = (focus.maxBullets ?? (summary ? 1 : 3)) - (feeLine && !summary ? 1 : 0);
  const q = new Set(tokens(focus.query));
  const said = new Set(summary ? tokens(summary) : []);
  const ranked = lines
    .map((text, i) => {
      const own = [...new Set(tokens(text))];
      const fresh = own.filter((w) => !said.has(w));
      const score = own.filter((w) => q.has(w)).length + (!summary && i === 0 ? 0.5 : 0);
      // Ý gần như trùng tóm tắt ⇒ bỏ (không nhắc lại).
      return { text, i, score: summary && fresh.length < own.length * 0.4 ? 0 : score };
    })
    .filter((r) => !summary || r.score >= 1)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const picked: typeof ranked = [];
  let used = (summary ? wordCount(summary) : 0) + (feeLine ? wordCount(feeLine) : 0);
  for (const r of ranked) {
    if (picked.length >= max) break;
    // Ý khớp mạnh đầu tiên luôn được giữ (đúng trọng tâm câu hỏi hơn là đúng trần chữ); trần cứng = trần + 15 từ (≈ 100 từ kể cả dấu đầu dòng).
    const strongFirst = !picked.length && r.score >= 2 && used + wordCount(r.text) <= budget + 15;
    if (!strongFirst && (picked.length || summary) && used + wordCount(r.text) > budget) continue;
    picked.push(r);
    used += wordCount(r.text);
  }
  const out = picked.sort((a, b) => a.i - b.i).map((r) => r.text);
  const extra = feeLine ? [...out, feeLine] : out;
  const more = picked.length < lines.length && used <= budget ? `\n${FAQ_MORE_LINE}` : '';
  if (summary) return `${summary}${extra.length ? `\n${bullet(extra)}` : ''}${more}`;
  return `${t.title}\n${bullet(extra)}${more}`;
}

export const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN');

const STOP = new Set(['khong', 'duoc', 'nhung', 'nhu', 'the', 'nao', 'cho', 'minh', 'toi', 'ban', 'can', 'neu', 'thi', 'co', 'la', 'va', 'cua', 'gi', 'bao', 'nhieu', 'lam', 'sao', 'voi', 'mot', 'cac', 'nay', 'khi']);
const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * Tìm đoạn tri thức cho công cụ `knowledge_lookup`: khớp regex định tuyến FAQ (+10) + số từ khoá trùng (tiêu đề ×2).
 * Dưới ngưỡng ⇒ không trả gì (Vinny nói "chưa có thông tin", không bịa). Quy mô ~15 chủ đề ⇒ không cần vector DB.
 */
export function rankTopics(query: string, topics: Map<string, KnowledgeTopic>, limit = 2, minScore = 3): KnowledgeTopic[] {
  const routed = routeFaq(query)?.topic;
  const q = new Set(tokens(query));
  const scored = [...topics.values()].map((t) => {
    const title = new Set(tokens(t.title));
    const body = new Set(tokens(t.bullets.join(' ')));
    let score = t.topic === routed ? 10 : 0;
    for (const w of q) score += (title.has(w) ? 2 : 0) + (body.has(w) ? 1 : 0);
    return { t, score };
  });
  return scored
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}
