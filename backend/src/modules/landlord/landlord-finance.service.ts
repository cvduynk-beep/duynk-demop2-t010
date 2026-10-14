import { Injectable } from '@nestjs/common';
import { ContractStatus, DepositStatus, MandateStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LandlordFeeService } from './landlord-fee.service';
import { LANDLORD_FORFEIT_SHARE, isConsigned, lastMonths, toUiUnitStatus } from './landlord.mappers';

const HISTORY_MONTHS = 6;

/**
 * Khoản thu của chủ nhà, tính từ HỢP ĐỒNG THUÊ (hệ thống chưa có sổ thu tiền thực tế theo tháng):
 * một tháng được tính là có thu khi hợp đồng còn hiệu lực trong tháng đó.
 * Tỷ lệ phí dịch vụ lấy từ FeeConfig `landlord_service_fee_rate` (Admin cấu hình, legal/01 Điều 6 để mở);
 * chưa cấu hình thì dùng mặc định và báo `feeSource: 'default'` để UI nói rõ đây là mức tạm.
 * Khoản cọc khách bỏ (`FORFEITED`, cọc v2 = toàn bộ cọc bảo đảm) ⇒ chủ nhà nhận `LANDLORD_FORFEIT_SHARE` (50%), ghi vào tháng của `expiresAt`
 * (thời điểm khách mất cọc — chưa có sổ chi trả thực tế), cộng thẳng vào thực nhận, không trừ phí dịch vụ.
 */
@Injectable()
export class LandlordFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: LandlordFeeService,
  ) {}

  async getFinance(landlordId: string, now = new Date()) {
    const months = lastMonths(HISTORY_MONTHS, now);
    const [fee, units, contracts, deposits, forfeits] = await Promise.all([
      this.fees.get(),
      this.prisma.unit.findMany({
        where: { landlordId },
        include: { building: true, mandates: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.contract.findMany({
        where: { landlordId, status: { in: [ContractStatus.ACTIVE, ContractStatus.TERMINATED_SETTLED] } },
      }),
      this.prisma.holdingDeposit.findMany({
        // Chỉ cọc còn hạn mới là "đang giữ hộ"; quá hạn là khách đã mất cọc (lượt quét sẽ chuyển FORFEITED).
        where: { unit: { landlordId }, paymentStatus: DepositStatus.PAID_HOLDING, expiresAt: { gt: now } },
        select: { unitId: true, amount: true },
      }),
      this.prisma.holdingDeposit.findMany({
        where: { unit: { landlordId }, paymentStatus: DepositStatus.FORFEITED, expiresAt: { gte: months[0].start } },
        select: { id: true, unitId: true, amount: true, paidAt: true, expiresAt: true, unit: { select: { unitCode: true } } },
        orderBy: { expiresAt: 'desc' },
      }),
    ]);

    const feeOf = fee.of;

    const history = months.map((m) => {
      const gross = contracts
        .filter((c) => c.startDate <= m.end && c.endDate >= m.start)
        .reduce((sum, c) => sum + Number(c.monthlyRentPrice), 0);
      const forfeit = Math.round(
        forfeits
          .filter((d) => d.expiresAt && d.expiresAt >= m.start && d.expiresAt <= m.end)
          .reduce((sum, d) => sum + Number(d.amount), 0) * LANDLORD_FORFEIT_SHARE,
      );
      return { month: m.key, label: m.label, gross, fee: feeOf(gross), forfeit, net: gross - feeOf(gross) + forfeit };
    });
    const current = history[history.length - 1];

    const activeByUnit = new Map(
      contracts.filter((c) => c.status === ContractStatus.ACTIVE).map((c) => [c.unitId, c]),
    );
    const holdByUnit = new Map(deposits.map((d) => [d.unitId, Number(d.amount)]));

    const perUnit = units
      .filter(isConsigned)
      .map((u) => {
        const lease = activeByUnit.get(u.id);
        const rent = lease ? Number(lease.monthlyRentPrice) : 0;
        return {
          unitId: u.id,
          unitCode: u.unitCode,
          building: u.building.buildingCode,
          status: toUiUnitStatus(u.status, false),
          rent,
          fee: feeOf(rent),
          net: rent - feeOf(rent),
          // Cọc đang giữ hộ: cọc bảo đảm của HĐ đang chạy, hoặc khoản cọc đã chuyển (amount) nếu chưa ký HĐ.
          escrow: lease ? Number(lease.securityDepositAmount) : (holdByUnit.get(u.id) ?? 0),
        };
      });

    return {
      serviceFeePercent: fee.percent,
      feeSource: fee.source,
      thisMonth: { gross: current.gross, fee: current.fee, forfeit: current.forfeit, net: current.net },
      totalNet6Months: history.reduce((sum, m) => sum + m.net, 0),
      escrowTotal: perUnit.reduce((sum, r) => sum + r.escrow, 0),
      history,
      perUnit,
      // Từng khoản bồi thường để chủ nhà biết đến từ căn nào, khi nào (6 tháng gần nhất, mới nhất trước).
      forfeits: forfeits.map((d) => ({
        depositId: d.id,
        unitId: d.unitId,
        unitCode: d.unit.unitCode,
        depositAmount: Number(d.amount),
        share: Math.round(Number(d.amount) * LANDLORD_FORFEIT_SHARE),
        paidAt: d.paidAt,
        expiredAt: d.expiresAt,
      })),
    };
  }
}
