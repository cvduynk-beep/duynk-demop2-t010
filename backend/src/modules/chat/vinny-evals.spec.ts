import { readFileSync } from 'fs';
import { join } from 'path';
import { detectHandoff, detectNegotiation, detectProbe } from './vinny-guard';

/**
 * Kiểm cấu trúc bộ eval Vinny (chạy trong CI, không cần khoá Gemini).
 * Bộ eval thật với Gemini chạy tay: `npm run eval:vinny`.
 */
const DIR = join(__dirname, '..', '..', '..', 'evals', 'vinny');
const KINDS = ['search', 'clarify', 'faq', 'greeting', 'refusal', 'answer', 'handoff'];

interface EvalCase {
  id: string;
  set: string;
  group: string;
  message: string;
  expect: { kind?: string[]; handoff?: boolean; must?: string[]; forbid?: string[]; judge?: string };
}

const load = (name: string): EvalCase[] =>
  readFileSync(join(DIR, name), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvalCase);

describe('Bộ eval Vinny', () => {
  const golden = load('golden.jsonl');
  const redteam = load('redteam.jsonl');

  it('đủ số lượng tối thiểu đã chốt (≥80 vàng, ≥30 đối kháng)', () => {
    expect(golden.length).toBeGreaterThanOrEqual(80);
    expect(redteam.length).toBeGreaterThanOrEqual(30);
  });

  it('id duy nhất, đúng set, đủ trường bắt buộc', () => {
    const all = [...golden, ...redteam];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    golden.forEach((c) => expect(c.set).toBe('golden'));
    redteam.forEach((c) => expect(c.set).toBe('redteam'));
    for (const c of all) {
      expect(typeof c.group).toBe('string');
      expect(c.message.trim().length).toBeGreaterThan(0);
      expect(c.message.length).toBeLessThanOrEqual(250);
      expect(c.expect).toBeDefined();
      (c.expect.kind ?? []).forEach((k) => expect(KINDS).toContain(k));
    }
  });

  it('mọi ca đối kháng đều có điều kiện cấm hoặc rubric chấm', () => {
    for (const c of redteam) {
      expect((c.expect.forbid?.length ?? 0) > 0 || !!c.expect.judge || c.expect.handoff !== undefined).toBe(true);
    }
  });

  it('bộ chặn tất định không chặn nhầm ca vàng (gỡ dấu dễ trùng chữ, vd "điều hoà hỏng" ~ "hoa hồng")', () => {
    const wrong = golden
      .filter((c) => !(c.expect.kind ?? []).includes('refusal') && detectProbe(c.message))
      .map((c) => `${c.id}: ${detectProbe(c.message)}`);
    expect(wrong).toEqual([]);
    const falseHandoff = golden
      .filter((c) => c.expect.kind && !c.expect.kind.includes('handoff') && detectHandoff(c.message))
      .map((c) => `${c.id}: ${detectHandoff(c.message)}`);
    expect(falseHandoff).toEqual([]);
    const falseNegotiation = golden.filter((c) => detectNegotiation(c.message)).map((c) => c.id);
    expect(falseNegotiation).toEqual([]);
  });
});
