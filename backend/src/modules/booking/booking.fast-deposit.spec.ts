import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { UnitStatus, ViewingStatus } from '@prisma/client';
import { BookingService } from './booking.service';
import { BookingAccessService } from '../tenant/booking-access.service';
import { PhoneService } from '../auth/phone/phone.service';
import { ActionTokenService } from '../auth/otp/action-token.service';
import { DispatchAssignerService } from '../dispatch/dispatch-assigner.service';
import { DepositService } from '../deposit/deposit.service';
import { DEPOSIT_TERMS_VERSION } from '../deposit/deposit-terms';

/** Hồ sơ 20 · SPEC-P01: cọc chốt nhanh trên trang căn, không cần lịch xem. DepositService giả (đã có test riêng). */
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const UNIT_ID = '00000000-0000-4000-8000-000000000010';

function setup(opts: { floorRent?: number | null; phoneVerified?: boolean } = {}) {
  const unit = { id: UNIT_ID, unitCode: 'VHOP-S1.02-1208', status: UnitStatus.AVAILABLE as UnitStatus, baseRentPrice: 6_500_000, building: { zoneName: 'The Sapphire 1' } };
  const viewings: any[] = [];
  const config = new ConfigService({ AES_SECRET_KEY: 'a-test-master-secret-of-32-chars!!', NODE_ENV: 'test' });
  const phones = new PhoneService(config);
  const prisma: Record<string, any> = {
    unit: {
      findFirst: jest.fn(async ({ where }) => (where.unitCode.equals.toLowerCase() === unit.unitCode.toLowerCase() ? { ...unit } : null)),
      findUnique: jest.fn(async () => ({ ...unit })),
    },
    viewing: {
      findFirst: jest.fn(async ({ where }) =>
        viewings.find((v) => v.tenantId === where.tenantId && v.unitId === where.unitId && v.status === where.status && v.tickets.length === 0) ?? null,
      ),
      findUnique: jest.fn(async ({ where }) => viewings.find((v) => v.bookingRefCode === where.bookingRefCode) ?? null),
      create: jest.fn(async ({ data }) => {
        const v = { id: `viewing-${viewings.length + 1}`, ...data, tickets: [] };
        viewings.push(v);
        return v;
      }),
      update: jest.fn(async ({ where, data }) => Object.assign(viewings.find((v) => v.id === where.id), data)),
    },
    profile: {
      findUnique: jest.fn(async () => ({
        id: TENANT_ID,
        isPhoneVerified: opts.phoneVerified ?? true,
        phoneHash: phones.hash(phones.normalize('0912345678')!),
      })),
      findFirst: jest.fn(async () => null),
      update: jest.fn(),
    },
  };
  const deposits = {
    expireIfDue: jest.fn(async () => undefined),
    fastCloseSource: jest.fn(async () => ({ rent: 6_500_000, deposit: 6_500_000, floorRent: opts.floorRent === undefined ? 6_000_000 : opts.floorRent })),
    createDeposit: jest.fn(async (ref: string) => ({ ref, status: 'closing', direct: true })),
  };
  const actionTokens = { redeem: jest.fn() } as unknown as ActionTokenService;
  const service = new BookingService(
    prisma as any,
    new BookingAccessService(prisma as any),
    phones,
    actionTokens,
    new DispatchAssignerService(prisma as any),
    deposits as unknown as DepositService,
  );
  return { service, prisma, unit, viewings, deposits, actionTokens };
}

const dto = (over: Record<string, unknown> = {}) => ({
  unitCode: 'VHOP-S1.02-1208',
  contactName: 'Nguyễn Văn An',
  phone: '0912345678',
  acceptTerms: true,
  acknowledgeNoViewing: true,
  termsVersion: DEPOSIT_TERMS_VERSION,
  ...over,
});
const ME = { id: TENANT_ID };

describe('BookingService.createFastDeposit — cọc trực tiếp không cần lịch xem (hồ sơ 20)', () => {
  it('tạo lịch CLOSING không ticket Host rồi gọi createDeposit với fastClose + dấu cọc trực tiếp', async () => {
    const f = setup();
    const res = await f.service.createFastDeposit(ME, dto(), { ip: '1.2.3.4' });
    expect(res).toMatchObject({ status: 'closing' });
    expect(f.viewings).toHaveLength(1);
    expect(f.viewings[0]).toMatchObject({ status: ViewingStatus.CLOSING, tenantId: TENANT_ID, unitId: UNIT_ID, tickets: [] });
    expect(f.viewings[0].contactPhoneEnc).not.toContain('0912345678'); // SĐT mã hoá
    expect(f.deposits.createDeposit).toHaveBeenCalledWith(
      f.viewings[0].bookingRefCode,
      ME,
      { acceptTerms: true, termsVersion: DEPOSIT_TERMS_VERSION, fastClose: true },
      { ip: '1.2.3.4' },
      { direct: true, acknowledgeNoViewing: true },
    );
  });

  it('chủ nhà chưa ủy quyền / giá sàn không hợp lệ ⇒ 409 fast_close_unavailable, KHÔNG tạo lịch', async () => {
    for (const floorRent of [null, 7_000_000]) {
      const f = setup({ floorRent });
      await expect(f.service.createFastDeposit(ME, dto())).rejects.toMatchObject({ response: { code: 'fast_close_unavailable' } });
      expect(f.viewings).toHaveLength(0);
    }
  });

  it('thiếu tick điều khoản hoặc xác nhận "không xem trực tiếp" ⇒ 400; điều khoản cũ ⇒ 409 terms_version_stale', async () => {
    const f = setup();
    await expect(f.service.createFastDeposit(ME, dto({ acknowledgeNoViewing: false }))).rejects.toMatchObject({ response: { code: 'invalid_request' } });
    await expect(f.service.createFastDeposit(ME, dto({ acceptTerms: false }))).rejects.toMatchObject({ response: { code: 'invalid_request' } });
    await expect(f.service.createFastDeposit(ME, dto({ termsVersion: 'DEP-2026.10-v2' }))).rejects.toMatchObject({ response: { code: 'terms_version_stale' } });
    expect(f.viewings).toHaveLength(0);
  });

  it('căn không còn trống ⇒ 409 unit_not_available; không tìm thấy ⇒ 404', async () => {
    const f = setup();
    f.unit.status = UnitStatus.HOLDING;
    await expect(f.service.createFastDeposit(ME, dto())).rejects.toMatchObject({ response: { code: 'unit_not_available' } });
    await expect(f.service.createFastDeposit(ME, dto({ unitCode: 'KHONG-CO' }))).rejects.toMatchObject({ response: { code: 'unit_not_found' } });
  });

  it('SĐT chưa xác thực, không có token OTP ⇒ 403 otp_required; có token đúng số ⇒ tạo được', async () => {
    const f = setup({ phoneVerified: false });
    await expect(f.service.createFastDeposit(ME, dto())).rejects.toMatchObject({ response: { code: 'otp_required' } });
    expect(f.viewings).toHaveLength(0);
    (f.actionTokens.redeem as jest.Mock).mockResolvedValueOnce({ phone: '+84912345678', purpose: 'TENANT_VIEWING' });
    await f.service.createFastDeposit(ME, dto({ actionToken: 'tok' }));
    expect(f.actionTokens.redeem).toHaveBeenCalledWith('tok', 'TENANT_VIEWING');
    expect(f.viewings).toHaveLength(1);
  });

  it('gửi lại khi đã có lịch trực tiếp còn sống ⇒ dùng lại lịch đó (không tạo lịch thứ hai)', async () => {
    const f = setup();
    await f.service.createFastDeposit(ME, dto());
    await f.service.createFastDeposit(ME, dto());
    expect(f.viewings).toHaveLength(1);
    expect(f.deposits.createDeposit).toHaveBeenCalledTimes(2);
  });

  it('createDeposit lỗi (vd. căn vừa bị giữ) ⇒ huỷ lịch vừa tạo (fast_deposit_failed) và trả đúng lỗi', async () => {
    const f = setup();
    f.deposits.createDeposit.mockRejectedValueOnce(new ConflictException({ code: 'unit_already_held' }));
    await expect(f.service.createFastDeposit(ME, dto())).rejects.toMatchObject({ response: { code: 'unit_already_held' } });
    expect(f.viewings[0]).toMatchObject({ status: ViewingStatus.CANCELLED, closedReason: 'fast_deposit_failed' });
  });
});
