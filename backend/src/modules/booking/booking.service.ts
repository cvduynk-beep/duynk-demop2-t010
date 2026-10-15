import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingAccessService } from '../tenant/booking-access.service';
import { PhoneService } from '../auth/phone/phone.service';
import { ActionTokenService } from '../auth/otp/action-token.service';
import { authError } from '../auth/auth.errors';
import {
  CreateBookingDto,
  CancelBookingDto,
  RescheduleBookingDto,
  RateBookingDto,
} from './dto/booking.dto';
import { FastDepositDto } from '../deposit/dto/deposit.dto';
import { DEPOSIT_TERMS_VERSION } from '../deposit/deposit-terms';
import { fastDepositQuote } from '../deposit/fast-close';
import { ViewingStatus, UnitStatus, TicketStatus } from '@prisma/client';
import { DispatchAssignerService } from '../dispatch/dispatch-assigner.service';
import { toTenantBooking, statusToWeb } from '../tenant/tenant.mappers';
import { readDefaultHoldHours } from '../deposit/hold-policy';
import { TenantBooking } from '../tenant/tenant.types';
import { isValidSlotTimeVN } from '../tenant/slots.helper';
import { DepositService } from '../deposit/deposit.service';

/**
 * Mã lịch hẹn `VS-XXXXX` (32^5 ≈ 33,5 triệu tổ hợp), sinh bằng `crypto.randomInt` — không dùng Math.random/đồng hồ.
 * Mã KHÔNG phải bí mật truy cập: xem lịch bắt buộc đăng nhập và là chủ lịch (người khác nhận 404 như mã không tồn tại).
 */
export function generateBookingRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VS-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}

/** Trạng thái lịch "còn sống" — chiếm khung giờ của căn. */
const LIVE_STATUSES = [
  ViewingStatus.PENDING_CONFIRMATION,
  ViewingStatus.CONFIRMED,
  ViewingStatus.LOBBY,
  ViewingStatus.RECEIVING,
  ViewingStatus.VIEWING,
  ViewingStatus.CLOSING,
];

function isSerializationConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2034');
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingAccess: BookingAccessService,
    private readonly phones: PhoneService,
    private readonly actionTokens: ActionTokenService,
    private readonly assigner: DispatchAssignerService,
    @Optional() private readonly deposits?: DepositService,
  ) {}

  /**
   * A6: Đặt lịch xem phòng (bắt buộc vai tenant).
   */
  async createBooking(user: { id: string }, dto: CreateBookingDto): Promise<TenantBooking> {
    // 1. Kiểm tra khung giờ xem phòng
    const slotDate = new Date(dto.slot);
    const now = Date.now();
    if (isNaN(slotDate.getTime()) || !isValidSlotTimeVN(slotDate)) {
      throw new UnprocessableEntityException({
        message: 'Khung giờ đặt lịch không thuộc SLOT_TIMES khả dụng (08:30–11:30, 14:30–17:30).',
        code: 'slot_invalid',
      });
    }

    const leadMs = slotDate.getTime() - now;
    if (leadMs < 30 * 60 * 1000) {
      throw new UnprocessableEntityException({
        message: 'Chỉ được đặt lịch xem phòng trước giờ xem tối thiểu 30 phút.',
        code: 'slot_invalid',
      });
    }

    if (leadMs > 14 * 24 * 60 * 60 * 1000) {
      throw new UnprocessableEntityException({
        message: 'Chỉ được đặt lịch xem phòng trong cửa sổ tối đa 14 ngày tới.',
        code: 'slot_invalid',
      });
    }

    // 2. Kiểm tra căn hộ
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        dto.unitCode,
      );
    let unit = await this.prisma.unit.findFirst({
      where: {
        ...(isUuid
          ? {
              OR: [
                { unitCode: { equals: dto.unitCode, mode: 'insensitive' } },
                { id: dto.unitCode },
              ],
            }
          : { unitCode: { equals: dto.unitCode, mode: 'insensitive' } }),
        isVerified: true,
        media: { some: {} },
      },
      include: { building: true },
    });

    if (!unit) {
      throw new NotFoundException({
        message: 'Không tìm thấy căn hộ hoặc căn hộ không còn khả dụng.',
        code: 'unit_not_found',
      });
    }

    // Idempotency (không đổi schema): cùng khách + cùng căn + cùng giờ + lịch còn sống ⇒ đây là lần GỬI LẠI (bấm trùng,
    // mạng chập chờn) ⇒ trả lại đúng lịch đã tạo thay vì 409/tạo bản thứ hai. Kiểm TRƯỚC khi đổi action token (token
    // dùng một lần nên lần gửi lại mang cùng token sẽ bị từ chối nếu kiểm sau).
    const replay = await this.ownLiveBooking(user, unit.id, slotDate);
    if (replay) return replay;

    if (unit.status === UnitStatus.HOLDING && this.deposits) {
      await this.deposits.expireIfDue(unit.id);
      unit = (await this.prisma.unit.findUnique({ where: { id: unit.id }, include: { building: true } })) ?? unit;
    }

    if (unit.status !== UnitStatus.AVAILABLE) {
      throw new ConflictException({
        message: 'Căn hộ hiện không ở trạng thái sẵn sàng để đặt lịch xem.',
        code: 'unit_not_available',
      });
    }

    // 3. Kiểm tra trùng slot với viewing sống khác của cùng căn
    const conflictViewing = await this.prisma.viewing.findFirst({
      where: {
        unitId: unit.id,
        viewingSlot: slotDate,
        status: {
          in: [
            ViewingStatus.PENDING_CONFIRMATION,
            ViewingStatus.CONFIRMED,
            ViewingStatus.LOBBY,
            ViewingStatus.RECEIVING,
            ViewingStatus.VIEWING,
            ViewingStatus.CLOSING,
          ],
        },
      },
    });

    if (conflictViewing) {
      throw new ConflictException({
        message: 'Khung giờ này vừa có người đặt xem phòng.',
        code: 'slot_taken',
      });
    }

    // 4–6. Xác thực SĐT (OTP Zalo) + sinh mã lịch
    const normPhone = await this.verifyContactPhone(user, dto.phone, dto.actionToken);
    const refCode = await this.newRefCode();

    const contactPhoneEnc = this.phones.encrypt(normPhone);
    const contactPhoneHash = this.phones.hash(normPhone);

    // 7. Tạo Viewing và điều phối trong transaction
    let createdViewing: any;
    try {
      createdViewing = await this.prisma.$transaction(async (tx) => {
      // Re-check conflict
      const reCheck = await tx.viewing.findFirst({
        where: {
          unitId: unit.id,
          viewingSlot: slotDate,
          status: {
            in: [
              ViewingStatus.PENDING_CONFIRMATION,
              ViewingStatus.CONFIRMED,
              ViewingStatus.LOBBY,
              ViewingStatus.RECEIVING,
              ViewingStatus.VIEWING,
              ViewingStatus.CLOSING,
            ],
          },
        },
      });
      if (reCheck) {
        throw new ConflictException({
          message: 'Khung giờ này vừa có người đặt xem phòng.',
          code: 'slot_taken',
        });
      }

      const v = await tx.viewing.create({
        data: {
          bookingRefCode: refCode,
          unitId: unit.id,
          tenantId: user.id,
          contactName: dto.contactName.trim(),
          contactPhoneEnc,
          contactPhoneHash,
          partySize: dto.partySize || 1,
          tenantNote: dto.note?.trim() || null,
          viewingSlot: slotDate,
          status: ViewingStatus.PENDING_CONFIRMATION,
        },
      });

      // Điều phối (hồ sơ 15): Sale đúng vai/phân khu/đang trực/không trùng lịch; không ai ⇒ ticket vào Open Pool.
      await this.assigner.offer(tx, {
        viewingId: v.id,
        zoneName: unit.building.zoneName,
        slot: slotDate,
      });

      return v;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isSerializationConflict(error) || (error instanceof ConflictException && (error.getResponse() as any)?.code === 'slot_taken')) {
        // Hai request song song của CÙNG khách: một bên đã tạo xong ⇒ bên còn lại trả về chính lịch đó.
        const winner = await this.ownLiveBooking(user, unit.id, slotDate);
        if (winner) return winner;
        throw new ConflictException({
          message: 'Khung giờ này vừa có người đặt xem phòng.',
          code: 'slot_taken',
        });
      }
      throw error;
    }

    const fullViewing = await this.bookingAccess.loadOwned(createdViewing.bookingRefCode, user);
    return toTenantBooking(fullViewing, { rawPhone: normPhone, defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * Bước 4–5 của đặt lịch, dùng chung với cọc trực tiếp: chuẩn hoá SĐT; có action token OTP (TENANT_VIEWING) thì đổi token,
   * không thì SĐT tài khoản phải đã xác thực và trùng số; hồ sơ chưa có SĐT ⇒ gắn số vừa xác thực.
   */
  private async verifyContactPhone(user: { id: string }, phone: string, actionToken?: string): Promise<string> {
    const normPhone = this.phones.normalize(phone);
    if (!normPhone) {
      throw new BadRequestException({
        message: 'Số điện thoại không đúng định dạng Việt Nam.',
        code: 'invalid_request',
      });
    }

    if (actionToken) {
      const payload = await this.actionTokens.redeem(actionToken, 'TENANT_VIEWING');
      const payloadNorm = this.phones.normalize(payload.phone);
      if (payloadNorm !== normPhone) {
        throw authError('action_token_invalid');
      }
    } else {
      const profile = await this.prisma.profile.findUnique({ where: { id: user.id } });
      const expectedHash = this.phones.hash(normPhone);
      if (!profile?.isPhoneVerified || profile.phoneHash !== expectedHash) {
        throw new ForbiddenException({
          message: 'Vui lòng xác thực số điện thoại qua OTP trước khi đặt lịch.',
          code: 'otp_required',
        });
      }
    }

    const profile = await this.prisma.profile.findUnique({ where: { id: user.id } });
    if (profile && !profile.phoneHash) {
      const targetHash = this.phones.hash(normPhone);
      const phoneTaken = await this.prisma.profile.findFirst({
        where: { phoneHash: targetHash, NOT: { id: user.id } },
      });
      if (phoneTaken) {
        throw authError('phone_already_registered');
      }

      await this.prisma.profile.update({
        where: { id: user.id },
        data: {
          phoneEnc: this.phones.encrypt(normPhone),
          phoneHash: targetHash,
          isPhoneVerified: true,
        },
      });
    }
    return normPhone;
  }

  /** Bước 6: mã `VS-XXXXX` chưa dùng (thử 5 lần). */
  private async newRefCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateBookingRefCode();
      const existing = await this.prisma.viewing.findUnique({
        where: { bookingRefCode: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    // Không rơi về mã đoán được (đồng hồ): báo lỗi tạm thời để khách thử lại.
    throw new ServiceUnavailableException({ message: 'Chưa cấp được mã lịch hẹn, vui lòng thử lại.', code: 'ref_generation_failed' });
  }

  /**
   * Chốt cọc nhanh ngay trên trang căn, KHÔNG cần lịch xem (hồ sơ 20 · SPEC-P01). Chỉ căn chủ nhà ủy quyền chốt nhanh.
   * Tạo lịch "trực tiếp" (CLOSING, không ticket Host) rồi đi qua đúng `DepositService.createDeposit` (số tiền do server tính,
   * First-to-Pay ở markPaid). Lỗi sau khi đã tạo lịch ⇒ huỷ lịch đó (không để lịch mồ côi).
   */
  async createFastDeposit(
    user: { id: string },
    dto: FastDepositDto,
    reqContext?: { ip?: string; userAgent?: string },
  ): Promise<TenantBooking> {
    if (!this.deposits) {
      throw new ServiceUnavailableException({ message: 'Dịch vụ đặt cọc chưa sẵn sàng.', code: 'deposit_unavailable' });
    }
    if (dto.acceptTerms !== true || dto.acknowledgeNoViewing !== true) {
      throw new BadRequestException({
        message: 'Bạn cần đồng ý điều khoản cọc và xác nhận chốt cọc không xem trực tiếp.',
        code: 'invalid_request',
      });
    }
    if (dto.termsVersion !== DEPOSIT_TERMS_VERSION) {
      throw new ConflictException({ message: 'Phiên bản điều khoản đặt cọc đã cũ, vui lòng tải lại.', code: 'terms_version_stale' });
    }

    let unit = await this.prisma.unit.findFirst({
      where: { unitCode: { equals: dto.unitCode.trim(), mode: 'insensitive' }, isVerified: true, media: { some: {} } },
      include: { building: true },
    });
    if (!unit) {
      throw new NotFoundException({ message: 'Không tìm thấy căn hộ hoặc căn hộ không còn khả dụng.', code: 'unit_not_found' });
    }
    if (unit.status === UnitStatus.HOLDING) {
      await this.deposits.expireIfDue(unit.id);
      unit = (await this.prisma.unit.findUnique({ where: { id: unit.id }, include: { building: true } })) ?? unit;
    }
    if (unit.status !== UnitStatus.AVAILABLE) {
      throw new ConflictException({ message: 'Căn hộ hiện không còn trống để đặt cọc.', code: 'unit_not_available' });
    }
    if (!fastDepositQuote(await this.deposits.fastCloseSource(this.prisma, unit))) {
      throw new ConflictException({ message: 'Căn này chưa được chủ nhà ủy quyền chốt nhanh.', code: 'fast_close_unavailable' });
    }

    // Idempotent: lịch trực tiếp còn sống của chính khách cho căn này ⇒ dùng lại (createDeposit tự báo giá lại / trả nguyên).
    const live = await this.prisma.viewing.findFirst({
      where: { tenantId: user.id, unitId: unit.id, status: ViewingStatus.CLOSING, tickets: { none: {} } },
      select: { id: true, bookingRefCode: true },
    });
    let ref = live?.bookingRefCode;
    let createdId: string | null = null;
    if (!ref) {
      const normPhone = await this.verifyContactPhone(user, dto.phone, dto.actionToken);
      ref = await this.newRefCode();
      const v = await this.prisma.viewing.create({
        data: {
          bookingRefCode: ref,
          unitId: unit.id,
          tenantId: user.id,
          contactName: dto.contactName.trim(),
          contactPhoneEnc: this.phones.encrypt(normPhone),
          contactPhoneHash: this.phones.hash(normPhone),
          partySize: dto.partySize || 1,
          viewingSlot: new Date(),
          status: ViewingStatus.CLOSING,
        },
      });
      createdId = v.id;
    }

    try {
      return await this.deposits.createDeposit(
        ref,
        user,
        { acceptTerms: true, termsVersion: dto.termsVersion, fastClose: true },
        reqContext,
        { direct: true, acknowledgeNoViewing: true },
      );
    } catch (error) {
      if (createdId) {
        await this.prisma.viewing
          .update({ where: { id: createdId }, data: { status: ViewingStatus.CANCELLED, closedReason: 'fast_deposit_failed' } })
          .catch((e: Error) => this.logger.error(`Huỷ lịch cọc trực tiếp ${ref} lỗi: ${e.message}`));
      }
      throw error;
    }
  }

  /** Lịch còn sống của chính khách cho (căn, giờ) — dùng cho idempotency của `createBooking`. */
  private async ownLiveBooking(user: { id: string }, unitId: string, slot: Date): Promise<TenantBooking | null> {
    const existing = await this.prisma.viewing.findFirst({
      where: { tenantId: user.id, unitId, viewingSlot: slot, status: { in: LIVE_STATUSES } },
      select: { bookingRefCode: true },
    });
    if (!existing) return null;
    const full = await this.bookingAccess.loadOwned(existing.bookingRefCode, user);
    let rawPhone: string | undefined;
    try {
      rawPhone = full.contactPhoneEnc ? this.phones.decrypt(full.contactPhoneEnc) : undefined;
    } catch {
      rawPhone = undefined; // SĐT giải mã lỗi ⇒ trả số đã che (toTenantBooking tự xử lý), không chặn việc trả lịch
    }
    return toTenantBooking(full, { rawPhone, defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * A7: Danh sách lịch hẹn xem phòng của tenant đang đăng nhập.
   */
  async getMyBookings(user: { id: string }): Promise<TenantBooking[]> {
    const viewings = await this.prisma.viewing.findMany({
      where: { tenantId: user.id },
      include: {
        unit: {
          include: {
            building: true,
            media: true,
          },
        },
        tenant: true,
        tickets: {
          include: {
            host: {
              include: {
                profile: true,
              },
            },
          },
          orderBy: { offeredAt: 'asc' },
        },
        deposit: {
          include: {
            identity: true,
            contract: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const defaultHoldHours = await readDefaultHoldHours(this.prisma);
    return viewings.map((v) => {
      let rawPhone: string | undefined = undefined;
      if (v.contactPhoneEnc) {
        try {
          rawPhone = this.phones.decrypt(v.contactPhoneEnc);
        } catch {
          rawPhone = undefined;
        }
      }
      return toTenantBooking(v, { rawPhone, defaultHoldHours });
    });
  }

  /**
   * A8: Chi tiết lịch hẹn xem phòng theo mã ref.
   */
  async getBookingByRef(ref: string, user: { id: string }): Promise<TenantBooking> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);
    let rawPhone: string | undefined = undefined;
    if (viewing.contactPhoneEnc) {
      try {
        rawPhone = this.phones.decrypt(viewing.contactPhoneEnc);
      } catch {
        rawPhone = undefined;
      }
    }
    return toTenantBooking(viewing, { rawPhone, defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * A9: Hủy lịch hẹn xem phòng.
   */
  async cancelBooking(ref: string, user: { id: string }, dto: CancelBookingDto): Promise<TenantBooking> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);

    if (
      viewing.status !== ViewingStatus.PENDING_CONFIRMATION &&
      viewing.status !== ViewingStatus.CONFIRMED
    ) {
      throw new ConflictException({
        message: 'Không thể hủy lịch hẹn ở trạng thái hiện tại.',
        code: 'bad_status',
        expected: 'pending|confirmed',
        actual: statusToWeb(viewing.status),
      });
    }

    const leadMs = new Date(viewing.viewingSlot).getTime() - Date.now();
    if (leadMs < 2 * 60 * 60 * 1000) {
      throw new ConflictException({
        message: 'Chỉ được hủy lịch hẹn trước giờ xem tối thiểu 2 giờ.',
        code: 'too_late_to_modify',
      });
    }

    await this.prisma.$transaction([
      this.prisma.viewing.update({
        where: { id: viewing.id },
        data: {
          status: ViewingStatus.CANCELLED,
          closedReason: dto.reason.trim(),
        },
      }),
      this.prisma.dispatchTicket.updateMany({
        where: {
          viewingId: viewing.id,
          status: { in: [TicketStatus.OFFERED, TicketStatus.ACCEPTED] },
        },
        data: { status: TicketStatus.CANCELLED, closedAt: new Date() },
      }),
    ]);

    const updated = await this.bookingAccess.loadOwned(ref, user);
    return toTenantBooking(updated, { defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * A10: Đổi khung giờ xem phòng.
   */
  async rescheduleBooking(ref: string, user: { id: string }, dto: RescheduleBookingDto): Promise<TenantBooking> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);

    if (
      viewing.status !== ViewingStatus.PENDING_CONFIRMATION &&
      viewing.status !== ViewingStatus.CONFIRMED
    ) {
      throw new ConflictException({
        message: 'Không thể đổi lịch hẹn ở trạng thái hiện tại.',
        code: 'bad_status',
      });
    }

    const leadMs = new Date(viewing.viewingSlot).getTime() - Date.now();
    if (leadMs < 2 * 60 * 60 * 1000) {
      throw new ConflictException({
        message: 'Chỉ được đổi lịch hẹn trước giờ xem tối thiểu 2 giờ.',
        code: 'too_late_to_modify',
      });
    }

    const newSlot = new Date(dto.slot);
    if (isNaN(newSlot.getTime()) || !isValidSlotTimeVN(newSlot)) {
      throw new UnprocessableEntityException({
        message: 'Khung giờ mới không thuộc SLOT_TIMES hợp lệ.',
        code: 'slot_invalid',
      });
    }

    const newLeadMs = newSlot.getTime() - Date.now();
    if (newLeadMs < 30 * 60 * 1000 || newLeadMs > 14 * 24 * 60 * 60 * 1000) {
      throw new UnprocessableEntityException({
        message: 'Khung giờ mới phải cách hiện tại ít nhất 30 phút và trong vòng 14 ngày.',
        code: 'slot_invalid',
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.viewing.findFirst({
        where: {
          unitId: viewing.unitId,
          viewingSlot: newSlot,
          id: { not: viewing.id },
          status: {
            in: [
              ViewingStatus.PENDING_CONFIRMATION,
              ViewingStatus.CONFIRMED,
              ViewingStatus.LOBBY,
              ViewingStatus.RECEIVING,
              ViewingStatus.VIEWING,
              ViewingStatus.CLOSING,
            ],
          },
        },
      });

      if (conflict) {
        throw new ConflictException({
          message: 'Khung giờ mới đã có người đặt trước.',
          code: 'slot_taken',
        });
      }

      await tx.viewing.update({
        where: { id: viewing.id },
        data: {
          viewingSlot: newSlot,
          rescheduleCount: { increment: 1 },
          status: ViewingStatus.PENDING_CONFIRMATION,
          confirmedAt: null,
        },
      });

      // Hủy ticket cũ và điều phối lại
      await tx.dispatchTicket.updateMany({
        where: {
          viewingId: viewing.id,
          status: { in: [TicketStatus.OFFERED, TicketStatus.ACCEPTED] },
        },
        data: { status: TicketStatus.CANCELLED, closedAt: new Date() },
      });

      await this.assigner.offer(tx, {
        viewingId: viewing.id,
        zoneName: viewing.unit.building.zoneName,
        slot: newSlot,
      });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw new ConflictException({
          message: 'Khung giờ mới vừa có người đặt trước.',
          code: 'slot_taken',
        });
      }
      throw error;
    }

    const updated = await this.bookingAccess.loadOwned(ref, user);
    return toTenantBooking(updated, { defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * A11: Xin trễ 10 phút.
   */
  async requestLate(ref: string, user: { id: string }): Promise<TenantBooking> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);

    if (viewing.status !== ViewingStatus.CONFIRMED) {
      throw new ConflictException({
        message: 'Chỉ có thể xin trễ khi lịch hẹn đã được xác nhận.',
        code: 'bad_status',
      });
    }

    if (!viewing.lateRequestedAt) {
      await this.prisma.viewing.update({
        where: { id: viewing.id },
        data: { lateRequestedAt: new Date() },
      });
    }

    const updated = await this.bookingAccess.loadOwned(ref, user);
    return toTenantBooking(updated, { defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * A12: Check-in tại sảnh.
   */
  async lobbyCheckIn(ref: string, user: { id: string }): Promise<TenantBooking> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);

    if (viewing.status !== ViewingStatus.CONFIRMED) {
      throw new ConflictException({
        message: 'Chỉ có thể check-in sảnh khi lịch hẹn đã được xác nhận.',
        code: 'bad_status',
      });
    }

    await this.prisma.viewing.update({
      where: { id: viewing.id },
      data: {
        status: ViewingStatus.LOBBY,
        lobbyCheckInAt: new Date(),
      },
    });

    const updated = await this.bookingAccess.loadOwned(ref, user);
    return toTenantBooking(updated, { defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

  /**
   * A13: Đánh giá chất lượng phục vụ của Field Host.
   */
  async rateBooking(ref: string, user: { id: string }, dto: RateBookingDto): Promise<TenantBooking> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);

    const allowed: ViewingStatus[] = [
      ViewingStatus.VIEWING,
      ViewingStatus.CLOSING,
      ViewingStatus.HOLDING,
      ViewingStatus.LEASED,
      ViewingStatus.COMPLETED,
    ];

    if (!allowed.includes(viewing.status)) {
      throw new ConflictException({
        message: 'Không thể đánh giá Field Host ở trạng thái này.',
        code: 'bad_status',
      });
    }

    if (viewing.tenantRating !== null && viewing.tenantRating !== undefined) {
      throw new ConflictException({
        message: 'Lịch hẹn này đã được đánh giá.',
        code: 'already_rated',
      });
    }

    await this.prisma.viewing.update({
      where: { id: viewing.id },
      data: { tenantRating: Math.round(dto.stars) },
    });

    const updated = await this.bookingAccess.loadOwned(ref, user);
    return toTenantBooking(updated, { defaultHoldHours: await readDefaultHoldHours(this.prisma) });
  }

}
