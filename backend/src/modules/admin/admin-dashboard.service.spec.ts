import { BadRequestException } from '@nestjs/common';
import { AdminDashboardService, parseActivityLimit } from './admin-dashboard.service';

const NOW = new Date('2026-10-13T03:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const meta = (stage: string | undefined, inspectDueAt?: string) => ({ consignment: { form: { building: 'S1.01' }, stage, inspectDueAt } });

function build(opts: { mandates?: any[]; exiting?: number; registry?: any[]; audit?: any[] } = {}) {
  const audit = opts.audit ?? [];
  const prisma: any = {
    exclusiveMandate: {
      findMany: jest.fn(async () => opts.mandates ?? []),
      count: jest.fn(async () => opts.exiting ?? 0),
    },
    auditLog: {
      // Mô phỏng đúng where con trỏ + orderBy (createdAt desc, id desc) + take.
      findMany: jest.fn(async ({ where, take }: any) => {
        const sorted = [...audit].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
        const ok = (r: any) =>
          !where ||
          where.OR.some((w: any) =>
            w.id ? r.createdAt.getTime() === w.createdAt.getTime() && r.id < w.id.lt : r.createdAt < w.createdAt.lt,
          );
        return sorted.filter(ok).slice(0, take);
      }),
    },
  };
  const dispatch = { getSlaSummary: jest.fn(async () => ({ actionable: { manualDispatch: 2, overSla: 3 } })) };
  const registry = { list: jest.fn(async () => opts.registry ?? []) };
  return { svc: new AdminDashboardService(prisma, dispatch as any, registry as any), prisma, dispatch };
}

describe('AdminDashboardService — việc cần xử lý', () => {
  it('đếm phía server: điều phối, hồ sơ ký gửi chờ phân Host / quá hạn 2h, căn đang thoát, sổ hợp đồng', async () => {
    const { svc, prisma } = build({
      mandates: [
        { status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: meta('awaiting_host', hoursFromNow(1)) },
        { status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: meta('awaiting_host', hoursFromNow(-1)) },
        { status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: meta(undefined) }, // không có stage ⇒ awaiting_host
        { status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: meta('inspecting', hoursFromNow(-3)) },
        { status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: meta('awaiting_landlord', hoursFromNow(-3)) },
      ],
      exiting: 4,
      registry: [
        { kind: 'lease', needsAction: 'Sắp hết hạn' },
        { kind: 'lease', needsAction: 'Tranh chấp' },
        { kind: 'mandate', needsAction: 'Quá hạn thoát' },
        { kind: 'deposit', needsAction: null },
      ],
    });
    const r = await svc.getWorkItems(NOW);
    expect(r).toEqual({
      generatedAt: NOW.toISOString(),
      dispatch: { manualDispatch: 2, overSla: 3 },
      consignments: { awaitingHost: 3, overdue: 2, total: 4 }, // 1 hồ sơ vừa chờ vừa quá hạn ⇒ không đếm trùng
      mandatesExiting: 4,
      contracts: { needsAction: 3, byKind: { lease: 2, mandate: 1 } },
    });
    // Chỉ hồ sơ đã ký (bản nháp chưa ký không phải yêu cầu thật).
    expect(prisma.exclusiveMandate.findMany.mock.calls[0][0].where).toEqual({ status: 'PENDING_INSPECTION', signedAt: { not: null } });
    expect(prisma.exclusiveMandate.count.mock.calls[0][0].where).toEqual({ status: 'EXIT_REQUESTED' });
  });

  it('không có việc ⇒ toàn số 0 thật', async () => {
    const { svc, dispatch } = build();
    dispatch.getSlaSummary.mockResolvedValue({ actionable: { manualDispatch: 0, overSla: 0 } });
    const r = await svc.getWorkItems(NOW);
    expect(r.consignments).toEqual({ awaitingHost: 0, overdue: 0, total: 0 });
    expect(r.contracts).toEqual({ needsAction: 0, byKind: {} });
    expect(r.mandatesExiting).toBe(0);
  });

  it('lỗi nguồn nào cũng thành lỗi, không trả số giả', async () => {
    const { svc, dispatch } = build();
    dispatch.getSlaSummary.mockRejectedValue(new Error('db down'));
    await expect(svc.getWorkItems(NOW)).rejects.toThrow('db down');
  });
});

describe('AdminDashboardService — dòng sự kiện (audit log)', () => {
  const row = (id: string, minute: number) => ({
    id,
    actionType: 'DISPATCH_REASSIGNED',
    entityName: 'viewings',
    entityId: `e-${id}`,
    actorRole: 'ops_admin',
    createdAt: new Date(NOW.getTime() - minute * 60_000),
    actor: { fullName: 'Admin A' },
    oldValue: { phone: '0900000000' },
    newValue: { phone: '0911111111' },
    ipAddress: '10.0.0.1',
  });

  it('phân trang con trỏ giảm dần, không lặp/không sót kể cả khi trùng createdAt; không lộ giá trị cũ/mới, IP', async () => {
    const audit = [row('a', 1), row('b', 2), row('c', 2), row('d', 3), row('e', 4)];
    const { svc, prisma } = build({ audit });
    const p1 = await svc.getActivity(2);
    expect(p1.items.map((i) => i.id)).toEqual(['a', 'c']);
    const p2 = await svc.getActivity(2, p1.nextCursor!);
    expect(p2.items.map((i) => i.id)).toEqual(['b', 'd']);
    const p3 = await svc.getActivity(2, p2.nextCursor!);
    expect([p3.items.map((i) => i.id), p3.nextCursor]).toEqual([['e'], null]);

    expect(Object.keys(p1.items[0]).sort()).toEqual(['actionType', 'actorName', 'actorRole', 'createdAt', 'entityId', 'entityName', 'id']);
    expect(JSON.stringify([p1, p2, p3])).not.toMatch(/0900000000|0911111111|10\.0\.0\.1/);
    // select chỉ xin đúng các cột được trả ra
    const select = prisma.auditLog.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('oldValue');
    expect(select).not.toHaveProperty('newValue');
    expect(select).not.toHaveProperty('ipAddress');
    expect(select).not.toHaveProperty('userAgent');
  });

  it('bảng rỗng ⇒ danh sách rỗng, không có trang sau', async () => {
    expect(await build().svc.getActivity(20)).toEqual({ items: [], nextCursor: null });
  });

  it('con trỏ hỏng ⇒ 400 invalid_cursor; limit ngoài 1–50 ⇒ 400 theo field', async () => {
    await expect(build().svc.getActivity(20, 'rác')).rejects.toBeInstanceOf(BadRequestException);
    expect(parseActivityLimit(undefined)).toBe(20);
    expect(parseActivityLimit('50')).toBe(50);
    for (const bad of ['0', '51', '1.5', 'abc', '-3']) {
      try {
        parseActivityLimit(bad);
        throw new Error('không ném lỗi');
      } catch (e: any) {
        expect(e.getResponse()).toMatchObject({ errors: { limit: expect.any(String) } });
      }
    }
  });
});
