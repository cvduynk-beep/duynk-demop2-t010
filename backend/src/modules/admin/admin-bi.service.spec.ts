import { BadRequestException } from '@nestjs/common';
import { AdminBiService } from './admin-bi.service';
import { parseReportRange } from './admin-range';

// ─── Prisma giả: so khớp `where` thật (=, in, not, gte/lt, quan hệ lồng nhau) để test đúng điều kiện truy vấn ──────
const OPS = new Set(['in', 'not', 'gte', 'gt', 'lt', 'lte']);
const val = (v: any) => (v instanceof Date ? v.getTime() : v);
function cond(v: any, c: any): boolean {
  if (c === null || typeof c !== 'object' || c instanceof Date) return val(v) === val(c);
  if (!Object.keys(c).some((k) => OPS.has(k))) return v != null && typeof v === 'object' && matches(v, c);
  if ('in' in c && !c.in.includes(v)) return false;
  if ('not' in c && (c.not === null ? v == null : val(v) === val(c.not))) return false;
  if ('gte' in c && !(v != null && val(v) >= val(c.gte))) return false;
  if ('gt' in c && !(v != null && val(v) > val(c.gt))) return false;
  if ('lt' in c && !(v != null && val(v) < val(c.lt))) return false;
  if ('lte' in c && !(v != null && val(v) <= val(c.lte))) return false;
  return true;
}
function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, c]) => {
    if (k === 'OR') return (c as any[]).some((w) => matches(row, w));
    if (k === 'AND') return (c as any[]).every((w) => matches(row, w));
    return cond(row[k], c);
  });
}
function table(rows: any[]) {
  return {
    count: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length),
    findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    groupBy: jest.fn(async ({ by, where }: any) => {
      const groups = new Map<string, any>();
      for (const r of rows.filter((x) => matches(x, where))) {
        const key = by.map((b: string) => r[b]).join('|');
        const g = groups.get(key) ?? { ...Object.fromEntries(by.map((b: string) => [b, r[b]])), _count: 0 };
        g._count += 1;
        groups.set(key, g);
      }
      return [...groups.values()];
    }),
  };
}

const NOW = new Date('2026-10-13T10:00:00+07:00');
const RANGE = parseReportRange('2026-10-07', '2026-10-13', NOW);
const IN = new Date('2026-10-10T09:00:00+07:00'); // trong khoảng
const OUT = new Date('2026-10-01T09:00:00+07:00'); // ngoài khoảng

let seq = 0;
const viewing = (status: string, over: any = {}) => ({ id: `v${++seq}`, status, createdAt: IN, viewingSlot: OUT, lobbyCheckInAt: null, ...over });

function build(over: { viewings?: any[]; deposits?: Array<[string, any]>; contracts?: Array<[string, any]>; units?: any[] } = {}) {
  const viewings = over.viewings ?? [];
  const deposits = (over.deposits ?? []).map(([paymentStatus, v]) => ({ paymentStatus, viewing: v }));
  const contracts = (over.contracts ?? []).map(([status, v]) => ({ status, holdingDeposit: { viewing: v } }));
  const buildings = [
    { id: 'b1', buildingCode: 'S1.01', zoneName: 'The Sapphire 1' },
    { id: 'b2', buildingCode: 'S1.02', zoneName: 'The Sapphire 1' },
  ];
  const prisma: any = {
    viewing: table(viewings),
    holdingDeposit: table(deposits),
    contract: table(contracts),
    unit: table(over.units ?? []),
    building: table(buildings),
  };
  return { svc: new AdminBiService(prisma), prisma };
}
const unit = (buildingId: string, status: string) => ({ buildingId, status });

describe('admin-range — khoảng thời gian báo cáo (giờ Asia/Ho_Chi_Minh)', () => {
  it('mặc định 7 ngày gần nhất tính tới hôm nay theo giờ VN', () => {
    // 2026-10-12T20:00Z = 03:00 ngày 13/10 giờ VN
    const r = parseReportRange(undefined, undefined, new Date('2026-10-12T20:00:00Z'));
    expect([r.from, r.to, r.days]).toEqual(['2026-10-07', '2026-10-13', 7]);
    expect(r.start.toISOString()).toBe('2026-10-06T17:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-13T17:00:00.000Z');
  });

  it.each([
    ['2026-10-1', '2026-10-13', 'from'],
    ['2026-02-30', '2026-03-01', 'from'],
    ['2026-10-13', '2026-10-01', 'from'],
    ['2026-01-01', '2026-06-01', 'to'],
  ])('from=%s to=%s ⇒ 400 invalid_range (lỗi ở %s)', (from, to, field) => {
    try {
      parseReportRange(from, to, NOW);
      throw new Error('không ném lỗi');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.getResponse()).toMatchObject({ code: 'invalid_range', errors: { [field]: expect.any(String) } });
    }
  });

  it('đúng 90 ngày được chấp nhận, 91 thì không', () => {
    expect(parseReportRange('2026-07-16', '2026-10-13', NOW).days).toBe(90);
    expect(() => parseReportRange('2026-07-15', '2026-10-13', NOW)).toThrow(BadRequestException);
  });
});

describe('AdminBiService — phễu BI theo nhóm lịch xem', () => {
  it('chỉ đếm lịch xem TẠO trong khoảng (đi theo cùng nhóm qua các bước); bước 1–2 không có nguồn', async () => {
    const a = viewing('LEASED', { lobbyCheckInAt: IN });
    const b = viewing('HOLDING', { lobbyCheckInAt: IN });
    const c = viewing('COMPLETED', { lobbyCheckInAt: IN });
    const d = viewing('CONFIRMED');
    const cancelled = viewing('CANCELLED', { lobbyCheckInAt: IN });
    const old = viewing('LEASED', { createdAt: OUT, lobbyCheckInAt: OUT });
    const { svc } = build({
      viewings: [a, b, c, d, cancelled, old],
      deposits: [['CONVERTED_TO_CONTRACT', a], ['PAID_HOLDING', b], ['REFUNDED', c], ['CONVERTED_TO_CONTRACT', old]],
      contracts: [['ACTIVE', a], ['ACTIVE', old]],
    });
    const r = await svc.getBiFunnelAndHeatmap(RANGE, NOW);
    expect(r.range).toEqual({ from: '2026-10-07', to: '2026-10-13', timezone: 'Asia/Ho_Chi_Minh', days: 7 });
    expect(r.funnel.stages.map((s) => s.count)).toEqual([null, null, 4, 3, 2, 1]);
    expect(r.funnel.stages.map((s) => s.available)).toEqual([false, false, true, true, true, true]);
    expect(r.funnel.stages.map((s) => s.key)).toEqual(['visit', 'matchmaker', 'booked', 'checkin', 'deposit', 'signed']);
  });

  it('dropRate chỉ giữa hai bước liền kề đều có dữ liệu và bước trước > 0', async () => {
    const { svc } = build({ viewings: [viewing('CONFIRMED', { lobbyCheckInAt: IN }), viewing('CONFIRMED')] });
    const s = (await svc.getBiFunnelAndHeatmap(RANGE, NOW)).funnel.stages;
    expect(s.map((x) => x.dropRate)).toEqual([null, null, null, 50, 100, null]);
  });

  it('DB rỗng ⇒ số 0 thật (không phải null) cho bước có nguồn; tỷ lệ chia cho 0 ⇒ null', async () => {
    const r = await build().svc.getBiFunnelAndHeatmap(RANGE, NOW);
    expect(r.funnel.stages.map((s) => s.count)).toEqual([null, null, 0, 0, 0, 0]);
    expect(r.funnel.noShowRate).toBeNull();
    expect(r.portfolioStatus.occupancyRate).toBeNull();
    expect(r.dailyBookings).toHaveLength(7);
    expect(r.dailyBookings.every((d) => d.count === 0)).toBe(true);
  });

  it('noShowRate = NO_SHOW / (COMPLETED + NO_SHOW + LEASED + HOLDING + CLOSING) của nhóm', async () => {
    const r = await build({
      viewings: [
        viewing('NO_SHOW'),
        viewing('COMPLETED'),
        viewing('LEASED'),
        viewing('HOLDING'),
        viewing('CLOSING'),
        viewing('CONFIRMED'), // chưa tới giờ xem ⇒ không vào mẫu số
        viewing('NO_SHOW', { createdAt: OUT }), // ngoài khoảng
      ],
    }).svc.getBiFunnelAndHeatmap(RANGE, NOW);
    expect([r.funnel.noShowCount, r.funnel.noShowDenominator, r.funnel.noShowRate]).toEqual([1, 5, 20]);
    expect(r.funnel.avgDecisionTimeMinutes).toBeNull();
    expect(r.funnel.avgDecisionTimeAvailable).toBe(false);
  });

  it('dailyBookings: đủ từng ngày của khoảng theo giờ VN, kể cả ngày 0 lịch, bỏ lịch đã huỷ', async () => {
    const { svc } = build({
      viewings: [
        viewing('CONFIRMED', { createdAt: new Date('2026-10-13T00:30:00+07:00') }),
        viewing('COMPLETED', { createdAt: new Date('2026-10-12T23:59:00+07:00') }),
        viewing('CONFIRMED', { createdAt: new Date('2026-10-12T08:00:00+07:00') }),
        viewing('CANCELLED', { createdAt: new Date('2026-10-13T09:00:00+07:00') }),
        viewing('CONFIRMED', { createdAt: new Date('2026-10-06T23:59:00+07:00') }), // ngày trước khoảng
      ],
    });
    const r = await svc.getBiFunnelAndHeatmap(RANGE, NOW);
    expect(r.dailyBookings.map((d) => d.date)).toEqual([
      '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13',
    ]);
    expect(r.dailyBookings.at(-1)).toEqual({ date: '2026-10-13', count: 1 });
    expect(r.dailyBookings.at(-2)).toEqual({ date: '2026-10-12', count: 2 });
  });

  it('lịch xem hôm nay / hôm qua theo giờ hẹn (viewingSlot) giờ VN, bỏ lịch huỷ, không phụ thuộc khoảng', async () => {
    const r = await build({
      viewings: [
        viewing('CONFIRMED', { createdAt: OUT, viewingSlot: new Date('2026-10-13T00:00:00+07:00') }),
        viewing('PENDING_CONFIRMATION', { viewingSlot: new Date('2026-10-13T23:59:00+07:00') }),
        viewing('CANCELLED', { viewingSlot: new Date('2026-10-13T15:00:00+07:00') }),
        viewing('COMPLETED', { viewingSlot: new Date('2026-10-12T15:00:00+07:00') }),
        viewing('CONFIRMED', { viewingSlot: new Date('2026-10-14T00:00:00+07:00') }),
      ],
    }).svc.getBiFunnelAndHeatmap(RANGE, NOW);
    expect(r.viewingsToday).toEqual({ date: '2026-10-13', today: 2, yesterday: 1 });
  });

  it('heatmap & rổ hàng đếm ở DB; lấp đầy = RENTED / TẤT CẢ căn (gồm UNLISTED/MAINTENANCE)', async () => {
    const { svc, prisma } = build({
      units: [
        unit('b1', 'RENTED'), unit('b1', 'RENTED'), unit('b1', 'RENTED'), unit('b1', 'RENTED'), unit('b1', 'AVAILABLE'),
        unit('b2', 'RENTED'), unit('b2', 'HOLDING'), unit('b2', 'UNLISTED'), unit('b2', 'MAINTENANCE'), unit('b2', 'AVAILABLE'),
      ],
    });
    const r = await svc.getBiFunnelAndHeatmap(RANGE, NOW);
    const byB = Object.fromEntries(r.occupancyHeatmap.map((h) => [h.buildingCode, h]));
    expect(byB['S1.01']).toEqual(expect.objectContaining({ total: 5, rented: 4, occupancyRate: 80, alert: 'NORMAL' }));
    expect(byB['S1.02']).toEqual(expect.objectContaining({ total: 5, rented: 1, occupancyRate: 20, alert: 'ATTENTION_NEEDED' }));
    expect(r.portfolioStatus).toEqual({
      totalUnits: 10, rentedUnits: 5, holdingUnits: 1, availableUnits: 2, unlistedUnits: 1, maintenanceUnits: 1, occupancyRate: 50,
    });
    expect(prisma.unit.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.unit.findMany).not.toHaveBeenCalled(); // không tải toàn bộ căn lên
  });

  it('lỗi DB thành lỗi, không trả số giả', async () => {
    const { svc, prisma } = build();
    prisma.viewing.count.mockRejectedValue(new Error('db down'));
    await expect(svc.getBiFunnelAndHeatmap(RANGE, NOW)).rejects.toThrow('db down');
  });
});
