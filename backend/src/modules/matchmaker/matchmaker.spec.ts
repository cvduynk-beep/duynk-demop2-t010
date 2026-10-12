import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MatchmakerRequestDto } from './dto/matchmaker-request.dto';
import { MatchmakerService } from './matchmaker.service';

const mkUnit = (i: number, extra: object = {}) => ({
  id: `u${i}`,
  code: `VHOP-T-${String(i).padStart(4, '0')}`,
  building: 'S1.02',
  zoneName: 'S1',
  layout: 'STUDIO',
  areaM2: 30,
  rent: 6_000_000 + i * 100_000,
  managementFee: 300_000,
  marketAvg: 8_000_000,
  photos: [],
  floor: 5,
  furnishing: 'full',
  items: ['ac'],
  petFriendly: false,
  ...extra,
});

function makeService(n: number) {
  const units = Array.from({ length: n }, (_, i) => mkUnit(i + 1));
  const prisma = {} as any;
  const property = { getUnits: jest.fn().mockResolvedValue(units) } as any;
  return new MatchmakerService(prisma, property);
}

const body = (extra: object = {}) => plainToInstance(MatchmakerRequestDto, { maxAllInBudget: 30_000_000, ...extra });

describe('MatchmakerService limit / totalMatched', () => {
  it('mặc định limit = 3, totalMatched = số căn khớp trước khi cắt', async () => {
    const res = await makeService(8).findTopRecommendations(body());
    expect(res.topRecommendations).toHaveLength(3);
    expect(res.scanSummary.totalMatched).toBe(8);
    expect(res.scanSummary.matchedUnits).toBe(3);
    expect(res.scanSummary.totalScannedUnits).toBe(8);
  });

  it('limit=20 trả nhiều hơn 3, giữ thứ tự xếp hạng', async () => {
    const res = await makeService(8).findTopRecommendations(body({ limit: 20 }));
    expect(res.topRecommendations).toHaveLength(8);
    expect(res.scanSummary.totalMatched).toBe(8);
    expect(res.topRecommendations.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('totalMatched chỉ đếm căn không vượt ngân sách', async () => {
    const res = await makeService(8).findTopRecommendations(body({ limit: 20, maxAllInBudget: 7_700_000 }));
    expect(res.scanSummary.totalMatched).toBe(res.topRecommendations.length);
    expect(res.scanSummary.totalMatched).toBeLessThan(8);
  });
});

describe('MatchmakerRequestDto limit validation', () => {
  it.each([0, 101, 1.5, 'abc'])('limit=%p bị từ chối', async (limit) => {
    const errs = await validate(body({ limit }));
    expect(errs.map((e) => e.property)).toContain('limit');
  });
  it.each([undefined, 1, 20, 50, 100])('limit=%p hợp lệ', async (limit) => {
    expect(await validate(body({ limit }))).toHaveLength(0);
  });
});

describe('MatchmakerService bộ lọc mở rộng (khung chat)', () => {
  const units = [
    mkUnit(1, { building: 'S1.02', floor: 25, layout: '2PN', items: ['ac', 'fridge'], petFriendly: true }),
    mkUnit(2, { building: 'S2.05', floor: 8, layout: '2PN' }),
    mkUnit(3, { building: 'ZR1', floor: 22, layout: 'Studio', furnishing: 'basic' }),
  ];
  const svc = () => new MatchmakerService({} as any, { getUnits: jest.fn().mockResolvedValue(units) } as any);

  it('không có ngân sách ⇒ không loại căn nào, vẫn xếp hạng', async () => {
    const res = await svc().findTopRecommendations(plainToInstance(MatchmakerRequestDto, { limit: 10 }));
    expect(res.topRecommendations).toHaveLength(3);
    expect(res.scanSummary.eliminatedUnits).toBe(0);
  });

  it('lọc phân khu + tầng + đồ dùng + thú cưng', async () => {
    const res = await svc().findTopRecommendations(
      plainToInstance(MatchmakerRequestDto, { zones: ['sapphire1'], floor: 'high', items: ['fridge'], pets: true, limit: 10 }),
    );
    expect(res.topRecommendations.map((r) => r.unitCode)).toEqual(['VHOP-T-0001']);
    expect(res.scanSummary.totalScannedUnits).toBe(3);
    expect(res.scanSummary.eliminatedUnits).toBe(2);
  });

  it('toà ưu tiên hơn phân khu; layouts nhiều giá trị', async () => {
    const res = await svc().findTopRecommendations(
      plainToInstance(MatchmakerRequestDto, { zones: ['sapphire1'], buildings: ['ZR1'], layouts: ['Studio', '2PN'], limit: 10 }),
    );
    expect(res.topRecommendations.map((r) => r.unitCode)).toEqual(['VHOP-T-0003']);
  });

  it('score = % tiết kiệm; thứ tự theo score giảm dần rồi All-in tăng dần', async () => {
    const res = await svc().findTopRecommendations(plainToInstance(MatchmakerRequestDto, { limit: 10 }));
    const recs = res.topRecommendations;
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
      if (recs[i - 1].score === recs[i].score) {
        expect(recs[i - 1].allInCost.allInTotal).toBeLessThanOrEqual(recs[i].allInCost.allInTotal);
      }
    }
    expect(recs.every((r) => r.score === r.comparison.savingPercentage)).toBe(true);
  });

  it('DTO từ chối giá trị lạ', async () => {
    const errs = await validate(plainToInstance(MatchmakerRequestDto, { zones: ['hanoi'], floor: 'top', layouts: ['4PN'] }));
    expect(errs.map((e) => e.property).sort()).toEqual(['floor', 'layouts', 'zones']);
  });
});

describe('MatchmakerService đọc biểu phí từ fee_configs', () => {
  const unit = mkUnit(1, { rent: 6_000_000, managementFee: 300_000 });
  const svcWith = (findMany: jest.Mock) =>
    new MatchmakerService({ feeConfig: { findMany } } as any, { getUnits: jest.fn().mockResolvedValue([unit]) } as any);

  it('dùng đơn giá trong DB cho gửi xe + điện nước', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { configKey: 'parking_fee_motorbike', paramValue: '200000' },
      { configKey: 'parking_fee_car', paramValue: '1500000' },
      { configKey: 'utility_per_person', paramValue: '350000' },
    ]);
    const res = await svcWith(findMany).findTopRecommendations(plainToInstance(MatchmakerRequestDto, { motorbikes: 2, cars: 1, occupants: 3 }));
    expect(res.topRecommendations[0].allInCost).toEqual({
      baseRent: 6_000_000,
      managementFee: 300_000,
      parkingFee: 2 * 200_000 + 1_500_000,
      utilityCost: 3 * 350_000,
      allInTotal: 6_000_000 + 300_000 + 1_900_000 + 1_050_000,
    });
  });

  it('thiếu khoá / DB lỗi ⇒ dùng giá trị dự phòng, không gãy', async () => {
    const partial = jest.fn().mockResolvedValue([{ configKey: 'parking_fee_motorbike', paramValue: '180000' }]);
    const a = await svcWith(partial).findTopRecommendations(plainToInstance(MatchmakerRequestDto, { occupants: 2 }));
    expect(a.topRecommendations[0].allInCost).toMatchObject({ parkingFee: 180_000, utilityCost: 600_000 });
    const down = jest.fn().mockRejectedValue(new Error('db down'));
    const b = await svcWith(down).findTopRecommendations(plainToInstance(MatchmakerRequestDto, { occupants: 2 }));
    expect(b.topRecommendations[0].allInCost).toMatchObject({ parkingFee: 150_000, utilityCost: 600_000 });
  });

  it('cache 60s: không đọc DB mỗi lượt', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = svcWith(findMany);
    await svc.findTopRecommendations(plainToInstance(MatchmakerRequestDto, {}));
    await svc.findTopRecommendations(plainToInstance(MatchmakerRequestDto, {}));
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
