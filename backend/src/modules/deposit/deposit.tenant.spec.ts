import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { BookingAccessService } from '../tenant/booking-access.service';
import { PhoneService } from '../auth/phone/phone.service';
import { buildDepositTerms, DEPOSIT_TERMS_VERSION } from './deposit-terms';
import { DepositStatus, UnitStatus, ViewingStatus } from '@prisma/client';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const UNIT_ID = '00000000-0000-4000-8000-000000000010';
const HOST_ID = '00000000-0000-4000-8000-000000000020';

function fakePrisma() {
  const feeHoldHours: { value: number | null } = { value: null };
  /** Hồ sơ ký gửi mới nhất của căn (meta chốt nhanh nằm trong doorAccessConfig.consignment.form). */
  const mandate: { value: any } = { value: null };
  const mockUnit = {
    id: UNIT_ID,
    unitCode: 'VHOP-S1.02-1208',
    status: UnitStatus.AVAILABLE,
    isVerified: true,
    doorLockType: 'ELECTRONIC_PIN',
    layoutType: 'ONE_BED_PLUS',
    baseRentPrice: 6500000,
    marketAvgPrice: 7000000,
    managementFee: 500000,
    parkingFeeEstimate: 100000,
    utilityCostEstimate: 500000,
    carpetAreaM2: 45,
    floorNumber: 12,
    doorNumber: '08',
    holdHoursOverride: 48,
    building: { buildingCode: 'S1.02', zoneName: 'The Sapphire 1' },
    media: [],
  };

  let savedViewing: any = {
    id: 'viewing-1',
    bookingRefCode: 'VS-88888',
    unitId: UNIT_ID,
    tenantId: TENANT_ID,
    status: ViewingStatus.CLOSING,
    viewingSlot: new Date(),
    partySize: 1,
    contactName: 'NGUYỄN VĂN AN',
    contactPhoneEnc: null,
    unit: mockUnit,
    tenant: { id: TENANT_ID, fullName: 'NGUYỄN VĂN AN' },
    tickets: [{ id: 'ticket-1', hostId: HOST_ID, status: 'ACCEPTED', host: { profile: { fullName: 'Host A' } } }],
    deposit: null,
  };

  let savedDeposits: any[] = [];
  let savedEscrow: any[] = [];
  let savedAudits: any[] = [];

  const prisma: Record<string, any> = {
    feeConfig: {
      findUnique: jest.fn(async ({ where }) =>
        where.configKey === 'hold_hours_default' && feeHoldHours.value != null
          ? { configKey: 'hold_hours_default', paramValue: feeHoldHours.value }
          : null,
      ),
    },
    unit: {
      findFirst: jest.fn(async ({ where }) =>
        where.unitCode?.equals?.toLowerCase() === mockUnit.unitCode.toLowerCase() ? { ...mockUnit } : null,
      ),
      findUnique: jest.fn(async ({ where }) => {
        if (where.id === mockUnit.id) return { ...mockUnit };
        return null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (mockUnit.status === where.status) {
          Object.assign(mockUnit, data);
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    viewing: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.bookingRefCode === savedViewing.bookingRefCode || where.id === savedViewing.id) {
          const dep = savedDeposits.find((d) => d.viewingId === savedViewing.id);
          return { ...savedViewing, deposit: dep || null };
        }
        return null;
      }),
      update: jest.fn(async ({ where, data }) => {
        if (savedViewing.id === where.id) {
          Object.assign(savedViewing, data);
          return { ...savedViewing };
        }
        return { id: where.id, ...data };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    holdingDeposit: {
      findUnique: jest.fn(async ({ where }) => {
        return savedDeposits.find((d) => d.id === where.id || d.viewingId === where.viewingId) || null;
      }),
      findFirst: jest.fn(async ({ where }) => {
        return (
          savedDeposits.find((d) => {
            if (where.depositCode && d.depositCode !== where.depositCode) return false;
            if (where.paymentStatus?.in && !where.paymentStatus.in.includes(d.paymentStatus)) return false;
            if (where.paymentStatus && !where.paymentStatus.in && d.paymentStatus !== where.paymentStatus) return false;
            if (where.transferContent?.equals && d.transferContent?.toLowerCase() !== where.transferContent.equals.toLowerCase()) {
              return false;
            }
            return true;
          }) || null
        );
      }),
      findMany: jest.fn(async ({ where }) => {
        return savedDeposits.filter((d) => {
          if (where.unitId && d.unitId !== where.unitId) return false;
          if (where.paymentStatus?.in && !where.paymentStatus.in.includes(d.paymentStatus)) return false;
          if (where.paymentStatus && !where.paymentStatus.in && d.paymentStatus !== where.paymentStatus) return false;
          if (where.expiresAt?.lte && d.expiresAt && new Date(d.expiresAt) > new Date(where.expiresAt.lte)) return false;
          if (where.expiresAt?.gt && (!d.expiresAt || new Date(d.expiresAt) <= new Date(where.expiresAt.gt))) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }) => {
        const dep = {
          id: `dep-${savedDeposits.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        savedDeposits.push(dep);
        return dep;
      }),
      update: jest.fn(async ({ where, data }) => {
        const dep = savedDeposits.find((d) => d.id === where.id);
        if (dep) {
          Object.assign(dep, data);
          return { ...dep };
        }
        return { id: where.id, ...data };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const dep of savedDeposits) {
          if (where.unitId && dep.unitId !== where.unitId) continue;
          if (typeof where.id === 'string' && dep.id !== where.id) continue;
          if (where.id?.not && dep.id === where.id.not) continue;
          if (where.paymentStatus && dep.paymentStatus !== where.paymentStatus) continue;
          Object.assign(dep, data);
          count++;
        }
        return { count };
      }),
    },
    escrowTransaction: {
      findUnique: jest.fn(async ({ where }) => {
        return savedEscrow.find((e) => e.bankRefNumber === where.bankRefNumber) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const tx = { id: `escrow-${savedEscrow.length + 1}`, ...data };
        savedEscrow.push(tx);
        return tx;
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }) => {
        const log = { id: `audit-${savedAudits.length + 1}`, ...data };
        savedAudits.push(log);
        return log;
      }),
    },
    profile: {
      findFirst: jest.fn(async () => ({ id: 'admin-system-id' })),
    },
    exclusiveMandate: {
      findFirst: jest.fn(async () => mandate.value),
    },
    $transaction: jest.fn(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    }),
  };

  return {
    prisma,
    mockUnit,
    feeHoldHours,
    /** Bật chốt nhanh cho căn với giá sàn `floorRent`. */
    allowFastClose: (floorRent: number) => {
      mandate.value = { doorAccessConfig: { consignment: { form: { allowFastClose: true, floorRent } } } };
    },
    getSavedViewing: () => savedViewing,
    setSavedViewing: (v: any) => {
      savedViewing = v;
    },
    savedDeposits,
    savedEscrow,
    savedAudits,
  };
}

describe('Deposit & VietQR Backend Tests (SPEC-P03 §8: Cases 1–11)', () => {
  let depositService: DepositService;
  let depositController: DepositController;
  let fixture: ReturnType<typeof fakePrisma>;
  let phoneService: PhoneService;
  let bookingAccess: BookingAccessService;

  // Test tự cấp cấu hình VietQR (tài khoản giả) và TẮT DEMO_TOOLS — không dựa vào backend/.env máy dev
  // (@prisma/client tự nạp .env; CI không có .env ⇒ trước đây đỏ 7 ca vì vietqr_not_configured).
  const VIETQR_ENV = {
    VIETQR_BANK_ID: '970436',
    VIETQR_ACCOUNT_NO: '1234567890',
    VIETQR_ACCOUNT_NAME: 'VINSTAY TEST',
    VIETQR_WEBHOOK_SECRET: 'test_vietqr_webhook_secret_key',
  };
  const savedEnv: Record<string, string | undefined> = {};
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    for (const k of [...Object.keys(VIETQR_ENV), 'DEMO_TOOLS']) savedEnv[k] = process.env[k];
    Object.assign(process.env, VIETQR_ENV);
    delete process.env.DEMO_TOOLS;
    fixture = fakePrisma();
    const config = new ConfigService({
      AES_SECRET_KEY: 'a-test-master-secret-of-32-chars!!',
      NODE_ENV: 'test',
      VIETQR_WEBHOOK_SECRET: 'test_vietqr_webhook_secret_key',
    });
    phoneService = new PhoneService(config);
    bookingAccess = new BookingAccessService(fixture.prisma as any);
    const auditService = { log: jest.fn() } as any;

    depositService = new DepositService(
      fixture.prisma as any,
      auditService,
      phoneService,
      bookingAccess,
    );
    depositController = new DepositController(depositService);
  });

  // 1. Tạo cọc khi không CLOSING → 409 bad_status
  it('1. tạo cọc khi không CLOSING → 409 bad_status', async () => {
    fixture.setSavedViewing({
      ...fixture.getSavedViewing(),
      status: ViewingStatus.CONFIRMED,
    });

    await expect(
      depositService.createDeposit(
        'VS-88888',
        { id: TENANT_ID },
        { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION },
      ),
    ).rejects.toThrow(ConflictException);
  });

  // 2. acceptTerms thiếu / false → 400 invalid_request
  it('2. acceptTerms thiếu → 400 invalid_request', async () => {
    await expect(
      depositService.createDeposit(
        'VS-88888',
        { id: TENANT_ID },
        { acceptTerms: false as any, termsVersion: DEPOSIT_TERMS_VERSION },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // 3. termsVersion cũ → 409 terms_version_stale
  it('3. termsVersion cũ → 409 terms_version_stale', async () => {
    await expect(
      depositService.createDeposit(
        'VS-88888',
        { id: TENANT_ID },
        { acceptTerms: true, termsVersion: 'HOLD-2025.01-v0' },
      ),
    ).rejects.toThrow(ConflictException);
  });

  // 4. Gọi 2 lần → cùng deposit, termsAcceptedAt không đổi (idempotent)
  it('4. gọi 2 lần → cùng deposit, termsAcceptedAt không đổi', async () => {
    const res1 = await depositService.createDeposit(
      'VS-88888',
      { id: TENANT_ID },
      { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION },
    );
    expect(res1.deposit).toBeDefined();
    const initialTermsAcceptedAt = res1.deposit?.termsAcceptedAt;

    // Call second time
    const res2 = await depositService.createDeposit(
      'VS-88888',
      { id: TENANT_ID },
      { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION },
    );
    expect(res2.deposit?.qrRef).toBe(res1.deposit?.qrRef);
    expect(res2.deposit?.termsAcceptedAt).toBe(initialTermsAcceptedAt);
    expect(fixture.savedDeposits.length).toBe(1);
  });

  // 5. Cọc v2: số tiền do server tính = Tiền cọc bảo đảm của căn; amount từ client bị bỏ qua
  it('5. cọc v2: amount từ client bị bỏ qua; số tiền = Tiền cọc bảo đảm của căn (chưa đặt ⇒ 1 tháng thuê)', async () => {
    const res = await depositService.createDeposit(
      'VS-88888',
      { id: TENANT_ID },
      { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, amount: 1 } as any,
    );
    expect(res.deposit?.amount).toBe(6_500_000);
    expect(fixture.savedDeposits[0].amount).toBe(6_500_000);
    expect(res.deposit?.vietqr.qrUrl).toContain('amount=6500000');
  });

  it('5b. căn có Tiền cọc bảo đảm riêng (chủ nhà đặt) ⇒ khoản cọc đúng số đó', async () => {
    (fixture.mockUnit as any).securityDeposit = 13_000_000;
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION });
    expect(fixture.savedDeposits[0].amount).toBe(13_000_000);
  });

  it('5c. điều khoản cũ (HOLD-…-v1) ⇒ 409 terms_version_stale (phải tick lại điều khoản v2)', async () => {
    await expect(
      depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: 'HOLD-2026.10-v1' }),
    ).rejects.toMatchObject({ response: { code: 'terms_version_stale' } });
  });

  // 6. Webhook sai secret → 401 webhook_secret_invalid
  it('6. webhook sai secret → 401 webhook_secret_invalid', async () => {
    await expect(
      depositController.vietqrWebhook('wrong_secret', {
        depositCode: 'DEP-VS-88888',
        amount: 2000000,
        bankRefNumber: 'FT-123456',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // 7. Trùng bankRefNumber → duplicate
  it('7. trùng bankRefNumber → duplicate', async () => {
    fixture.savedEscrow.push({
      id: 'esc-1',
      depositId: 'dep-1',
      transType: 'INBOUND_DEPOSIT',
      amount: 2000000,
      bankRefNumber: 'FT-DUPLICATE-999',
    });

    const result = await depositService.markPaid({
      depositCode: 'DEP-VS-88888',
      amount: 2000000,
      bankRefNumber: 'FT-DUPLICATE-999',
      actor: 'bank',
    });
    expect(result).toBe('duplicate');
  });

  // 8. Sai số tiền → ignored + deposit vẫn PENDING_PAYMENT
  it('8. sai số tiền → ignored + deposit vẫn PENDING_PAYMENT', async () => {
    // First create deposit
    await depositService.createDeposit(
      'VS-88888',
      { id: TENANT_ID },
      { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION },
    );

    const result = await depositService.markPaid({
      depositCode: 'DEP-VS-88888',
      amount: 1500000, // Not 2.000.000
      bankRefNumber: 'FT-WRONG-AMOUNT',
      actor: 'bank',
    });

    expect(result).toBe('ignored');
    expect(fixture.savedDeposits[0].paymentStatus).toBe(DepositStatus.PENDING_PAYMENT);
  });

  // 9. Hai deposit cùng căn cùng báo có → đúng một paid, một refunded, căn HOLDING (First-to-Pay Wins)
  it('9. hai deposit cùng căn cùng báo có → đúng một paid, một refunded, căn HOLDING', async () => {
    // Deposit A for viewing 1
    const depA = await fixture.prisma.holdingDeposit.create({
      data: {
        depositCode: 'DEP-UNIT-A',
        viewingId: 'viewing-1',
        unitId: UNIT_ID,
        amount: 2000000,
        vietqrRef: 'VQ-1111',
        transferContent: 'COC VHOP-S1.02-1208 0911111111',
        paymentStatus: DepositStatus.PENDING_PAYMENT,
      },
    });

    // Deposit B for viewing 2 on same unit
    const depB = await fixture.prisma.holdingDeposit.create({
      data: {
        depositCode: 'DEP-UNIT-B',
        viewingId: 'viewing-2',
        unitId: UNIT_ID,
        amount: 2000000,
        vietqrRef: 'VQ-2222',
        transferContent: 'COC VHOP-S1.02-1208 0922222222',
        paymentStatus: DepositStatus.PENDING_PAYMENT,
      },
    });

    // Payment A arrives first
    const resultA = await depositService.markPaid({
      depositCode: depA.depositCode,
      amount: 2000000,
      bankRefNumber: 'FT-RACE-A',
      actor: 'bank',
    });
    expect(resultA).toBe('paid');
    expect(fixture.mockUnit.status).toBe(UnitStatus.HOLDING);
    expect(depA.paymentStatus).toBe(DepositStatus.PAID_HOLDING);

    // Payment B arrives second (race lost)
    const resultB = await depositService.markPaid({
      depositCode: depB.depositCode,
      amount: 2000000,
      bankRefNumber: 'FT-RACE-B',
      actor: 'bank',
    });
    expect(resultB).toBe('refunded');
    expect(depB.paymentStatus).toBe(DepositStatus.REFUNDED);

    // Check refund escrow entries
    const refundTx = fixture.savedEscrow.find((e) => e.bankRefNumber === 'FT-RACE-B-R');
    expect(refundTx).toBeDefined();
    expect(refundTx?.transType).toBe('REFUND');
  });

  // 10. Báo có huỷ lịch trùng căn & QR_EXPIRED các deposit pending khác
  it('10. báo có huỷ lịch trùng căn', async () => {
    const dep = await fixture.prisma.holdingDeposit.create({
      data: {
        depositCode: 'DEP-VS-88888',
        viewingId: 'viewing-1',
        unitId: UNIT_ID,
        amount: 2000000,
        vietqrRef: 'VQ-8888',
        transferContent: 'COC VHOP-S1.02-1208 0912345678',
        paymentStatus: DepositStatus.PENDING_PAYMENT,
      },
    });

    const result = await depositService.markPaid({
      depositCode: dep.depositCode,
      amount: 2000000,
      bankRefNumber: 'FT-CANCEL-CHECK',
      actor: 'bank',
    });

    expect(result).toBe('paid');
    expect(fixture.prisma.viewing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unitId: UNIT_ID }),
        data: expect.objectContaining({
          status: ViewingStatus.CANCELLED,
          closedReason: 'auto_cancelled_due_to_deposit',
        }),
      }),
    );
  });

  // 11. holdHours lấy override căn, ngoài [12,72] bị kẹp
  it('11. holdHours lấy override căn, ngoài [12,72] bị kẹp', () => {
    const termsLow = buildDepositTerms(5);
    expect(termsLow.holdHours).toBe(12);

    const termsHigh = buildDepositTerms(100);
    expect(termsHigh.holdHours).toBe(72);

    const termsNormal = buildDepositTerms(48);
    expect(termsNormal.holdHours).toBe(48);
  });

  it('hết hạn một cọc không mở căn nếu vẫn còn khoản giữ chỗ hiệu lực khác', async () => {
    (fixture.mockUnit as any).status = UnitStatus.HOLDING;
    fixture.savedDeposits.push(
      {
        id: 'expired-deposit',
        unitId: UNIT_ID,
        viewingId: 'viewing-1',
        paymentStatus: DepositStatus.PAID_HOLDING,
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        id: 'active-deposit',
        unitId: UNIT_ID,
        viewingId: 'viewing-2',
        paymentStatus: DepositStatus.UNC_PENDING_REVIEW,
        expiresAt: new Date(Date.now() + 60_000),
      },
    );

    await depositService.expireIfDue(UNIT_ID);

    expect(fixture.savedDeposits.find((d) => d.id === 'expired-deposit')?.paymentStatus).toBe(DepositStatus.FORFEITED);
    expect(fixture.mockUnit.status).toBe(UnitStatus.HOLDING);
  });

  // 12. A14 công khai: giờ giữ chỗ theo override căn → mặc định Admin (FeeConfig) → 48
  it('12. A14 công khai: giờ giữ chỗ = override căn → FeeConfig.hold_hours_default → 48', async () => {
    (fixture.mockUnit as any).holdHoursOverride = null; // fixture mặc định có override 48: bỏ để thử đường FeeConfig
    expect((await depositService.getPublicDepositTerms()).holdHours).toBe(48);

    fixture.feeHoldHours.value = 72;
    expect((await depositService.getPublicDepositTerms()).holdHours).toBe(72);
    expect((await depositService.getPublicDepositTerms('vhop-s1.02-1208')).holdHours).toBe(72);

    (fixture.mockUnit as any).holdHoursOverride = 24;
    expect((await depositService.getPublicDepositTerms('VHOP-S1.02-1208')).holdHours).toBe(24);
    expect((await depositService.getPublicDepositTerms()).holdHours).toBe(72);

    fixture.feeHoldHours.value = 200; // ngoài [12,72] bị kẹp
    expect((await depositService.getPublicDepositTerms()).holdHours).toBe(72);
  });

  // 13. A14 công khai: mã căn không có → 404 unit_not_found
  it('13. A14 công khai: unitCode không tồn tại → 404 unit_not_found', async () => {
    await expect(depositService.getPublicDepositTerms('VHOP-KHONG-CO')).rejects.toMatchObject({
      response: { code: 'unit_not_found' },
    });
  });

  // 14. Tạo cọc dùng giờ mặc định Admin: biên bản và deposit không được lệch nhau
  it('14. createDeposit dùng FeeConfig.hold_hours_default khi căn không có override', async () => {
    (fixture.mockUnit as any).holdHoursOverride = null;
    fixture.feeHoldHours.value = 36;
    const terms = await depositService.getPublicDepositTerms('VHOP-S1.02-1208');
    expect(terms.holdHours).toBe(36);

    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION });
    expect(fixture.savedDeposits[0].holdHours).toBe(36);
  });

  // 15. Admin đổi mặc định / giờ riêng của căn SAU khi khách tick điều khoản: báo có vẫn khoá đúng số giờ đã chốt trong cọc
  it('15. báo có dùng giờ đã chốt trong cọc, không bị mặc định mới hay giờ riêng căn đổi sau đè lên', async () => {
    const dep = await fixture.prisma.holdingDeposit.create({
      data: {
        depositCode: 'DEP-SNAPSHOT',
        viewingId: 'viewing-1',
        unitId: UNIT_ID,
        amount: 2000000,
        vietqrRef: 'VQ-3333',
        transferContent: 'COC VHOP-S1.02-1208 SNAP',
        paymentStatus: DepositStatus.PENDING_PAYMENT,
        holdHours: 36,
        unit: { holdHoursOverride: 24 }, // giờ riêng căn đổi sau khi tạo cọc
      },
    });
    fixture.feeHoldHours.value = 60; // Admin vừa đổi mặc định toàn sàn
    const paidAt = new Date('2026-10-13T08:00:00Z');
    expect(await depositService.markPaid({ depositCode: dep.depositCode, amount: 2000000, bankRefNumber: 'FT-SNAP', actor: 'bank', paidAt })).toBe('paid');
    expect(dep.holdHours).toBe(36);
    expect(new Date(dep.expiresAt).getTime() - paidAt.getTime()).toBe(36 * 3600 * 1000);
  });

  // ── Chốt nhanh ─────────────────────────────────────────────────────────────────────────────
  it('16. báo giá chốt nhanh: chủ nhà chưa ủy quyền ⇒ eligible false; ủy quyền ⇒ 3 nấc, giá ≥ giá sàn, không lộ giá sàn', async () => {
    expect(await depositService.getFastCloseQuotes('VS-88888', { id: TENANT_ID })).toMatchObject({ eligible: false, quotes: [] });
    fixture.allowFastClose(6_000_000);
    const q = await depositService.getFastCloseQuotes('VS-88888', { id: TENANT_ID });
    expect(q).toMatchObject({ eligible: true, quoteHours: 24, rent: 6_500_000, deposit: 6_500_000 });
    // 6.5tr: −3,5% ⇒ 6.272.500 → làm tròn 50k 6.250.000 · −5,5% ⇒ 6.150.000 · −10% ⇒ 5.850.000 < sàn 6tr ⇒ kẹp 6.000.000
    expect(q.quotes.map((x: any) => [x.cycle, x.rent])).toEqual([[1, 6_250_000], [3, 6_150_000], [6, 6_000_000]]);
    // cọc 6.5tr: 5% = 325.000 → làm tròn 50k 350.000 (≥ 200k, ≤ 8% = 520k → 500k) ⇒ 6.150.000
    expect(q.quotes.every((x: any) => x.deposit === 6_150_000 && x.depositDiscount === 350_000)).toBe(true);
    expect(JSON.stringify(q)).not.toMatch(/floor/i);
  });

  it('17. tạo cọc chốt nhanh: amount đã giảm, snapshot chu kỳ + giá + hạn 24h; chưa ủy quyền ⇒ 409 fast_close_unavailable; chu kỳ sai ⇒ 400', async () => {
    await expect(
      depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 3 }),
    ).rejects.toMatchObject({ response: { code: 'fast_close_unavailable' } });
    await expect(
      depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 2 }),
    ).rejects.toMatchObject({ response: { code: 'invalid_request', errors: { fastCloseCycle: expect.any(String) } } });
    fixture.allowFastClose(6_000_000);
    const before = Date.now();
    const res = await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 3 });
    const dep = fixture.savedDeposits[0];
    expect(dep).toMatchObject({ amount: 6_150_000, baseAmount: 6_500_000, fastCloseCycle: 3, quotedMonthlyRent: 6_150_000 });
    expect(new Date(dep.quoteExpiresAt).getTime() - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
    expect(res.deposit).toMatchObject({ amount: 6_150_000, fastClose: { cycle: 3, baseAmount: 6_500_000, monthlyRent: 6_150_000 } });
  });

  it('18. đổi lựa chọn khi chưa có tiền về ⇒ báo giá lại trên CÙNG khoản cọc (audit DEPOSIT_REQUOTED); gửi lại y hệt ⇒ idempotent', async () => {
    fixture.allowFastClose(6_000_000);
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 3 });
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 3 });
    expect(fixture.savedDeposits).toHaveLength(1);
    expect(fixture.savedAudits.filter((a) => a.actionType === 'DEPOSIT_REQUOTED')).toHaveLength(0);
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION });
    expect(fixture.savedDeposits).toHaveLength(1);
    expect(fixture.savedDeposits[0]).toMatchObject({ amount: 6_500_000, fastCloseCycle: null, quotedMonthlyRent: null });
    expect(fixture.savedAudits.find((a) => a.actionType === 'DEPOSIT_REQUOTED')).toMatchObject({ oldValue: { amount: 6_150_000, fastCloseCycle: 3 }, newValue: { amount: 6_500_000 } });
  });

  it('19. báo có sai số tiền của CHÍNH khoản cọc ⇒ ignored + audit expected/received; đúng số ⇒ paid', async () => {
    fixture.allowFastClose(6_000_000);
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 6 });
    const code = fixture.savedDeposits[0].depositCode;
    expect(await depositService.markPaid({ depositCode: code, amount: 2_000_000, bankRefNumber: 'FT-OLD', actor: 'bank' })).toBe('ignored');
    expect(fixture.savedAudits.find((a) => a.actionType === 'DEPOSIT_AMOUNT_MISMATCH')?.newValue).toMatchObject({ expected: 6_150_000, received: 2_000_000 });
    expect(await depositService.markPaid({ depositCode: code, amount: 6_150_000, bankRefNumber: 'FT-OK', actor: 'bank' })).toBe('paid');
    expect(fixture.savedEscrow.find((e) => e.bankRefNumber === 'FT-OK')?.amount).toBe(6_150_000);
  });

  it('20. chốt nhanh: tiền về SAU 24 giờ ⇒ hoàn đúng số đã nhận, không giữ căn; khách báo giá lại được', async () => {
    fixture.allowFastClose(6_000_000);
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastCloseCycle: 1 });
    const dep = fixture.savedDeposits[0];
    const late = new Date(new Date(dep.quoteExpiresAt).getTime() + 60_000);
    expect(await depositService.markPaid({ depositCode: dep.depositCode, amount: dep.amount, bankRefNumber: 'FT-LATE', actor: 'bank', paidAt: late })).toBe('refunded');
    expect(dep.paymentStatus).toBe(DepositStatus.REFUNDED);
    expect(fixture.mockUnit.status).toBe(UnitStatus.AVAILABLE);
    expect(fixture.savedEscrow.filter((e) => e.depositId === dep.id).map((e) => [e.transType, e.amount])).toEqual([['INBOUND_DEPOSIT', 6_150_000], ['REFUND', 6_150_000]]);
    expect(fixture.savedAudits.map((a) => a.actionType)).toContain('DEPOSIT_QUOTE_EXPIRED_REFUND');
    await depositService.createDeposit('VS-88888', { id: TENANT_ID }, { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION });
    expect(fixture.savedDeposits).toHaveLength(1);
    expect(dep).toMatchObject({ paymentStatus: DepositStatus.PENDING_PAYMENT, amount: 6_500_000, fastCloseCycle: null });
  });
});
