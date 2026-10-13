import { Prisma } from '@prisma/client';
import { HostService } from './host.service';

const D = (v: number) => new Prisma.Decimal(v);
const payout = (transRef: string, amount: number) => ({
  id: transRef,
  amount: D(amount),
  period: '2026-W41',
  status: 'PENDING',
  transRef,
  createdAt: new Date('2026-10-05T03:00:00Z'),
});

function build(roles: string[], payouts: any[]) {
  const prisma: any = {
    fieldHost: {
      findUnique: jest.fn(async () => ({
        id: 'h1',
        rating: D(4.9),
        roles,
        walletBalance: D(0),
        profile: { fullName: 'An' },
        payouts,
      })),
    },
    feeConfig: {
      findMany: jest.fn(async () => [
        { configKey: 'host_base_viewing_fee', paramValue: 50000 },
        { configKey: 'host_deal_commission', paramValue: 400000 },
        { configKey: 'host_rating_multiplier_5star', paramValue: 1.2 },
      ]),
    },
    viewing: {
      findMany: jest.fn(async () => [{ tenantRating: 5 }, { tenantRating: 4 }]),
    },
    holdingDeposit: {
      findMany: jest.fn(async () => [
        { id: 'd1', depositCode: 'DEP-1', paidAt: new Date('2026-10-05T02:00:00Z'), paymentStatus: 'CONVERTED_TO_CONTRACT', unit: { unitCode: 'U2', floorNumber: 5, building: { buildingCode: 'S2.01' } }, viewing: { bookingRefCode: 'VS-002', contactName: 'Chi' } },
      ]),
    },
  };
  return new HostService(prisma, {} as any);
}

describe('HostService.getEarnings — tách khoản thu nhập', () => {
  const rows = [
    payout('viewing:v1', 50000),
    payout('deposit:d1', 400000),
    payout('deposit:d1:rating', 80000),
    payout('deposit:d1:campaign', 200000),
    payout('inspection:m1', 150000),
    payout('inspection:m2', 150000),
  ];

  it('Sale + Thẩm định: có thêm khoản thù lao thẩm định, không lẫn vào hoa hồng/lượt dẫn', async () => {
    const r: any = await build(['SALE', 'INSPECTOR'], rows).getEarnings('p1');
    expect(r.roles).toEqual(['sale', 'inspector']);
    expect(r.stats).toEqual(
      expect.objectContaining({
        totalViewings: 1,
        totalDeals: 1,
        dealCommissionTotal: 400000,
        viewingFeeTotal: 50000,
        ratingBonus: 80000,
        campaignBonus: 200000,
        totalInspections: 2,
        inspectionFeeTotal: 300000,
        totalEarnings: 1030000,
      }),
    );
  });

  it('Sale thường: không có khoản thẩm định', async () => {
    const r: any = await build(['SALE'], rows.slice(0, 4)).getEarnings('p1');
    expect(r.roles).toEqual(['sale']);
    expect(r.stats).toEqual(expect.objectContaining({ totalInspections: 0, inspectionFeeTotal: 0 }));
  });

  it('trả biểu phí, điểm trung bình thật, số tuần hiện tại và danh sách deal gộp theo cọc', async () => {
    const r: any = await build(['SALE', 'INSPECTOR'], rows).getEarnings('p1', new Date('2026-10-07T03:00:00Z'));
    expect(r.fees).toEqual(expect.objectContaining({ baseViewingFee: 50000, dealCommission: 400000, ratingMultiplier: 1.2, campaignBonus: null }));
    expect(r.ratingAvg).toBe(4.5);
    expect(r.ratingCount).toBe(2);
    expect(r.week).toEqual(expect.objectContaining({ period: '2026-W41', totalEarnings: 1030000, ratingBonusCount: 1 }));
    expect(r.deals).toEqual([
      {
        depositId: 'd1',
        unit: 'S2.01 · Tầng 5 · U2',
        tenantName: 'Chi',
        depositCode: 'DEP-1',
        paidAt: '2026-10-05T02:00:00.000Z',
        status: 'CONVERTED_TO_CONTRACT',
        commission: 480000,
        campaignBonus: 200000,
        href: '/host/viewing/VS-002',
      },
    ]);
    expect(r).not.toHaveProperty('payouts');
  });

  it('khoản sang tuần khác không lọt vào số tuần hiện tại', async () => {
    const r: any = await build(['SALE'], rows.slice(0, 2)).getEarnings('p1', new Date('2026-10-20T03:00:00Z'));
    expect(r.week).toEqual(expect.objectContaining({ period: '2026-W43', totalEarnings: 0, totalViewings: 0 }));
    expect(r.stats.totalEarnings).toBe(450000);
  });
});
