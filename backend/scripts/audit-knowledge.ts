/**
 * Rà kho tri thức Vinny (Bước 3C.3) — CHỈ LIỆT KÊ, không sửa nội dung (chủ sở hữu: Ops/Admin).
 *   npx ts-node --transpile-only scripts/audit-knowledge.ts      ⇒ ghi evals/vinny/knowledge-audit.md
 * Kiểm: thiếu nguồn / ngày duyệt / người duyệt, nội dung cũ, đoạn quá dài / quá ngắn, trùng giữa các chủ đề,
 * đánh dấu "CẦN DUYỆT", số liệu động viết cứng (giờ giữ, tiền) thay vì lấy từ API, số trong `summary` không có trong ý gốc.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fold } from '../src/modules/chat/chat-criteria';

const DIR = resolve(__dirname, '..', '..', 'ai-engine', 'knowledge');
const OUT = resolve(__dirname, '..', 'evals', 'vinny', 'knowledge-audit.md');
const TODAY = new Date();
const STALE_DAYS = 14;
const LONG_WORDS = 45;
const SHORT_WORDS = 6;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const tokens = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
};

interface Topic {
  file: string;
  meta: Record<string, string>;
  bullets: string[];
  raw: string;
}

const topics: Topic[] = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
  const raw = readFileSync(join(DIR, file), 'utf-8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const bullets = (m?.[2] ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  topics.push({ file, meta, bullets, raw });
}

const lines: string[] = [];
const issues: { file: string; kind: string; detail: string }[] = [];
const add = (file: string, kind: string, detail: string) => issues.push({ file, kind, detail });

for (const t of topics.filter((x) => !x.file.startsWith('_'))) {
  for (const f of ['topic', 'title', 'summary', 'sources', 'verified_at']) if (!t.meta[f]) add(t.file, 'thiếu trường', f);
  if (!t.meta.reviewer && !t.meta.owner) add(t.file, 'thiếu người duyệt', 'không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt)');
  const days = t.meta.verified_at ? Math.floor((TODAY.getTime() - Date.parse(t.meta.verified_at)) / 86_400_000) : NaN;
  if (days > STALE_DAYS) add(t.file, 'có thể lỗi thời', `duyệt lần cuối ${t.meta.verified_at} (${days} ngày)`);
  if (/CẦN DUYỆT/.test(t.raw)) add(t.file, 'chờ duyệt', `${(t.raw.match(/CẦN DUYỆT/g) ?? []).length} ý đánh dấu "CẦN DUYỆT"`);
  t.bullets.forEach((b, i) => {
    const w = words(b);
    if (w > LONG_WORDS) add(t.file, 'ý quá dài', `ý ${i + 1}: ${w} từ (> ${LONG_WORDS})`);
    if (w < SHORT_WORDS && !b.endsWith(':')) add(t.file, 'ý quá ngắn', `ý ${i + 1}: ${w} từ — "${b}"`);
    if (b.endsWith(':')) add(t.file, 'ý cụt', `ý ${i + 1} kết thúc bằng ":" nhưng không có ý con — "${b.slice(0, 60)}"`);
    // Số liệu động viết cứng (phải lấy qua công cụ / biến): giờ giữ, tiền, số căn.
    if (/\b\d{1,3}\s*(giờ|tiếng)\b/.test(b) && !/\{hold_hours/.test(b)) add(t.file, 'số cứng', `ý ${i + 1}: số giờ viết cứng — "${b.match(/\b\d{1,3}\s*(giờ|tiếng)\b/)![0]}"`);
    if (/\d[\d.]*\s*(đ|vnđ|triệu)\b/i.test(b)) add(t.file, 'số cứng', `ý ${i + 1}: số tiền viết cứng — "${b.match(/\d[\d.]*\s*(đ|vnđ|triệu)\b/i)![0]}"`);
  });
  // Tóm tắt không được thêm số / dữ kiện mới so với các ý đã duyệt.
  const sumNums = (t.meta.summary ?? '').match(/\d+(?:[.,]\d+)?%?/g) ?? [];
  const body = t.bullets.join(' ');
  for (const n of sumNums) if (!body.includes(n)) add(t.file, 'tóm tắt có số mới', `"${n}" có trong summary nhưng không có trong các ý`);
}

// Trùng lặp giữa các chủ đề (Jaccard ≥ 0.6 trên từ ≥ 3 ký tự, bỏ dấu).
const all = topics.filter((x) => !x.file.startsWith('_')).flatMap((t) => t.bullets.map((b, i) => ({ file: t.file, i, b, tok: tokens(b) })));
for (let x = 0; x < all.length; x++) {
  for (let y = x + 1; y < all.length; y++) {
    if (all[x].file === all[y].file) continue;
    const j = jaccard(all[x].tok, all[y].tok);
    if (j >= 0.6) add(`${all[x].file} ↔ ${all[y].file}`, 'trùng ý', `ý ${all[x].i + 1} ↔ ý ${all[y].i + 1} (giống ${Math.round(j * 100)}%): "${all[x].b.slice(0, 70)}…"`);
  }
}

// Mâu thuẫn đã ghi trong _conflicts.md: liệt kê để người phụ trách xác nhận còn đúng không.
const conflicts = topics.find((t) => t.file === '_conflicts.md');
const conflictHeads = conflicts ? [...conflicts.raw.matchAll(/^## (C\d+\..*)$/gm)].map((m) => m[1]) : [];

const byKind = new Map<string, number>();
issues.forEach((i) => byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1));
lines.push(
  `# Rà kho tri thức Vinny — ${TODAY.toISOString().slice(0, 10)}`,
  '',
  `Nguồn: \`ai-engine/knowledge/\` (${topics.filter((x) => !x.file.startsWith('_')).length} chủ đề). Sinh bằng \`scripts/audit-knowledge.ts\` — CHỈ liệt kê, KHÔNG sửa nội dung (chủ sở hữu Ops/Admin quyết).`,
  '',
  '| Loại vấn đề | Số lượng |',
  '|---|---|',
  ...[...byKind.entries()].map(([k, n]) => `| ${k} | ${n} |`),
  '',
  '## Chi tiết',
  '',
  '| File | Loại | Chi tiết |',
  '|---|---|---|',
  ...issues.map((i) => `| ${i.file} | ${i.kind} | ${i.detail.replace(/\|/g, '/')} |`),
  '',
  '## Mâu thuẫn code ↔ pháp lý trong `_conflicts.md` (cần người phụ trách xác nhận còn hiệu lực)',
  '',
  `Duyệt lần cuối: ${conflicts?.meta.verified_at ?? '—'}. Khi API và tri thức nói khác nhau thì API đúng; các mục dưới đây là chỗ chưa chốt:`,
  '',
  ...conflictHeads.map((h) => `- ${h}`),
);
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`[audit] ${issues.length} mục · ${conflictHeads.length} mâu thuẫn đã ghi → ${OUT}`);
for (const [k, n] of byKind) console.log(`  ${k}: ${n}`);
