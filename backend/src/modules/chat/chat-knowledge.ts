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
  return { topic: meta.topic, title: meta.title ?? meta.topic, bullets };
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
  { topic: 'security_deposit', test: /coc bao dam|tien coc bao|hoan coc|tru coc|security deposit/ },
  { topic: 'holding_expiry', test: /het han giu|qua han (coc|giu)|giu (can|cho) (duoc )?bao lau|bao lau (thi )?(het|mo lai)/ },
  { topic: 'first_to_pay', test: /nguoi khac (da )?coc|ai coc truoc|first.?to.?pay|dang co (nguoi|khach) xem/ },
  { topic: 'holding_deposit', test: /coc giu cho|dat coc|coc 2|2 ?trieu|2tr\b|vietqr|giu can|giu cho|tien coc|\bcoc\b/ },
  { topic: 'bql_rules', test: /noi quy|thu cung|nuoi (cho|meo)|on ao|gio yen tinh|pccc|sac xe dien|airbnb|cho thue lai|khoan tuong/ },
  { topic: 'contract', test: /hop dong|ky (hop dong|so|dien tu)|ekyc|cccd|can cuoc/ },
  { topic: 'maintenance', test: /sua chua|hong hoc|bi hong|bao tri|\btho\b|ro ri|chap dien|ro nuoc/ },
  { topic: 'move_out', test: /tra phong|tra nha|chuyen di|thanh ly|ket thuc hop dong/ },
  { topic: 'privacy', test: /bao mat|du lieu ca nhan|nghi dinh 13|thong tin ca nhan/ },
  { topic: 'viewing', test: /xem nha|xem phong|xem can|dat lich|lich xem|the thang may|don (tai|o) sanh|field host|host don|no.?show/ },
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

/** Thay biến; dòng còn biến chưa có giá trị bị BỎ (không đoán số). */
export function renderTopic(t: KnowledgeTopic, values: FaqValues, feeLine?: string): string {
  const lines: string[] = [];
  for (const b of t.bullets) {
    let missing = false;
    const text = b.replace(PLACEHOLDER, (_, k: keyof FaqValues) => {
      const v = values[k];
      if (v == null) missing = true;
      return v ?? '';
    });
    if (!missing) lines.push(`• ${text}`);
  }
  if (feeLine) lines.push(`• ${feeLine}`);
  return `${t.title}\n${lines.join('\n')}`;
}

export const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN');
