import { depositDiscount, fastCloseQuote, fastCloseQuotes } from './fast-close';
import { evaluateMoveIn, moveInWindow } from '../contract/move-in';

describe('fast-close — công thức chốt nhanh', () => {
  const src = { rent: 6_500_000, deposit: 6_500_000, floorRent: 6_000_000 };
  it('3 nấc giá thuê theo chu kỳ, làm tròn 50k, kẹp ≥ giá sàn và ≤ giá chào', () => {
    expect(fastCloseQuotes(src).map((q) => [q.cycle, q.rent, q.rentDiscountPct])).toEqual([[1, 6_250_000, 3.8], [3, 6_150_000, 5.4], [6, 6_000_000, 7.7]]);
    expect(fastCloseQuote({ ...src, floorRent: 3_000_000 }, 6)!.rent).toBe(5_850_000); // −10% khi sàn thấp
  });
  it('chưa ủy quyền / giá sàn không hợp lệ ⇒ không có chốt nhanh', () => {
    expect(fastCloseQuotes({ ...src, floorRent: null })).toEqual([]);
    expect(fastCloseQuote({ ...src, floorRent: 7_000_000 }, 1)).toBeNull(); // sàn > giá chào
  });
  it('giảm cọc ~5% làm tròn 50k, ≥ 200k nhưng ≤ 8% cọc', () => {
    expect(depositDiscount(6_500_000)).toBe(350_000);
    expect(depositDiscount(20_000_000)).toBe(1_000_000);
    expect(depositDiscount(3_000_000)).toBe(200_000); // 5% = 150k ⇒ sàn 200k (≤ 8% = 240k)
    expect(depositDiscount(2_000_000)).toBe(150_000); // 8% = 160k ⇒ chặn 150k (bội 50k)
  });
});

describe('move-in — Smart Move-in Window (giờ VN)', () => {
  const paid = new Date('2026-10-13T17:30:00Z'); // 00:30 ngày 14/10 giờ VN ⇒ T0 = 14/10
  it('T0 theo giờ VN; sớm nhất +2, miễn phí tới +7, muộn nhất +30', () => {
    expect(moveInWindow(paid)).toEqual({ depositDate: '2026-10-14', earliest: '2026-10-16', freeUntil: '2026-10-21', latest: '2026-11-13' });
  });
  it('trong khung miễn phí ⇒ tính tiền từ ngày dọn vào; sau 7 ngày ⇒ từ T0+7; ngoài khung / sai ngày ⇒ lỗi', () => {
    expect(evaluateMoveIn(paid, '2026-10-18')).toMatchObject({ ok: true, billingStartDate: '2026-10-18', freeHolding: true });
    expect(evaluateMoveIn(paid, '2026-10-21')).toMatchObject({ ok: true, billingStartDate: '2026-10-21', freeHolding: true });
    expect(evaluateMoveIn(paid, '2026-11-01')).toMatchObject({ ok: true, moveInDate: '2026-11-01', billingStartDate: '2026-10-21', freeHolding: false });
    for (const bad of ['2026-10-15', '2026-11-14', '2026-02-30', '14/10/2026']) expect(evaluateMoveIn(paid, bad).ok).toBe(false);
  });
});
