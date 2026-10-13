import { Injectable } from '@nestjs/common';
import { ContractStatus, DepositStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DAY_MS, ictDay, ictStart, parseReportRange, publicRange, type ReportRange } from './admin-range';

// Ngưỡng cảnh báo heatmap: lấp đầy dưới 80% (đã chốt).
const OCCUPANCY_ALERT_THRESHOLD = 80;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) => (den === 0 ? null : round1((num / den) * 100));

/** Lịch xem đã tới bước "khách có mặt hay không" (mẫu số no-show, đã chốt): NO_SHOW + các trạng thái sau khi xem. */
const ATTENDED_OR_NO_SHOW = ['COMPLETED', 'NO_SHOW', 'LEASED', 'HOLDING', 'CLOSING'];
const PAID_DEPOSIT: DepositStatus[] = ['PAID_HOLDING', 'CONVERTED_TO_CONTRACT'];
const SIGNED_CONTRACT: ContractStatus[] = ['ACTIVE', 'TERMINATED_SETTLED'];
const UNIT_STATUSES = ['AVAILABLE', 'HOLDING', 'RENTED', 'UNLISTED', 'MAINTENANCE'] as const;

@Injectable()
export class AdminBiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Phễu & no-show tính theo NHÓM lịch xem tạo trong khoảng [from, to] (ngày ICT, đã chốt): mỗi bước đếm số lịch của
   * nhóm đó đã đi tới bước ấy. Lấp đầy / heatmap / rổ hàng / lịch xem hôm nay là ảnh chụp TẠI THỜI ĐIỂM gọi.
   */
  async getBiFunnelAndHeatmap(rangeArg?: ReportRange, now: Date = new Date()) {
    const range = rangeArg ?? parseReportRange(undefined, undefined, now);

    // Nhóm lịch xem: tạo trong khoảng, không tính lịch đã huỷ (giữ định nghĩa "đặt lịch" cũ).
    const cohort: Prisma.ViewingWhereInput = { createdAt: { gte: range.start, lt: range.end }, status: { not: 'CANCELLED' } };
    const today = ictDay(now);
    const todayStart = ictStart(today);
    const slotIn = (start: Date, end: Date): Prisma.ViewingWhereInput => ({
      viewingSlot: { gte: start, lt: end },
      status: { not: 'CANCELLED' },
    });

    const [booked, checkedIn, deposited, signed, byStatus, recent, viewingsToday, viewingsYesterday, unitGroups, buildings] =
      await Promise.all([
        this.prisma.viewing.count({ where: cohort }),
        this.prisma.viewing.count({ where: { ...cohort, lobbyCheckInAt: { not: null } } }),
        this.prisma.holdingDeposit.count({ where: { paymentStatus: { in: PAID_DEPOSIT }, viewing: cohort } }),
        this.prisma.contract.count({ where: { status: { in: SIGNED_CONTRACT }, holdingDeposit: { viewing: cohort } } }),
        this.prisma.viewing.groupBy({ by: ['status'], where: cohort, _count: true }),
        // Chỉ lấy createdAt của nhóm (khoảng tối đa 90 ngày) để chia theo NGÀY ICT — Prisma không group theo ngày được.
        this.prisma.viewing.findMany({ where: cohort, select: { createdAt: true } }),
        this.prisma.viewing.count({ where: slotIn(todayStart, new Date(todayStart.getTime() + DAY_MS)) }),
        this.prisma.viewing.count({ where: slotIn(new Date(todayStart.getTime() - DAY_MS), todayStart) }),
        this.prisma.unit.groupBy({ by: ['buildingId', 'status'], _count: true }),
        this.prisma.building.findMany({ select: { id: true, buildingCode: true, zoneName: true } }),
      ]);

    const statusCount = new Map<string, number>(
      byStatus.map((r) => [String(r.status), Number(r._count)]),
    );
    const noShow = statusCount.get('NO_SHOW') ?? 0;
    const noShowDenominator = ATTENDED_OR_NO_SHOW.reduce((s, k) => s + (statusCount.get(k) ?? 0), 0);

    const perDay = new Map<string, number>();
    for (const v of recent as Array<{ createdAt: Date }>) {
      const key = ictDay(new Date(v.createdAt));
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const dailyBookings = Array.from({ length: range.days }, (_, i) => {
      const date = ictDay(new Date(range.start.getTime() + i * DAY_MS));
      return { date, count: perDay.get(date) ?? 0 };
    });

    // Bước 1–2 (truy cập web, chat AI) chưa có nguồn dữ liệu trong DB ⇒ count null, available=false (đã chốt: hiện "chưa có nguồn").
    const raw: Array<{ key: string; stage: string; count: number | null }> = [
      { key: 'visit', stage: '1. Truy cập & All-in Calculator', count: null },
      { key: 'matchmaker', stage: '2. Quét AI Matchmaker 30s', count: null },
      { key: 'booked', stage: '3. Đặt lịch OTP xác thực SĐT', count: booked },
      { key: 'checkin', stage: '4. Check-in 1-chạm Sảnh đón', count: checkedIn },
      { key: 'deposit', stage: '5. Quét VietQR Cọc 2M', count: deposited },
      { key: 'signed', stage: '6. Ký Thỏa thuận & Hợp đồng số', count: signed },
    ];
    const stages = raw.map((s, i) => {
      const prev = i > 0 ? raw[i - 1].count : null;
      const dropRate =
        s.count === null || prev === null || prev === 0 ? null : round1(((prev - s.count) / prev) * 100);
      return { key: s.key, stage: s.stage, count: s.count, available: s.count !== null, dropRate };
    });

    const funnel = {
      stages,
      noShowRate: pct(noShow, noShowDenominator),
      noShowCount: noShow,
      noShowDenominator,
      avgDecisionTimeMinutes: null as number | null,
      avgDecisionTimeAvailable: false,
    };

    // Ảnh chụp rổ hàng: đếm ở DB theo (toà, trạng thái).
    const buildingById = new Map((buildings as any[]).map((b) => [b.id, b]));
    const byBuilding = new Map<string, { buildingCode: string; zone: string; total: number; rented: number }>();
    const portfolio: Record<string, number> = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0]));
    let totalUnits = 0;
    for (const g of unitGroups) {
      const n = Number(g._count);
      const b = buildingById.get(g.buildingId);
      totalUnits += n;
      portfolio[g.status] = (portfolio[g.status] ?? 0) + n;
      if (!b) continue;
      const row = byBuilding.get(b.buildingCode) ?? { buildingCode: b.buildingCode, zone: b.zoneName, total: 0, rented: 0 };
      row.total += n;
      if (g.status === 'RENTED') row.rented += n;
      byBuilding.set(b.buildingCode, row);
    }
    const occupancyHeatmap = [...byBuilding.values()]
      .sort((a, b) => a.buildingCode.localeCompare(b.buildingCode))
      .map((b) => {
        const occupancyRate = round1((b.rented / b.total) * 100);
        return { ...b, occupancyRate, alert: occupancyRate < OCCUPANCY_ALERT_THRESHOLD ? 'ATTENTION_NEEDED' : 'NORMAL' };
      });

    return {
      range: publicRange(range),
      funnel,
      dailyBookings,
      viewingsToday: { date: today, today: viewingsToday, yesterday: viewingsYesterday },
      occupancyHeatmap,
      portfolioStatus: {
        totalUnits,
        rentedUnits: portfolio.RENTED,
        holdingUnits: portfolio.HOLDING,
        availableUnits: portfolio.AVAILABLE,
        unlistedUnits: portfolio.UNLISTED,
        maintenanceUnits: portfolio.MAINTENANCE,
        /** Lấp đầy = RENTED / TẤT CẢ căn trong hệ thống (đã chốt); không có căn ⇒ null. */
        occupancyRate: pct(portfolio.RENTED, totalUnits),
      },
    };
  }
}
