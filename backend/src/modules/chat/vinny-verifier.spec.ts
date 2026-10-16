import { verifyReply, VerifySource } from './vinny-verifier';

const rec = (code: string, rank: number, allIn: number, rent: number) => ({
  unitCode: code,
  rank,
  allInCost: { baseRent: rent, managementFee: 446_500, parkingFee: 150_000, utilityCost: 600_000, allInTotal: allIn },
});
const SRC: VerifySource = {
  recommendations: [rec('VHOP-S1.02-0607', 1, 6_196_500, 5_000_000), rec('VHOP-S1.02-1001', 2, 6_196_500, 5_000_000), rec('VHOP-BE3-0804', 3, 7_196_500, 6_000_000)],
  evidence: [],
  userText: '1PN dưới 8 triệu',
  budget: 8_000_000,
  holdHours: 48,
};

describe('Verifier sau khi AI viết (3C.2 — chưa bật vào chat)', () => {
  it('câu đúng nguồn ⇒ pass', () => {
    const r = verifyReply('1. VHOP-S1.02-0607: All-in 6.196.500đ, thấp hơn ngân sách 1.803.500đ. 2. VHOP-S1.02-1001: All-in 6,2 triệu.', SRC);
    expect(r).toMatchObject({ ok: true, action: 'pass', issues: [] });
  });

  it('GIẢ LẬP AI BỊA một căn không có thật ⇒ chặn được, cắt đúng câu bịa', () => {
    const r = verifyReply('1. VHOP-S1.02-0607: All-in 6.196.500đ. 2. VHOP-S1.02-1001: All-in 6.196.500đ. Ngoài ra có căn VHOP-S9.99-9999 rất đẹp.', SRC);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([expect.objectContaining({ type: 'ma_can', value: 'VHOP-S9.99-9999' })]);
    expect(r.action).toBe('cut');
    expect(r.cleaned).not.toContain('S9.99');
    expect(r.cleaned).toContain('VHOP-S1.02-0607');
  });

  it('AI bịa giá ⇒ cắt câu sai; bịa gần hết câu ⇒ sinh lại', () => {
    const cut = verifyReply('VHOP-S1.02-0607 All-in 6.196.500đ. Căn VHOP-S1.02-1001 chỉ 3.900.000đ. Bạn xem thẻ căn nhé.', SRC);
    expect(cut).toMatchObject({ action: 'cut', issues: [expect.objectContaining({ type: 'gia', value: '3900000' })] });
    expect(verifyReply('Căn VHOP-S1.02-0607 chỉ 3.900.000đ.', SRC).action).toBe('regenerate');
  });

  it('nhắc căn sai thứ tự rank ⇒ sinh lại (không sửa bằng cắt câu)', () => {
    const r = verifyReply('1. VHOP-BE3-0804 tốt nhất. 2. VHOP-S1.02-0607.', SRC);
    expect(r).toMatchObject({ action: 'regenerate', issues: [expect.objectContaining({ type: 'thu_tu' })] });
  });

  it('SĐT / email / nhãn nội bộ ⇒ sinh lại', () => {
    expect(verifyReply('Gọi chủ nhà 0912 345 678 nhé.', SRC).action).toBe('regenerate');
    expect(verifyReply('Theo TRẠNG_THÁI: khách chưa đăng nhập.', SRC).action).toBe('regenerate');
  });

  it('giờ giữ căn phải khớp hold-policy; ngày phải có nguồn', () => {
    expect(verifyReply('Cọc xong giữ căn 72 giờ.', SRC).issues).toEqual([expect.objectContaining({ type: 'gio_giu', value: '72' })]);
    expect(verifyReply('Cọc xong giữ căn 48 giờ.', SRC).ok).toBe(true);
    expect(verifyReply('Unit is held for 24 hours after payment.', SRC).issues[0]).toMatchObject({ type: 'gio_giu' });
    const withSlot = { ...SRC, evidence: [{ bookings: [{ ref: 'VS-AB12C', slot: '2026-10-17T03:30:00.000Z' }] }] };
    expect(verifyReply('Lịch của bạn ngày 17/10.', withSlot).ok).toBe(true);
    expect(verifyReply('Lịch của bạn ngày 20/10.', withSlot).issues[0]).toMatchObject({ type: 'ngay', value: '20/10' });
    // 17:30Z ngày 16/10 = 00:30 ngày 17/10 giờ Việt Nam.
    const late = { ...SRC, evidence: [{ bookings: [{ slot: '2026-10-16T17:30:00.000Z' }] }] };
    expect(verifyReply('Lịch của bạn ngày 17/10.', late).ok).toBe(true);
  });

  it('mã căn khách tự gõ / có trong kết quả công cụ ⇒ không phải bịa', () => {
    const src = { ...SRC, recommendations: [], userText: 'căn VHOP-S1.02-0701 giá bao nhiêu', evidence: [{ found: true, code: 'VHOP-S1.02-0701', rent: 8_500_000 }] };
    expect(verifyReply('Căn VHOP-S1.02-0701 thuê 8.500.000đ/tháng.', src).ok).toBe(true);
  });
});
