import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContractStatus, DepositStatus, UnitStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneService } from '../auth/phone/phone.service';
import { holdingDepositAmount } from '../deposit/deposit-amount';
import { DepositService } from '../deposit/deposit.service';
import { BookingAccessService } from '../tenant/booking-access.service';
import { statusToWeb, toTenantBooking, toTenantContract } from '../tenant/tenant.mappers';
import { TenantBooking, TenantContract } from '../tenant/tenant.types';
import { SignLeaseDto } from './dto/contract.dto';
import { LeasePdfService } from './lease-pdf.service';

/** Cách ký ghi vào `signatures.method`: chữ ký tay trên canvas + OTP mô phỏng (chưa có nhà cung cấp OTP ký số thật). */
export const LEASE_SIGN_METHOD = 'CANVAS_SIMULATED_OTP';
const MAX_LEASE_MONTHS = 36;
const MAX_START_DAYS = 30;
const PAYMENT_CYCLES = [1, 3, 6];

/**
 * Ký Hợp đồng thuê chính thức (`POST /contracts/lease/sign`).
 *
 * THẬT: chỉ chủ lịch; lịch đang giữ chỗ còn hạn; đã có eKYC; kiểm điều khoản thuê; trong một transaction tạo
 * `contracts` (ACTIVE), chuyển 100% cọc giữ chỗ 2.000.000đ thành một phần Tiền cọc bảo đảm (KHÔNG trừ tiền thuê tháng
 * đầu — `holding_deposits.payment_status = CONVERTED_TO_CONTRACT`, `escrow_transactions` HOLD_CONVERTED), căn → RENTED,
 * lịch → LEASED, audit LEASE_ESTABLISHED; sau đó sinh PDF thật (SHA-256 của file) và tạo `signed_documents` + `signatures`.
 *
 * MÔ PHỎNG (giữ có chủ đích): bước OTP ký số (`otp_verified_at` = lúc ký, method `CANVAS_SIMULATED_OTP`) và dấu thời
 * gian TSA (`tsa_token` = `SIMULATED-TSA-…`) — chưa tích hợp nhà cung cấp ký số / TSA RFC 3161 thật.
 */
@Injectable()
export class LeaseSigningService {
  private readonly logger = new Logger(LeaseSigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
    private readonly bookingAccess: BookingAccessService,
    private readonly deposits: DepositService,
    private readonly leasePdf: LeasePdfService,
  ) {}

  async sign(
    user: { id: string },
    dto: SignLeaseDto,
    ctx: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ booking: TenantBooking; contract: TenantContract }> {
    const viewing = await this.bookingAccess.loadOwned(dto.bookingRef, user);
    if (viewing.status !== ViewingStatus.HOLDING) {
      throw new ConflictException({
        message: 'Lịch hẹn không ở trạng thái giữ chỗ.',
        code: 'bad_status',
        expected: 'holding',
        actual: statusToWeb(viewing.status),
      });
    }

    await this.deposits.expireIfDue(viewing.unitId);
    const deposit = await this.prisma.holdingDeposit.findUnique({
      where: { viewingId: viewing.id },
      include: { identity: true, contract: true },
    });
    const now = new Date();
    if (!deposit || deposit.paymentStatus !== DepositStatus.PAID_HOLDING || (deposit.expiresAt && deposit.expiresAt <= now)) {
      throw new ConflictException({ message: 'Thời hạn giữ chỗ đã kết thúc.', code: 'hold_expired' });
    }
    if (deposit.contract) {
      throw new ConflictException({ message: 'Lịch hẹn này đã có hợp đồng thuê.', code: 'lease_already_signed' });
    }
    if (!deposit.identity?.verifiedDataRef) {
      throw new ConflictException({ message: 'Cần xác minh CCCD (eKYC) trước khi ký hợp đồng thuê.', code: 'no_kyc' });
    }

    const unit = viewing.unit;
    const minMonths = unit.minLeaseMonths ?? 6;
    if (!Number.isInteger(dto.months) || dto.months < minMonths || dto.months > MAX_LEASE_MONTHS) {
      throw new UnprocessableEntityException({
        message: `Thời hạn thuê phải từ ${minMonths} đến ${MAX_LEASE_MONTHS} tháng.`,
        code: 'lease_terms_invalid',
      });
    }
    if (!PAYMENT_CYCLES.includes(dto.paymentCycle)) {
      throw new UnprocessableEntityException({ message: 'Kỳ thanh toán chỉ chấp nhận 1, 3 hoặc 6 tháng/lần.', code: 'lease_terms_invalid' });
    }
    const startDate = new Date(`${dto.startDate}T00:00:00.000Z`);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const maxStart = new Date(today.getTime() + MAX_START_DAYS * 86_400_000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.startDate) || isNaN(startDate.getTime()) || startDate < today || startDate > maxStart) {
      throw new UnprocessableEntityException({
        message: `Ngày bắt đầu hợp đồng phải trong vòng ${MAX_START_DAYS} ngày kể từ hôm nay.`,
        code: 'lease_terms_invalid',
      });
    }
    if (!dto.signatureSvg?.trim()) {
      throw new UnprocessableEntityException({ message: 'Thiếu chữ ký tay của khách thuê.', code: 'signature_required' });
    }

    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + dto.months);
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const monthlyRent = Number(unit.baseRentPrice);
    const converted = holdingDepositAmount(unit);
    // Tiền cọc bảo đảm tài sản & nội thất: theo căn (Admin/Chủ nhà đặt) hoặc bằng 1 tháng thuê; luôn ≥ khoản cọc giữ chỗ.
    const securityDeposit = Math.max(unit.securityDeposit != null ? Number(unit.securityDeposit) : monthlyRent, converted);

    const contract = await this.prisma.$transaction(async (tx) => {
      const contractNumber = await this.nextContractNumber(tx, unit.unitCode, now.getFullYear());
      const created = await tx.contract.create({
        data: {
          contractNumber,
          unitId: unit.id,
          holdingDepositId: deposit.id,
          tenantId: viewing.tenantId,
          landlordId: unit.landlordId,
          leaseTermMonths: dto.months,
          startDate,
          endDate,
          monthlyRentPrice: monthlyRent,
          paymentCycleMonths: dto.paymentCycle,
          securityDepositAmount: securityDeposit,
          convertedHoldingAmount: converted,
          status: ContractStatus.ACTIVE,
          signedAt: now,
        },
      });
      // Chỉ một request được chuyển cọc PAID_HOLDING → CONVERTED (chống ký trùng song song).
      const claimed = await tx.holdingDeposit.updateMany({
        where: { id: deposit.id, paymentStatus: DepositStatus.PAID_HOLDING },
        data: { paymentStatus: DepositStatus.CONVERTED_TO_CONTRACT },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({ message: 'Lịch hẹn này đã có hợp đồng thuê.', code: 'lease_already_signed' });
      }
      await tx.escrowTransaction.create({
        data: {
          depositId: deposit.id,
          transType: 'HOLD_CONVERTED',
          amount: converted,
          bankRefNumber: `CONV-${deposit.depositCode}`,
          executedAt: now,
        },
      });
      await tx.unit.update({ where: { id: unit.id }, data: { status: UnitStatus.RENTED } });
      await tx.viewing.update({ where: { id: viewing.id }, data: { status: ViewingStatus.LEASED } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: 'tenant',
          actionType: 'LEASE_ESTABLISHED',
          entityName: 'Contract',
          entityId: created.id,
          newValue: { contractNumber, unitCode: unit.unitCode, leaseTermMonths: dto.months, securityDeposit },
          ipAddress: ctx.ipAddress?.slice(0, 45),
          userAgent: ctx.userAgent,
        },
      });
      return created;
    });

    await this.sealDocument(contract.id, viewing.tenantId, dto.signatureSvg, ctx, now);
    this.logger.log(`[LEASE] Đã ký hợp đồng ${contract.contractNumber} cho lịch ${viewing.bookingRefCode}`);

    const reloaded = await this.bookingAccess.loadOwned(dto.bookingRef, user);
    const full = await this.prisma.contract.findUnique({
      where: { id: contract.id },
      include: { unit: { include: { building: true, media: true } }, document: true, holdingDeposit: { include: { viewing: true } } },
    });
    let rawPhone: string | undefined;
    try {
      rawPhone = reloaded.contactPhoneEnc ? this.phones.decrypt(reloaded.contactPhoneEnc) : undefined;
    } catch {
      rawPhone = undefined;
    }
    return { booking: toTenantBooking(reloaded, { rawPhone }), contract: toTenantContract(full) };
  }

  /**
   * PDF + SHA-256 thật (LeasePdfService), rồi gắn dấu TSA mô phỏng và chữ ký của khách. PDF lỗi không huỷ hợp đồng đã ký:
   * `pdf.ready=false`, FE bấm thử lại qua `GET /me/contracts/:id/pdf` (LeasePdfService.ensure là idempotent).
   */
  private async sealDocument(contractId: string, tenantId: string, signatureSvg: string, ctx: { ipAddress?: string; userAgent?: string }, now: Date) {
    const pdf = await this.leasePdf.ensure(contractId).catch((err: Error) => {
      this.logger.error(`Sinh PDF hợp đồng ${contractId} lỗi: ${err.message}`);
      return { ready: false as const };
    });
    if (!pdf.ready) return;
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { documentId: true } });
    if (!contract?.documentId) return;
    await this.prisma.$transaction([
      this.prisma.signedDocument.update({
        where: { id: contract.documentId },
        data: { tsaToken: `SIMULATED-TSA-${now.getTime()}`, tsaTime: now },
      }),
      this.prisma.signature.create({
        data: {
          documentId: contract.documentId,
          signerId: tenantId,
          signerRole: 'tenant',
          method: LEASE_SIGN_METHOD,
          signatureSvg: signatureSvg.slice(0, 200_000),
          otpVerifiedAt: now,
          ipAddress: ctx.ipAddress?.slice(0, 45),
          userAgent: ctx.userAgent,
        },
      }),
    ]);
  }

  private async nextContractNumber(tx: any, unitCode: string, year: number): Promise<string> {
    let seq = (await tx.contract.count({ where: { contractNumber: { contains: `-${year}-` } } })) + 1;
    for (;;) {
      const candidate = `VSA-LEASE-${unitCode}-${year}-${String(seq).padStart(4, '0')}`;
      if (!(await tx.contract.findUnique({ where: { contractNumber: candidate }, select: { id: true } }))) return candidate;
      seq += 1;
    }
  }
}
