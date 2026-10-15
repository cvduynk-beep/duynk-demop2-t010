import { securityDepositAmount } from './deposit-amount';
import { FAST_CLOSE_CYCLES, FAST_CLOSE_QUOTE_HOURS, fastCloseRent, fastDepositQuote, type FastCloseRentQuote, type FastCloseSource } from './fast-close';
import { readConsignmentMeta } from '../landlord/landlord.mappers';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhoneService } from '../auth/phone/phone.service';
import { BookingAccessService } from '../tenant/booking-access.service';
import { buildDepositTerms, DEPOSIT_TERMS_VERSION } from './deposit-terms';
import { resolveHoldHours } from './hold-policy';
import { getVietQrConfig, isDemoToolsEnabled, isVietQrWebhookConfigured } from './vietqr';
import { CreateDepositDto, UploadHostReceiptDto } from './dto/deposit.dto';
import { toTenantBooking, statusToWeb } from '../tenant/tenant.mappers';
import { DepositTermsDoc, TenantBooking } from '../tenant/tenant.types';
import { DepositStatus, HostRole, TicketStatus, UnitStatus, ViewingStatus } from '@prisma/client';

function isSerializationConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2034');
}

/** Cọc chốt nhanh = có hạn ưu đãi 24 giờ (hồ sơ 20 · 01-CONTRACTS §2). Chu kỳ có thể còn NULL tới lúc ký HĐ. */
export const isFastDeposit = (d: { quoteExpiresAt?: unknown } | null | undefined): boolean => d?.quoteExpiresAt != null;

/** Báo giá công khai trên trang căn — KHÔNG có giá sàn, KHÔNG có giá thuê đã giảm. */
export interface PublicFastDepositQuote {
  eligible: boolean;
  holdHours: number;
  quoteHours: number;
  deposit: number;
  depositDiscount: number;
  amount: number;
}

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly phones: PhoneService,
    private readonly bookingAccess: BookingAccessService,
  ) {}

  private async systemActorId(client: any): Promise<string> {
    const admin = await client.profile.findFirst({
      where: { role: { code: 'ops_admin' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new ServiceUnavailableException({
        message: 'Chưa có tài khoản Admin thật để ghi nhận sự kiện đối soát.',
        code: 'system_actor_unavailable',
      });
    }
    return admin.id;
  }

  /** A14 (công khai): biên bản điều khoản cọc khách đọc trước khi tick. Có `unitCode` thì dùng giờ giữ chỗ của căn đó. */
  async getPublicDepositTerms(unitCode?: string): Promise<DepositTermsDoc> {
    let override: number | null = null;
    let amount = 0;
    if (unitCode) {
      const unit = await this.prisma.unit.findFirst({
        where: { unitCode: { equals: unitCode.trim(), mode: 'insensitive' } },
        select: { holdHoursOverride: true, securityDeposit: true, baseRentPrice: true },
      });
      if (!unit) throw new NotFoundException({ message: 'Không tìm thấy căn hộ.', code: 'unit_not_found' });
      override = unit.holdHoursOverride;
      amount = securityDepositAmount(unit);
    }
    return buildDepositTerms(await resolveHoldHours(this.prisma, { override }), amount);
  }

  async getDepositTerms(ref: string, user: { id: string }): Promise<DepositTermsDoc> {
    const viewing = await this.bookingAccess.loadOwned(ref, user);
    const unit = await this.prisma.unit.findUnique({
      where: { id: viewing.unitId },
    });

    return buildDepositTerms(await resolveHoldHours(this.prisma, { override: unit?.holdHoursOverride }), securityDepositAmount(unit));
  }

  /**
   * Nguồn chốt nhanh của căn: giá chào, Tiền cọc bảo đảm, giá sàn (meta hồ sơ ký gửi mới nhất; chủ nhà không ủy quyền ⇒
   * `floorRent` null). Giá sàn KHÔNG bao giờ trả ra API — chỉ dùng để kẹp giá đã giảm. Dùng chung với LeaseSigningService.
   */
  async fastCloseSource(db: any, unit: { id: string; baseRentPrice: unknown; securityDeposit?: unknown }): Promise<FastCloseSource> {
    const mandate = await db.exclusiveMandate.findFirst({ where: { unitId: unit.id }, orderBy: { createdAt: 'desc' }, select: { doorAccessConfig: true } });
    const form = readConsignmentMeta(mandate?.doorAccessConfig)?.form;
    const floor = form?.allowFastClose && form.floorRent ? Number(form.floorRent) : null;
    return { rent: Math.round(Number(unit.baseRentPrice)), deposit: securityDepositAmount(unit), floorRent: floor };
  }

  /**
   * Công khai (trang căn): căn có nút "Chốt cọc nhanh" không và giảm bao nhiêu tiền cọc. Mức giảm cọc chỉ phụ thuộc số cọc
   * nên không suy ngược được giá sàn; giá thuê theo chu kỳ chỉ báo cho chủ lịch (`getFastCloseQuotes`).
   */
  async getPublicFastDeposit(unitCode: string): Promise<PublicFastDepositQuote> {
    const unit = await this.prisma.unit.findFirst({
      where: { unitCode: { equals: unitCode.trim(), mode: 'insensitive' }, isVerified: true, media: { some: {} } },
    });
    if (!unit) throw new NotFoundException({ message: 'Không tìm thấy căn hộ.', code: 'unit_not_found' });
    const src = await this.fastCloseSource(this.prisma, unit);
    const quote = unit.status === UnitStatus.AVAILABLE ? fastDepositQuote(src) : null;
    return {
      eligible: quote != null,
      holdHours: await resolveHoldHours(this.prisma, { override: unit.holdHoursOverride }),
      quoteHours: FAST_CLOSE_QUOTE_HOURS,
      deposit: src.deposit,
      depositDiscount: quote?.depositDiscount ?? 0,
      amount: quote?.deposit ?? src.deposit,
    };
  }

  /**
   * Báo giá chốt nhanh cho CHÍNH chủ lịch hẹn (không công khai ⇒ không suy ngược được giá sàn từ catalog).
   * `stage = 'deposit'`: lịch đang chốt cọc — giảm cọc + xem trước giá thuê theo chu kỳ.
   * `stage = 'lease'`: đã giữ căn bằng cọc chốt nhanh, chưa chọn chu kỳ — khách chọn ở bước ký HĐ.
   */
  async getFastCloseQuotes(ref: string, user: { id: string }) {
    const viewing = await this.bookingAccess.loadOwned(ref, user);
    const unit = await this.prisma.unit.findUnique({ where: { id: viewing.unitId } });
    if (!unit) throw new NotFoundException({ message: 'Không tìm thấy căn hộ.', code: 'unit_not_found' });
    const src = await this.fastCloseSource(this.prisma, unit);
    const dep = viewing.deposit;
    let stage: 'deposit' | 'lease' | null = null;
    if (viewing.status === ViewingStatus.CLOSING) stage = 'deposit';
    else if (
      viewing.status === ViewingStatus.HOLDING &&
      dep?.paymentStatus === DepositStatus.PAID_HOLDING &&
      isFastDeposit(dep) &&
      dep.fastCloseCycle == null
    ) stage = 'lease';
    const depositQuote = fastDepositQuote(src);
    const quotes = stage && depositQuote ? FAST_CLOSE_CYCLES.map((c) => fastCloseRent(src, c)).filter((q): q is FastCloseRentQuote => q != null) : [];
    const eligible = quotes.length > 0;
    return {
      eligible,
      stage: eligible ? stage : null,
      quoteHours: FAST_CLOSE_QUOTE_HOURS,
      rent: src.rent,
      deposit: src.deposit,
      depositDiscount: eligible ? depositQuote!.depositDiscount : 0,
      depositAfter: eligible ? depositQuote!.deposit : src.deposit,
      quotes: quotes.map(({ cycle, rent, rentDiscount, rentDiscountPct }) => ({ cycle, rent, rentDiscount, rentDiscountPct })),
    };
  }

  async createDeposit(
    ref: string,
    user: { id: string },
    dto: CreateDepositDto,
    reqContext?: { ip?: string; userAgent?: string },
    /** Cọc trực tiếp từ trang căn (`POST /bookings/fast-deposit`): ghi dấu vào audit. */
    origin?: { direct: true; acknowledgeNoViewing: true },
  ): Promise<TenantBooking> {
    if (!isDemoToolsEnabled() && (!getVietQrConfig() || !isVietQrWebhookConfigured())) {
      throw new ServiceUnavailableException({
        message: 'Thanh toán VietQR chưa được cấu hình đầy đủ để nhận và đối soát giao dịch.',
        code: 'vietqr_not_configured',
      });
    }

    const viewing = await this.bookingAccess.loadOwned(ref, user);

    if (viewing.status !== ViewingStatus.CLOSING) {
      throw new ConflictException({
        message: 'Lịch hẹn chưa ở trạng thái chốt cọc.',
        code: 'bad_status',
        expected: 'closing',
        actual: statusToWeb(viewing.status),
      });
    }

    if (dto.acceptTerms !== true) {
      throw new BadRequestException({
        message: 'Bạn phải đồng ý với điều khoản đặt cọc.',
        code: 'invalid_request',
      });
    }

    if (dto.termsVersion !== DEPOSIT_TERMS_VERSION) {
      throw new ConflictException({
        message: 'Phiên bản điều khoản đặt cọc đã cũ, vui lòng tải lại.',
        code: 'terms_version_stale',
      });
    }

    // Chu kỳ 1/3/6 chọn ở bước ký HĐ (hồ sơ 20); lúc cọc chỉ có giảm cọc.
    const fastClose = dto.fastClose === true;

    // Check existing deposit (viewing_id UNIQUE ⇒ một khoản cọc / lịch; chưa có tiền về thì được báo giá lại trên chính dòng đó)
    const existingDeposit = await this.prisma.holdingDeposit.findUnique({
      where: { viewingId: viewing.id },
    });
    const now0 = new Date();
    const quoteAlive = (d: any) => !isFastDeposit(d) || new Date(d.quoteExpiresAt) > now0;
    const reusable = (d: any) =>
      d.paymentStatus === DepositStatus.QR_EXPIRED ||
      d.paymentStatus === DepositStatus.PENDING_PAYMENT ||
      (d.paymentStatus === DepositStatus.REFUNDED && isFastDeposit(d)); // hoàn vì quá hạn chốt nhanh

    // Chụp giá trị cũ TRƯỚC khi ghi (audit cũ/mới của lần báo giá lại).
    const before = existingDeposit
      ? { amount: Number(existingDeposit.amount), fastClose: isFastDeposit(existingDeposit), paymentStatus: existingDeposit.paymentStatus }
      : undefined;

    if (existingDeposit) {
      const sameChoice = isFastDeposit(existingDeposit) === fastClose && existingDeposit.termsVersion === DEPOSIT_TERMS_VERSION;
      if (existingDeposit.paymentStatus === DepositStatus.PENDING_PAYMENT && sameChoice && quoteAlive(existingDeposit)) {
        // Idempotent: return existing without changing termsAcceptedAt
        const reloaded = await this.bookingAccess.loadOwned(ref, user);
        let rawPhone: string | undefined;
        if (viewing.contactPhoneEnc) {
          try {
            rawPhone = this.phones.decrypt(viewing.contactPhoneEnc);
          } catch {}
        }
        const holdHours = await resolveHoldHours(this.prisma, { snapshot: existingDeposit.holdHours, override: reloaded.unit?.holdHoursOverride });
        return toTenantBooking(reloaded, { rawPhone, holdHours });
      }
      if (!reusable(existingDeposit)) {
        throw new ConflictException({
          message: 'Giao dịch cọc đã được xử lý hoặc không ở trạng thái chờ thanh toán.',
          code: 'bad_status',
        });
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      await this.expireIfDue(viewing.unitId, tx);

      const unit = await tx.unit.findUnique({
        where: { id: viewing.unitId },
      });

      if (!unit || unit.status !== UnitStatus.AVAILABLE) {
        throw new ConflictException({
          message: 'Căn hộ đã có người khác giữ chỗ hoặc không còn trống.',
          code: 'unit_already_held',
        });
      }

      // Attribution lock: find host from accepted ticket
      const acceptedTicket = viewing.tickets?.find((t: any) => t.status === 'ACCEPTED');
      const attributedHostId = acceptedTicket?.hostId ?? null;
      let rawPhone: string | undefined;
      if (viewing.contactPhoneEnc) {
        try {
          rawPhone = this.phones.decrypt(viewing.contactPhoneEnc);
        } catch {
          rawPhone = undefined;
        }
      }

      const depositCode = `DEP-${ref}`;
      // Số tiền do SERVER tính (CẤM nhận từ client): Tiền cọc bảo đảm của căn; chốt nhanh ⇒ đã giảm theo fast-close.ts.
      const baseAmount = securityDepositAmount(unit);
      if (baseAmount <= 0) {
        throw new ConflictException({ message: 'Căn chưa có Tiền cọc bảo đảm hợp lệ, vui lòng liên hệ hỗ trợ.', code: 'deposit_unavailable' });
      }
      const quote = fastClose ? fastDepositQuote(await this.fastCloseSource(tx, unit)) : null;
      if (fastClose && !quote) {
        throw new ConflictException({ message: 'Căn này chưa được chủ nhà ủy quyền chốt nhanh.', code: 'fast_close_unavailable' });
      }
      const amount = quote ? quote.deposit : baseAmount;
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const randHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      const vietqrRef = `VQ-${randNum}-${randHex}`;
      const transferContent = `COC ${unit.unitCode} ${ref}`;
      const now = new Date();
      // Chốt số giờ vào cọc ngay lúc khách tick điều khoản: Admin đổi mặc định sau đó không làm đổi cọc này.
      const holdHours = await resolveHoldHours(tx, { override: unit.holdHoursOverride });

      const terms = {
        attributedHostId,
        amount,
        baseAmount: quote ? baseAmount : null,
        // Chu kỳ + giá thuê ghi khi ký HĐ (LeaseSigningService); báo giá lại xoá giá trị cũ nếu có.
        fastCloseCycle: null,
        quotedMonthlyRent: null,
        quoteExpiresAt: quote ? new Date(now.getTime() + FAST_CLOSE_QUOTE_HOURS * 3_600_000) : null,
        vietqrRef,
        transferContent,
        paymentStatus: DepositStatus.PENDING_PAYMENT,
        termsAcceptedAt: now,
        termsVersion: DEPOSIT_TERMS_VERSION,
        holdHours,
      };
      // Báo giá lại (chưa có tiền về): ghi đè đúng dòng cũ — chỉ khi trạng thái vẫn là trạng thái đã đọc (chống đua).
      const deposit = existingDeposit
        ? await (async () => {
            const res = await tx.holdingDeposit.updateMany({ where: { id: existingDeposit.id, paymentStatus: existingDeposit.paymentStatus }, data: terms });
            if (res.count !== 1) throw new ConflictException({ message: 'Giao dịch cọc vừa thay đổi, vui lòng tải lại.', code: 'bad_status' });
            return { ...existingDeposit, ...terms };
          })()
        : await tx.holdingDeposit.create({ data: { depositCode, viewingId: viewing.id, unitId: unit.id, ...terms } });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: 'tenant',
          actionType: existingDeposit ? 'DEPOSIT_REQUOTED' : 'DEPOSIT_TERMS_ACCEPTED',
          entityName: 'HoldingDeposit',
          entityId: deposit.id,
          oldValue: before,
          newValue: {
            termsVersion: DEPOSIT_TERMS_VERSION,
            holdHours,
            amount,
            ...(quote ? { fastClose: { baseAmount, depositDiscount: quote.depositDiscount, quoteExpiresAt: terms.quoteExpiresAt?.toISOString() } } : {}),
            ...(origin ?? {}),
          },
          ipAddress: reqContext?.ip || '127.0.0.1',
          userAgent: reqContext?.userAgent || 'VinStay PWA / Web Client',
        },
      });

      const reloaded = await tx.viewing.findUnique({
        where: { id: viewing.id },
        include: {
          unit: { include: { building: true } },
          tenant: true,
          tickets: { include: { host: { include: { profile: true } } } },
          deposit: true,
        },
      });

      return toTenantBooking(reloaded, { rawPhone, holdHours });
    });
  }

  /**
   * DEMO (xoá khi có webhook ngân hàng thật): giả lập ngân hàng báo có cho cọc của chính khách này,
   * đi qua đúng markPaid nên first-to-pay, hết hạn giữ chỗ... vẫn chạy như thật.
   */
  async demoPay(ref: string, user: { id: string }): Promise<{ outcome: string }> {
    if (!isDemoToolsEnabled()) {
      throw new NotFoundException({ message: 'Không tìm thấy.', code: 'not_found' });
    }
    const viewing = await this.bookingAccess.loadOwned(ref, user);
    const deposit = await this.prisma.holdingDeposit.findUnique({ where: { viewingId: viewing.id } });
    if (!deposit) {
      throw new ConflictException({ message: 'Chưa có giao dịch cọc để thanh toán.', code: 'bad_status' });
    }
    const outcome = await this.markPaid({
      depositCode: deposit.depositCode,
      amount: Number(deposit.amount),
      // Mỗi lần báo giá có vietqrRef mới ⇒ mã giao dịch demo không trùng sau khi khoản cọc được dùng lại (hoàn vì quá hạn chốt nhanh).
      bankRefNumber: `DEMO-${deposit.depositCode}-${deposit.vietqrRef}`,
      actor: 'bank',
      actorId: user.id,
    });
    return { outcome };
  }

  async markPaid(input: {
    transferContent?: string;
    depositCode?: string;
    amount: number;
    bankRefNumber: string;
    paidAt?: Date;
    actor: 'bank';
    actorId?: string;
  }): Promise<'paid' | 'duplicate' | 'ignored' | 'refunded'> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Idempotent: check bankRefNumber in EscrowTransaction
      const existingTx = await tx.escrowTransaction.findUnique({
        where: { bankRefNumber: input.bankRefNumber },
      });
      if (existingTx) {
        return 'duplicate';
      }

      // 2. Find pending deposit by depositCode or transferContent
      let deposit: any = null;
      if (input.depositCode) {
        deposit = await tx.holdingDeposit.findFirst({
          where: {
            depositCode: input.depositCode,
            paymentStatus: { in: [DepositStatus.PENDING_PAYMENT, DepositStatus.QR_EXPIRED] },
          },
          include: { unit: true, viewing: { include: { tenant: true } } },
        });
      }

      if (!deposit && input.transferContent) {
        const cleaned = input.transferContent.trim().replace(/\s+/g, ' ');
        deposit = await tx.holdingDeposit.findFirst({
          where: {
            paymentStatus: { in: [DepositStatus.PENDING_PAYMENT, DepositStatus.QR_EXPIRED] },
            transferContent: { equals: cleaned, mode: 'insensitive' },
          },
          include: { unit: true, viewing: { include: { tenant: true } } },
        });
      }

      if (!deposit) {
        const systemActorId = input.actorId || (await this.systemActorId(tx));
        await tx.auditLog.create({
          data: {
            actorId: systemActorId,
            actorRole: input.actor,
            actionType: 'DEPOSIT_UNMATCHED',
            entityName: 'HoldingDeposit',
            entityId: input.depositCode || input.transferContent || 'unknown',
            newValue: { bankRefNumber: input.bankRefNumber, amount: input.amount },
          },
        });
        return 'ignored';
      }

      const effectiveActorId = deposit.viewing?.tenantId || input.actorId || (await this.systemActorId(tx));

      // 3. Amount check: phải đúng số tiền đã chốt trên khoản cọc này (cọc v2 / chốt nhanh / cọc cũ 2tr)
      const expected = Number(deposit.amount);
      if (Number(input.amount) !== expected) {
        await tx.auditLog.create({
          data: {
            actorId: effectiveActorId,
            actorRole: input.actor,
            actionType: 'DEPOSIT_AMOUNT_MISMATCH',
            entityName: 'HoldingDeposit',
            entityId: deposit.id,
            newValue: {
              expected,
              received: input.amount,
              bankRefNumber: input.bankRefNumber,
            },
          },
        });
        return 'ignored';
      }

      // 3b. Chốt nhanh quá 24 giờ: ưu đãi đã hết ⇒ không giữ căn với giá đã giảm; hoàn đúng khoản vừa nhận.
      const receivedAt = input.paidAt || new Date();
      if (isFastDeposit(deposit) && receivedAt > new Date(deposit.quoteExpiresAt)) {
        await tx.holdingDeposit.update({ where: { id: deposit.id }, data: { paymentStatus: DepositStatus.REFUNDED } });
        await tx.escrowTransaction.create({
          data: { depositId: deposit.id, transType: 'INBOUND_DEPOSIT', amount: expected, bankRefNumber: input.bankRefNumber, executedAt: receivedAt },
        });
        await tx.escrowTransaction.create({
          data: { depositId: deposit.id, transType: 'REFUND', amount: expected, bankRefNumber: `${input.bankRefNumber}-R`, executedAt: receivedAt },
        });
        await tx.auditLog.create({
          data: {
            actorId: effectiveActorId,
            actorRole: input.actor,
            actionType: 'DEPOSIT_QUOTE_EXPIRED_REFUND',
            entityName: 'HoldingDeposit',
            entityId: deposit.id,
            newValue: { bankRefNumber: input.bankRefNumber, quoteExpiresAt: new Date(deposit.quoteExpiresAt).toISOString(), receivedAt: receivedAt.toISOString() },
          },
        });
        return 'refunded';
      }

      // 4. Lazy expire
      await this.expireIfDue(deposit.unitId, tx);

      // 5. First-to-Pay Wins race condition lock
      const unitUpdate = await tx.unit.updateMany({
        where: { id: deposit.unitId, status: UnitStatus.AVAILABLE },
        data: { status: UnitStatus.HOLDING },
      });

      if (unitUpdate.count === 0) {
        // Race lost: unit already held or rented
        await tx.holdingDeposit.update({
          where: { id: deposit.id },
          data: { paymentStatus: DepositStatus.REFUNDED },
        });

        const execTime = input.paidAt || new Date();
        await tx.escrowTransaction.create({
          data: {
            depositId: deposit.id,
            transType: 'INBOUND_DEPOSIT',
            amount: expected,
            bankRefNumber: input.bankRefNumber,
            executedAt: execTime,
          },
        });

        await tx.escrowTransaction.create({
          data: {
            depositId: deposit.id,
            transType: 'REFUND',
            amount: expected,
            bankRefNumber: `${input.bankRefNumber}-R`,
            executedAt: execTime,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: effectiveActorId,
            actorRole: input.actor,
            actionType: 'DEPOSIT_LOST_RACE',
            entityName: 'HoldingDeposit',
            entityId: deposit.id,
            newValue: {
              bankRefNumber: input.bankRefNumber,
              reason: 'Căn hộ đã được người khác giữ chỗ trước.',
            },
          },
        });

        return 'refunded';
      }

      // 6. Won race (paid)
      const paidAt = input.paidAt || new Date();
      // Giờ đã chốt trong cọc (điều khoản khách đã tick) trước, rồi mới tới giờ riêng của căn / mặc định — cùng thứ tự với duyệt UNC.
      const holdHours = await resolveHoldHours(tx, { snapshot: deposit.holdHours, override: deposit.unit?.holdHoursOverride });
      const expiresAt = new Date(paidAt.getTime() + holdHours * 3600 * 1000);

      await tx.holdingDeposit.update({
        where: { id: deposit.id },
        data: {
          paymentStatus: DepositStatus.PAID_HOLDING,
          paidAt,
          holdHours,
          expiresAt,
        },
      });

      await tx.viewing.update({
        where: { id: deposit.viewingId },
        data: { status: ViewingStatus.HOLDING },
      });

      await tx.escrowTransaction.create({
        data: {
          depositId: deposit.id,
          transType: 'INBOUND_DEPOSIT',
          amount: expected,
          bankRefNumber: input.bankRefNumber,
          executedAt: paidAt,
        },
      });

      // Cancel other active viewings for the same unit
      await tx.viewing.updateMany({
        where: {
          unitId: deposit.unitId,
          id: { not: deposit.viewingId },
          status: {
            in: [
              ViewingStatus.PENDING_CONFIRMATION,
              ViewingStatus.CONFIRMED,
              ViewingStatus.LOBBY,
            ],
          },
        },
        data: {
          status: ViewingStatus.CANCELLED,
          closedReason: 'auto_cancelled_due_to_deposit',
        },
      });

      // Expire other pending deposits for the same unit
      await tx.holdingDeposit.updateMany({
        where: {
          unitId: deposit.unitId,
          id: { not: deposit.id },
          paymentStatus: DepositStatus.PENDING_PAYMENT,
        },
        data: { paymentStatus: DepositStatus.QR_EXPIRED },
      });

      await tx.auditLog.create({
        data: {
          actorId: effectiveActorId,
          actorRole: input.actor,
          actionType: 'DEPOSIT_PAID',
          entityName: 'HoldingDeposit',
          entityId: deposit.id,
          newValue: {
            bankRefNumber: input.bankRefNumber,
            paidAt: paidAt.toISOString(),
            holdHours,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return 'paid';
    });
  }

  async expireIfDue(unitId: string, tx?: any): Promise<void> {
    const db = tx || this.prisma;
    const now = new Date();

    const expiredDeposits = await db.holdingDeposit.findMany({
      where: {
        unitId,
        paymentStatus: { in: [DepositStatus.PAID_HOLDING, DepositStatus.UNC_PENDING_REVIEW] },
        expiresAt: { lte: now },
      },
      include: { viewing: true },
    });
    if (!expiredDeposits.length) return;

    for (const dep of expiredDeposits) {
      const isUncReview = dep.paymentStatus === DepositStatus.UNC_PENDING_REVIEW;
      await db.holdingDeposit.update({
        where: { id: dep.id },
        data: { paymentStatus: isUncReview ? DepositStatus.QR_EXPIRED : DepositStatus.FORFEITED },
      });

      if (dep.viewingId && !isUncReview) {
        await db.viewing.update({
          where: { id: dep.viewingId },
          data: {
            status: ViewingStatus.COMPLETED,
            closedReason: 'hold_expired',
          },
        });
      }

      await db.auditLog.create({
        data: {
          actorId: dep.viewing?.tenantId || (await this.systemActorId(db)),
          actorRole: 'system',
          actionType: isUncReview ? 'DEPOSIT_UNC_EXPIRED' : 'HOLD_EXPIRED',
          entityName: 'HoldingDeposit',
          entityId: dep.id,
          newValue: {
            expiredAt: now.toISOString(),
            previousExpiresAt: dep.expiresAt?.toISOString(),
          },
        },
      });
    }

    const activeDeposits = await db.holdingDeposit.findMany({
      where: {
        unitId,
        paymentStatus: { in: [DepositStatus.PAID_HOLDING, DepositStatus.UNC_PENDING_REVIEW] },
        expiresAt: { gt: now },
      },
      select: { id: true },
      take: 1,
    });
    if (!activeDeposits.length) {
      await db.unit.updateMany({
        where: { id: unitId, status: UnitStatus.HOLDING },
        data: { status: UnitStatus.AVAILABLE },
      });
    }
  }

  async uploadHostReceipt(depositId: string, dto: UploadHostReceiptDto, profileId: string) {
    const host = await this.prisma.fieldHost.findUnique({
      where: { profileId },
      select: { id: true, roles: true },
    });
    if (!host || !host.roles.includes(HostRole.SALE)) {
      throw new ForbiddenException('Chỉ Field Host phụ trách bán hàng mới được tải UNC.');
    }

    const tempHoldUntil = new Date(Date.now() + 30 * 60 * 1000);
    let result: { id: string; status: DepositStatus; tempHoldUntil: Date };
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const deposit = await tx.holdingDeposit.findUnique({
        where: { id: depositId },
        include: { unit: true, viewing: { include: { tickets: true } } },
      });
      if (!deposit) throw new NotFoundException('Không tìm thấy khoản cọc.');
      if (deposit.paymentStatus !== DepositStatus.PENDING_PAYMENT) {
        throw new ConflictException('Chỉ nhận UNC cho khoản cọc đang chờ thanh toán.');
      }

      const assigned = deposit.attributedHostId === host.id || deposit.viewing.tickets.some(
        (ticket: any) =>
          ticket.hostId === host.id &&
          [TicketStatus.ACCEPTED, TicketStatus.CHECKED, TicketStatus.COMPLETED].includes(ticket.status),
      );
      if (!assigned) throw new ForbiddenException('Khoản cọc này không thuộc lịch được phân công cho bạn.');

      await this.expireIfDue(deposit.unitId, tx);
      const unit = await tx.unit.findUnique({ where: { id: deposit.unitId } });
      if (!unit || unit.status !== UnitStatus.AVAILABLE) {
        throw new ConflictException('Căn hộ đã được giữ chỗ hoặc không còn trống.');
      }
      const claimed = await tx.unit.updateMany({
        where: { id: deposit.unitId, status: UnitStatus.AVAILABLE },
        data: { status: UnitStatus.HOLDING },
      });
      if (claimed.count !== 1) throw new ConflictException('Căn hộ vừa được giữ chỗ bởi giao dịch khác.');

      await tx.holdingDeposit.update({
        where: { id: depositId },
        data: { paymentStatus: DepositStatus.UNC_PENDING_REVIEW, expiresAt: tempHoldUntil },
      });
      await tx.auditLog.create({
        data: {
          actorId: profileId,
          actorRole: 'field_host',
          actionType: 'DEPOSIT_UNC_UPLOADED',
          entityName: 'holding_deposits',
          entityId: depositId,
          oldValue: { paymentStatus: DepositStatus.PENDING_PAYMENT },
          newValue: {
            paymentStatus: DepositStatus.UNC_PENDING_REVIEW,
            receiptUrl: dto.receiptUrl,
            note: dto.note?.trim() || null,
            tempHoldUntil: tempHoldUntil.toISOString(),
          },
        },
      });
      return { id: depositId, status: DepositStatus.UNC_PENDING_REVIEW, tempHoldUntil };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw new ConflictException('Căn hộ hoặc khoản cọc vừa được giao dịch khác xử lý. Vui lòng tải lại.');
      }
      throw error;
    }

    this.logger.log(`[HOST RECEIPT] Stored UNC review request for deposit ${depositId}.`);
    return {
      success: true,
      depositId: result.id,
      status: result.status,
      tempHoldUntil: result.tempHoldUntil.toISOString(),
      message: 'Đã lưu UNC để Admin đối soát; căn được giữ tạm trong 30 phút.',
    };
  }
}
