import { Prisma } from '@prisma/client';
import { int, money, numOrNull, type ReportDefinition, type ReportQuery } from './report-types';

export interface HostPerformanceRow {
  hostId: string;
  name: string | null;
  zone: string;
  isSale: boolean;
  isActive: boolean;
  tours: number;
  deals: number;
  /** Chuỗi decimal VND. */
  grv: string;
  /** %, 1 chữ số; null khi chưa có lượt dẫn. */
  winRate: number | null;
  ticketsOffered: number;
  ticketsAccepted: number;
  acceptMedianSec: number | null;
  acceptAvgSec: number | null;
  slaBreaches: number;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface HostPerformanceSummary {
  hosts: number;
  tours: number;
  deals: number;
  grv: string;
  winRate: number | null;
  ticketsOffered: number;
  ticketsAccepted: number;
  acceptMedianSec: number | null;
  acceptAvgSec: number | null;
  slaBreaches: number;
  ratingAvg: number | null;
  ratingCount: number;
}

/** Trạng thái cọc tính là "căn chốt": đã báo có; loại REFUNDED (thua First-to-Pay). */
export const CLOSED_DEPOSIT_STATUSES = ['PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED'] as const;

/**
 * CTE dùng chung cho dòng và tổng: mỗi chỉ số một CTE gom theo host_id, đều lọc theo khoảng [start, end) ICT.
 * Không có biến nào nối chuỗi — mọi giá trị đi qua tham số; trạng thái là hằng số cố định trong SQL.
 */
function ctes(q: ReportQuery): Prisma.Sql {
  const { start, end } = q.range;
  return Prisma.sql`
    hosts AS (
      SELECT h.id, p.full_name, h.assigned_zone, p.is_active, ('SALE'::"HostRole" = ANY (h.roles)) AS is_sale
      FROM field_hosts h
      JOIN profiles p ON p.id = h.profile_id
      WHERE (${q.zone}::text IS NULL OR position(${q.zone}::text in h.assigned_zone) > 0)
        AND (${q.hostId}::uuid IS NULL OR h.id = ${q.hostId}::uuid)
    ),
    owned AS (
      SELECT DISTINCT t.host_id, v.id AS viewing_id, v.viewing_started_at, v.tenant_rating
      FROM dispatch_tickets t
      JOIN viewings v ON v.id = t.viewing_id
      WHERE t.host_id IN (SELECT id FROM hosts)
        AND t.accepted_at IS NOT NULL
        AND t.status IN ('ACCEPTED', 'CHECKED', 'COMPLETED')
        AND v.viewing_slot >= ${start}::timestamptz AND v.viewing_slot < ${end}::timestamptz
    ),
    tour_agg AS (
      SELECT host_id,
             count(*) FILTER (WHERE viewing_started_at IS NOT NULL)::int AS tours,
             count(tenant_rating)::int AS rating_count,
             avg(tenant_rating) AS rating_avg
      FROM owned GROUP BY host_id
    ),
    deal_rows AS (
      SELECT d.attributed_host_id AS host_id, COALESCE(c.monthly_rent_price, u.base_rent_price) AS rent
      FROM holding_deposits d
      JOIN units u ON u.id = d.unit_id
      LEFT JOIN contracts c ON c.holding_deposit_id = d.id
      WHERE d.attributed_host_id IN (SELECT id FROM hosts)
        AND d.paid_at >= ${start}::timestamptz AND d.paid_at < ${end}::timestamptz
        AND d.payment_status IN ('PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED')
    ),
    deal_agg AS (
      SELECT host_id, count(*)::int AS deals, sum(rent) AS grv FROM deal_rows GROUP BY host_id
    ),
    ticket_rows AS (
      SELECT host_id, status, sla_seconds,
             CASE WHEN accepted_at IS NOT NULL THEN extract(epoch FROM accepted_at - offered_at) END AS accept_sec
      FROM dispatch_tickets
      WHERE host_id IN (SELECT id FROM hosts)
        AND offered_at >= ${start}::timestamptz AND offered_at < ${end}::timestamptz
    ),
    ticket_agg AS (
      SELECT host_id,
             count(*)::int AS offered,
             count(accept_sec)::int AS accepted,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY accept_sec) AS accept_median,
             avg(accept_sec) AS accept_avg,
             count(*) FILTER (WHERE accept_sec > sla_seconds OR status = 'EXPIRED')::int AS breaches
      FROM ticket_rows GROUP BY host_id
    ),
    per_host AS (
      SELECT h.id, h.full_name, h.assigned_zone, h.is_sale, h.is_active,
             COALESCE(ta.tours, 0) AS tours, COALESCE(da.deals, 0) AS deals, COALESCE(da.grv, 0) AS grv,
             CASE WHEN COALESCE(ta.tours, 0) > 0 THEN round(100.0 * COALESCE(da.deals, 0) / ta.tours, 1) END AS win_rate,
             COALESCE(tk.offered, 0) AS offered, COALESCE(tk.accepted, 0) AS accepted,
             tk.accept_median, tk.accept_avg, COALESCE(tk.breaches, 0) AS breaches,
             ta.rating_avg, COALESCE(ta.rating_count, 0) AS rating_count
      FROM hosts h
      LEFT JOIN tour_agg ta ON ta.host_id = h.id
      LEFT JOIN deal_agg da ON da.host_id = h.id
      LEFT JOIN ticket_agg tk ON tk.host_id = h.id
      -- Host vai Sale, hoặc Host khác nhưng có phát sinh trong khoảng (vd. vừa đổi vai) — không làm rơi số.
      WHERE h.is_sale OR ta.host_id IS NOT NULL OR da.host_id IS NOT NULL OR tk.host_id IS NOT NULL
    )`;
}

export const hostPerformanceReport: ReportDefinition<HostPerformanceRow, HostPerformanceSummary> = {
  id: 'host-performance',
  name: 'Hiệu suất Field Host (Sale)',
  description: 'Lượt dẫn, căn chốt, doanh số tiền thuê, tốc độ nhận ticket, vi phạm SLA và đánh giá của khách theo từng Host.',
  filters: ['from', 'to', 'zone', 'hostId'],
  sorts: {
    deals: 'deals',
    grv: 'grv',
    tours: 'tours',
    winRate: 'win_rate',
    acceptMedianSec: 'accept_median',
    slaBreaches: 'breaches',
    ratingAvg: 'rating_avg',
    name: 'full_name',
  },
  defaultSort: 'deals',
  defaultDir: 'desc',
  definitions: {
    tours: 'Lượt dẫn = số lịch xem có giờ hẹn trong khoảng, Host đã nhận ticket (ACCEPTED/CHECKED/COMPLETED) và đã bắt đầu dẫn (viewing_started_at có giá trị).',
    deals: 'Căn chốt = số cọc giữ chỗ gán cho Host (attributed_host_id) đã báo có trong khoảng (paid_at), trạng thái PAID_HOLDING / CONVERTED_TO_CONTRACT / FORFEITED; không tính REFUNDED.',
    grv: 'Doanh số (GRV) = tổng tiền thuê tháng của các căn chốt: đã ký HĐ ⇒ contracts.monthly_rent_price; chưa ký ⇒ giá niêm yết HIỆN TẠI units.base_rent_price (DB không lưu giá lúc chốt).',
    winRate: 'Tỷ lệ chốt = căn chốt / lượt dẫn × 100 (%, 1 chữ số). Lưu ý: căn chốt lọc theo paid_at, lượt dẫn lọc theo giờ hẹn.',
    acceptMedianSec: 'Tốc độ nhận ticket = trung vị (và trung bình) của accepted_at − offered_at (giây) với ticket Host đã nhận, lọc theo offered_at.',
    slaBreaches: 'Vi phạm SLA = ticket giao cho Host trong khoảng (offered_at) nhận muộn hơn sla_seconds, cộng ticket EXPIRED đang giao cho Host đó.',
    ratingAvg: 'Đánh giá = trung bình viewings.tenant_rating (1–5) của lịch xem Host đã nhận, lọc theo giờ hẹn; mỗi lịch xem tính một lần.',
    summary: 'Tổng: cộng các cột đếm và tiền; tỷ lệ chốt, trung vị/trung bình tốc độ nhận và đánh giá tính lại trên toàn bộ dữ liệu gốc (không lấy trung bình của các dòng).',
  },
  columns: [
    { key: 'name', label: 'Field Host' },
    { key: 'zone', label: 'Phân khu' },
    { key: 'tours', label: 'Lượt dẫn' },
    { key: 'deals', label: 'Căn chốt' },
    { key: 'grv', label: 'Doanh số tiền thuê (VND)' },
    { key: 'winRate', label: 'Tỷ lệ chốt (%)' },
    { key: 'ticketsOffered', label: 'Ticket được giao' },
    { key: 'ticketsAccepted', label: 'Ticket đã nhận' },
    { key: 'acceptMedianSec', label: 'Trung vị nhận ticket (giây)' },
    { key: 'acceptAvgSec', label: 'Trung bình nhận ticket (giây)' },
    { key: 'slaBreaches', label: 'Vi phạm SLA' },
    { key: 'ratingAvg', label: 'Đánh giá TB (sao)' },
    { key: 'ratingCount', label: 'Lượt đánh giá' },
  ],

  async run(tx, q, opts) {
    const order = Prisma.raw(`${this.sorts[q.sort]} ${q.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, full_name ASC, id ASC`);
    const limit = opts.limit ?? q.pageSize;
    const offset = opts.limit ? 0 : (q.page - 1) * q.pageSize;
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH ${ctes(q)}
      SELECT per_host.*, grv::text AS grv_text,
             round(accept_median::numeric, 1)::float8 AS accept_median_r,
             round(accept_avg::numeric, 1)::float8 AS accept_avg_r,
             round(rating_avg::numeric, 2)::float8 AS rating_avg_r,
             win_rate::float8 AS win_rate_r,
             count(*) OVER ()::int AS total
      FROM per_host
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`);
    const [s] = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH ${ctes(q)},
      scoped_tickets AS (SELECT t.* FROM ticket_rows t WHERE t.host_id IN (SELECT id FROM per_host)),
      scoped_owned AS (SELECT o.* FROM owned o WHERE o.host_id IN (SELECT id FROM per_host))
      SELECT
        (SELECT count(*)::int FROM per_host) AS hosts,
        (SELECT COALESCE(sum(tours), 0)::int FROM per_host) AS tours,
        (SELECT COALESCE(sum(deals), 0)::int FROM per_host) AS deals,
        (SELECT COALESCE(sum(grv), 0)::text FROM per_host) AS grv,
        (SELECT COALESCE(sum(offered), 0)::int FROM per_host) AS offered,
        (SELECT COALESCE(sum(accepted), 0)::int FROM per_host) AS accepted,
        (SELECT COALESCE(sum(breaches), 0)::int FROM per_host) AS breaches,
        (SELECT CASE WHEN sum(tours) > 0 THEN round(100.0 * sum(deals) / sum(tours), 1)::float8 END FROM per_host) AS win_rate,
        (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY accept_sec))::numeric, 1)::float8 FROM scoped_tickets) AS accept_median,
        (SELECT round(avg(accept_sec)::numeric, 1)::float8 FROM scoped_tickets) AS accept_avg,
        (SELECT round(avg(tenant_rating)::numeric, 2)::float8 FROM scoped_owned) AS rating_avg,
        (SELECT count(tenant_rating)::int FROM scoped_owned) AS rating_count`);
    return {
      total: rows[0] ? int(rows[0].total) : int(s.hosts),
      rows: rows.map((r) => ({
        hostId: r.id,
        name: r.full_name,
        zone: r.assigned_zone,
        isSale: r.is_sale,
        isActive: r.is_active,
        tours: int(r.tours),
        deals: int(r.deals),
        grv: money(r.grv_text),
        winRate: numOrNull(r.win_rate_r),
        ticketsOffered: int(r.offered),
        ticketsAccepted: int(r.accepted),
        acceptMedianSec: numOrNull(r.accept_median_r),
        acceptAvgSec: numOrNull(r.accept_avg_r),
        slaBreaches: int(r.breaches),
        ratingAvg: numOrNull(r.rating_avg_r),
        ratingCount: int(r.rating_count),
      })),
      summary: {
        hosts: int(s.hosts),
        tours: int(s.tours),
        deals: int(s.deals),
        grv: money(s.grv),
        winRate: numOrNull(s.win_rate), // numeric ở DB như cột từng dòng, không chia float ở app
        ticketsOffered: int(s.offered),
        ticketsAccepted: int(s.accepted),
        acceptMedianSec: numOrNull(s.accept_median),
        acceptAvgSec: numOrNull(s.accept_avg),
        slaBreaches: int(s.breaches),
        ratingAvg: numOrNull(s.rating_avg),
        ratingCount: int(s.rating_count),
      },
    };
  },
};
