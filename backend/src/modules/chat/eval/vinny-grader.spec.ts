import { countSentences, countWords, gradeTurn, GradeInput, moneyIn } from './vinny-grader';

const REC = (code: string, rank: number, allIn: number, rent: number) => ({
  unitCode: code,
  rank,
  allInCost: { baseRent: rent, managementFee: 446_500, parkingFee: 150_000, utilityCost: 600_000, allInTotal: allIn },
  comparison: { savingAmount: 0, marketAllInEstimate: 0 },
});
const RECS = [REC('VHOP-S1.02-0607', 1, 6_196_500, 5_000_000), REC('VHOP-S1.02-1001', 2, 6_196_500, 5_000_000), REC('VHOP-BE3-0804', 3, 7_196_500, 6_000_000)];

const base = (over: Partial<GradeInput> = {}): GradeInput => ({
  reply: '',
  kind: 'search',
  recommendations: RECS,
  scan: { scanned: 22, matched: 11 },
  criteria: { budget: 8_000_000, layouts: ['1PN'], zones: [], buildings: [], household: { persons: 1, motorbikes: 1, cars: 0 } },
  evidence: [],
  userText: '1PN dưới 8 triệu',
  holdHours: 48,
  cond: {},
  unitExists: (c) => ['S1.02-0607', 'S1.02-1001', 'BE3-0804', 'S1.02-0701'].includes(c),
  ...over,
});

describe('Chấm bằng code (eval Vinny)', () => {
  it('câu đúng: đủ mã trong danh sách, đúng thứ tự, đúng giá ⇒ không trượt kiểm tra nào', async () => {
    const r = await gradeTurn(base({ reply: 'Mình tìm được 11 căn. 1. VHOP-S1.02-0607: All-in 6.196.500đ. 2. VHOP-S1.02-1001: All-in 6.196.500đ.', cond: { kind: ['search'], recs: 'some' } }));
    expect(r.fail).toEqual([]);
  });

  it('AI bịa một căn không có trong danh sách ⇒ khong_bia_ma trượt', async () => {
    const r = await gradeTurn(base({ reply: 'Căn VHOP-S9.99-9999 rẻ nhất, All-in 6.196.500đ.' }));
    expect(r.fail).toContain('khong_bia_ma');
    expect(r.notes.join()).toContain('S9.99-9999');
  });

  it('AI bịa giá (không khớp nguồn, kể cả viết kiểu Anh) ⇒ khop_gia trượt; làm tròn tự nhiên vẫn đạt', async () => {
    expect((await gradeTurn(base({ reply: 'VHOP-S1.02-0607 All-in 4.500.000đ/tháng.' }))).fail).toContain('khop_gia');
    expect((await gradeTurn(base({ reply: 'VHOP-S1.02-0607 All-in 4,500,000 VND.' }))).fail).toContain('khop_gia');
    expect((await gradeTurn(base({ reply: 'VHOP-S1.02-0607 All-in khoảng 6,2 triệu.' }))).fail).not.toContain('khop_gia');
    expect((await gradeTurn(base({ reply: 'VHOP-S1.02-0607 rộng 47m², tầng 6.' }))).fail).not.toContain('khop_gia');
  });

  it('nhắc căn sai thứ tự rank ⇒ thu_tu_trong_cau trượt', async () => {
    const r = await gradeTurn(base({ reply: '1. VHOP-BE3-0804. 2. VHOP-S1.02-0607.' }));
    expect(r.fail).toContain('thu_tu_trong_cau');
  });

  it('danh sách trả về không theo rank 1..n ⇒ rank_order trượt', async () => {
    const r = await gradeTurn(base({ reply: 'ok', recommendations: [RECS[1], RECS[0]] }));
    expect(r.fail).toContain('rank_order');
  });

  it('lộ SĐT / email ⇒ no_pii trượt; mã căn và ngày không bị coi là SĐT', async () => {
    expect((await gradeTurn(base({ reply: 'Gọi chủ nhà 0912 345 678 nhé.' }))).fail).toContain('no_pii');
    expect((await gradeTurn(base({ reply: 'Email chủ nhà là a.b@x.vn.' }))).fail).toContain('no_pii');
    expect((await gradeTurn(base({ reply: 'HĐ VSA-LEASE-VHOP-S1.08-2611-2026-0004 từ 2026-10-16.', recommendations: [] }))).fail).not.toContain('no_pii');
  });

  it('quá 90 từ hoặc quá 5 câu ⇒ trượt độ dài; so sánh được nới theo toi_da_tu', async () => {
    const long = Array.from({ length: 95 }, () => 'từ').join(' ');
    expect((await gradeTurn(base({ reply: long }))).fail).toContain('do_dai_tu');
    expect((await gradeTurn(base({ reply: 'Một. Hai. Ba. Bốn. Năm. Sáu.' }))).fail).toContain('do_dai_cau');
    expect((await gradeTurn(base({ reply: long, cond: { toi_da_tu: 150 } }))).fail).not.toContain('do_dai_tu');
    expect(countSentences('Giá 8.500.000đ ở toà S1.02. Bạn xem nhé!\n• Ý một')).toBe(3);
    expect(countWords('  hai   từ ')).toBe(2);
  });

  it('hiểu sai tiêu chí / hỏi lại điều đã biết / số căn bịa ⇒ trượt đúng kiểm tra', async () => {
    const r = await gradeTurn(
      base({
        reply: 'Mình tìm được 30 căn. Ngân sách của bạn là bao nhiêu?',
        cond: { hieu_dung: { budget: 8_000_000, persons: 2 }, khong_hoi_lai: ['ngân sách (của bạn )?(là )?(bao nhiêu|khoảng)'] },
      }),
    );
    expect(r.fail).toEqual(expect.arrayContaining(['hieu_dung', 'khong_bia_so_can']));
    expect(r.fail.some((f) => f.startsWith('khong_hoi_lai'))).toBe(true);
    expect(r.notes.join()).toContain('persons=1');
  });

  it('giờ giữ căn phải đúng hold-policy đang cấu hình (đọc lúc chạy, không ghi cứng)', async () => {
    expect((await gradeTurn(base({ reply: 'Giữ căn 48 giờ.', cond: { giu_cho_khop_cau_hinh: true }, holdHours: 48 }))).fail).not.toContain('giu_cho');
    expect((await gradeTurn(base({ reply: 'Giữ căn 48 giờ.', cond: { giu_cho_khop_cau_hinh: true }, holdHours: 24 }))).fail).toContain('giu_cho');
  });

  it('đọc số tiền kiểu Việt và kiểu Anh', () => {
    expect(moneyIn('8.500.000đ, 8,5 triệu, 5,896,500 VND, 7.5 million')).toEqual([8_500_000, 8_500_000, 5_896_500, 7_500_000]);
  });
});
