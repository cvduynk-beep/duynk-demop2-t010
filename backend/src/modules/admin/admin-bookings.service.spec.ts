import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminBookingsService, ticketVersion } from './admin-bookings.service';

// ─── Prisma giả: dữ liệu chuẩn hoá + so khớp `where` thật + transaction có rollback ─────────────────────────────
const OPS = new Set(['in', 'not', 'gte', 'gt', 'lt', 'lte', 'contains', 'mode']);
const v = (x: any) => (x instanceof Date ? x.getTime() : x);
function cond(val: any, c: any): boolean {
  if (c === null || typeof c !== 'object' || c instanceof Date) return v(val) === v(c);
  if (!Object.keys(c).some((k) => OPS.has(k))) return val != null && typeof val === 'object' && matches(val, c);
  if ('in' in c && !c.in.includes(val)) return false;
  if ('not' in c && (c.not === null ? val == null : v(val) === v(c.not))) return false;
  if ('gte' in c && !(val != null && v(val) >= v(c.gte))) return false;
  if ('gt' in c && !(val != null && v(val) > v(c.gt))) return false;
  if ('lt' in c && !(val != null && v(val) < v(c.lt))) return false;
  if ('lte' in c && !(val != null && v(val) <= v(c.lte))) return false;
  if ('contains' in c && !String(val ?? '').toLowerCase().includes(String(c.contains).toLowerCase())) return false;
  return true;
}
function matches(row: any, where: any = {}): boolean {
  return Object.entries(where ?? {}).every(([k, c]) => {
    if (k === 'OR') return (c as any[]).some((w) => matches(row, w));
    if (k === 'AND') return (c as any[]).every((w) => matches(row, w));
    return cond(row[k], c);
  });
}
const tick = () => new Promise((r) => setImmediate(r)); // cho các lời gọi song song xen kẽ như DB thật

const NOW = new Date('2026-10-13T03:00:00Z'); // 10:00 giờ VN
const ago = (s: number) => new Date(NOW.getTime() - s * 1000);
const ACTOR = { id: 'a0000000-0000-4000-8000-000000000001', role: 'ops_admin' };
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';

function world() {
  const buildings = { b1: { id: 'b1', buildingCode: 'S1.02', zoneName: 'The Sapphire 1' } };
  const units = { u1: { id: 'u1', unitCode: 'VHOP-S1.02-1208', buildingId: 'b1' } };
  const profiles: Record<string, any> = {
    p1: { id: 'p1', fullName: 'Host Cũ', isActive: true },
    p2: { id: 'p2', fullName: 'Host Mới', isActive: true },
    p3: { id: 'p3', fullName: 'Host Nghỉ', isActive: true },
    p4: { id: 'p4', fullName: 'Host Bị Khoá', isActive: false },
    p5: { id: 'p5', fullName: 'Host Thẩm Định', isActive: true },
    p6: { id: 'p6', fullName: 'Host Phân Khu Khác', isActive: true },
    p7: { id: 'p7', fullName: 'Host Bận', isActive: true },
    t1: { id: 't1', fullName: 'Khách Profile', isActive: true },
  };
  const hosts: Record<string, any> = {
    'h-old': { id: 'h-old', profileId: 'p1', dutyStatus: 'ONLINE_AVAILABLE', roles: ['SALE'], assignedZone: 'The Sapphire 1 (S1.01 - S1.06)' },
    'h-new': { id: 'h-new', profileId: 'p2', dutyStatus: 'ONLINE_AVAILABLE', roles: ['SALE', 'INSPECTOR'], assignedZone: 'The Sapphire 1' },
    'h-off': { id: 'h-off', profileId: 'p3', dutyStatus: 'OFF_DUTY', roles: ['SALE'], assignedZone: 'The Sapphire 1' },
    'h-locked': { id: 'h-locked', profileId: 'p4', dutyStatus: 'ONLINE_AVAILABLE', roles: ['SALE'], assignedZone: 'The Sapphire 1' },
    'h-insp': { id: 'h-insp', profileId: 'p5', dutyStatus: 'ONLINE_AVAILABLE', roles: ['INSPECTOR'], assignedZone: 'The Sapphire 1' },
    'h-far': { id: 'h-far', profileId: 'p6', dutyStatus: 'ONLINE_AVAILABLE', roles: ['SALE'], assignedZone: 'The Sapphire 2' },
    'h-busy': { id: 'h-busy', profileId: 'p7', dutyStatus: 'ONLINE_AVAILABLE', roles: ['SALE'], assignedZone: 'The Sapphire 1' },
  };
  const viewings: Record<string, any> = {
    [V1]: { id: V1, bookingRefCode: 'VS-0001', unitId: 'u1', tenantId: 't1', viewingSlot: new Date('2026-10-13T07:00:00Z'), status: 'CONFIRMED', createdAt: ago(3600), contactName: 'Nguyễn Khách', contactPhoneEnc: 'enc:+84912345678' },
    // Lịch khác của Host "bận", giờ hẹn cách V1 30 phút ⇒ trùng ca
    [V2]: { id: V2, bookingRefCode: 'VS-0002', unitId: 'u1', tenantId: 't1', viewingSlot: new Date('2026-10-13T07:30:00Z'), status: 'CONFIRMED', createdAt: ago(7200), contactName: null, contactPhoneEnc: null },
  };
  const tickets: Record<string, any> = {
    tk1: { id: 'tk1', viewingId: V1, hostId: 'h-old', tier: 2, slaSeconds: 180, status: 'OFFERED', offeredAt: ago(400), acceptedAt: null },
    tk2: { id: 'tk2', viewingId: V2, hostId: 'h-busy', tier: 1, slaSeconds: 300, status: 'ACCEPTED', offeredAt: ago(900), acceptedAt: ago(800) },
  };
  const audits: any[] = [];
  return { buildings, units, profiles, hosts, viewings, tickets, audits };
}

function build(mut: (w: ReturnType<typeof world>) => void = () => {}) {
  const w = world();
  mut(w);
  const hostView = (h: any) => h && { ...h, profile: w.profiles[h.profileId] };
  const ticketView = (t: any) => ({ ...t, host: t.hostId ? hostView(w.hosts[t.hostId]) : null, viewing: viewingBase(w.viewings[t.viewingId]) });
  const viewingBase = (x: any) => x && { ...x, unit: { ...w.units[x.unitId], building: w.buildings[w.units[x.unitId].buildingId] } };
  const viewingFull = (x: any) =>
    x && { ...viewingBase(x), tenant: w.profiles[x.tenantId], tickets: Object.values(w.tickets).filter((t: any) => t.viewingId === x.id).map(ticketView) };
  const failAudit = { on: false };

  const db: any = {
    viewing: {
      findUnique: jest.fn(async ({ where }: any) => (await tick(), viewingFull(w.viewings[where.id]) ?? null)),
      count: jest.fn(async ({ where }: any) => Object.values(w.viewings).map(viewingBase).filter((x) => matches(x, where)).length),
      findMany: jest.fn(async ({ where, orderBy, skip = 0, take }: any) => {
        const dir = orderBy?.[0]?.viewingSlot === 'desc' ? -1 : 1;
        return Object.values(w.viewings)
          .map(viewingBase)
          .filter((x) => matches(x, where))
          .sort((a: any, b: any) => dir * (a.viewingSlot - b.viewingSlot))
          .slice(skip, take === undefined ? undefined : skip + take)
          .map((x: any) => viewingFull(w.viewings[x.id]));
      }),
    },
    fieldHost: {
      findMany: jest.fn(async () => Object.values(w.hosts).map(hostView)),
      findUnique: jest.fn(async ({ where }: any) => (await tick(), hostView(w.hosts[where.id]) ?? null)),
    },
    dispatchTicket: {
      findMany: jest.fn(async ({ where }: any) => Object.values(w.tickets).map(ticketView).filter((t) => matches(t, where))),
      groupBy: jest.fn(async ({ where }: any) => {
        const m = new Map<string, number>();
        for (const t of Object.values(w.tickets).filter((x: any) => matches(x, where)) as any[]) m.set(t.hostId, (m.get(t.hostId) ?? 0) + 1);
        return [...m.entries()].map(([hostId, n]) => ({ hostId, _count: n }));
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        await tick();
        const hit = Object.values(w.tickets).filter((t: any) => matches(t, where));
        for (const t of hit) Object.assign(t, data);
        return { count: hit.length };
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }: any) => {
        if (failAudit.on) throw new Error('audit insert failed');
        const row = { id: `au${w.audits.length + 1}`, createdAt: new Date(NOW.getTime() + w.audits.length), ...data };
        w.audits.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        w.audits
          .filter((a) => matches(a, where))
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((a) => ({ ...a, actor: { fullName: 'Admin A' } })),
      ),
    },
    // Transaction: mỗi transaction có undo-log RIÊNG ⇒ lỗi chỉ hoàn tác đúng phần nó đã ghi (như rollback Postgres),
    // không đụng thay đổi đã commit của transaction khác chạy song song.
    $transaction: jest.fn(async (cb: any) => {
      const undo: Array<() => void> = [];
      const tx = {
        ...db,
        dispatchTicket: {
          ...db.dispatchTicket,
          updateMany: async ({ where, data }: any) => {
            await tick();
            // So khớp + chụp giá trị cũ + ghi trong MỘT bước đồng bộ (như khoá dòng của DB) ⇒ undo chỉ chứa đúng phần mình ghi.
            const hit = Object.values(w.tickets).filter((t: any) => matches(t, where)) as any[];
            const before = hit.map((t) => [t, { ...t }] as const);
            for (const t of hit) Object.assign(t, data);
            undo.push(() => before.forEach(([t, old]) => Object.assign(t, old)));
            return { count: hit.length };
          },
        },
        auditLog: {
          ...db.auditLog,
          create: async (args: any) => {
            const row = await db.auditLog.create(args);
            undo.push(() => w.audits.splice(w.audits.indexOf(row), 1));
            return row;
          },
        },
      };
      try {
        return await cb(tx);
      } catch (e) {
        undo.reverse().forEach((f) => f());
        throw e;
      }
    }),
  };
  const phones: any = { decrypt: (x: string) => x.replace(/^enc:/, '') };
  return { svc: new AdminBookingsService(db, phones), db, w: () => w, failAudit };
}

const OK_REASON = 'Host cũ kẹt thang máy';
const versionOf = (w: any, id = 'tk1') => ticketVersion(w.tickets[id]);

describe('AdminBookingsService — giao lại (reassign)', () => {
  it.each(['OFFERED', 'EXPIRED', 'ESCALATED'])('từ %s: đổi Host, về OFFERED, reset offeredAt; audit trong cùng transaction; trả dòng mới', async (status) => {
    const { svc, w, db } = build((x) => (x.tickets.tk1.status = status));
    const res = await svc.reassign(V1, { hostId: 'h-new', reason: `  ${OK_REASON}  `, version: versionOf(w()) }, ACTOR, NOW);
    expect(w().tickets.tk1).toMatchObject({ hostId: 'h-new', status: 'OFFERED', offeredAt: NOW, acceptedAt: null, tier: 2, slaSeconds: 180 });
    expect(w().audits).toHaveLength(1);
    expect(w().audits[0]).toMatchObject({
      actorId: ACTOR.id,
      actorRole: 'ops_admin',
      actionType: 'DISPATCH_REASSIGNED',
      entityName: 'DispatchTicket',
      entityId: 'tk1',
      oldValue: { hostId: 'h-old', status },
      newValue: { hostId: 'h-new', status: 'OFFERED', reason: OK_REASON, viewingId: V1 },
    });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ viewingId: V1, ticket: { hostId: 'h-new', hostName: 'Host Mới', status: 'OFFERED' }, lastReassign: { toHostId: 'h-new', reason: OK_REASON } });
    expect(res.version).toBe(versionOf(w()));
  });

  it.each([
    ['ticket ACCEPTED (Host đã nhận)', (x: any) => (x.tickets.tk1.status = 'ACCEPTED')],
    ['ticket CHECKED', (x: any) => (x.tickets.tk1.status = 'CHECKED')],
    ['lịch LOBBY (Host đang đón)', (x: any) => (x.viewings[V1].status = 'LOBBY')],
    ['lịch VIEWING', (x: any) => (x.viewings[V1].status = 'VIEWING')],
    ['lịch NO_SHOW (đã kết thúc)', (x: any) => (x.viewings[V1].status = 'NO_SHOW')],
    ['lịch CANCELLED', (x: any) => (x.viewings[V1].status = 'CANCELLED')],
  ])('%s ⇒ 409 reassign_not_allowed, không ghi gì', async (_n, mut) => {
    const { svc, w } = build(mut);
    const before = structuredClone(w().tickets.tk1);
    const err = await svc.reassign(V1, { hostId: 'h-new', reason: OK_REASON, version: versionOf(w()) }, ACTOR, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'reassign_not_allowed' });
    expect(w().tickets.tk1).toEqual(before);
    expect(w().audits).toHaveLength(0);
  });

  it.each([
    ['không tồn tại', 'h-nope', 'Không tìm thấy'],
    ['đang nghỉ (OFF_DUTY)', 'h-off', 'sẵn sàng'],
    ['tài khoản bị khoá', 'h-locked', 'khoá'],
    ['không có vai Sale', 'h-insp', 'Sale'],
    ['trùng Host hiện tại', 'h-old', 'trùng'],
    ['có ca khác trong ±45 phút', 'h-busy', '45 phút'],
  ])('Host %s ⇒ 422 reassign_target_invalid theo field hostId, không ghi gì', async (_n, hostId, text) => {
    const { svc, w } = build();
    const err = await svc.reassign(V1, { hostId, reason: OK_REASON, version: versionOf(w()) }, ACTOR, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toMatchObject({ code: 'reassign_target_invalid', errors: { hostId: expect.stringContaining(text) } });
    expect(w().tickets.tk1.hostId).toBe('h-old');
    expect(w().audits).toHaveLength(0);
  });

  it('Host phân khu khác vẫn được giao (chỉ cảnh báo ở danh sách ứng viên)', async () => {
    const { svc, w } = build();
    await svc.reassign(V1, { hostId: 'h-far', reason: OK_REASON, version: versionOf(w()) }, ACTOR, NOW);
    expect(w().tickets.tk1.hostId).toBe('h-far');
  });

  it.each([
    [{ hostId: '', reason: OK_REASON, version: 'x' }, 'hostId'],
    [{ hostId: 'h-new', reason: ' abc ', version: 'x' }, 'reason'],
    [{ hostId: 'h-new', reason: 'x'.repeat(301), version: 'x' }, 'reason'],
    [{ hostId: 'h-new', reason: 123, version: 'x' }, 'reason'],
    [{ hostId: 'h-new', reason: OK_REASON }, 'version'],
  ])('body sai ⇒ 400 invalid_request theo field %#', async (dto, field) => {
    const { svc, db } = build();
    const err = await svc.reassign(V1, dto as any, ACTOR, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'invalid_request', errors: { [field]: expect.any(String) } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('lịch xem không tồn tại / id không phải UUID ⇒ 404', async () => {
    const { svc } = build();
    await expect(svc.reassign('33333333-3333-4333-8333-333333333333', { hostId: 'h-new', reason: OK_REASON, version: 'x' }, ACTOR, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reassign('not-a-uuid', { hostId: 'h-new', reason: OK_REASON, version: 'x' }, ACTOR, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('đồng thời (tuần tự): admin B gửi version cũ sau khi admin A đã giao ⇒ 409 reassign_conflict kèm dữ liệu mới nhất', async () => {
    const { svc, w } = build();
    const stale = versionOf(w());
    await svc.reassign(V1, { hostId: 'h-new', reason: OK_REASON, version: stale }, ACTOR, NOW);
    const err = await svc.reassign(V1, { hostId: 'h-far', reason: 'Admin B giao khác', version: stale }, ACTOR, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'reassign_conflict', errors: { latest: { viewingId: V1, ticket: { hostId: 'h-new' } } } });
    expect(w().tickets.tk1.hostId).toBe('h-new'); // không bị ghi đè
    expect(w().audits).toHaveLength(1);
  });

  it('đồng thời (song song thật): 2 request cùng version ⇒ đúng 1 thành công, 1 nhận 409; chỉ 1 audit', async () => {
    const { svc, w } = build();
    const ver = versionOf(w());
    const results = await Promise.allSettled([
      svc.reassign(V1, { hostId: 'h-new', reason: 'Admin A giao', version: ver }, ACTOR, NOW),
      svc.reassign(V1, { hostId: 'h-far', reason: 'Admin B giao', version: ver }, { ...ACTOR, id: 'a0000000-0000-4000-8000-000000000002' }, NOW),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const ko = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect([ok.length, ko.length]).toEqual([1, 1]);
    expect(ko[0].reason.getResponse()).toMatchObject({ code: 'reassign_conflict' });
    expect(w().audits).toHaveLength(1);
    expect(w().tickets.tk1.hostId).toBe((ok[0] as PromiseFulfilledResult<any>).value.ticket.hostId);
  });

  it('Host cũ vừa nhận ca (ticket đổi sau lúc tải) ⇒ 409 reassign_conflict, không giật ca của Host', async () => {
    const { svc, w } = build();
    const stale = versionOf(w());
    Object.assign(w().tickets.tk1, { status: 'ACCEPTED', acceptedAt: NOW });
    const err = await svc.reassign(V1, { hostId: 'h-new', reason: OK_REASON, version: stale }, ACTOR, NOW).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'reassign_conflict', errors: { latest: { ticket: { status: 'ACCEPTED', hostId: 'h-old' }, canReassign: false } } });
    expect(w().tickets.tk1.hostId).toBe('h-old');
  });

  it('ghi audit lỗi ⇒ rollback cả thay đổi ticket (không có giao lại "không vết")', async () => {
    const { svc, w, failAudit } = build();
    failAudit.on = true;
    await expect(svc.reassign(V1, { hostId: 'h-new', reason: OK_REASON, version: versionOf(w()) }, ACTOR, NOW)).rejects.toThrow('audit insert failed');
    expect(w().tickets.tk1).toMatchObject({ hostId: 'h-old', status: 'OFFERED' });
    expect(w().audits).toHaveLength(0);
  });
});

describe('AdminBookingsService — ứng viên nhận ca', () => {
  it('chỉ trả Host hợp lệ (cùng quy tắc lúc ghi); cùng phân khu lên trước; nêu lý do loại; không lộ SĐT/email', async () => {
    const { svc, w } = build();
    const r = await svc.candidates(V1);
    expect(r).toMatchObject({ viewingId: V1, canReassign: true, version: versionOf(w()) });
    expect(r.eligible.map((c) => [c.hostId, c.sameZone])).toEqual([['h-new', true], ['h-far', false]]);
    expect(Object.fromEntries(r.ineligible.map((c) => [c.hostId, c.reason]))).toEqual({
      'h-old': expect.stringContaining('trùng'),
      'h-off': expect.stringContaining('sẵn sàng'),
      'h-locked': expect.stringContaining('khoá'),
      'h-insp': expect.stringContaining('Sale'),
      'h-busy': expect.stringContaining('45 phút'),
    });
    expect(JSON.stringify(r)).not.toMatch(/@|\+84|09\d/);
  });

  it('lịch không cho giao lại ⇒ eligible rỗng + lý do', async () => {
    const { svc } = build((x) => (x.viewings[V1].status = 'RECEIVING'));
    const r = await svc.candidates(V1);
    expect(r).toMatchObject({ canReassign: false, eligible: [], reassignBlockedReason: expect.stringContaining('đang đón') });
  });
});

describe('AdminBookingsService — danh sách (phân trang/lọc/tìm phía server)', () => {
  it('tab open mặc định, sắp theo giờ hẹn; SĐT khách che bớt; có version, SLA, quyền giao lại', async () => {
    const { svc } = build();
    const r = await svc.list({}, NOW);
    expect([r.total, r.page, r.pageSize, r.tab]).toEqual([2, 1, 20, 'open']);
    expect(r.items.map((i) => i.bookingRef)).toEqual(['VS-0001', 'VS-0002']);
    const first = r.items[0];
    expect(first.tenant).toEqual({ name: 'Nguyễn Khách', phoneMasked: '09•• ••• 678' });
    expect(first.ticket).toMatchObject({ hostName: 'Host Cũ', tier: 2, isBreached: true, secondsOverdue: 220 });
    expect([first.canReassign, r.items[1].canReassign]).toEqual([true, false]); // VS-0002 ticket ACCEPTED
    expect(r.items[1].tenant).toEqual({ name: 'Khách Profile', phoneMasked: null });
    expect(JSON.stringify(r)).not.toContain('912345678');
  });

  it('tìm theo mã booking / mã căn (không phân biệt hoa thường), phân trang server', async () => {
    const { svc, db } = build();
    expect((await svc.list({ q: 'vs-0002' }, NOW)).items.map((i) => i.bookingRef)).toEqual(['VS-0002']);
    expect((await svc.list({ q: 's1.02-1208' }, NOW)).total).toBe(2);
    const p2 = await svc.list({ page: '2', pageSize: '1' }, NOW);
    expect([p2.total, p2.items.map((i) => i.bookingRef)]).toEqual([2, ['VS-0002']]);
    expect(db.viewing.findMany.mock.calls.at(-1)[0]).toMatchObject({ skip: 1, take: 1 });
  });

  it('tab today theo giờ hẹn trong ngày giờ VN; tab all gồm cả lịch đã kết thúc', async () => {
    const { svc } = build((x) => {
      x.viewings[V2].status = 'COMPLETED';
      x.viewings[V2].viewingSlot = new Date('2026-10-12T16:59:00Z'); // 23:59 hôm qua giờ VN
    });
    expect((await svc.list({ tab: 'today' }, NOW)).items.map((i) => i.bookingRef)).toEqual(['VS-0001']);
    expect((await svc.list({ tab: 'open' }, NOW)).total).toBe(1);
    expect((await svc.list({ tab: 'all' }, NOW)).total).toBe(2);
  });

  it.each([
    [{ tab: 'xyz' }, 'tab'],
    [{ page: '0' }, 'page'],
    [{ pageSize: '51' }, 'pageSize'],
    [{ q: 'x'.repeat(51) }, 'q'],
  ])('tham số sai ⇒ 400 theo field %#', async (q, field) => {
    const err = await build().svc.list(q as any, NOW).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'invalid_request', errors: { [field]: expect.any(String) } });
  });
});
