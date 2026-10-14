import { Prisma } from '@prisma/client';
import { int, money, numOrNull, type ReportDefinition, type ReportQuery } from './report-types';
import { maskName, maskPhone } from './report-mask';

export const DEAL_STATUSES = ['PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED', 'REFUNDED'] as const;

export interface DealRow {
  depositCode: string;
  /** Thời điểm tiền về (ISO). */
  receivedAt: string;
  status: string;
  unitCode: string;
  layout: string;
  unitZone: string;
  hostName: string | null;
  hostZone: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  /** Chuỗi decimal VND. */
  depositAmount: string;
  inbound: string;
  refund: string;
  monthlyRent: string;
  rentSource: 'contract' | 'listing';
  contractNumber: string | null;
  contractStatus: string | null;
  salesCycleDays: number | null;
}

export interface DealSummary {
  rows: number;
  byStatus: Record<string, number>;
  inbound: string;
  refund: string;
  /** Tiền cọc đang/đã giữ = vào − hoàn. */
  netHeld: string;
  closedDeals: number;
  grv: string;
}

/**
 * Tập dòng: cọc có tiền về trong khoảng. Thời điểm tiền về = paid_at; cọc thua First-to-Pay (REFUNDED) không có paid_at
 * ⇒ lấy lần INBOUND_DEPOSIT đầu tiên trong escrow để đối soát không sót khoản hoàn.
 */
function base(q: ReportQuery): Prisma.Sql {
  const { start, end } = q.range;
  return Prisma.sql`
    esc AS (
      SELECT deposit_id,
             sum(amount) FILTER (WHERE trans_type = 'INBOUND_DEPOSIT') AS inbound,
             sum(amount) FILTER (WHERE trans_type = 'REFUND') AS refund,
             min(executed_at) FILTER (WHERE trans_type = 'INBOUND_DEPOSIT') AS first_in
      FROM escrow_transactions GROUP BY deposit_id
    ),
    deal AS (
      SELECT d.id, d.deposit_code, d.payment_status::text AS status, d.amount AS deposit_amount,
             COALESCE(d.paid_at, e.first_in) AS received_at,
             COALESCE(e.inbound, 0) AS inbound, COALESCE(e.refund, 0) AS refund,
             u.unit_code, u.layout_type::text AS layout, b.zone_name AS unit_zone,
             hp.full_name AS host_name, h.assigned_zone AS host_zone,
             COALESCE(NULLIF(v.contact_name, ''), tp.full_name) AS tenant_name, v.contact_phone_enc,
             COALESCE(c.monthly_rent_price, u.base_rent_price) AS monthly_rent,
             CASE WHEN c.id IS NULL THEN 'listing' ELSE 'contract' END AS rent_source,
             c.contract_number, c.status::text AS contract_status,
             round((extract(epoch FROM COALESCE(d.paid_at, e.first_in) - v.created_at) / 86400.0)::numeric, 1) AS cycle_days
      FROM holding_deposits d
      JOIN viewings v ON v.id = d.viewing_id
      JOIN units u ON u.id = d.unit_id
      JOIN buildings b ON b.id = u.building_id
      LEFT JOIN esc e ON e.deposit_id = d.id
      LEFT JOIN field_hosts h ON h.id = d.attributed_host_id
      LEFT JOIN profiles hp ON hp.id = h.profile_id
      LEFT JOIN profiles tp ON tp.id = v.tenant_id
      LEFT JOIN contracts c ON c.holding_deposit_id = d.id
      WHERE d.payment_status IN ('PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED', 'REFUNDED')
        AND COALESCE(d.paid_at, e.first_in) >= ${start}::timestamptz
        AND COALESCE(d.paid_at, e.first_in) < ${end}::timestamptz
        AND (${q.zone}::text IS NULL OR position(${q.zone}::text in h.assigned_zone) > 0)
        AND (${q.hostId}::uuid IS NULL OR h.id = ${q.hostId}::uuid)
        AND (${q.status}::text IS NULL OR d.payment_status::text = ${q.status}::text)
    )`;
}

export const dealsReport: ReportDefinition<DealRow, DealSummary> = {
  id: 'deals',
  name: 'Giao dịch cọc & hợp đồng',
  description: 'Đối soát từng khoản cọc giữ chỗ có tiền về: trạng thái, tiền vào/hoàn, giá thuê, hợp đồng, chu kỳ chốt. Tên và SĐT khách đã che.',
  filters: ['from', 'to', 'zone', 'hostId', 'status'],
  statuses: DEAL_STATUSES,
  sorts: { receivedAt: 'received_at', monthlyRent: 'monthly_rent', salesCycleDays: 'cycle_days', depositCode: 'deposit_code' },
  defaultSort: 'receivedAt',
  defaultDir: 'desc',
  definitions: {
    receivedAt: 'Thời điểm tiền về = holding_deposits.paid_at; cọc REFUNDED (thua First-to-Pay, không có paid_at) lấy giao dịch INBOUND_DEPOSIT đầu tiên.',
    inbound: 'Tiền vào = tổng escrow_transactions INBOUND_DEPOSIT của khoản cọc.',
    refund: 'Tiền hoàn = tổng escrow_transactions REFUND của khoản cọc.',
    netHeld: 'Đang/đã giữ = tiền vào − tiền hoàn (cọc CONVERTED chuyển 100% thành tiền cọc bảo đảm, không phải doanh thu sàn).',
    closedDeals: 'Căn chốt = dòng có trạng thái PAID_HOLDING / CONVERTED_TO_CONTRACT / FORFEITED (cùng định nghĩa báo cáo Hiệu suất Host).',
    monthlyRent: 'Giá thuê: đã ký HĐ ⇒ contracts.monthly_rent_price; chưa ký ⇒ giá niêm yết HIỆN TẠI units.base_rent_price.',
    grv: 'Doanh số (GRV) = tổng giá thuê tháng của các căn chốt.',
    salesCycleDays: 'Chu kỳ chốt = thời điểm tiền về − lúc khách đặt lịch xem (viewings.created_at), theo ngày, 1 chữ số.',
    zone: 'Lọc phân khu/Host theo Host được gán cọc (attributed_host_id); cọc không gán Host bị loại khi có lọc này.',
    pii: 'Tên khách giữ họ + chữ cái đầu, SĐT chỉ còn 2 số đầu và 3 số cuối — cả trên màn hình và file xuất.',
  },
  columns: [
    { key: 'depositCode', label: 'Mã cọc' },
    { key: 'receivedAt', label: 'Thời điểm tiền về (giờ VN)', value: (r) => vnTime(r.receivedAt) },
    { key: 'status', label: 'Trạng thái' },
    { key: 'unitCode', label: 'Căn hộ' },
    { key: 'layout', label: 'Loại căn' },
    { key: 'unitZone', label: 'Phân khu căn' },
    { key: 'hostName', label: 'Field Host' },
    { key: 'tenantName', label: 'Khách (đã che)' },
    { key: 'tenantPhone', label: 'SĐT (đã che)' },
    { key: 'depositAmount', label: 'Tiền cọc (VND)' },
    { key: 'inbound', label: 'Tiền vào (VND)' },
    { key: 'refund', label: 'Tiền hoàn (VND)' },
    { key: 'monthlyRent', label: 'Giá thuê tháng (VND)' },
    { key: 'rentSource', label: 'Nguồn giá', value: (r) => (r.rentSource === 'contract' ? 'Hợp đồng' : 'Niêm yết hiện tại') },
    { key: 'contractNumber', label: 'Số hợp đồng' },
    { key: 'contractStatus', label: 'Trạng thái HĐ' },
    { key: 'salesCycleDays', label: 'Chu kỳ chốt (ngày)' },
  ],

  async run(tx, q, opts) {
    const order = Prisma.raw(`${this.sorts[q.sort]} ${q.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, deposit_code ASC`);
    const limit = opts.limit ?? q.pageSize;
    const offset = opts.limit ? 0 : (q.page - 1) * q.pageSize;
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH ${base(q)}
      SELECT deal.*, deposit_amount::text AS deposit_amount_t, inbound::text AS inbound_t, refund::text AS refund_t,
             monthly_rent::text AS monthly_rent_t, cycle_days::float8 AS cycle_days_f
      FROM deal ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`);
    const [s] = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH ${base(q)}
      SELECT count(*)::int AS rows,
             COALESCE(sum(inbound), 0)::text AS inbound,
             COALESCE(sum(refund), 0)::text AS refund,
             (COALESCE(sum(inbound), 0) - COALESCE(sum(refund), 0))::text AS net_held,
             count(*) FILTER (WHERE status IN ('PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED'))::int AS closed,
             COALESCE(sum(monthly_rent) FILTER (WHERE status IN ('PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED')), 0)::text AS grv,
             (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*)::int AS n FROM deal GROUP BY status) x) AS by_status
      FROM deal`);
    return {
      total: int(s.rows),
      rows: rows.map((r) => ({
        depositCode: r.deposit_code,
        receivedAt: new Date(r.received_at).toISOString(),
        status: r.status,
        unitCode: r.unit_code,
        layout: r.layout,
        unitZone: r.unit_zone,
        hostName: r.host_name,
        hostZone: r.host_zone,
        tenantName: maskName(r.tenant_name),
        tenantPhone: maskPhone(opts.decryptPhone(r.contact_phone_enc)),
        depositAmount: money(r.deposit_amount_t),
        inbound: money(r.inbound_t),
        refund: money(r.refund_t),
        monthlyRent: money(r.monthly_rent_t),
        rentSource: r.rent_source,
        contractNumber: r.contract_number,
        contractStatus: r.contract_status,
        salesCycleDays: numOrNull(r.cycle_days_f),
      })),
      summary: {
        rows: int(s.rows),
        byStatus: Object.fromEntries(DEAL_STATUSES.map((st) => [st, int(s.by_status?.[st])])),
        inbound: money(s.inbound),
        refund: money(s.refund),
        netHeld: money(s.net_held),
        closedDeals: int(s.closed),
        grv: money(s.grv),
      },
    };
  },
};

/** ISO ⇒ "dd/mm/yyyy hh:mm" giờ VN cho file CSV. */
export function vnTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
