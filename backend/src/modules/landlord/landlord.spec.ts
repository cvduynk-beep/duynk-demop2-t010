import { CanActivate, ExecutionContext, ForbiddenException, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '../../common/guards/roles.guard';
import { InspectorAssigner } from '../inspection/inspector-assigner.service';
import { ConsignmentMetaStore } from './consignment-meta.store';
import { LandlordAccessService } from './landlord-access.service';
import { LandlordConsignmentService } from './landlord-consignment.service';
import { LandlordDirectoryService } from './landlord-directory.service';
import { LandlordFeeService } from './landlord-fee.service';
import { LandlordController } from './landlord.controller';
import { LandlordFinanceService } from './landlord-finance.service';
import { HoldExpiryService } from '../deposit/hold-expiry.service';
import { LandlordVerificationService } from './landlord-verification.service';
import { LandlordPriceInsightService } from './landlord-price-insight.service';
import { EkycSimulator } from '../identity/ekyc.simulator';
import { LandlordMandateService } from './landlord-mandate.service';
import { LandlordPricingService } from './landlord-pricing.service';
import { LandlordPhotoService, displayName } from './landlord-photo.service';
import { sniffImage } from './landlord-photo-storage.service';
import { LandlordUnitsService } from './landlord-units.service';
import { LandlordService } from './landlord.service';
import { MAX_PHOTO_BYTES, consignmentStage, isConsigned, lastMonths, maskPhone, toLayoutType, withConsignmentMeta } from './landlord.mappers';

const ME = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const MANDATE_ID = '00000000-0000-4000-8000-0000000000cc';
const UNIT_ID = '00000000-0000-4000-8000-0000000000dd';
const NOW = new Date('2026-10-02T03:00:00Z');
/** Tài khoản thụ hưởng đã xác thực trong hồ sơ chủ nhà (mã hoá) — điều kiện để ký gửi. */
const PAYOUT_ROW = { payoutBankName: 'VCB', payoutAccountEnc: 'ENC(0011223344)', payoutAccountHolder: 'TRAN B' };

const building = { id: 'b1', buildingCode: 'S1.02', zoneName: 'The Sapphire 1', totalFloors: 28 };

function mandateRow(over: Record<string, unknown> = {}, unitOver: Record<string, unknown> = {}) {
  return {
    id: MANDATE_ID,
    unitId: UNIT_ID,
    contractNumber: 'UQ-2026-S102-ABC123',
    status: 'ACTIVE',
    signedAt: null,
    exitRequestedAt: null,
    exitEffectiveAt: null,
    doorAccessConfig: null,
    createdAt: NOW,
    unit: {
      id: UNIT_ID,
      unitCode: 'VHOP-S1.02-1208',
      landlordId: ME,
      status: 'AVAILABLE',
      floorNumber: 12,
      layoutType: 'ONE_BED_PLUS',
      carpetAreaM2: 47,
      baseRentPrice: 6_500_000,
      doorLockType: 'ELECTRONIC_PIN',
      building,
      ...unitOver,
    },
    ...over,
  };
}

/**
 * Prisma giả tối thiểu: chỉ các hàm mà khu Chủ nhà gọi, mỗi hàm là jest.fn để test kiểm tra tham số.
 * `$transaction` chạy TUẦN TỰ (mỗi giao dịch chờ giao dịch trước xong) để mô phỏng khóa dòng `FOR UPDATE`;
 * `state.mandate` là dòng ủy quyền duy nhất mà `ConsignmentMetaStore` đọc/ghi qua `tx` (dùng `seed()` để đặt).
 */
function fakePrisma() {
  const state: { mandate: any } = { mandate: null };
  let chain: Promise<unknown> = Promise.resolve();
  const tx: Record<string, any> = {
    unit: { create: jest.fn(async ({ data }) => ({ id: UNIT_ID, ...data })) },
    doorAccessKey: { create: jest.fn(async () => ({})) },
    exclusiveMandate: {
      create: jest.fn(async ({ data }) => mandateRow({ ...data, id: MANDATE_ID, createdAt: NOW }, { unitCode: data.unitCode })),
      findUnique: jest.fn(async (_args?: any) => state.mandate),
      findMany: jest.fn(async (_args?: any) => []),
      update: jest.fn(async ({ data }) => {
        state.mandate = { ...state.mandate, ...data };
        return state.mandate;
      }),
    },
    $queryRaw: jest.fn(async (..._args: any[]) => []),
  };
  const prisma = {
    tx,
    state,
    seed(row: any) {
      state.mandate = row;
      prisma.exclusiveMandate.findFirst.mockResolvedValue(row);
    },
    building: { findUnique: jest.fn(async () => building) },
    unit: { findUnique: jest.fn(async (_args?: any) => null), findFirst: jest.fn(), findMany: jest.fn(async (_args?: any) => []) },
    exclusiveMandate: { findFirst: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn(async ({ where, data }) => mandateRow({ ...data, id: where.id })) },
    feeConfig: { findUnique: jest.fn(async () => null) },
    profile: { findUnique: jest.fn(async (_args?: any): Promise<any> => ({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: false })) },
    contract: { findMany: jest.fn(async () => []), findFirst: jest.fn(async (_args?: any) => null) },
    fieldHost: { findFirst: jest.fn(async () => ({ id: 'host-1' })), findMany: jest.fn(async (_args?: any): Promise<any[]> => []) },
    viewing: { findMany: jest.fn(async (_args?: any) => []) },
    auditLog: { findMany: jest.fn(async (_args?: any) => []) },
    holdingDeposit: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn((fn: any) => {
      const run = chain.then(() => fn(tx));
      chain = run.catch(() => undefined);
      return run;
    }),
  };
  tx.fieldHost = prisma.fieldHost;
  return prisma;
}

const feeOf = (prisma: ReturnType<typeof fakePrisma>) => new LandlordFeeService(prisma as any);

describe('Landlord mappers', () => {
  it('nhận cả giá trị UI lẫn enum Prisma cho layout, từ chối giá trị lạ', () => {
    expect(toLayoutType('1PN')).toBe('ONE_BED_PLUS');
    expect(toLayoutType('THREE_BED')).toBe('THREE_BED');
    expect(toLayoutType('penthouse')).toBeNull();
  });

  it('che SĐT: giữ 4 số đầu và 3 số cuối', () => {
    expect(maskPhone('+84901234567')).toBe('0901 *** 567');
    expect(maskPhone(null)).toBeNull();
  });

  it('suy trạng thái hồ sơ: chờ Host → duyệt; meta.stage ghi đè', () => {
    expect(consignmentStage({ status: 'PENDING_INSPECTION' as any, signedAt: NOW, doorAccessConfig: null })).toBe('awaiting_host');
    expect(consignmentStage({ status: 'ACTIVE' as any, signedAt: NOW, doorAccessConfig: null })).toBe('approved');
    const inspecting = withConsignmentMeta(null, { form: {} as any, stage: 'inspecting' });
    expect(consignmentStage({ status: 'PENDING_INSPECTION' as any, signedAt: NOW, doorAccessConfig: inspecting })).toBe('inspecting');
  });

  it('lastMonths trả đúng 6 tháng, cũ → mới, tháng cuối là tháng hiện tại', () => {
    const months = lastMonths(6, NOW);
    expect(months.map((m) => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(months[5].label).toBe('T10');
  });
});

describe('LandlordAccessService — chống đọc/sửa dữ liệu của chủ nhà khác', () => {
  it('truy vấn luôn kèm landlordId của phiên; căn không thuộc về mình → 404', async () => {
    const prisma = fakePrisma();
    prisma.unit.findFirst.mockResolvedValue(null);
    const access = new LandlordAccessService(prisma as any);

    await expect(access.ownedUnit(ME, UNIT_ID)).rejects.toMatchObject({ status: 404 });
    expect(prisma.unit.findFirst).toHaveBeenCalledWith({ where: { landlordId: ME, id: UNIT_ID } });

    await access.ownedUnit(ME, 'VHOP-S1.02-1208').catch(() => undefined);
    expect(prisma.unit.findFirst).toHaveBeenLastCalledWith({ where: { landlordId: ME, unitCode: 'VHOP-S1.02-1208' } });
  });

  it('id ủy quyền không phải uuid → 404, không chạm DB', async () => {
    const prisma = fakePrisma();
    const access = new LandlordAccessService(prisma as any);
    await expect(access.ownedMandate(ME, 'not-a-uuid')).rejects.toMatchObject({ status: 404 });
    expect(prisma.exclusiveMandate.findFirst).not.toHaveBeenCalled();
  });
});

describe('LandlordConsignmentService', () => {
  const dto = { building: 'S1.02', floor: 12, door: '08', layout: '1PN', areaM2: 47, askRent: 6_500_000, ownershipWarranted: true, otp: '4829' };
  let prisma: ReturnType<typeof fakePrisma>;
  let audit: { log: jest.Mock };
  let otp: { verify: jest.Mock; consume: jest.Mock; send: jest.Mock; expiresInSeconds: number };
  let phones: { encrypt: jest.Mock; decrypt: jest.Mock; normalize: jest.Mock };
  let service: LandlordConsignmentService;

  beforeEach(() => {
    prisma = fakePrisma();
    audit = { log: jest.fn() };
    otp = { verify: jest.fn(async () => ({ id: 'otp-1' })), consume: jest.fn(async () => true), send: jest.fn(async () => ({})), expiresInSeconds: 300 } as any;
    phones = {
      encrypt: jest.fn((v: string) => `ENC(${v})`),
      decrypt: jest.fn(() => '+84901234567'),
      normalize: jest.fn((v: string) => (/^0\d{9}$/.test(v) ? `+84${v.slice(1)}` : null)),
    };
    service = new LandlordConsignmentService(
      prisma as any,
      new LandlordAccessService(prisma as any),
      audit as any,
      otp as any,
      phones as any,
      { withUrls: jest.fn(async () => []) } as any,
      new ConsignmentMetaStore(prisma as any),
      new InspectorAssigner(),
      { assertReady: jest.fn(async () => ({ ready: true })) } as any,
    );
  });

  it('tạo hồ sơ: căn UNLISTED + ủy quyền PENDING_INSPECTION đã ký, vào thẳng awaiting_host, không lộ mã cửa', async () => {
    const out = await service.create(ME, { ...dto, doorCode: '839201', locks: ['smart'] } as any);

    expect(prisma.tx.unit.create.mock.calls[0][0].data).toMatchObject({
      unitCode: 'VHOP-S1.02-1208',
      landlordId: ME,
      status: 'UNLISTED',
      isVerified: false,
      layoutType: 'ONE_BED_PLUS',
      managementFee: 446_500, // 47 m² × 9.500 (mặc định khi chưa có FeeConfig)
    });
    expect(prisma.tx.exclusiveMandate.create.mock.calls[0][0].data.status).toBe('PENDING_INSPECTION');
    expect(prisma.tx.doorAccessKey.create.mock.calls[0][0].data.vaultSecretRef).toBe('aes:ENC(839201)');
    // Mã cửa plaintext không được nằm trong meta hồ sơ hay trong phản hồi.
    expect(JSON.stringify(prisma.tx.exclusiveMandate.create.mock.calls[0][0].data)).not.toContain('839201');
    expect(JSON.stringify(out)).not.toContain('839201');
    expect(out).toMatchObject({ id: MANDATE_ID, status: 'awaiting_host', door: '08', layoutKind: '1PN' });
    expect(prisma.tx.exclusiveMandate.create.mock.calls[0][0].data.signedAt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'CONSIGNMENT_CREATED', actorId: ME }));
  });

  it.each([
    ['layout lạ', { layout: 'penthouse' }],
    ['cọc nhỏ hơn 50% giá thuê', { suggestedDeposit: 3_000_000 }],
    ['cọc quá 4 lần giá thuê', { suggestedDeposit: 6_500_000 * 4 + 1 }],
    ['khóa lạ', { locks: ['laser'] }],
    ['tầng vượt số tầng của tòa', { floor: 40 }],
  ])('từ chối %s bằng 400', async (_name, patch) => {
    await expect(service.create(ME, { ...dto, ...patch } as any)).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['1PN vượt trần 25 triệu', { askRent: 25_000_001, suggestedDeposit: 25_000_001 }, 'rent_above_ceiling'],
    ['Studio vượt trần 18 triệu', { layout: 'Studio', askRent: 18_500_000, suggestedDeposit: 18_500_000 }, 'rent_above_ceiling'],
    ['bật chốt nhanh nhưng thiếu giá sàn', { allowFastClose: true }, 'floor_rent_invalid'],
    ['giá sàn dưới 3 triệu', { allowFastClose: true, floorRent: 2_900_000 }, 'floor_rent_invalid'],
    ['giá sàn bằng giá chào', { allowFastClose: true, floorRent: 6_500_000 }, 'floor_rent_invalid'],
  ])('guardrail giá: %s ⇒ 400 %s, không ghi gì, không tiêu thụ OTP', async (_name, patch, code) => {
    await expect(service.create(ME, { ...dto, ...patch } as any)).rejects.toMatchObject({ status: 400, response: { code } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it('giá sàn hợp lệ: lưu trong meta hồ sơ (không có ở bảng units), chỉ trả cho chủ nhà; tắt chốt nhanh ⇒ floorRent null', async () => {
    const out = await service.create(ME, { ...dto, allowFastClose: true, floorRent: 5_800_000 } as any);
    expect(out).toMatchObject({ allowFastClose: true, floorRent: 5_800_000 });
    expect(JSON.stringify(prisma.tx.unit.create.mock.calls[0][0].data)).not.toContain('5800000');
    const meta = prisma.tx.exclusiveMandate.create.mock.calls[0][0].data.doorAccessConfig.consignment;
    expect(meta.form).toMatchObject({ allowFastClose: true, floorRent: 5_800_000 });

    const off = await service.create(ME, { ...dto, door: '09', floorRent: 5_800_000 } as any);
    expect(off).toMatchObject({ allowFastClose: false, floorRent: null });
  });

  it('tòa không tồn tại → 400; mã căn trùng → 409', async () => {
    prisma.building.findUnique.mockResolvedValueOnce(null);
    await expect(service.create(ME, dto as any)).rejects.toMatchObject({ status: 400 });
    prisma.unit.findUnique.mockResolvedValueOnce({ id: 'x' } as any);
    await expect(service.create(ME, dto as any)).rejects.toMatchObject({ status: 409 });
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it('danh sách hồ sơ: mọi ủy quyền đã ký (kể cả nhập thẳng DB, không meta ⇒ số liệu từ units); bỏ bản nháp cũ chưa ký', async () => {
    prisma.exclusiveMandate.findMany.mockResolvedValue([
      mandateRow(
        { id: 'm-seed', signedAt: NOW },
        { unitCode: 'VHOP-S1.02-0701', floorNumber: 7, doorNumber: null, securityDeposit: null, minLeaseMonths: 6, furnishing: 'FULL' },
      ),
      mandateRow({ id: 'm-draft', status: 'PENDING_INSPECTION', signedAt: null }),
    ] as any);
    const out = await service.list(ME);

    expect(out.map((c) => c.id)).toEqual(['m-seed']);
    expect(out[0]).toMatchObject({ status: 'approved', door: '01', askRent: 6_500_000, suggestedDeposit: 6_500_000, leaseTerm: 'mid', furnished: true });
  });

  describe('xác thực chủ nhà + tài khoản thụ hưởng', () => {
    it('chưa xác thực đủ ⇒ 403 landlord_not_verified, KHÔNG tiêu thụ OTP, không ghi gì', async () => {
      const gate = { assertReady: jest.fn(async () => { throw new ForbiddenException({ code: 'landlord_not_verified', missing: ['identity'] }); }) };
      (service as any).verification = gate;
      await expect(service.create(ME, dto as any)).rejects.toMatchObject({ status: 403, response: { code: 'landlord_not_verified' } });
      expect(otp.verify).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('đã xác thực: tài khoản đã xác thực trong hồ sơ được chép (mã hoá) vào meta căn; trả bản che', async () => {
      phones.decrypt.mockImplementation((v: string) => (v.startsWith('ENC(') ? v.slice(4, -1) : '+84901234567'));
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: false, payoutBankName: 'VCB', payoutAccountEnc: 'ENC(0011223344)', payoutAccountHolder: 'TRAN B' } as any);
      const out = await service.create(ME, dto as any);
      const meta = prisma.tx.exclusiveMandate.create.mock.calls[0][0].data.doorAccessConfig.consignment;
      expect(meta.payout).toEqual({ bankName: 'VCB', accountEnc: 'ENC(0011223344)', holder: 'TRAN B' });
      expect(JSON.stringify(meta)).not.toContain('"0011223344"'); // chỉ có bản mã hoá
      expect(out.payout).toEqual({ bankName: 'VCB', bankAccountMasked: '001****3344', bankAccountHolder: 'TRAN B' });
    });
  });

  describe('ký ủy quyền ngay khi tạo (không có bản nháp)', () => {
    const savedMeta = () => prisma.tx.exclusiveMandate.create.mock.calls[0][0].data.doorAccessConfig.consignment;

    it('thành công: verify + consume OTP, đặt signedAt, stage awaiting_host, hạn thẩm định 48h, gán Inspector', async () => {
      prisma.fieldHost.findMany.mockResolvedValue([{ id: 'host-1', createdAt: NOW }]);
      await service.create(ME, dto as any);

      expect(otp.verify).toHaveBeenCalledWith({ phone: '+84901234567', purpose: 'PHONE_VERIFY', code: '4829' });
      expect(otp.consume).toHaveBeenCalledWith('otp-1');
      const data = prisma.tx.exclusiveMandate.create.mock.calls[0][0].data;
      expect(data.signedAt).toBeInstanceOf(Date);
      const meta = savedMeta();
      expect(meta).toMatchObject({ stage: 'awaiting_host', hostId: 'host-1' });
      expect(new Date(meta.inspectDueAt).getTime() - new Date(meta.ownershipWarrantedAt).getTime()).toBe(48 * 3_600_000);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'CONSIGNMENT_SIGNED' }));
    });

    it('cọc ngoài 0.5–4× giá thuê (vd. thuê 10tr, cọc 100tr) → 400, không tiêu thụ OTP, không ghi gì', async () => {
      await expect(service.create(ME, { ...dto, askRent: 10_000_000, suggestedDeposit: 100_000_000 } as any)).rejects.toMatchObject({ status: 400 });
      expect(otp.verify).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cọc hợp lệ (4× giá thuê) → tạo được', async () => {
      await service.create(ME, { ...dto, askRent: 10_000_000, suggestedDeposit: 40_000_000 } as any);
      expect(prisma.tx.exclusiveMandate.create).toHaveBeenCalled();
    });

    it('không cam kết sở hữu → 400 và không tiêu thụ OTP', async () => {
      await expect(service.create(ME, { ...dto, ownershipWarranted: false } as any)).rejects.toMatchObject({ status: 400 });
      expect(otp.verify).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('chưa có SĐT và không gửi phone → 400, không tạo gì', async () => {
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: null });
      await expect(service.create(ME, dto as any)).rejects.toMatchObject({ status: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('OTP sai ⇒ lỗi từ OtpService, không tạo căn/ủy quyền', async () => {
      otp.verify.mockRejectedValueOnce(Object.assign(new Error('Mã OTP không đúng'), { status: 400 }));
      await expect(service.create(ME, dto as any)).rejects.toMatchObject({ status: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('chưa có SĐT nhưng gửi phone: xác thực OTP trên số đó, KHÔNG gắn vào tài khoản, lưu số ký (mã hoá) trong hồ sơ', async () => {
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: null });
      await service.create(ME, { ...dto, phone: '0901234567' } as any);

      expect(otp.verify).toHaveBeenCalledWith(expect.objectContaining({ phone: '+84901234567', code: '4829' }));
      expect(prisma.profile.findUnique).toHaveBeenCalled(); // chỉ ĐỌC hồ sơ; không có đường ghi Profile
      const saved = JSON.stringify(prisma.tx.exclusiveMandate.create.mock.calls[0][0]);
      expect(saved).toContain('signedPhoneEnc');
      expect(saved).not.toContain('0901234567');
    });

    it('số đã xác thực của tài khoản + không nhập số khác: KHÔNG cần OTP, vẫn lưu số ký, audit otpSkipped', async () => {
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: true });
      await service.create(ME, { ...dto, otp: undefined } as any);
      expect(otp.verify).not.toHaveBeenCalled();
      expect(otp.consume).not.toHaveBeenCalled();
      expect(JSON.stringify(prisma.tx.exclusiveMandate.create.mock.calls[0][0])).toContain('signedPhoneEnc');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'CONSIGNMENT_SIGNED', newValue: expect.objectContaining({ otpSkipped: true }) }));
    });

    it('số đã xác thực + nhập đúng số đó: vẫn không cần OTP', async () => {
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: true });
      await service.create(ME, { ...dto, otp: undefined, phone: '0901234567' } as any);
      expect(otp.verify).not.toHaveBeenCalled();
      expect(prisma.tx.exclusiveMandate.create).toHaveBeenCalled();
    });

    it('ĐỔI số (khác số đã xác thực): bắt buộc OTP trên số mới; thiếu OTP → 400, không tạo', async () => {
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: true });
      await expect(service.create(ME, { ...dto, otp: undefined, phone: '0999999999' } as any)).rejects.toMatchObject({ status: 400 });
      expect(prisma.tx.exclusiveMandate.create).not.toHaveBeenCalled();
      await service.create(ME, { ...dto, phone: '0999999999' } as any);
      expect(otp.verify).toHaveBeenCalledWith(expect.objectContaining({ phone: '+84999999999', code: '4829' }));
    });

    it('có số nhưng CHƯA xác thực: vẫn bắt buộc OTP trên số đã lưu', async () => {
      prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: false });
      await expect(service.create(ME, { ...dto, otp: undefined } as any)).rejects.toMatchObject({ status: 400 });
      await service.create(ME, dto as any);
      expect(otp.verify).toHaveBeenCalledWith(expect.objectContaining({ phone: '+84901234567' }));
    });
  });
});

describe('LandlordConsignmentService.get — phiếu thẩm định cho chủ nhà (E10)', () => {
  const build = (meta: any) => {
    const prisma = fakePrisma();
    prisma.seed(mandateRow({ status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: withConsignmentMeta(null, meta) }));
    (prisma.fieldHost as any).findUnique = jest.fn(async () => ({ profile: { fullName: 'Lê Thẩm Định' } }));
    const photos = {
      withUrls: jest.fn(async () => []),
      signPaths: jest.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://signed/${p}`]))),
    };
    const service = new LandlordConsignmentService(
      prisma as any, new LandlordAccessService(prisma as any), { log: jest.fn() } as any, {} as any, {} as any,
      photos as any, new ConsignmentMetaStore(prisma as any), new InspectorAssigner(),
      { assertReady: jest.fn(async () => ({ ready: true })) } as any,
    );
    return { prisma, photos, service };
  };

  it('chưa nộp phiếu ⇒ inspection null, không truy vấn Host/ký ảnh', async () => {
    const { prisma, photos, service } = build({ form: { building: 'S1.02', door: '08' } as any, stage: 'inspecting' });
    const out: any = await service.get(ME, MANDATE_ID);
    expect(out.inspection).toBeNull();
    expect(photos.signPaths).not.toHaveBeenCalled();
    expect((prisma.fieldHost as any).findUnique).not.toHaveBeenCalled();
  });

  it('đã nộp ⇒ inspection {hostName, submittedAt, report, photos có link ký}; không lộ path lưu trữ', async () => {
    const photo = { id: 'p1', path: 'inspections/m/p1.jpg', slot: '1', mime: 'image/jpeg', size: 1, width: 800, height: 600, sharpness: null, brightness: null, takenAt: null, uploadedAt: '2026-10-06T00:00:00.000Z', hostId: 'h1' };
    const report = { hostId: 'h1', submittedAt: '2026-10-06T01:00:00.000Z', recommendation: 'approve', avgCondition: 80 };
    const { service } = build({ form: { building: 'S1.02', door: '08' } as any, stage: 'approved', report, inspection: { photos: [photo] } });
    const out: any = await service.get(ME, MANDATE_ID);
    expect(out.inspection).toMatchObject({ hostName: 'Lê Thẩm Định', submittedAt: report.submittedAt, report });
    expect(out.inspection.photos).toEqual([expect.objectContaining({ id: 'p1', slot: '1', url: 'https://signed/inspections/m/p1.jpg' })]);
    expect(out.inspection.photos[0]).not.toHaveProperty('path');
  });
});

describe('LandlordConsignmentService.sendSignOtp', () => {
  const build = () => {
    const prisma = fakePrisma();
    const otp = { send: jest.fn(async () => undefined), expiresInSeconds: 300, resendInSeconds: 60 };
    const phones = {
      decrypt: jest.fn(() => '+84901234567'),
      normalize: jest.fn((v: string) => (/^0\d{9}$/.test(v) ? `+84${v.slice(1)}` : null)),
    };
    const service = new LandlordConsignmentService(
      prisma as any,
      new LandlordAccessService(prisma as any),
      { log: jest.fn() } as any,
      otp as any,
      phones as any,
      { withUrls: jest.fn(async () => []) } as any,
      new ConsignmentMetaStore(prisma as any),
      new InspectorAssigner(),
      { assertReady: jest.fn(async () => ({ ready: true })) } as any,
    );
    return { prisma, otp, service };
  };

  it('có số nhưng chưa xác thực → gửi OTP tới số đã lưu, trả SĐT đã che (không lộ số đầy đủ)', async () => {
    const { otp, service } = build();
    const out = await service.sendSignOtp(ME);
    expect(otp.send).toHaveBeenCalledWith({ phone: '+84901234567', purpose: 'PHONE_VERIFY' });
    expect(out).toEqual({ otpRequired: true, maskedPhone: '0901 *** 567', expiresInSeconds: 300, resendInSeconds: 60 });
    expect(JSON.stringify(out)).not.toContain('901234567');
  });

  it('OTP_PROVIDER=mock (OtpService trả devOtp) ⇒ response chuyển tiếp devOtp; kênh thật (trả {}) ⇒ không có trường này', async () => {
    const { otp, service } = build();
    otp.send.mockResolvedValueOnce({ devOtp: '0427' });
    expect(await service.sendSignOtp(ME)).toMatchObject({ otpRequired: true, devOtp: '0427' });
    expect(await service.sendSignOtp(ME)).not.toHaveProperty('devOtp');
  });

  it('số đã xác thực + không nhập số khác → otpRequired:false, KHÔNG gửi mã', async () => {
    const { prisma, otp, service } = build();
    prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: true });
    const out = await service.sendSignOtp(ME);
    expect(out).toMatchObject({ otpRequired: false, maskedPhone: '0901 *** 567' });
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('số đã xác thực nhưng nhập số KHÁC → gửi OTP tới số mới', async () => {
    const { prisma, otp, service } = build();
    prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: 'enc-phone', isPhoneVerified: true });
    const out = await service.sendSignOtp(ME, '0999999999');
    expect(otp.send).toHaveBeenCalledWith({ phone: '+84999999999', purpose: 'PHONE_VERIFY' });
    expect(out).toMatchObject({ otpRequired: true });
  });

  it('chưa có SĐT → dùng số client gửi; số sai định dạng → 400', async () => {
    const { prisma, otp, service } = build();
    prisma.profile.findUnique.mockResolvedValue({ ...PAYOUT_ROW, phoneEnc: null });
    await service.sendSignOtp(ME, '0912345678');
    expect(otp.send).toHaveBeenCalledWith({ phone: '+84912345678', purpose: 'PHONE_VERIFY' });
    await expect(service.sendSignOtp(ME, 'abc')).rejects.toMatchObject({ status: 400 });
    await expect(service.sendSignOtp(ME)).rejects.toMatchObject({ status: 400 });
  });
});

describe('LandlordMandateService — thoát ủy quyền', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let audit: { log: jest.Mock };
  let service: LandlordMandateService;

  beforeEach(() => {
    prisma = fakePrisma();
    audit = { log: jest.fn() };
    service = new LandlordMandateService(prisma as any, new LandlordAccessService(prisma as any), audit as any);
  });

  it('căn trống + ủy quyền ACTIVE → EXIT_REQUESTED, hiệu lực sau đúng 15 ngày', async () => {
    prisma.exclusiveMandate.findFirst.mockResolvedValue(mandateRow());
    const out = await service.requestExit(ME, { mandateId: MANDATE_ID, reason: 'Tự ở' }, NOW);

    const data = prisma.exclusiveMandate.update.mock.calls[0][0].data;
    expect(data.status).toBe('EXIT_REQUESTED');
    expect(data.exitEffectiveAt.getTime() - NOW.getTime()).toBe(15 * 86_400_000);
    expect(out).toMatchObject({ status: 'exiting', countdownDays: 15 });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'MANDATE_EXIT_REQUESTED' }));
  });

  it.each(['HOLDING', 'RENTED'])('căn %s → 409, không đổi trạng thái ủy quyền', async (status) => {
    prisma.exclusiveMandate.findFirst.mockResolvedValue(mandateRow({}, { status }));
    await expect(service.requestExit(ME, { mandateId: MANDATE_ID, reason: 'x' }, NOW)).rejects.toMatchObject({ status: 409 });
    expect(prisma.exclusiveMandate.update).not.toHaveBeenCalled();
  });

  it('đã đang thoát → 409; ủy quyền của người khác → 404', async () => {
    prisma.exclusiveMandate.findFirst.mockResolvedValue(mandateRow({ status: 'EXIT_REQUESTED' }));
    await expect(service.requestExit(ME, { mandateId: MANDATE_ID, reason: 'x' }, NOW)).rejects.toMatchObject({ status: 409 });
    prisma.exclusiveMandate.findFirst.mockResolvedValue(null);
    await expect(service.requestExit(OTHER, { mandateId: MANDATE_ID, reason: 'x' }, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it('hủy thoát: chỉ khi đang EXIT_REQUESTED, xóa mốc ngày', async () => {
    prisma.exclusiveMandate.findFirst.mockResolvedValue(mandateRow({ status: 'EXIT_REQUESTED' }));
    await service.cancelExit(ME, { mandateId: MANDATE_ID });
    expect(prisma.exclusiveMandate.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE', exitRequestedAt: null, exitEffectiveAt: null });

    prisma.exclusiveMandate.findFirst.mockResolvedValue(mandateRow());
    await expect(service.cancelExit(ME, { mandateId: MANDATE_ID })).rejects.toMatchObject({ status: 409 });
  });
});

describe('LandlordFinanceService', () => {
  const contract = (over: Record<string, unknown>) => ({
    unitId: UNIT_ID,
    status: 'ACTIVE',
    monthlyRentPrice: 10_000_000,
    securityDepositAmount: 10_000_000,
    startDate: new Date('2026-08-15'),
    endDate: new Date('2027-08-14'),
    ...over,
  });

  it('chưa cấu hình phí → mặc định 5% và báo feeSource=default; tính thực nhận theo tháng có hợp đồng', async () => {
    const prisma = fakePrisma();
    prisma.unit.findMany.mockResolvedValue([{ id: UNIT_ID, unitCode: 'U1', status: 'RENTED', building, mandates: [{ status: 'ACTIVE' }] }]);
    prisma.contract.findMany.mockResolvedValue([contract({})]);
    const out = await new LandlordFinanceService(prisma as any, feeOf(prisma)).getFinance(ME, NOW);

    expect(out).toMatchObject({ serviceFeePercent: 5, feeSource: 'default' });
    expect(out.thisMonth).toEqual({ gross: 10_000_000, fee: 500_000, forfeit: 0, net: 9_500_000 });
    // HĐ bắt đầu 15/08 → tháng 5,6,7 chưa có thu; 8,9,10 có thu.
    expect(out.history.map((m) => m.gross)).toEqual([0, 0, 0, 10_000_000, 10_000_000, 10_000_000]);
    expect(out.totalNet6Months).toBe(28_500_000);
    expect(out.perUnit[0]).toMatchObject({ rent: 10_000_000, fee: 500_000, net: 9_500_000, escrow: 10_000_000 });
    expect(out.escrowTotal).toBe(10_000_000);
  });

  it('dùng tỷ lệ Admin cấu hình; căn đang giữ chỗ tính cọc 2tr vào escrow, không có tiền thuê', async () => {
    const prisma = fakePrisma();
    prisma.feeConfig.findUnique.mockResolvedValue({ paramValue: 8 } as any);
    prisma.unit.findMany.mockResolvedValue([{ id: UNIT_ID, unitCode: 'U1', status: 'HOLDING', building, mandates: [{ status: 'ACTIVE' }] }]);
    prisma.holdingDeposit.findMany.mockResolvedValueOnce([{ unitId: UNIT_ID, amount: 2_000_000 }]).mockResolvedValueOnce([]);
    const out = await new LandlordFinanceService(prisma as any, feeOf(prisma)).getFinance(ME, NOW);

    expect(out).toMatchObject({ serviceFeePercent: 8, feeSource: 'config', escrowTotal: 2_000_000 });
    expect(out.perUnit[0]).toMatchObject({ status: 'holding', rent: 0, escrow: 2_000_000 });
  });

  it('cọc giữ chỗ còn hạn mới tính "giữ hộ" (lọc expiresAt > now)', async () => {
    const prisma = fakePrisma();
    await new LandlordFinanceService(prisma as any, feeOf(prisma)).getFinance(ME, NOW);
    const holdingWhere = (prisma.holdingDeposit.findMany.mock.calls as any[])[0][0].where;
    expect(holdingWhere).toMatchObject({ paymentStatus: 'PAID_HOLDING', expiresAt: { gt: NOW } });
  });

  it('cọc khách bỏ (FORFEITED): chủ nhà nhận 50% vào tháng của expiresAt, cộng thẳng vào thực nhận, không trừ phí', async () => {
    const prisma = fakePrisma();
    prisma.holdingDeposit.findMany
      .mockResolvedValueOnce([]) // cọc đang giữ
      .mockResolvedValueOnce([
        { id: 'd1', unitId: UNIT_ID, unit: { unitCode: 'U1' }, amount: 2_000_000, paidAt: new Date('2026-09-29T10:00:00Z'), expiresAt: new Date('2026-10-01T10:00:00Z') },
        { id: 'd2', unitId: UNIT_ID, unit: { unitCode: 'U1' }, amount: 2_000_000, paidAt: new Date('2026-09-18T10:00:00Z'), expiresAt: new Date('2026-09-20T10:00:00Z') },
      ]);
    const out = await new LandlordFinanceService(prisma as any, feeOf(prisma)).getFinance(ME, NOW);

    expect((prisma.holdingDeposit.findMany.mock.calls as any[])[1][0].where).toMatchObject({ paymentStatus: 'FORFEITED' });
    expect(out.thisMonth).toEqual({ gross: 0, fee: 0, forfeit: 1_000_000, net: 1_000_000 });
    expect(out.history.map((m) => m.forfeit)).toEqual([0, 0, 0, 0, 1_000_000, 1_000_000]);
    expect(out.totalNet6Months).toBe(2_000_000);
    expect(out.escrowTotal).toBe(0);
    // Liệt kê từng khoản: căn nào, cọc bao nhiêu, chủ nhà nhận bao nhiêu, hết hạn lúc nào.
    expect(out.forfeits).toEqual([
      expect.objectContaining({ depositId: 'd1', unitCode: 'U1', depositAmount: 2_000_000, share: 1_000_000, expiredAt: new Date('2026-10-01T10:00:00Z') }),
      expect.objectContaining({ depositId: 'd2', unitCode: 'U1', share: 1_000_000 }),
    ]);
  });
});

describe('HoldExpiryService', () => {
  const build = (due: { unitId: string }[]) => {
    const tx = { marker: 'tx' };
    const prisma = {
      holdingDeposit: { findMany: jest.fn(async (_args: unknown) => due) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const deposits = { expireIfDue: jest.fn(async (_unitId: string, _tx: unknown) => undefined) };
    return { prisma, deposits, tx, service: new HoldExpiryService(prisma as any, deposits as any) };
  };

  it('quét cọc PAID_HOLDING/UNC quá hạn của đúng chủ nhà, gọi expireIfDue cho từng căn trong transaction', async () => {
    const { prisma, deposits, tx, service } = build([{ unitId: 'u1' }, { unitId: 'u2' }]);
    const n = await service.sweep({ landlordId: ME }, NOW);

    expect(n).toBe(2);
    expect((prisma.holdingDeposit.findMany.mock.calls as any[])[0][0]).toMatchObject({
      where: { paymentStatus: { in: ['PAID_HOLDING', 'UNC_PENDING_REVIEW'] }, expiresAt: { lte: NOW }, unit: { landlordId: ME } },
      distinct: ['unitId'],
    });
    expect(deposits.expireIfDue).toHaveBeenCalledWith('u1', tx);
    expect(deposits.expireIfDue).toHaveBeenCalledWith('u2', tx);
  });

  it('một căn lỗi không chặn các căn khác; không lọc chủ nhà khi quét nền', async () => {
    const { prisma, deposits, service } = build([{ unitId: 'u1' }, { unitId: 'u2' }]);
    deposits.expireIfDue.mockRejectedValueOnce(new Error('boom'));
    expect(await service.sweep({}, NOW)).toBe(1);
    expect((prisma.holdingDeposit.findMany.mock.calls as any[])[0][0].where).not.toHaveProperty('unit');
  });
});

describe('LandlordUnitsService', () => {
  const unitRow = (over: Record<string, unknown> = {}) => ({
    id: UNIT_ID,
    unitCode: 'VHOP-S1.02-1208',
    landlordId: ME,
    status: 'AVAILABLE',
    floorNumber: 12,
    layoutType: 'ONE_BED_PLUS',
    carpetAreaM2: 47,
    baseRentPrice: 6_500_000,
    managementFee: 446_500,
    parkingFeeEstimate: 150_000,
    utilityCostEstimate: 600_000,
    doorLockType: 'ELECTRONIC_PIN',
    isVerified: true,
    building,
    mandates: [{ id: MANDATE_ID, status: 'ACTIVE', signedAt: new Date('2026-03-01'), exitRequestedAt: null, exitEffectiveAt: null, contractNumber: 'UQ-1' }],
    deposits: [],
    contract: [],
    media: [],
    viewings: [],
    _count: { viewings: 3 },
    ...over,
  });
  const build = (prisma: ReturnType<typeof fakePrisma>) =>
    new LandlordUnitsService(prisma as any, new LandlordAccessService(prisma as any), { decrypt: jest.fn(() => '+84901234567') } as any, feeOf(prisma), new LandlordDirectoryService(prisma as any));

  it('danh sách: lọc theo landlordId của phiên, ẩn hồ sơ còn chờ thẩm định, căn có khách đang xem → viewing', async () => {
    const prisma = fakePrisma();
    prisma.unit.findMany.mockResolvedValue([
      unitRow({ viewings: [{ id: 'v1' }] }),
      unitRow({ id: 'u2', mandates: [{ status: 'PENDING_INSPECTION' }] }),
    ] as any);
    const out = await build(prisma).list(ME);

    expect(prisma.unit.findMany.mock.calls[0][0].where).toEqual({ landlordId: ME });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ status: 'viewing', layoutKind: '1PN', lock: 'smart', rent: 6_500_000, totalViewings: 3 });
  });

  it('danh sách chỉ gồm căn ĐÃ qua ký gửi: không có ủy quyền (nhập thẳng DB) hoặc còn chờ thẩm định thì ẩn', async () => {
    const prisma = fakePrisma();
    prisma.unit.findMany.mockResolvedValue([
      unitRow({ id: 'ok' }),
      unitRow({ id: 'imported-no-mandate', mandates: [] }),
      unitRow({ id: 'pending', mandates: [{ status: 'PENDING_INSPECTION' }] }),
      unitRow({ id: 'ended', mandates: [{ status: 'TERMINATED', id: MANDATE_ID }] }),
    ] as any);
    const out = await build(prisma).list(ME);
    expect(out.map((u) => u.id)).toEqual(['ok', 'ended']);
  });

  it('isConsigned: chỉ true khi có ủy quyền và không còn PENDING_INSPECTION', () => {
    expect(isConsigned({ mandates: [] })).toBe(false);
    expect(isConsigned({ mandates: [{ status: 'PENDING_INSPECTION' as any }] })).toBe(false);
    for (const status of ['ACTIVE', 'EXIT_REQUESTED', 'TERMINATED', 'EXPIRED']) expect(isConsigned({ mandates: [{ status: status as any }] })).toBe(true);
  });

  it('chi tiết: không bao giờ include/trả DoorAccessKey; có All-in và ngày gia hạn ủy quyền', async () => {
    const prisma = fakePrisma();
    prisma.unit.findFirst.mockResolvedValue(unitRow() as any);
    const out = await build(prisma).detail(ME, UNIT_ID, NOW);

    expect(JSON.stringify(prisma.unit.findFirst.mock.calls[0][0])).not.toContain('doorKey');
    expect(JSON.stringify(out)).not.toMatch(/vault|doorKey|secret/i);
    expect(out.allInCost.total).toBe(6_500_000 + 446_500 + 150_000 + 600_000);
    expect(out.mandate?.renewsAt).toEqual(new Date('2027-03-01'));
  });

  it('chi tiết: HĐ đang chạy có phí dịch vụ và số chủ nhà thực nhận theo tỷ lệ cấu hình', async () => {
    const prisma = fakePrisma();
    prisma.feeConfig.findUnique.mockResolvedValue({ paramValue: 5 } as any);
    prisma.unit.findFirst.mockResolvedValue(unitRow() as any);
    prisma.contract.findFirst.mockResolvedValue({
      contractNumber: 'HD-1',
      monthlyRentPrice: 10_000_000,
      securityDepositAmount: 10_000_000,
      leaseTermMonths: 12,
      startDate: NOW,
      endDate: NOW,
      tenant: { fullName: 'Khách B' },
    } as any);
    const out = await build(prisma).detail(ME, UNIT_ID, NOW);
    expect(out.lease).toMatchObject({ rent: 10_000_000, serviceFee: 500_000, landlordNet: 9_500_000, tenantName: 'Khách B' });
  });

  it('chi tiết gom luôn nhật ký xem phòng + mở cửa, và mọi truy vấn song song đều bị khóa theo landlordId', async () => {
    const prisma: any = fakePrisma();
    const t0 = new Date('2026-10-01T02:00:00Z');
    prisma.unit.findFirst.mockResolvedValue(unitRow() as any);
    prisma.fieldHost.findMany.mockResolvedValue([{ id: 'h1', assignedZone: 'The Sapphire 1 (S1.01 - S1.06)', profile: { fullName: 'Host A' } }]);
    prisma.viewing.findMany.mockResolvedValue([
      { id: 'v1', bookingRefCode: 'R1', viewingSlot: t0, status: 'CONFIRMED', lobbyCheckInAt: t0, completedAt: null, tenant: { fullName: 'Khách A', phoneEnc: 'enc' }, deposit: null, tickets: [{ hostId: 'h1' }] },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([{ id: 'a1', createdAt: t0, actorRole: 'field_host', actor: { fullName: 'Host A' }, newValue: { expiresAt: '2026-10-01T02:45:00Z' } }]);

    const out = await build(prisma).detail(ME, UNIT_ID, NOW);

    expect(out.host).toEqual({ id: 'h1', name: 'Host A' });
    expect(out.viewings[0]).toMatchObject({ outcome: 'in_progress', host: { id: 'h1', name: 'Host A' }, tenantPhoneMasked: '0901 *** 567' });
    expect(out.doorAudit[0]).toMatchObject({ actorName: 'Host A', expiresAt: '2026-10-01T02:45:00Z' });
    // Mọi truy vấn chạy song song với việc kiểm tra quyền phải tự khóa theo chủ nhà.
    expect(prisma.contract.findFirst.mock.calls[0][0].where.unit).toMatchObject({ landlordId: ME, id: UNIT_ID });
    expect(prisma.viewing.findMany.mock.calls[0][0].where.unit).toMatchObject({ landlordId: ME, id: UNIT_ID });
  });

  it('chi tiết của căn người khác → 404 và không trả dữ liệu dù các truy vấn song song đã chạy', async () => {
    const prisma: any = fakePrisma();
    prisma.unit.findFirst.mockResolvedValue(null);
    prisma.viewing.findMany.mockResolvedValue([
      { id: 'v-secret', bookingRefCode: 'X', viewingSlot: NOW, status: 'COMPLETED', lobbyCheckInAt: null, completedAt: null, tenant: null, deposit: null, tickets: [] },
    ]);
    await expect(build(prisma).detail(OTHER, UNIT_ID, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it('phí và danh bạ Host chỉ truy vấn DB một lần trong 60 giây', async () => {
    const prisma: any = fakePrisma();
    prisma.unit.findFirst.mockResolvedValue(unitRow() as any);
    const service = build(prisma);
    await service.detail(ME, UNIT_ID, NOW);
    await service.detail(ME, UNIT_ID, NOW);
    expect(prisma.feeConfig.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.fieldHost.findMany).toHaveBeenCalledTimes(1);
  });

  it('nhật ký mở cửa: chỉ log của căn này (entityId), không còn trả log mọi căn', async () => {
    const prisma: any = fakePrisma();
    prisma.unit.findFirst.mockResolvedValue(unitRow() as any);
    await build(prisma).doorAuditTrail(ME, UNIT_ID);

    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      entityName: 'Unit',
      entityId: UNIT_ID,
      actionType: 'DOOR_KEY_REVEAL',
    });
  });

  it('nhật ký xem phòng: che SĐT khách, suy kết quả (cọc / bỏ hẹn / đang xem), thời lượng và tên Host', async () => {
    const prisma: any = fakePrisma();
    prisma.unit.findFirst.mockResolvedValue(unitRow() as any);
    prisma.fieldHost.findMany.mockResolvedValue([{ id: 'h1', assignedZone: 'The Sapphire 1', profile: { fullName: 'Host A' } }]);
    const tenant = { fullName: 'Khách A', phoneEnc: 'enc' };
    const t0 = new Date('2026-10-01T02:00:00Z');
    prisma.viewing.findMany.mockResolvedValue([
      { id: 'v1', bookingRefCode: 'R1', viewingSlot: t0, status: 'COMPLETED', lobbyCheckInAt: t0, completedAt: new Date(t0.getTime() + 25 * 60_000), tenant, deposit: { paymentStatus: 'PAID_HOLDING' }, tickets: [{ hostId: 'h1' }] },
      { id: 'v2', bookingRefCode: 'R2', viewingSlot: t0, status: 'NO_SHOW', lobbyCheckInAt: null, completedAt: null, tenant, deposit: null, tickets: [] },
      { id: 'v3', bookingRefCode: 'R3', viewingSlot: t0, status: 'CONFIRMED', lobbyCheckInAt: t0, completedAt: null, tenant, deposit: null, tickets: [] },
    ]);
    const out = await build(prisma).viewingLog(ME, UNIT_ID);

    expect(out.map((v) => v.outcome)).toEqual(['deposit', 'no_show', 'in_progress']);
    expect(out[0]).toMatchObject({ durationMin: 25, tenantPhoneMasked: '0901 *** 567', host: { id: 'h1', name: 'Host A' } });
    expect(out[1].host).toBeNull();
    expect(JSON.stringify(out)).not.toContain('0901234567');
  });
});

describe('LandlordPhotoService — ảnh tham khảo của chủ nhà', () => {
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
  const img = (name: string, buffer: Buffer, size = buffer.length) => ({ originalname: name, buffer, size });

  const metaWith = (photos: unknown[] = [], stage: string = 'awaiting_host') =>
    withConsignmentMeta(null, { form: { building: 'S1.02' } as any, stage: stage as any, photos: photos as any });

  const build = (doorAccessConfig: unknown = metaWith()) => {
    const prisma = fakePrisma();
    prisma.seed(mandateRow({ doorAccessConfig, status: 'PENDING_INSPECTION' }));
    let n = 0;
    const storage = {
      upload: jest.fn(async () => `${ME}/${MANDATE_ID}/file-${++n}.jpg`),
      remove: jest.fn(async () => undefined),
      signedUrls: jest.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://signed/${p}`]))),
    };
    const audit = { log: jest.fn() };
    const service = new LandlordPhotoService(new LandlordAccessService(prisma as any), storage as any, audit as any, new ConsignmentMetaStore(prisma as any));
    return { prisma, storage, audit, service };
  };
  const savedPhotos = (prisma: ReturnType<typeof fakePrisma>) =>
    (prisma.tx.exclusiveMandate.update.mock.calls[0][0].data.doorAccessConfig as any).consignment.photos;

  it('nhận diện ảnh theo nội dung, không theo đuôi/mimetype', () => {
    expect(sniffImage(JPG)?.ext).toBe('jpg');
    expect(sniffImage(PNG)?.ext).toBe('png');
    expect(sniffImage(WEBP)?.ext).toBe('webp');
    expect(sniffImage(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });

  it('tên file chỉ để hiển thị: bỏ đường dẫn, ký tự điều khiển, cắt độ dài', () => {
    expect(displayName('../../etc/passwd')).toBe('passwd');
    expect(displayName('C:\\Users\\a\\phong khach.jpg')).toBe('phong khach.jpg');
    expect(displayName('a\u0000b.png')).toBe('ab.png');
    expect(displayName('x'.repeat(200)).length).toBe(80);
    expect(displayName('')).toBe('anh');
  });

  it('thêm ảnh hợp lệ: tải lên Storage, ghi metadata, trả URL ký, KHÔNG lộ đường dẫn lưu', async () => {
    const { prisma, storage, service } = build();
    const out = await service.add(ME, MANDATE_ID, [img('phong-khach.jpg', JPG), img('bep.png', PNG)]);

    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(savedPhotos(prisma)).toHaveLength(2);
    expect(out.map((p) => p.name)).toEqual(['phong-khach.jpg', 'bep.png']);
    expect(out[0].url).toMatch(/^https:\/\/signed\//);
    expect(Object.keys(out[0]).sort()).toEqual(['id', 'name', 'size', 'uploadedAt', 'url']);
  });

  it('một file hỏng (giả đuôi .jpg) → 400 và KHÔNG file nào được tải lên', async () => {
    const { storage, service } = build();
    await expect(service.add(ME, MANDATE_ID, [img('ok.jpg', JPG), img('virus.jpg', Buffer.from('MZ\x90\x00'))])).rejects.toMatchObject({ status: 400 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('ảnh quá 3MB → 400; vượt tổng 8 ảnh → 400', async () => {
    const { service } = build();
    await expect(service.add(ME, MANDATE_ID, [img('big.jpg', JPG, MAX_PHOTO_BYTES + 1)])).rejects.toMatchObject({ status: 400 });

    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, path: `x/${i}`, name: 'a', size: 1, mime: 'image/jpeg', uploadedAt: NOW.toISOString() }));
    const full = build(metaWith(seven));
    await expect(full.service.add(ME, MANDATE_ID, [img('a.jpg', JPG), img('b.jpg', JPG)])).rejects.toMatchObject({ status: 400 });
    await full.service.add(ME, MANDATE_ID, [img('a.jpg', JPG)]); // đúng 8 thì được
    expect(full.storage.upload).toHaveBeenCalledTimes(1);
  });

  it('lưu DB lỗi giữa chừng → dọn các file vừa tải lên, không để file mồ côi', async () => {
    const { prisma, storage, service } = build();
    prisma.tx.exclusiveMandate.update.mockRejectedValueOnce(new Error('db down'));
    await expect(service.add(ME, MANDATE_ID, [img('a.jpg', JPG), img('b.jpg', JPG)])).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledWith([expect.stringContaining('file-1'), expect.stringContaining('file-2')]);
  });

  it('hồ sơ đã bị Host nhận/duyệt → 409, không tải lên', async () => {
    for (const stage of ['inspecting', 'approved', 'rejected']) {
      const { storage, service } = build(metaWith([], stage));
      await expect(service.add(ME, MANDATE_ID, [img('a.jpg', JPG)])).rejects.toMatchObject({ status: 409 });
      expect(storage.upload).not.toHaveBeenCalled();
    }
  });

  it('hồ sơ của người khác → 404 trước khi chạm Storage', async () => {
    const { prisma, storage, service } = build();
    prisma.exclusiveMandate.findFirst.mockResolvedValue(null);
    await expect(service.add(OTHER, MANDATE_ID, [img('a.jpg', JPG)])).rejects.toMatchObject({ status: 404 });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.exclusiveMandate.findFirst.mock.calls[0][0].where).toMatchObject({ unit: { landlordId: OTHER } });
  });

  it('xóa ảnh: bỏ khỏi metadata và xóa file; ảnh không có → 404; hồ sơ đã khóa → 409', async () => {
    const photo = { id: '00000000-0000-4000-8000-0000000000e1', path: `${ME}/${MANDATE_ID}/a.jpg`, name: 'a.jpg', size: 1, mime: 'image/jpeg', uploadedAt: NOW.toISOString() };
    const { prisma, storage, service } = build(metaWith([photo]));
    const out = await service.remove(ME, MANDATE_ID, photo.id);
    expect(out).toEqual([]);
    expect(savedPhotos(prisma)).toEqual([]);
    expect(storage.remove).toHaveBeenCalledWith([photo.path]);

    await expect(build(metaWith([photo])).service.remove(ME, MANDATE_ID, '00000000-0000-4000-8000-0000000000e2')).rejects.toMatchObject({ status: 404 });
    await expect(build(metaWith([photo], 'inspecting')).service.remove(ME, MANDATE_ID, photo.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe('ConsignmentMetaStore — khóa dòng + đọc lại meta trong khóa (hồ sơ 16, B3)', () => {
  const metaOf = (stage: string, extra: Record<string, unknown> = {}) =>
    withConsignmentMeta(null, { form: { door: '08' } as any, stage: stage as any, ...extra });
  const row = (stage: string, extra: Record<string, unknown> = {}) =>
    mandateRow({ status: 'PENDING_INSPECTION', signedAt: NOW, doorAccessConfig: metaOf(stage, extra) });
  const savedMeta = (prisma: ReturnType<typeof fakePrisma>) => (prisma.state.mandate.doorAccessConfig as any).consignment;

  it('khóa dòng bằng SELECT … FOR UPDATE TRƯỚC khi đọc lại hồ sơ, rồi ghi meta + cột phụ trong một UPDATE', async () => {
    const prisma = fakePrisma();
    prisma.seed(row('awaiting_host'));
    const order: string[] = [];
    prisma.tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      order.push(`lock:${strings.join('?')}:${vals[0]}`);
      return [];
    });
    prisma.tx.exclusiveMandate.findUnique.mockImplementation(async () => (order.push('read'), prisma.state.mandate));
    const store = new ConsignmentMetaStore(prisma as any);

    const out = await store.mutate(MANDATE_ID, async (_m, meta) => ({ meta: { ...meta, stage: 'awaiting_host' }, result: 'ok', extra: { signedAt: NOW } }));

    expect(out).toBe('ok');
    expect(order[0]).toContain('FOR UPDATE');
    expect(order[0]).toContain('::uuid');
    expect(order[0].endsWith(`:${MANDATE_ID}`)).toBe(true);
    expect(order[1]).toBe('read');
    expect(prisma.tx.exclusiveMandate.update).toHaveBeenCalledTimes(1);
    expect(prisma.tx.exclusiveMandate.update.mock.calls[0][0].data.signedAt).toBe(NOW);
    expect(savedMeta(prisma).stage).toBe('awaiting_host');
  });

  it('hai mutate song song: người sau thấy kết quả của người trước (không mất cập nhật)', async () => {
    const prisma = fakePrisma();
    prisma.seed(row('awaiting_host'));
    const store = new ConsignmentMetaStore(prisma as any);
    const bump = (n: number) =>
      store.mutate(MANDATE_ID, async (_m, meta) => {
        await new Promise((r) => setTimeout(r, 5)); // nhường lượt: không có khóa thì cả hai cùng đọc bản cũ
        return { meta: { ...meta, decisionNote: `${meta.decisionNote ?? ''}${n}` }, result: undefined };
      });
    await Promise.all([bump(1), bump(2), bump(3)]);
    expect(savedMeta(prisma).decisionNote).toBe('123');
  });

  it('fn ném lỗi ⇒ không UPDATE; hồ sơ không tồn tại / thiếu meta ⇒ 404', async () => {
    const prisma = fakePrisma();
    prisma.seed(row('awaiting_host'));
    const store = new ConsignmentMetaStore(prisma as any);
    await expect(store.mutate(MANDATE_ID, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(prisma.tx.exclusiveMandate.update).not.toHaveBeenCalled();

    prisma.state.mandate = null;
    await expect(store.mutate(MANDATE_ID, async (_m, meta) => ({ meta, result: 1 }))).rejects.toMatchObject({ status: 404 });
    prisma.state.mandate = mandateRow({ status: 'PENDING_INSPECTION', doorAccessConfig: null });
    await expect(store.mutate(MANDATE_ID, async (_m, meta) => ({ meta, result: 1 }))).rejects.toMatchObject({ status: 404 });
    expect(prisma.tx.exclusiveMandate.update).not.toHaveBeenCalled();
  });

  it('P1-17: ảnh chủ nhà add chạy xen giữa lúc Inspector nhận ca ⇒ stage cuối vẫn inspecting, ảnh bị 409 và file được xóa', async () => {
    const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const prisma = fakePrisma();
    prisma.seed(row('awaiting_host', { hostId: 'host-1' }));
    const store = new ConsignmentMetaStore(prisma as any);
    // "accept" của Inspector (WP2 sẽ có service thật) — ở đây chỉ cần một mutate đổi stage.
    const accept = () =>
      store.mutate(MANDATE_ID, async (_m, meta) => ({
        meta: { ...meta, stage: 'inspecting', hostAcceptedAt: NOW.toISOString() },
        result: undefined,
      }));
    const storage = {
      // Đúng lúc chủ nhà đang tải file lên Storage (ngoài khóa), Inspector nhận ca.
      upload: jest.fn(async () => {
        await accept();
        return `${ME}/${MANDATE_ID}/file-1.jpg`;
      }),
      remove: jest.fn(async () => undefined),
      signedUrls: jest.fn(async () => new Map()),
    };
    const audit = { log: jest.fn() };
    const photos = new LandlordPhotoService(new LandlordAccessService(prisma as any), storage as any, audit as any, store);

    await expect(photos.add(ME, MANDATE_ID, [{ originalname: 'a.jpg', buffer: JPG, size: JPG.length }])).rejects.toMatchObject({ status: 409 });

    expect(savedMeta(prisma)).toMatchObject({ stage: 'inspecting', hostId: 'host-1' });
    expect(savedMeta(prisma).hostAcceptedAt).toBe(NOW.toISOString());
    expect(savedMeta(prisma).photos ?? []).toHaveLength(0);
    expect(storage.remove).toHaveBeenCalledWith([`${ME}/${MANDATE_ID}/file-1.jpg`]);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('P1-17b: xóa ảnh khi Inspector đã nhận ca ⇒ 409, không xóa file', async () => {
    const photo = { id: 'p1', path: 'x/p1.jpg', name: 'a', size: 1, mime: 'image/jpeg', uploadedAt: NOW.toISOString() };
    const prisma = fakePrisma();
    prisma.seed(row('awaiting_host', { photos: [photo] }));
    const store = new ConsignmentMetaStore(prisma as any);
    const storage = { remove: jest.fn(), signedUrls: jest.fn(async () => new Map()) };
    const photosSvc = new LandlordPhotoService(new LandlordAccessService(prisma as any), storage as any, { log: jest.fn() } as any, store);
    // Bản đọc "sớm" của remove vẫn thấy awaiting_host, nhưng khi vào khóa stage đã là inspecting.
    prisma.exclusiveMandate.findFirst.mockResolvedValue(row('awaiting_host', { photos: [photo] }));
    prisma.state.mandate = row('inspecting', { photos: [photo] });
    await expect(photosSvc.remove(ME, MANDATE_ID, 'p1')).rejects.toMatchObject({ status: 409 });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('LandlordConsignmentService.create — giao Inspector khi ký (P1-1)', () => {
  const dto = { building: 'S1.02', floor: 12, door: '08', layout: '1PN', areaM2: 47, askRent: 6_500_000, ownershipWarranted: true, otp: '4829' };
  const build = (hosts: any[], mandates: any[] = []) => {
    const prisma = fakePrisma();
    prisma.fieldHost.findMany.mockResolvedValue(hosts);
    prisma.tx.exclusiveMandate.findMany.mockResolvedValue(mandates);
    const audit = { log: jest.fn() };
    const otp = { verify: jest.fn(async () => ({ id: 'otp-1' })), consume: jest.fn(async () => true), expiresInSeconds: 300 };
    const phones = { decrypt: jest.fn(() => '+84901234567'), normalize: jest.fn(), encrypt: jest.fn() };
    const service = new LandlordConsignmentService(
      prisma as any,
      new LandlordAccessService(prisma as any),
      audit as any,
      otp as any,
      phones as any,
      { withUrls: jest.fn(async () => []) } as any,
      new ConsignmentMetaStore(prisma as any),
      new InspectorAssigner(),
      { assertReady: jest.fn(async () => ({ ready: true })) } as any,
    );
    return { prisma, audit, service };
  };
  const busy = (hostId: string, stage = 'awaiting_host') => ({ doorAccessConfig: withConsignmentMeta(null, { form: {} as any, stage: stage as any, hostId }) });
  const savedMeta = (prisma: ReturnType<typeof fakePrisma>) => prisma.tx.exclusiveMandate.create.mock.calls[0][0].data.doorAccessConfig.consignment;

  it('chọn Inspector cùng phân khu ÍT ca nhất; ghi hostId + offeredAt; audit có inspectorId', async () => {
    const { prisma, audit, service } = build(
      [{ id: 'host-a', createdAt: NOW }, { id: 'host-b', createdAt: NOW }],
      [busy('host-a'), busy('host-a', 'inspecting'), busy('host-b')],
    );
    const out = await service.create(ME, dto as any);

    expect(savedMeta(prisma)).toMatchObject({ stage: 'awaiting_host', hostId: 'host-b' });
    expect(typeof savedMeta(prisma).offeredAt).toBe('string');
    expect(out).toMatchObject({ status: 'awaiting_host', hostId: 'host-b' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'CONSIGNMENT_SIGNED', newValue: expect.objectContaining({ inspectorId: 'host-b' }) }),
    );
    // Truy vấn chọn người lọc đúng vai INSPECTOR + đúng phân khu của tòa.
    expect(prisma.fieldHost.findMany.mock.calls[0][0].where).toEqual({ roles: { has: 'INSPECTOR' }, assignedZone: { contains: 'The Sapphire 1' }, profile: { isPhoneVerified: true } });
  });

  it('không có Inspector trong phân khu ⇒ không ghi hostId/offeredAt (ca vào Open Pool ngay), vẫn tạo được', async () => {
    const { prisma, audit, service } = build([]);
    const out = await service.create(ME, dto as any);

    expect(savedMeta(prisma).stage).toBe('awaiting_host');
    expect(savedMeta(prisma)).not.toHaveProperty('hostId');
    expect(savedMeta(prisma)).not.toHaveProperty('offeredAt');
    expect(out.hostId).toBeNull();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ newValue: expect.objectContaining({ inspectorId: null }) }));
  });
});

describe('LandlordController qua HTTP — phân quyền & lấy landlordId từ phiên', () => {
  let app: INestApplication;
  const units = { list: jest.fn(async () => []), detail: jest.fn(), viewingLog: jest.fn(), doorAuditTrail: jest.fn() };
  const consignments = { list: jest.fn(async () => []), create: jest.fn(async () => ({})), get: jest.fn() };
  const mandates = { requestExit: jest.fn(async () => ({})), cancelExit: jest.fn() };
  const photos = { add: jest.fn(async () => []), remove: jest.fn(async () => []) };
  const payouts = { status: jest.fn(async () => ({})), scan: jest.fn(), submit: jest.fn(), updatePayout: jest.fn(async () => ({})) };
  const pricing = { decide: jest.fn(async () => ({ stage: 'approved' })) };

  /** Thay SupabaseAuthGuard: vai trò + id lấy từ header test; RolesGuard là bản thật. */
  @Injectable()
  class HeaderAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = { id: req.headers['x-test-user'], role: req.headers['x-test-role'] };
      return true;
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LandlordController],
      providers: [
        { provide: LandlordService, useValue: { getLandlordDashboard: jest.fn(async () => ({})) } },
        { provide: LandlordUnitsService, useValue: units },
        { provide: LandlordConsignmentService, useValue: consignments },
        { provide: LandlordFinanceService, useValue: { getFinance: jest.fn(async () => ({})) } },
        { provide: LandlordMandateService, useValue: mandates },
        { provide: LandlordPricingService, useValue: pricing },
        { provide: LandlordPhotoService, useValue: photos },
        { provide: HoldExpiryService, useValue: { sweep: jest.fn(async () => 0) } },
        { provide: LandlordVerificationService, useValue: payouts },
        { provide: LandlordPriceInsightService, useValue: { insights: jest.fn(async () => []), applyRent: jest.fn() } },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());

  it.each(['tenant', 'field_host', 'ops_admin'])('vai trò %s bị chặn 403 ở mọi route chủ nhà', async (role) => {
    for (const path of ['/landlord/units', '/landlord/finance', '/landlord/consignments']) {
      await request(app.getHttpServer()).get(path).set('x-test-user', ME).set('x-test-role', role).expect(403);
    }
  });

  it('landlordId lấy từ phiên, bỏ qua ?landlordId= do client gửi', async () => {
    await request(app.getHttpServer())
      .get(`/landlord/units?landlordId=${OTHER}`)
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .expect(200);
    expect(units.list).toHaveBeenCalledWith(ME);
  });

  it('PUT payout-account: số TK sai định dạng ⇒ 400; hợp lệ ⇒ gọi service với landlordId từ phiên', async () => {
    const put = (body: object) =>
      request(app.getHttpServer()).put('/landlord/payout-account').set('x-test-user', ME).set('x-test-role', 'landlord').send(body);
    await put({ bankName: 'VCB', bankAccount: '12ab', bankAccountHolder: 'TRAN B' }).expect(400);
    expect(payouts.updatePayout).not.toHaveBeenCalled();
    await put({ bankName: 'VCB', bankAccount: '0011223344', bankAccountHolder: 'TRAN B' }).expect(200);
    expect(payouts.updatePayout).toHaveBeenCalledWith(ME, expect.objectContaining({ bankAccount: '0011223344' }));
  });

  it('POST consignments: dữ liệu sai bị ValidationPipe chặn 400 (giá thuê dưới 3tr)', async () => {
    await request(app.getHttpServer())
      .post('/landlord/consignments')
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .send({ building: 'S1.02', floor: 12, door: '08', layout: '1PN', areaM2: 47, askRent: 1000 })
      .expect(400);
    expect(consignments.create).not.toHaveBeenCalled();
  });

  it('POST photos: đúng role + multipart → gọi service với landlordId từ phiên; không có file → 400', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    await request(app.getHttpServer())
      .post(`/landlord/consignments/${MANDATE_ID}/photos`)
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .attach('files', png, 'a.png')
      .expect(201);
    expect(photos.add).toHaveBeenCalledWith(ME, MANDATE_ID, [expect.objectContaining({ originalname: 'a.png', size: png.length })]);

    await request(app.getHttpServer())
      .post(`/landlord/consignments/${MANDATE_ID}/photos`)
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .expect(400);
  });

  it('POST photos: vai trò tenant bị chặn 403, ảnh quá 3MB bị chặn trước khi vào service', async () => {
    await request(app.getHttpServer())
      .post(`/landlord/consignments/${MANDATE_ID}/photos`)
      .set('x-test-user', ME)
      .set('x-test-role', 'tenant')
      .attach('files', Buffer.alloc(10), 'a.png')
      .expect(403);

    photos.add.mockClear();
    // Đúng 3MB: được nhận (giao diện hứa "tối đa 3MB") — vào tới service.
    await request(app.getHttpServer())
      .post(`/landlord/consignments/${MANDATE_ID}/photos`)
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .attach('files', Buffer.alloc(MAX_PHOTO_BYTES), 'edge.png')
      .expect(201);
    expect(photos.add).toHaveBeenCalledTimes(1);

    photos.add.mockClear();
    await request(app.getHttpServer())
      .post(`/landlord/consignments/${MANDATE_ID}/photos`)
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .attach('files', Buffer.alloc(MAX_PHOTO_BYTES + 2), 'big.png')
      .expect(413);
    expect(photos.add).not.toHaveBeenCalled();
  });

  it('id hồ sơ không phải uuid → 400 trước khi vào service', async () => {
    await request(app.getHttpServer())
      .get('/landlord/consignments/abc')
      .set('x-test-user', ME)
      .set('x-test-role', 'landlord')
      .expect(400);
    expect(consignments.get).not.toHaveBeenCalled();
  });

  it('POST pricing-decision: chỉ landlord (tenant 403), decision lạ 400, landlordId lấy từ phiên', async () => {
    const id = '00000000-0000-4000-8000-0000000000c1';
    const post = (role: string, body: object) =>
      request(app.getHttpServer()).post(`/landlord/consignments/${id}/pricing-decision`).set('x-test-user', ME).set('x-test-role', role).send(body);
    await post('tenant', { decision: 'accept' }).expect(403);
    await post('landlord', { decision: 'maybe' }).expect(400);
    expect(pricing.decide).not.toHaveBeenCalled();
    await post('landlord', { decision: 'accept' }).expect(200);
    expect(pricing.decide).toHaveBeenCalledWith(ME, id, 'accept');
  });
});

describe('LandlordVerificationService', () => {
  const KYC = { fullName: 'TRẦN THỊ BÌNH', idNumber: '001234567890', dob: '12/04/1980', issuedDate: '18/08/2021', address: 'Đống Đa, Hà Nội' };
  const build = (opts: { phoneVerified?: boolean; kyc?: boolean; payout?: boolean } = {}) => {
    const profileRow: any = {
      phoneEnc: 'ENC(+84901234567)',
      isPhoneVerified: opts.phoneVerified ?? true,
      fullName: 'Tran Binh',
      payoutBankName: opts.payout ? 'VCB' : null,
      payoutAccountEnc: opts.payout ? 'ENC(0011223344)' : null,
      payoutAccountHolder: opts.payout ? 'TRAN THI BINH' : null,
      payoutVerifiedAt: opts.payout ? NOW : null,
    };
    const tx = { identityVerification: { create: jest.fn(async (_a: unknown) => ({})) }, profile: { update: jest.fn(async (_a: unknown) => ({})) } };
    const prisma = {
      profile: { findUnique: jest.fn(async (_a: unknown) => profileRow), update: jest.fn(async (_a: unknown) => ({})) },
      identityVerification: {
        findFirst: jest.fn(async (_a: unknown) => (opts.kyc ? { verifiedDataRef: `ENC(${JSON.stringify(KYC)})`, verifiedAt: NOW } : null)),
      },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const audit = { log: jest.fn(async (_a: unknown) => undefined) };
    const phones = { encrypt: jest.fn((v: string) => `ENC(${v})`), decrypt: jest.fn((v: string) => v.slice(4, -1)) };
    return { prisma, tx, audit, service: new LandlordVerificationService(prisma as any, phones as any, audit as any) };
  };

  it('status: liệt kê đúng bước còn thiếu theo thứ tự; đủ 3 bước ⇒ ready', async () => {
    expect((await build({ phoneVerified: false }).service.status(ME)).missing).toEqual(['phone', 'identity', 'payout']);
    const ok = await build({ kyc: true, payout: true }).service.status(ME);
    expect(ok).toMatchObject({ ready: true, missing: [], identity: { fullName: 'TRẦN THỊ BÌNH', idNumberMasked: '001******890' } });
    expect(ok.payout.account).toEqual({ bankName: 'VCB', bankAccountMasked: '001****3344', bankAccountHolder: 'TRAN THI BINH' });
    expect(JSON.stringify(ok)).not.toContain('001234567890');
  });

  it('assertReady: thiếu bước ⇒ 403 landlord_not_verified kèm missing', async () => {
    await expect(build({ kyc: true }).service.assertReady(ME)).rejects.toMatchObject({ status: 403, response: { code: 'landlord_not_verified', missing: ['payout'] } });
  });

  it('eKYC: scanId gắn đúng chủ nhà; lưu mã hoá vào identity_verifications (deposit null) + cập nhật họ tên', async () => {
    const { tx, service } = build();
    const scan = await service.scan(ME, true, 'PRIVACY-2026.10-v1');
    await service.submit(ME, { scanId: scan.scanId, consentVersion: 'PRIVACY-2026.10-v1', fields: { ...KYC }, confirmedLowConfidence: true });
    const data = (tx.identityVerification.create.mock.calls as any[])[0][0].data;
    expect(data).toMatchObject({ tenantId: ME, status: 'VERIFIED', providerName: 'SIMULATED' });
    expect(data).not.toHaveProperty('depositId');
    expect(data.verifiedDataRef).toBe(`ENC(${JSON.stringify(KYC)})`);
    expect((tx.profile.update.mock.calls as any[])[0][0].data).toMatchObject({ fullName: 'TRẦN THỊ BÌNH' });
  });

  it('eKYC: scanId của người khác / của lịch khách thuê ⇒ 422 scan_expired', async () => {
    const { service } = build();
    const foreign = EkycSimulator.createScanToken('viewing-1', EkycSimulator.scan('A', '0901234567'), 'PRIVACY-2026.10-v1');
    await expect(service.submit(ME, { scanId: foreign, consentVersion: 'PRIVACY-2026.10-v1', fields: { ...KYC }, confirmedLowConfidence: true }))
      .rejects.toMatchObject({ status: 422, response: { code: 'scan_expired' } });
  });

  it('ngân hàng: chưa eKYC ⇒ 409 kyc_required; tên chủ TK khác CCCD ⇒ 422; trùng (bỏ dấu) ⇒ lưu mã hoá + payoutVerifiedAt, audit bản che', async () => {
    const body = { bankName: 'VCB', bankAccount: '0011223344', bankAccountHolder: 'tran thi binh' };
    await expect(build().service.updatePayout(ME, body)).rejects.toMatchObject({ status: 409, response: { code: 'kyc_required' } });

    const { prisma, audit, service } = build({ kyc: true });
    await expect(service.updatePayout(ME, { ...body, bankAccountHolder: 'NGUYEN VAN A' })).rejects.toMatchObject({ status: 422, response: { code: 'payout_name_mismatch' } });
    await service.updatePayout(ME, body);
    const data = (prisma.profile.update.mock.calls as any[])[0][0].data;
    expect(data).toMatchObject({ payoutBankName: 'VCB', payoutAccountEnc: 'ENC(0011223344)', payoutAccountHolder: 'TRAN THI BINH' });
    expect(data.payoutVerifiedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('0011223344');
  });
});

describe('LandlordService.getLandlordDashboard — dòng hoạt động', () => {
  const unit = { id: UNIT_ID, unitCode: 'VHOP-S1.02-1208' };
  const at = (iso: string) => new Date(iso);

  it('dựng từ ca xem / cọc / hợp đồng thật, mới nhất trước, lọc theo chủ nhà, không lộ thông tin khách', async () => {
    const prisma = {
      viewing: {
        findMany: jest.fn(async (_a: unknown) => [
          { id: 'v1', status: 'NO_SHOW', viewingSlot: at('2026-09-28T03:00:00Z'), createdAt: at('2026-09-27T03:00:00Z'), completedAt: at('2026-09-28T03:45:00Z'), unit },
        ]),
      },
      holdingDeposit: {
        findMany: jest.fn(async (_a: unknown) => [
          { id: 'd1', amount: 2_000_000, paymentStatus: 'FORFEITED', paidAt: at('2026-09-29T01:00:00Z'), expiresAt: at('2026-10-01T01:00:00Z'), unit },
        ]),
      },
      contract: { findMany: jest.fn(async (_a: unknown) => []) },
    };
    const out = await new LandlordService(prisma as any).getLandlordDashboard(ME, NOW);

    expect(out.activity.map((a) => a.kind)).toEqual(['deposit_forfeited', 'no_show', 'viewing_booked']);
    expect(out.activity[0].body).toContain('1.000.000đ');
    expect((prisma.viewing.findMany.mock.calls as any[])[0][0].where.unit).toEqual({ landlordId: ME });
    expect((prisma.holdingDeposit.findMany.mock.calls as any[])[0][0].where.unit).toEqual({ landlordId: ME });
    expect(JSON.stringify(out)).not.toMatch(/tenant|phone|0901/i);
  });
});

describe('LandlordPriceInsightService', () => {
  const comp = (rent: number, zoneName = 'The Sapphire 1') => ({ baseRentPrice: rent, building: { zoneName } });
  const mine = (over: Record<string, unknown> = {}) => ({
    id: UNIT_ID,
    unitCode: 'VHOP-S1.02-1208',
    layoutType: 'ONE_BED_PLUS',
    baseRentPrice: 9_000_000,
    managementFee: 446_500,
    status: 'AVAILABLE',
    verifiedAt: new Date('2026-09-10T00:00:00Z'),
    createdAt: new Date('2026-09-01T00:00:00Z'),
    building: { zoneName: 'The Sapphire 1' },
    mandates: [{ status: 'ACTIVE', signedAt: new Date('2026-09-01T00:00:00Z'), doorAccessConfig: null }],
    viewings: [
      { status: 'COMPLETED', completedAt: new Date('2026-09-25T00:00:00Z'), deposit: null },
      { status: 'NO_SHOW', completedAt: new Date('2026-09-26T00:00:00Z'), deposit: null },
    ],
    ...over,
  });
  const build = (units: any[], comps: any[]) => {
    const prisma = {
      unit: {
        findMany: jest.fn(async (args: any) => (args.where.landlordId ? units : comps)),
        findFirst: jest.fn(async (_a: unknown) => units[0] ?? null),
        update: jest.fn(async (_a: unknown) => ({})),
      },
    };
    const audit = { log: jest.fn(async (_a: unknown) => undefined) };
    return { prisma, audit, service: new LandlordPriceInsightService(prisma as any, audit as any) };
  };
  // Mặt bằng 1PN Sapphire 1: 7.0 / 7.5 / 8.0tr (+ 1 căn 40tr ngoại lai bị IQR loại) ⇒ trung vị 7.5tr.
  const comps = [comp(7_000_000), comp(7_500_000), comp(8_000_000), comp(40_000_000), comp(5_000_000, 'The Beverly')];

  it('mặt bằng = trung vị cùng layout + phân khu, lọc ngoại lai; đề xuất = mức cao nhất vẫn đạt "Căn hời" (≥10% All-in)', async () => {
    const { prisma, service } = build([mine()], comps);
    const [i] = await service.insights(ME, NOW);
    // fees = 446.500 + 150.000 + 600.000 ⇒ 7.5tr − 10% × (7.5tr + 1.1965tr) = 6.630.350 ⇒ làm tròn xuống 6.600.000.
    expect(i).toMatchObject({ scope: 'zone', comps: 3, marketMedian: 7_500_000, suggestedRent: 6_600_000, dealBadge: true, currentRent: 9_000_000 });
    expect(i).toMatchObject({ daysVacant: 22, viewings30d: 2, viewingsNoDeposit: 1, noShows: 1 });
    expect(i.savingPercent).toBeGreaterThanOrEqual(10);
    // Chỉ học từ căn đã xác thực, cùng layout.
    expect((prisma.unit.findMany.mock.calls as any[])[1][0].where).toMatchObject({ layoutType: 'ONE_BED_PLUS', isVerified: true });
  });

  it('giá sàn chốt nhanh cao hơn mức đạt badge ⇒ đề xuất dừng ở giá sàn, không có badge', async () => {
    const meta = { consignment: { form: { allowFastClose: true, floorRent: 7_000_000 } } };
    const { service } = build([mine({ mandates: [{ status: 'ACTIVE', signedAt: NOW, doorAccessConfig: meta }] })], comps);
    const [i] = await service.insights(ME, NOW);
    expect(i).toMatchObject({ suggestedRent: 7_000_000, dealBadge: false, floorLimited: true });
  });

  it('căn đã rẻ (≤ mức badge) hoặc chưa đủ căn đối chứng ⇒ không gợi ý', async () => {
    expect(await build([mine({ baseRentPrice: 6_500_000 })], comps).service.insights(ME, NOW)).toEqual([]);
    expect(await build([mine()], [comp(7_000_000)]).service.insights(ME, NOW)).toEqual([]);
  });

  it('applyRent: căn không trống ⇒ 409; dưới sàn / quá trần ⇒ 400; hợp lệ ⇒ đổi giá + marketAvgPrice + audit', async () => {
    await expect(build([mine({ status: 'HOLDING' })], comps).service.applyRent(ME, UNIT_ID, 7_000_000)).rejects.toMatchObject({ status: 409 });
    const { prisma, audit, service } = build([mine()], comps);
    await expect(service.applyRent(ME, UNIT_ID, 2_000_000)).rejects.toMatchObject({ status: 400 });
    await expect(service.applyRent(ME, UNIT_ID, 26_000_000)).rejects.toMatchObject({ status: 400 });
    await service.applyRent(ME, UNIT_ID, 6_600_000);
    expect((prisma.unit.update.mock.calls as any[])[0][0].data).toEqual({ baseRentPrice: 6_600_000, marketAvgPrice: 7_500_000 });
    expect((prisma.unit.findFirst.mock.calls as any[])[0][0].where).toEqual({ id: UNIT_ID, landlordId: ME });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'UNIT_RENT_UPDATED' }));
  });
});
