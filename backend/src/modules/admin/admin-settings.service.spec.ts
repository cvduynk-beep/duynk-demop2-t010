import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminSettingsService, HOLD_POLICY_ACTION, UNIT_HOLD_ACTION } from './admin-settings.service';
import { HOLD_HOURS_KEY, readDefaultHoldHours, resolveHoldHours } from '../deposit/hold-policy';

const ADMIN_A = { id: 'a0000000-0000-4000-8000-00000000000a', role: 'ops_admin' };
const ADMIN_B = { id: 'b0000000-0000-4000-8000-00000000000b', role: 'ops_admin' };
const tick = () => new Promise((r) => setImmediate(r));

/**
 * Prisma giả đủ cho chính sách giữ chỗ: `fee_configs` (unique config_key, updatedAt), `audit_logs`, `profiles`, `units`.
 * Mỗi thao tác nhường event loop (`tick`) để hai transaction chạy xen kẽ; `$transaction` có undo-log riêng nên lỗi giữa
 * chừng rollback đúng phần của chính nó.
 */
function fakeDb(opts: { feeRow?: { paramValue: number; updatedBy: string; updatedAt: Date } } = {}) {
  const fee: any[] = opts.feeRow ? [{ id: 'fc1', configKey: HOLD_HOURS_KEY, paramUnit: 'giờ', ...opts.feeRow }] : [];
  const audits: any[] = [];
  const profiles = new Map([
    [ADMIN_A.id, { id: ADMIN_A.id, fullName: 'Admin A' }],
    [ADMIN_B.id, { id: ADMIN_B.id, fullName: 'Admin B' }],
  ]);
  const units = [{ id: 'u1', unitCode: 'VHOP-S1.02-1208' }];
  let failAudit = false;

  const client = (undo: (() => void)[] | null) => ({
    feeConfig: {
      findUnique: async ({ where }: any) => {
        await tick();
        const r = fee.find((f) => f.configKey === where.configKey);
        return r ? { ...r } : null;
      },
      updateMany: async ({ where, data }: any) => {
        await tick();
        const r = fee.find((f) => f.configKey === where.configKey && f.updatedAt >= where.updatedAt.gte && f.updatedAt < where.updatedAt.lt);
        if (!r) return { count: 0 };
        const before = { ...r };
        Object.assign(r, data);
        undo?.push(() => Object.assign(r, before));
        return { count: 1 };
      },
      create: async ({ data }: any) => {
        await tick();
        if (fee.some((f) => f.configKey === data.configKey)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        const r = { id: `fc${fee.length + 1}`, updatedAt: new Date(), ...data };
        fee.push(r);
        undo?.push(() => fee.splice(fee.indexOf(r), 1));
        return r;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        await tick();
        if (failAudit) throw new Error('audit down');
        const r = { id: `al${audits.length + 1}`, createdAt: new Date(Date.now() + audits.length), ...data };
        audits.push(r);
        undo?.push(() => audits.splice(audits.indexOf(r), 1));
        return r;
      },
      findMany: async ({ where, take }: any) =>
        audits
          .filter((a) => where.actionType.in.includes(a.actionType))
          .sort((x, y) => y.createdAt - x.createdAt)
          .slice(0, take)
          .map((a) => ({ ...a, actor: profiles.get(a.actorId) ?? null })),
    },
    profile: { findUnique: async ({ where }: any) => profiles.get(where.id) ?? null },
    unit: { findMany: async ({ where }: any) => units.filter((u) => where.id.in.includes(u.id)) },
  });

  const prisma: any = {
    ...client(null),
    $transaction: async (cb: any) => {
      const undo: (() => void)[] = [];
      try {
        return await cb(client(undo));
      } catch (err) {
        for (const u of undo.reverse()) u();
        throw err;
      }
    },
  };
  return { prisma, fee, audits, setFailAudit: (v: boolean) => (failAudit = v) };
}

const errOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as any;
  }
  throw new Error('expected rejection');
};

describe('AdminSettingsService — chính sách giữ chỗ', () => {
  it('chưa ai lưu ⇒ mặc định 48 giờ, isDefault, version "default", không có người cập nhật', async () => {
    const svc = new AdminSettingsService(fakeDb().prisma);
    expect(await svc.getHoldPolicy()).toMatchObject({
      defaultHours: 48,
      minHours: 12,
      maxHours: 72,
      isDefault: true,
      version: 'default',
      updatedAt: null,
      updatedBy: null,
      history: [],
    });
  });

  it('lưu lần đầu ⇒ tạo fee_configs + audit (ai, cũ/mới, lý do); GET sau đó (admin khác) thấy giá trị mới', async () => {
    const db = fakeDb();
    const svc = new AdminSettingsService(db.prisma);
    const out = await svc.updateHoldPolicy({ defaultHours: 24, reason: '  Mùa   cao điểm ', version: 'default' }, ADMIN_A);
    expect(out).toMatchObject({ changed: true, defaultHours: 24, isDefault: false, updatedBy: { id: ADMIN_A.id, name: 'Admin A' } });
    expect(db.fee).toHaveLength(1);
    expect(db.fee[0]).toMatchObject({ configKey: HOLD_HOURS_KEY, paramValue: 24, updatedBy: ADMIN_A.id });
    expect(db.audits).toEqual([
      expect.objectContaining({
        actorId: ADMIN_A.id,
        actionType: HOLD_POLICY_ACTION,
        entityName: 'fee_configs',
        entityId: HOLD_HOURS_KEY,
        oldValue: { defaultHours: 48, isDefault: true },
        newValue: { defaultHours: 24, reason: 'Mùa cao điểm' },
      }),
    ]);
    const seenByB = await new AdminSettingsService(db.prisma).getHoldPolicy();
    expect(seenByB).toMatchObject({ defaultHours: 24, version: db.fee[0].updatedAt.toISOString() });
    expect(seenByB.history[0]).toMatchObject({ scope: 'default', from: 48, to: 24, actorName: 'Admin A', reason: 'Mùa cao điểm' });
  });

  it('lưu tiếp với version đúng ⇒ đổi giá trị, version mới khác version cũ', async () => {
    const db = fakeDb({ feeRow: { paramValue: 24, updatedBy: ADMIN_A.id, updatedAt: new Date('2026-10-13T01:00:00.123Z') } });
    const svc = new AdminSettingsService(db.prisma);
    const v1 = (await svc.getHoldPolicy()).version;
    const out = await svc.updateHoldPolicy({ defaultHours: 60, reason: 'Thấp điểm, giữ lâu hơn', version: v1 }, ADMIN_B);
    expect(out).toMatchObject({ changed: true, defaultHours: 60, updatedBy: { id: ADMIN_B.id } });
    expect(out.version).not.toBe(v1);
    expect(db.audits[0]).toMatchObject({ oldValue: { defaultHours: 24, isDefault: false }, newValue: { defaultHours: 60 } });
  });

  it('cùng giá trị ⇒ 200 changed:false, không ghi DB, không audit', async () => {
    const db = fakeDb();
    const out = await new AdminSettingsService(db.prisma).updateHoldPolicy({ defaultHours: 48, reason: 'Không đổi gì', version: 'default' }, ADMIN_A);
    expect(out).toMatchObject({ changed: false, defaultHours: 48, isDefault: true });
    expect(db.fee).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });

  it.each([
    [{ defaultHours: 11 }, 'defaultHours'],
    [{ defaultHours: 73 }, 'defaultHours'],
    [{ defaultHours: 24.5 }, 'defaultHours'],
    [{ defaultHours: '24' }, 'defaultHours'],
    [{ defaultHours: null }, 'defaultHours'],
    [{ reason: 'abc' }, 'reason'],
    [{ reason: 'x'.repeat(301) }, 'reason'],
    [{ reason: '   a   b   ' }, 'reason'],
    [{ version: '' }, 'version'],
    [{ version: 7 }, 'version'],
  ])('body sai %j ⇒ 400 invalid_request, lỗi theo field %s, DB không đổi', async (patch, field) => {
    const db = fakeDb();
    const body = { defaultHours: 24, reason: 'Lý do hợp lệ', version: 'default', ...patch };
    const err = await errOf(new AdminSettingsService(db.prisma).updateHoldPolicy(body, ADMIN_A));
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'invalid_request', errors: { [field]: expect.any(String) } });
    expect(db.fee).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });

  it('version cũ (admin khác vừa lưu) ⇒ 409 hold_policy_conflict kèm giá trị mới nhất, DB giữ giá trị của người trước', async () => {
    const db = fakeDb();
    const svc = new AdminSettingsService(db.prisma);
    await svc.updateHoldPolicy({ defaultHours: 24, reason: 'Admin B lưu trước', version: 'default' }, ADMIN_B);
    const err = await errOf(svc.updateHoldPolicy({ defaultHours: 60, reason: 'Admin A dữ liệu cũ', version: 'default' }, ADMIN_A));
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'hold_policy_conflict', errors: { latest: { defaultHours: 24, updatedBy: { id: ADMIN_B.id } } } });
    expect(db.fee[0].paramValue).toBe(24);
    expect(db.audits).toHaveLength(1);
  });

  it('hai admin lưu SONG SONG lần đầu (cùng version "default") ⇒ đúng 1 thành công, 1 nhận 409, 1 audit', async () => {
    const db = fakeDb();
    const svc = new AdminSettingsService(db.prisma);
    const results = await Promise.allSettled([
      svc.updateHoldPolicy({ defaultHours: 24, reason: 'Admin A lưu', version: 'default' }, ADMIN_A),
      svc.updateHoldPolicy({ defaultHours: 60, reason: 'Admin B lưu', version: 'default' }, ADMIN_B),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(db.fee).toHaveLength(1);
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0].newValue.defaultHours).toBe(db.fee[0].paramValue);
  });

  it('hai admin lưu SONG SONG khi đã có dòng ⇒ CAS chặn người sau (1 thành công, 1 409)', async () => {
    const db = fakeDb({ feeRow: { paramValue: 48, updatedBy: ADMIN_A.id, updatedAt: new Date('2026-10-13T01:00:00.000Z') } });
    const svc = new AdminSettingsService(db.prisma);
    const version = (await svc.getHoldPolicy()).version;
    const results = await Promise.allSettled([
      svc.updateHoldPolicy({ defaultHours: 24, reason: 'Admin A lưu', version }, ADMIN_A),
      svc.updateHoldPolicy({ defaultHours: 60, reason: 'Admin B lưu', version }, ADMIN_B),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0].newValue.defaultHours).toBe(db.fee[0].paramValue);
  });

  it('ghi audit lỗi ⇒ rollback, chính sách KHÔNG đổi', async () => {
    const db = fakeDb({ feeRow: { paramValue: 48, updatedBy: ADMIN_A.id, updatedAt: new Date('2026-10-13T01:00:00.000Z') } });
    db.setFailAudit(true);
    const svc = new AdminSettingsService(db.prisma);
    await expect(svc.updateHoldPolicy({ defaultHours: 24, reason: 'Audit sập', version: '2026-10-13T01:00:00.000Z' }, ADMIN_A)).rejects.toThrow('audit down');
    expect(db.fee[0].paramValue).toBe(48);
    expect(db.audits).toHaveLength(0);
  });

  it('lịch sử gộp thay đổi mặc định + giờ riêng từng căn (kèm mã căn), mới nhất trước, tối đa 10', async () => {
    const db = fakeDb();
    for (let i = 0; i < 11; i++) {
      db.audits.push({
        id: `u${i}`,
        actorId: ADMIN_B.id,
        actionType: UNIT_HOLD_ACTION,
        entityId: 'u1',
        oldValue: { holdHours: 48 },
        newValue: { holdHours: 24 + i, reason: `riêng ${i}` },
        createdAt: new Date(Date.UTC(2026, 9, 1, i)),
      });
    }
    const svc = new AdminSettingsService(db.prisma);
    await svc.updateHoldPolicy({ defaultHours: 36, reason: 'Mặc định mới', version: 'default' }, ADMIN_A);
    const { history } = await svc.getHoldPolicy();
    expect(history).toHaveLength(10);
    expect(history[0]).toMatchObject({ scope: 'default', from: 48, to: 36, unitCode: null });
    expect(history[1]).toMatchObject({ scope: 'unit', unitCode: 'VHOP-S1.02-1208', from: 48, to: 34, actorName: 'Admin B', reason: 'riêng 10' });
  });

  it('giá trị đã lưu chính là giá trị mọi luồng cọc đọc (deposit/hold-policy cùng khoá)', async () => {
    const db = fakeDb();
    await new AdminSettingsService(db.prisma).updateHoldPolicy({ defaultHours: 24, reason: 'Đổi để kiểm tra', version: 'default' }, ADMIN_A);
    expect(await readDefaultHoldHours(db.prisma)).toBe(24);
    expect(await resolveHoldHours(db.prisma, {})).toBe(24); // căn không có giờ riêng, cọc mới
    expect(await resolveHoldHours(db.prisma, { override: 60 })).toBe(60); // căn có giờ riêng
    expect(await resolveHoldHours(db.prisma, { snapshot: 48, override: 60 })).toBe(48); // cọc đã chốt
  });
});

describe('deposit/hold-policy — thứ tự ưu tiên + kẹp', () => {
  const none = { feeConfig: { findUnique: async () => null } };
  const set = (v: number) => ({ feeConfig: { findUnique: async () => ({ paramValue: v }) } });
  it('chưa cài ⇒ 48; đã cài ⇒ giá trị đó (làm tròn, kẹp 12–72)', async () => {
    expect(await readDefaultHoldHours(none)).toBe(48);
    expect(await readDefaultHoldHours(set(30))).toBe(30);
    expect(await readDefaultHoldHours(set(5))).toBe(12);
    expect(await readDefaultHoldHours(set(99.6))).toBe(72);
  });
  it('snapshot cọc → giờ riêng căn → mặc định', async () => {
    expect(await resolveHoldHours(set(30), { snapshot: 40, override: 20 })).toBe(40);
    expect(await resolveHoldHours(set(30), { snapshot: null, override: 20 })).toBe(20);
    expect(await resolveHoldHours(set(30), { snapshot: null, override: null })).toBe(30);
    expect(await resolveHoldHours(none, { defaultHours: 50 })).toBe(50);
  });
});
