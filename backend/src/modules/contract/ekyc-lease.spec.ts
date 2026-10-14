import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import * as pdfImport from 'pdf-parse';
const pdf = (pdfImport as any).default || pdfImport;
import { IdentityService } from '../identity/identity.service';
import { LeasePdfService } from './lease-pdf.service';
import { BookingAccessService } from '../tenant/booking-access.service';
import { DepositService } from '../deposit/deposit.service';
import { PhoneService } from '../auth/phone/phone.service';
import { EKYC_CONSENT_VERSION } from '../identity/ekyc.simulator';
import { LeaseSigningService, LEASE_SIGN_METHOD } from './lease-signing.service';
import { DepositStatus, UnitStatus, ViewingStatus } from '@prisma/client';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000099';
const LANDLORD_ID = '00000000-0000-4000-8000-000000000030';
const UNIT_ID = '00000000-0000-4000-8000-000000000010';

function fakePrisma() {
  const mockUnit = {
    id: UNIT_ID,
    unitCode: 'VHOP-S1.02-1208',
    status: UnitStatus.HOLDING,
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
    minLeaseMonths: 6,
    landlordId: LANDLORD_ID,
    building: { buildingCode: 'S1.02', zoneName: 'The Sapphire 1' },
    media: [],
  };

  const now = new Date();
  const futureExpiresAt = new Date(now.getTime() + 48 * 3600 * 1000);

  let savedDeposit: any = {
    id: 'dep-1',
    depositCode: 'DEP-VS-99999',
    viewingId: 'viewing-1',
    unitId: UNIT_ID,
    // Cọc v2: khách đã chuyển thẳng Tiền cọc bảo đảm (= 1 tháng thuê của căn) theo điều khoản v2.
    amount: 6500000,
    termsVersion: 'DEP-2026.10-v2',
    vietqrRef: 'VQ-9999',
    transferContent: 'COC VHOP-S1.02-1208 0912345678',
    paymentStatus: DepositStatus.PAID_HOLDING,
    paidAt: now,
    holdHours: 48,
    expiresAt: futureExpiresAt,
    identity: null,
    contract: null,
  };

  let savedViewing: any = {
    id: 'viewing-1',
    bookingRefCode: 'VS-99999',
    unitId: UNIT_ID,
    tenantId: TENANT_ID,
    status: ViewingStatus.HOLDING,
    viewingSlot: now,
    partySize: 1,
    contactName: 'NGUYỄN VĂN AN',
    contactPhoneEnc: null,
    unit: mockUnit,
    tenant: { id: TENANT_ID, fullName: 'NGUYỄN VĂN AN' },
    tickets: [],
    deposit: savedDeposit,
  };

  let savedContracts: any[] = [];
  let savedDocuments: any[] = [];
  let savedIdentities: any[] = [];
  let savedAudits: any[] = [];
  const savedSignatures: any[] = [];

  const prisma: Record<string, any> = {
    unit: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.id === mockUnit.id || where.unitCode === mockUnit.unitCode) return { ...mockUnit };
        return null;
      }),
      update: jest.fn(async ({ where, data }) => {
        Object.assign(mockUnit, data);
        return { ...mockUnit };
      }),
      updateMany: jest.fn(async ({ data }) => {
        Object.assign(mockUnit, data);
        return { count: 1 };
      }),
    },
    viewing: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.bookingRefCode === savedViewing.bookingRefCode || where.id === savedViewing.id) {
          return {
            ...savedViewing,
            deposit: savedDeposit
              ? {
                  ...savedDeposit,
                  identity: savedIdentities.find((i) => i.depositId === savedDeposit.id) || null,
                  contract: savedContracts.find((c) => c.holdingDepositId === savedDeposit.id) || null,
                }
              : null,
          };
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
        if (savedDeposit && (savedDeposit.id === where.id || savedDeposit.viewingId === where.viewingId)) {
          return {
            ...savedDeposit,
            identity: savedIdentities.find((i) => i.depositId === savedDeposit.id) || null,
            contract: savedContracts.find((c) => c.holdingDepositId === savedDeposit.id) || null,
          };
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }) => {
        if (!savedDeposit) return [];
        if (where.unitId && savedDeposit.unitId !== where.unitId) return [];
        const status = where.paymentStatus;
        if (status && (status.in ? !status.in.includes(savedDeposit.paymentStatus) : savedDeposit.paymentStatus !== status)) return [];
        const exp = savedDeposit.expiresAt ? new Date(savedDeposit.expiresAt).getTime() : null;
        if (where.expiresAt?.lte && (exp === null || exp > new Date(where.expiresAt.lte).getTime())) return [];
        if (where.expiresAt?.gt && (exp === null || exp <= new Date(where.expiresAt.gt).getTime())) return [];
        return [{ ...savedDeposit, viewing: savedViewing }];
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!savedDeposit || savedDeposit.id !== where.id) return { count: 0 };
        if (where.paymentStatus && savedDeposit.paymentStatus !== where.paymentStatus) return { count: 0 };
        Object.assign(savedDeposit, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }) => {
        if (savedDeposit && savedDeposit.id === where.id) {
          Object.assign(savedDeposit, data);
          return { ...savedDeposit };
        }
        return { id: where.id, ...data };
      }),
    },
    identityVerification: {
      create: jest.fn(async ({ data }) => {
        const idn = { id: `idn-${savedIdentities.length + 1}`, ...data };
        savedIdentities.push(idn);
        if (savedDeposit) savedDeposit.identity = idn;
        return idn;
      }),
    },
    contract: {
      count: jest.fn(async () => savedContracts.length),
      findUnique: jest.fn(async ({ where }) => {
        // Prisma thật ném lỗi (⇒ 500) khi cột uuid nhận chuỗi không phải UUID.
        if (where.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(where.id)) {
          throw new Error('Inconsistent column data: Error creating UUID, invalid character');
        }
        const found = savedContracts.find((c) => c.id === where.id || c.contractNumber === where.contractNumber);
        if (found) {
          const doc = savedDocuments.find((d) => d.id === found.documentId);
          return {
            ...found,
            unit: mockUnit,
            document: doc || null,
            landlord: { id: LANDLORD_ID, fullName: 'Chủ Hộ A' },
            tenant: { id: TENANT_ID, fullName: 'NGUYỄN VĂN AN' },
            holdingDeposit: {
              ...savedDeposit,
              identity: savedIdentities.find((i) => i.depositId === savedDeposit.id) || null,
              viewing: savedViewing,
            },
          };
        }
        return null;
      }),
      create: jest.fn(async ({ data, include }) => {
        const c = {
          id: `00000000-0000-4000-8000-${String(savedContracts.length + 1).padStart(12, '0')}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        savedContracts.push(c);
        if (savedDeposit) savedDeposit.contract = c;
        return {
          ...c,
          unit: mockUnit,
          document: null,
          holdingDeposit: { ...savedDeposit, viewing: savedViewing },
        };
      }),
      update: jest.fn(async ({ where, data }) => {
        const c = savedContracts.find((x) => x.id === where.id);
        if (c) {
          Object.assign(c, data);
          return { ...c };
        }
        return { id: where.id, ...data };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const c = savedContracts.find((x) => x.id === where.id && (where.documentId === null ? !x.documentId : true));
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      }),
    },
    signature: {
      create: jest.fn(async ({ data }) => {
        savedSignatures.push(data);
        return data;
      }),
    },
    signedDocument: {
      update: jest.fn(async ({ where, data }) => {
        const doc = savedDocuments.find((d) => d.id === where.id);
        Object.assign(doc, data);
        return doc;
      }),
      findUnique: jest.fn(async ({ where }) => {
        return savedDocuments.find((d) => d.id === where.id) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const doc = { id: `doc-${savedDocuments.length + 1}`, ...data };
        savedDocuments.push(doc);
        return doc;
      }),
      delete: jest.fn(async ({ where }) => {
        const i = savedDocuments.findIndex((d) => d.id === where.id);
        if (i >= 0) savedDocuments.splice(i, 1);
        return { id: where.id };
      }),
    },
    exclusiveMandate: {
      findFirst: jest.fn(async () => null),
    },
    profile: {
      findFirst: jest.fn(async () => ({ id: '00000000-0000-4000-8000-0000000000ad' })),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    escrowTransaction: {
      create: jest.fn(async ({ data }) => data),
    },
    auditLog: {
      create: jest.fn(async ({ data }) => {
        savedAudits.push(data);
        return data;
      }),
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
    getSavedViewing: () => savedViewing,
    setSavedViewing: (v: any) => {
      savedViewing = v;
    },
    getSavedDeposit: () => savedDeposit,
    setSavedDeposit: (d: any) => {
      savedDeposit = d;
    },
    savedContracts,
    savedDocuments,
    savedIdentities,
    savedSignatures,
    savedAudits,
  };
}

describe('eKYC (mô phỏng OCR) → ký Hợp đồng thuê (POST /contracts/lease/sign)', () => {
  let identityService: IdentityService;
  let leasePdfService: LeasePdfService;
  let leaseSigning: LeaseSigningService;
  let fixture: ReturnType<typeof fakePrisma>;
  let phoneService: PhoneService;
  const ME = { id: TENANT_ID };
  /** Ngày giờ VN cách hôm nay `n` ngày (T0 = hôm nay vì cọc về `now`). */
  const vnDay = (n: number) => new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
  const lease = (over: Record<string, unknown> = {}) => ({
    bookingRef: 'VS-99999',
    startDate: vnDay(3), // trong khung miễn phí (T0+2 … T0+7)
    months: 12,
    paymentCycle: 1 as const,
    signatureSvg: '<svg><path d="M0 0L10 10"/></svg>',
    ...over,
  });

  const ENV_KEYS = ['LEASE_PDF_LOCAL_DIR', 'DATABASE_URL', 'NODE_ENV', 'EKYC_SCAN_SECRET'];
  let savedEnv: Record<string, string | undefined>;
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.LEASE_PDF_LOCAL_DIR = './tmp/test-lease-pdfs';
    // Bộ lưu PDF cục bộ chỉ chạy với DB local (chốt an toàn của LeasePdfService); test dùng Prisma giả.
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:55432/vinstay_dev';
    process.env.NODE_ENV = 'test';
    process.env.EKYC_SCAN_SECRET = 'test_ekyc_scan_secret_key';

    fixture = fakePrisma();
    phoneService = new PhoneService(new ConfigService({ AES_SECRET_KEY: 'a-test-master-secret-of-32-chars!!', NODE_ENV: 'test' }));
    fixture.getSavedViewing().contactPhoneEnc = phoneService.encrypt('+84912345678');
    const bookingAccess = new BookingAccessService(fixture.prisma as any);
    const auditService = { log: jest.fn(async () => {}) } as any;
    leasePdfService = new LeasePdfService(
      fixture.prisma as any,
      { getClient: jest.fn(() => null), isConfigured: jest.fn(() => false) } as any,
      auditService,
      phoneService,
    );
    leasePdfService.onModuleInit();
    const depositService = new DepositService(fixture.prisma as any, auditService, phoneService, bookingAccess);
    identityService = new IdentityService(fixture.prisma as any, phoneService, bookingAccess, depositService);
    leaseSigning = new LeaseSigningService(fixture.prisma as any, phoneService, bookingAccess, depositService, leasePdfService);
  });

  const scan = () => identityService.scan('VS-99999', ME, { consent: true, consentVersion: EKYC_CONSENT_VERSION });
  const verify = async () => {
    const s = await scan();
    return identityService.submit('VS-99999', ME, {
      scanId: s.scanId,
      consentVersion: EKYC_CONSENT_VERSION,
      fields: s.fields,
      confirmedLowConfidence: true,
    });
  };

  it('scan trả kết quả OCR mô phỏng (simulated=true), độ tin cậy từng trường và scanId', async () => {
    const s = await scan();
    expect(s.simulated).toBe(true);
    expect(s.scanId).toMatch(/\./);
    expect(s.fields.fullName).toBe('NGUYỄN VĂN AN');
    expect(s.lowConfidenceKeys.length).toBeGreaterThan(0);
  });

  it('eKYC sau expiresAt → 409 hold_expired, cọc FORFEITED, căn mở lại', async () => {
    fixture.getSavedDeposit().expiresAt = new Date(Date.now() - 60_000);
    await expect(scan()).rejects.toMatchObject({ response: { code: 'hold_expired' } });
    expect(fixture.getSavedDeposit().paymentStatus).toBe(DepositStatus.FORFEITED);
    expect(fixture.mockUnit.status).toBe(UnitStatus.AVAILABLE);
  });

  it('thiếu confirmedLowConfidence → 422 kyc_confirmation_required, không lưu gì', async () => {
    const s = await scan();
    await expect(
      identityService.submit('VS-99999', ME, { scanId: s.scanId, consentVersion: EKYC_CONSENT_VERSION, fields: s.fields, confirmedLowConfidence: false }),
    ).rejects.toMatchObject({ response: { code: 'kyc_confirmation_required' } });
    expect(fixture.savedIdentities).toHaveLength(0);
  });

  it('consentVersion lạ → 409 terms_version_stale; hợp lệ thì ghi bản của token', async () => {
    const s = await scan();
    const body = { scanId: s.scanId, fields: s.fields, confirmedLowConfidence: true };
    await expect(identityService.submit('VS-99999', ME, { ...body, consentVersion: 'PRIVACY-1999' })).rejects.toMatchObject({
      response: { code: 'terms_version_stale' },
    });
    expect(fixture.savedIdentities).toHaveLength(0);
    await identityService.submit('VS-99999', ME, { ...body, consentVersion: EKYC_CONSENT_VERSION });
    expect(fixture.savedIdentities[0].consentVersion).toBe(EKYC_CONSENT_VERSION);
  });

  it('eKYC hợp lệ → chỉ lưu IdentityVerification (mã hoá, provider SIMULATED), CHƯA có hợp đồng; lần 2 → ekyc_already_done', async () => {
    const { booking } = await verify();
    expect(fixture.savedIdentities).toHaveLength(1);
    expect(fixture.savedIdentities[0].providerName).toBe('SIMULATED');
    expect(fixture.savedIdentities[0].verifiedDataRef).not.toContain('NGUYỄN');
    expect(JSON.parse(phoneService.decrypt(fixture.savedIdentities[0].verifiedDataRef)).fullName).toBe('NGUYỄN VĂN AN');
    expect(fixture.savedContracts).toHaveLength(0);
    expect(booking.status).toBe('holding');
    await expect(scan()).rejects.toMatchObject({ response: { code: 'ekyc_already_done' } });
  });

  it('ký khi chưa eKYC → 409 no_kyc, không tạo hợp đồng', async () => {
    await expect(leaseSigning.sign(ME, lease())).rejects.toMatchObject({ response: { code: 'no_kyc' } });
    expect(fixture.savedContracts).toHaveLength(0);
  });

  it('người khác ký lịch của tôi → 404 booking_not_found', async () => {
    await verify();
    await expect(leaseSigning.sign({ id: OTHER_USER_ID }, lease())).rejects.toMatchObject({ response: { code: 'booking_not_found' } });
  });

  it.each([
    ['months < minLeaseMonths', { months: 3 }],
    ['months > 36', { months: 37 }],
    ['kỳ thanh toán 2 tháng', { paymentCycle: 2 }],
    ['ngày dọn vào trong quá khứ', { startDate: '2020-01-01' }],
    ['ngày dọn vào sớm hơn T0+2 (BQL chưa kịp duyệt)', { startDate: vnDay(1) }],
    ['ngày dọn vào quá T0+30', { startDate: vnDay(31) }],
    ['ngày sai định dạng', { startDate: '2026-02-30' }],
  ])('điều khoản sai (%s) → 422 lease_terms_invalid', async (_label, over) => {
    await verify();
    await expect(leaseSigning.sign(ME, lease(over) as any)).rejects.toMatchObject({ response: { code: 'lease_terms_invalid' } });
    expect(fixture.savedContracts).toHaveLength(0);
  });

  it('ký hợp lệ (cọc v2) → HĐ ACTIVE, khoản đã chuyển = 100% Tiền cọc bảo đảm (không thu bù), căn RENTED, lịch LEASED, audit', async () => {
    await verify();
    const { contract, booking } = await leaseSigning.sign(ME, lease({ paymentCycle: 3 }));
    expect(contract.status).toBe('active');
    expect(contract.convertedHolding).toBe(6_500_000);
    expect(contract.securityDeposit).toBe(6_500_000);
    expect(contract.startDate).toBe(vnDay(3)); // dọn vào trong khung miễn phí ⇒ tính tiền từ ngày dọn vào
    expect(fixture.getSavedDeposit().paymentStatus).toBe(DepositStatus.CONVERTED_TO_CONTRACT);
    expect(fixture.mockUnit.status).toBe(UnitStatus.RENTED);
    expect(fixture.getSavedViewing().status).toBe(ViewingStatus.LEASED);
    expect(booking.status).toBe('leased');
    expect(fixture.savedAudits.map((a: any) => a.actionType)).toContain('LEASE_ESTABLISHED');
    // Kỳ đầu = tiền thuê × chu kỳ; cọc đã đủ nên không thu bù; cọc KHÔNG bị trừ vào tiền thuê.
    expect(contract.firstPaymentDue.rent).toBe(6_500_000 * 3);
    expect(contract.firstPaymentDue.depositTopUp).toBe(0);
    expect(contract.firstPaymentDue.transferContent).toBe('VSA VHOP-S1.02-1208 THANH TOAN TIEN THUE KY 1');
  });

  it('cọc giữ chỗ CŨ (điều khoản HOLD-*, 2tr) vẫn ký được: cọc bảo đảm theo căn, kỳ đầu thu phần chênh', async () => {
    Object.assign(fixture.getSavedDeposit(), { amount: 2_000_000, termsVersion: 'HOLD-2026.10-v1' });
    await verify();
    const { contract } = await leaseSigning.sign(ME, lease());
    expect(contract.convertedHolding).toBe(2_000_000);
    expect(contract.securityDeposit).toBe(6_500_000);
    expect(contract.firstPaymentDue.depositTopUp).toBe(6_500_000 - 2_000_000);
  });

  it('Smart Move-in: dọn vào sau 7 ngày ⇒ HĐ & tiền thuê bắt đầu T0+7; audit ghi ngày dọn vào + ngày tính tiền', async () => {
    await verify();
    const { contract } = await leaseSigning.sign(ME, lease({ startDate: vnDay(20) }));
    expect(contract.startDate).toBe(vnDay(7));
    const audit = fixture.savedAudits.find((a: any) => a.actionType === 'LEASE_ESTABLISHED');
    expect(audit.newValue).toMatchObject({ moveInDate: vnDay(20), billingStartDate: vnDay(7) });
  });

  it('chốt nhanh: HĐ dùng giá đã chốt + bắt buộc đúng chu kỳ đã cam kết', async () => {
    Object.assign(fixture.getSavedDeposit(), { amount: 6_150_000, baseAmount: 6_500_000, fastCloseCycle: 3, quotedMonthlyRent: 6_150_000 });
    await verify();
    await expect(leaseSigning.sign(ME, lease({ paymentCycle: 1 }))).rejects.toMatchObject({ response: { code: 'lease_terms_invalid', errors: { paymentCycle: 3 } } });
    const { contract } = await leaseSigning.sign(ME, lease({ paymentCycle: 3 }));
    expect(contract.monthlyRent).toBe(6_150_000);
    expect(contract.securityDeposit).toBe(6_150_000);
    expect(contract.firstPaymentDue.rent).toBe(6_150_000 * 3);
    expect(fixture.savedAudits.find((a: any) => a.actionType === 'LEASE_ESTABLISHED').newValue).toMatchObject({ fastCloseCycle: 3, monthlyRent: 6_150_000 });
  });

  it('PDF thật (bắt đầu %PDF-, có số HĐ, SHA-256 thật), Signature của khách + TSA mô phỏng; người khác tải → 404', async () => {
    await verify();
    const { contract } = await leaseSigning.sign(ME, lease());
    expect(fixture.savedDocuments).toHaveLength(1);
    const doc = fixture.savedDocuments[0];
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.tsaToken).toMatch(/^SIMULATED-TSA-/);
    expect(fixture.savedSignatures).toHaveLength(1);
    expect(fixture.savedSignatures[0]).toMatchObject({ signerId: TENANT_ID, signerRole: 'tenant', method: LEASE_SIGN_METHOD, documentId: doc.id });

    const { buffer } = await leasePdfService.getPdfStream(contract.id, TENANT_ID, 'tenant');
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const parsed = await pdf(buffer);
    expect(parsed.text).toContain('HỢP ĐỒNG THUÊ CĂN HỘ CHUNG CƯ');
    expect(parsed.text).toContain(contract.contractNumber);
    await expect(leasePdfService.getPdfStream(contract.id, OTHER_USER_ID, 'tenant')).rejects.toThrow(NotFoundException);
  });

  it('ký lần 2 → 409 (lịch đã LEASED), vẫn đúng một hợp đồng', async () => {
    await verify();
    await leaseSigning.sign(ME, lease());
    await expect(leaseSigning.sign(ME, lease())).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.savedContracts).toHaveLength(1);
  });

  it('thiếu chữ ký tay → 422 signature_required', async () => {
    await verify();
    await expect(leaseSigning.sign(ME, lease({ signatureSvg: '  ' }))).rejects.toMatchObject({ response: { code: 'signature_required' } });
  });
});
