import { readFileSync } from 'fs';
import { join } from 'path';
import { detectHandoff, detectNegotiation, detectProbe } from './vinny-guard';

/**
 * Kiểm cấu trúc 4 bộ eval Vinny (chạy trong CI, không cần khoá Gemini). Sinh bộ: `python evals/vinny/build_sets.py`.
 * Bộ eval thật với Gemini chạy tay: `npm run eval:vinny`. Bộ D (giữ kín) chỉ chạy một lần cuối.
 */
const DIR = join(__dirname, '..', '..', '..', 'evals', 'vinny');
const KINDS = ['search', 'clarify', 'faq', 'greeting', 'refusal', 'answer', 'handoff'];
const NHOM = ['hieu_y', 'suy_luan', 'kheo_leo', 'chinh_xac', 'an_toan'];
const COND_KEYS = ['kind', 'hieu_dung', 'recs', 'chuyen_nguoi', 'phai_co', 'khong_duoc_co', 'giu_cho_khop_cau_hinh', 'khong_hoi_lai', 'toi_da_tu', 'giam_khao'];

interface Cond {
  kind?: string[];
  recs?: string;
  chuyen_nguoi?: string;
  phai_co?: string[];
  khong_duoc_co?: string[];
  khong_hoi_lai?: string[];
  giam_khao?: string;
}
interface EvalCase {
  id: string;
  bo: string;
  loai: string;
  nhom: string;
  auth: string;
  hoi?: string;
  luot?: { hoi: string; dieu_kien_dung: Cond }[];
  dieu_kien_dung?: Cond;
}

const load = (name: string): EvalCase[] =>
  readFileSync(join(DIR, `${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvalCase);

const turns = (c: EvalCase) => c.luot ?? [{ hoi: c.hoi!, dieu_kien_dung: c.dieu_kien_dung! }];

describe('Bộ eval Vinny (A/B/C/D)', () => {
  const sets = { A: load('a_mot_luot'), B: load('b_nhieu_luot'), C: load('c_tan_cong'), D: load('d_giu_kin') };
  const all = Object.values(sets).flat();

  it('đủ số lượng tối thiểu đã chốt (A ≥ 80, B/C/D ≥ 30)', () => {
    expect(sets.A.length).toBeGreaterThanOrEqual(80);
    expect(sets.B.length).toBeGreaterThanOrEqual(30);
    expect(sets.C.length).toBeGreaterThanOrEqual(30);
    expect(sets.D.length).toBeGreaterThanOrEqual(30);
  });

  it('id duy nhất, đúng bộ, đủ trường, điều kiện hợp lệ', () => {
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const [bo, rows] of Object.entries(sets)) rows.forEach((c) => expect([c.bo, c.id.startsWith(`${bo}-`)]).toEqual([bo, true]));
    for (const c of all) {
      expect(NHOM).toContain(c.nhom);
      expect(['guest', 'tenant']).toContain(c.auth);
      for (const t of turns(c)) {
        expect(t.hoi.trim().length).toBeGreaterThan(0);
        expect(t.hoi.length).toBeLessThanOrEqual(250);
        Object.keys(t.dieu_kien_dung).forEach((k) => expect(COND_KEYS).toContain(k));
        (t.dieu_kien_dung.kind ?? []).forEach((k) => expect(KINDS).toContain(k));
        [...(t.dieu_kien_dung.phai_co ?? []), ...(t.dieu_kien_dung.khong_duoc_co ?? []), ...(t.dieu_kien_dung.khong_hoi_lai ?? [])].forEach((rx) => expect(() => new RegExp(rx, 'i')).not.toThrow());
      }
    }
  });

  it('bộ B là hội thoại 2–8 lượt; bộ A mỗi nhóm nội dung bắt buộc ≥ 5 câu', () => {
    sets.B.forEach((c) => expect(c.luot!.length).toBeGreaterThanOrEqual(2));
    sets.B.forEach((c) => expect(c.luot!.length).toBeLessThanOrEqual(8));
    const count = (loai: string) => sets.A.filter((c) => c.loai === loai).length;
    for (const loai of ['tim_can', 'so_sanh', 'quy_trinh', 'giu_cho', 'cua_toi', 'thieu_thong_tin', 'het_can', 'ngoai_pham_vi', 'tieng_anh', 'khong_dau', 'buc_boi']) {
      expect([loai, count(loai) >= 5]).toEqual([loai, true]);
    }
  });

  it('bản YAML (để người duyệt đọc) có đúng cùng danh sách ca với bản JSONL (máy chạy)', () => {
    for (const [bo, file] of Object.entries({ A: 'a_mot_luot', B: 'b_nhieu_luot', C: 'c_tan_cong', D: 'd_giu_kin' })) {
      const yamlIds = [...readFileSync(join(DIR, `${file}.yaml`), 'utf8').matchAll(/^- id: (\S+)$/gm)].map((m) => m[1]);
      expect(yamlIds).toEqual(sets[bo as keyof typeof sets].map((c) => c.id));
    }
  });

  it('mọi ca tấn công đều có điều kiện cấm', () => {
    sets.C.forEach((c) => expect((c.dieu_kien_dung!.khong_duoc_co ?? []).length).toBeGreaterThan(0));
  });

  it('bộ chặn tất định không chặn nhầm câu thường (gỡ dấu dễ trùng chữ, vd "điều hoà hỏng" ~ "hoa hồng")', () => {
    const normal = [...sets.A, ...sets.B, ...sets.D].filter((c) => c.nhom !== 'an_toan');
    const wrong: string[] = [];
    for (const c of normal) {
      for (const t of turns(c)) {
        const kind = t.dieu_kien_dung.kind ?? [];
        if (!kind.includes('refusal') && detectProbe(t.hoi)) wrong.push(`${c.id} probe: ${t.hoi}`);
        if (kind.length && !kind.includes('handoff') && detectHandoff(t.hoi)) wrong.push(`${c.id} handoff: ${t.hoi}`);
        if (!kind.includes('refusal') && detectNegotiation(t.hoi)) wrong.push(`${c.id} negotiation: ${t.hoi}`);
      }
    }
    // Lỗi đã biết ở baseline (ghi vào bảng lỗi Giai đoạn 2, sửa ở Giai đoạn 3 — sửa xong phải xoá khỏi danh sách này).
    const KNOWN_BASELINE = ['B-007 handoff: bỏ điều kiện khu đi, chỗ nào cũng được'];
    expect(wrong).toEqual(KNOWN_BASELINE);
  });
});
