import { emptyCriteria, parseMessage } from './chat-criteria';
import { normalizeVi, parseMoveIn, VI_RULES } from './vi-normalize';

// Thứ Sáu 16/10/2026 10:00 giờ Việt Nam.
const NOW = new Date('2026-10-16T03:00:00.000Z');
const understand = (text: string) => parseMessage(normalizeVi(text, NOW).text, emptyCriteria(), false).criteria;

describe('Chuẩn hoá tiếng Việt (bảng 3A.2 — chưa bật vào chat)', () => {
  it.each([
    ['căn 2 phong ngu zenpak dưới 10 chiệu', { budget: 10_000_000, layouts: ['2PN'], zones: ['zenpark'] }],
    ['studio tầm 7 triệu rưỡi', { budget: 7_500_000, layouts: ['Studio'] }],
    ['tìm stu tam 6 cu', { budget: 6_000_000, layouts: ['Studio'] }],
    ['2 phòng ở beverli dưới 9tr', { budget: 9_000_000, layouts: ['2PN'], buildings: ['BE3'] }],
    ['1 ngủ saphia 1 max 8 củ', { budget: 8_000_000, layouts: ['1PN'], zones: ['sapphire1'] }],
    ['3pn tam 12-13 cu cho 5 nguoi', { budget: 13_000_000, layouts: ['3PN'] }],
    ['2BR in zen under 12 million', { budget: 12_000_000, layouts: ['2PN'], zones: ['zenpark'] }],
  ])('"%s" ⇒ hiểu đúng tiêu chí', (text, want) => {
    expect(understand(text)).toMatchObject(want);
  });

  it('người / xe viết tắt', () => {
    expect(understand('2vc, 2xm, 1PN dưới 8tr').household).toEqual({ persons: 2, motorbikes: 2, cars: 0 });
    expect(understand('nhà 4 ng có oto, 2pn').household).toMatchObject({ persons: 4, cars: 1 });
  });

  it('khoảng giá ⇒ sàn + trần; diện tích tối thiểu; nội thất', () => {
    const r = normalizeVi('1pn nt full dt tren 45m2 tam 7-8 cu', NOW);
    expect(r.slots).toMatchObject({ budgetMin: 7_000_000, budgetMax: 8_000_000, minAreaM2: 45 });
    expect(parseMessage(r.text, emptyCriteria(), false).criteria).toMatchObject({ budget: 8_000_000, layouts: ['1PN'], furnishing: 'full' });
  });

  it('còn mơ hồ ⇒ báo để hỏi lại, không đoán', () => {
    expect(normalizeVi('5 triệu 1 tuần được không', NOW).ambiguities).toContain('chu_ky_thue');
    expect(normalizeVi('thuê ngắn ngày được không', NOW).ambiguities).toContain('chu_ky_thue');
    expect(normalizeVi('studio tầm 8 thôi', NOW).ambiguities).toContain('gia_khong_ro_don_vi');
    expect(normalizeVi('studio tầm 8 triệu', NOW).ambiguities).toEqual([]);
    expect(normalizeVi('2pn cho 3 nguoi tang 8', NOW).ambiguities).toEqual([]);
  });

  it.each([
    ['dọn vào hôm nay', '2026-10-16'],
    ['mai dọn vào được không', '2026-10-17'],
    ['cuối tuần này', '2026-10-17'],
    ['cuối tuần sau', '2026-10-24'],
    ['tuần sau', '2026-10-19'],
    ['tháng sau', '2026-11-01'],
    ['đầu tháng 11', '2026-11-01'],
    ['cuối tháng 2', '2027-02-28'],
    ['giữa tháng sau', '2026-11-15'],
    ['ngày 25/10', '2026-10-25'],
    ['ngày 5/10', '2027-10-05'],
    ['chuyển vào ngày 25', '2026-10-25'],
    ['dọn vào ngày 3', '2026-11-03'],
  ])('"%s" ⇒ %s (giờ Việt Nam)', (text, date) => {
    expect(normalizeVi(text, NOW).slots.moveInDate).toBe(date);
  });

  it('nửa đêm UTC vẫn tính đúng ngày Việt Nam (UTC+7)', () => {
    // 2026-10-16T18:30Z = 01:30 sáng 17/10 giờ VN ⇒ "hôm nay" = 17/10.
    expect(parseMoveIn('hom nay', new Date('2026-10-16T18:30:00.000Z')).date).toBe('2026-10-17');
  });

  it('không đổi câu không liên quan; mọi luật có mô tả cho người duyệt', () => {
    expect(normalizeVi('phí gửi xe máy bao nhiêu', NOW).applied).toEqual([]);
    expect(normalizeVi('điều hoà hỏng thì ai sửa', NOW).applied).toEqual([]);
    for (const r of VI_RULES) expect(r.vi.length).toBeGreaterThan(5);
  });
});
