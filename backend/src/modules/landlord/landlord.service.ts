import { Injectable } from '@nestjs/common';
import { ContractStatus, DepositStatus, ViewingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVITY_DAYS = 30;
const ACTIVITY_LIMIT = 12;

export type ActivityKind = 'viewing_booked' | 'viewing_done' | 'no_show' | 'deposit_paid' | 'deposit_forfeited' | 'lease_signed';

export interface LandlordActivity {
  id: string;
  at: Date;
  kind: ActivityKind;
  unitId: string;
  unitCode: string;
  tone: 'info' | 'success' | 'warning';
  title: string;
  body: string;
}

const time = (d: Date) => d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Tổng quan chủ nhà: dòng hoạt động gần đây trên các căn của chính chủ nhà (30 ngày, mới nhất trước), dựng từ dữ liệu
 * thật — ca xem phòng, cọc giữ chỗ, hợp đồng thuê. Không lộ thông tin khách (không tên, không SĐT).
 * Số liệu KPI/biểu đồ của màn Tổng quan lấy từ `/landlord/units` và `/landlord/finance` để không tính lệch hai nơi.
 */
@Injectable()
export class LandlordService {
  constructor(private readonly prisma: PrismaService) {}

  async getLandlordDashboard(landlordId: string, now = new Date()) {
    const since = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000);
    const unitWhere = { unit: { landlordId } };
    const unitSel = { unit: { select: { id: true, unitCode: true } } };
    const [viewings, deposits, contracts] = await Promise.all([
      this.prisma.viewing.findMany({
        where: { ...unitWhere, OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }] },
        select: { id: true, status: true, viewingSlot: true, createdAt: true, completedAt: true, ...unitSel },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      this.prisma.holdingDeposit.findMany({
        where: {
          ...unitWhere,
          OR: [
            { paymentStatus: { in: [DepositStatus.PAID_HOLDING, DepositStatus.CONVERTED_TO_CONTRACT] }, paidAt: { gte: since } },
            { paymentStatus: DepositStatus.FORFEITED, expiresAt: { gte: since } },
          ],
        },
        select: { id: true, amount: true, paymentStatus: true, paidAt: true, expiresAt: true, ...unitSel },
        take: 40,
      }),
      this.prisma.contract.findMany({
        where: { landlordId, status: ContractStatus.ACTIVE, signedAt: { gte: since } },
        select: { id: true, signedAt: true, monthlyRentPrice: true, startDate: true, ...unitSel },
        take: 20,
      }),
    ]);

    const items: LandlordActivity[] = [];
    for (const v of viewings) {
      const base = { unitId: v.unit.id, unitCode: v.unit.unitCode };
      if (v.status === ViewingStatus.NO_SHOW) {
        items.push({ ...base, id: `v-${v.id}-ns`, at: v.completedAt ?? v.viewingSlot, kind: 'no_show', tone: 'warning', title: 'Khách không đến xem', body: `Ca xem lúc ${time(v.viewingSlot)} — Host đã đóng ca, căn vẫn mở khách.` });
      } else if (v.completedAt && v.completedAt >= since && v.status !== ViewingStatus.CANCELLED) {
        items.push({ ...base, id: `v-${v.id}-done`, at: v.completedAt, kind: 'viewing_done', tone: 'info', title: 'Field Host đã dẫn khách xem', body: `Ca xem lúc ${time(v.viewingSlot)} đã kết thúc.` });
      }
      if (v.createdAt >= since && v.status !== ViewingStatus.CANCELLED) {
        items.push({ ...base, id: `v-${v.id}-new`, at: v.createdAt, kind: 'viewing_booked', tone: 'info', title: 'Có lịch xem phòng mới', body: `Khách đặt xem lúc ${time(v.viewingSlot)}. Host đón khách tại sảnh, bạn không cần có mặt.` });
      }
    }
    for (const d of deposits) {
      const base = { unitId: d.unit.id, unitCode: d.unit.unitCode };
      if (d.paymentStatus === DepositStatus.FORFEITED && d.expiresAt) {
        const share = Math.round(Number(d.amount) / 2);
        items.push({ ...base, id: `d-${d.id}-ff`, at: d.expiresAt, kind: 'deposit_forfeited', tone: 'warning', title: 'Khách bỏ cọc, căn mở lại', body: `Quá hạn giữ chỗ không ký hợp đồng. Bạn nhận bồi thường ${share.toLocaleString('vi-VN')}đ (50% cọc).` });
      } else if (d.paidAt) {
        items.push({ ...base, id: `d-${d.id}-paid`, at: d.paidAt, kind: 'deposit_paid', tone: 'success', title: 'Khách đã cọc giữ chỗ', body: `${Number(d.amount).toLocaleString('vi-VN')}đ qua VietQR — căn khoá giữ chỗ cho khách.` });
      }
    }
    for (const c of contracts) {
      if (!c.signedAt) continue;
      items.push({
        id: `c-${c.id}`,
        at: c.signedAt,
        kind: 'lease_signed',
        unitId: c.unit.id,
        unitCode: c.unit.unitCode,
        tone: 'success',
        title: 'Đã ký hợp đồng thuê',
        body: `Tiền thuê ${Number(c.monthlyRentPrice).toLocaleString('vi-VN')}đ/tháng, bắt đầu ${c.startDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      });
    }
    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return { activity: items.slice(0, ACTIVITY_LIMIT) };
  }
}
