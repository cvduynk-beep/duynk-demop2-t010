import { Prisma } from '@prisma/client';
import { int, money, type ReportDefinition, type ReportQuery } from './report-types';

export interface HostEarningsRow {
  hostId: string;
  name: string | null;
  zone: string;
  entries: number;
  /** Các cột tiền: chuỗi decimal VND. */
  viewingFee: string;
  dealCommission: string;
  ratingBonus: string;
  campaignBonus: string;
  inspectionFee: string;
  other: string;
  total: string;
  paid: string;
  pending: string;
}

export type HostEarningsSummary = Omit<HostEarningsRow, 'hostId' | 'name' | 'zone'> & { hosts: number };

/**
 * Loại khoản suy từ `host_payouts.trans_ref` (đúng tiền tố AdminPayoutService ghi): `viewing:<id>` thù lao dẫn,
 * `deposit:<id>` hoa hồng cọc, `deposit:<id>:rating` thưởng đánh giá, `deposit:<id>:campaign` thưởng chiến dịch,
 * `inspection:<id>` thù lao thẩm định; còn lại ⇒ khác.
 */
function base(q: ReportQuery): Prisma.Sql {
  const { start, end } = q.range;
  return Prisma.sql`
    entries AS (
      SELECT hp.host_id, hp.amount, hp.status,
             CASE
               WHEN hp.trans_ref LIKE 'viewing:%' THEN 'viewing'
               WHEN hp.trans_ref LIKE 'deposit:%:rating' THEN 'rating'
               WHEN hp.trans_ref LIKE 'deposit:%:campaign' THEN 'campaign'
               WHEN hp.trans_ref LIKE 'deposit:%' AND hp.trans_ref NOT LIKE 'deposit:%:%' THEN 'deal'
               WHEN hp.trans_ref LIKE 'inspection:%' THEN 'inspection'
               ELSE 'other'
             END AS kind
      FROM host_payouts hp
      JOIN field_hosts h ON h.id = hp.host_id
      WHERE hp.created_at >= ${start}::timestamptz AND hp.created_at < ${end}::timestamptz
        AND (${q.zone}::text IS NULL OR position(${q.zone}::text in h.assigned_zone) > 0)
        AND (${q.hostId}::uuid IS NULL OR h.id = ${q.hostId}::uuid)
    ),
    per_host AS (
      SELECT e.host_id AS id, p.full_name, h.assigned_zone,
             count(*)::int AS entries,
             COALESCE(sum(e.amount) FILTER (WHERE kind = 'viewing'), 0) AS viewing_fee,
             COALESCE(sum(e.amount) FILTER (WHERE kind = 'deal'), 0) AS deal_commission,
             COALESCE(sum(e.amount) FILTER (WHERE kind = 'rating'), 0) AS rating_bonus,
             COALESCE(sum(e.amount) FILTER (WHERE kind = 'campaign'), 0) AS campaign_bonus,
             COALESCE(sum(e.amount) FILTER (WHERE kind = 'inspection'), 0) AS inspection_fee,
             COALESCE(sum(e.amount) FILTER (WHERE kind = 'other'), 0) AS other,
             sum(e.amount) AS total,
             COALESCE(sum(e.amount) FILTER (WHERE e.status = 'PAID'), 0) AS paid,
             COALESCE(sum(e.amount) FILTER (WHERE e.status <> 'PAID'), 0) AS pending
      FROM entries e
      JOIN field_hosts h ON h.id = e.host_id
      JOIN profiles p ON p.id = h.profile_id
      GROUP BY e.host_id, p.full_name, h.assigned_zone
    )`;
}

const MONEY_COLS = ['viewing_fee', 'deal_commission', 'rating_bonus', 'campaign_bonus', 'inspection_fee', 'other', 'total', 'paid', 'pending'] as const;
const toMoney = (r: any) => ({
  viewingFee: money(r.viewing_fee),
  dealCommission: money(r.deal_commission),
  ratingBonus: money(r.rating_bonus),
  campaignBonus: money(r.campaign_bonus),
  inspectionFee: money(r.inspection_fee),
  other: money(r.other),
  total: money(r.total),
  paid: money(r.paid),
  pending: money(r.pending),
});
const textCols = (prefix = '') => Prisma.raw(MONEY_COLS.map((c) => `${prefix}${c}::text AS ${c}`).join(', '));

export const hostEarningsReport: ReportDefinition<HostEarningsRow, HostEarningsSummary> = {
  id: 'host-earnings',
  name: 'Thu nhập Field Host',
  description: 'Các khoản biến phí đã ghi sổ cho Host (thù lao dẫn, hoa hồng cọc, thưởng, thù lao thẩm định), đã trả / chờ trả.',
  filters: ['from', 'to', 'zone', 'hostId'],
  sorts: { total: 'total', dealCommission: 'deal_commission', viewingFee: 'viewing_fee', pending: 'pending', name: 'full_name' },
  defaultSort: 'total',
  defaultDir: 'desc',
  definitions: {
    basis: 'Nguồn: sổ host_payouts (mỗi khoản một dòng, ghi bởi AdminPayoutService), lọc theo thời điểm ghi khoản (created_at, giờ VN).',
    viewingFee: 'Thù lao dẫn = khoản trans_ref viewing:<id>.',
    dealCommission: 'Hoa hồng cọc = khoản trans_ref deposit:<id>.',
    ratingBonus: 'Thưởng đánh giá = khoản trans_ref deposit:<id>:rating.',
    campaignBonus: 'Thưởng chiến dịch = khoản trans_ref deposit:<id>:campaign.',
    inspectionFee: 'Thù lao thẩm định = khoản trans_ref inspection:<id>.',
    total: 'Tổng = tổng mọi khoản; Đã trả = status PAID; Chờ trả = còn lại.',
  },
  columns: [
    { key: 'name', label: 'Field Host' },
    { key: 'zone', label: 'Phân khu' },
    { key: 'entries', label: 'Số khoản' },
    { key: 'viewingFee', label: 'Thù lao dẫn (VND)' },
    { key: 'dealCommission', label: 'Hoa hồng cọc (VND)' },
    { key: 'ratingBonus', label: 'Thưởng đánh giá (VND)' },
    { key: 'campaignBonus', label: 'Thưởng chiến dịch (VND)' },
    { key: 'inspectionFee', label: 'Thù lao thẩm định (VND)' },
    { key: 'other', label: 'Khoản khác (VND)' },
    { key: 'total', label: 'Tổng (VND)' },
    { key: 'paid', label: 'Đã trả (VND)' },
    { key: 'pending', label: 'Chờ trả (VND)' },
  ],

  async run(tx, q, opts) {
    const order = Prisma.raw(`${this.sorts[q.sort]} ${q.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, full_name ASC, id ASC`);
    const limit = opts.limit ?? q.pageSize;
    const offset = opts.limit ? 0 : (q.page - 1) * q.pageSize;
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH ${base(q)}
      SELECT id, full_name, assigned_zone, entries, ${textCols()}
      FROM per_host ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`);
    const [s] = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH ${base(q)}
      SELECT count(*)::int AS hosts, COALESCE(sum(entries), 0)::int AS entries,
             ${Prisma.raw(MONEY_COLS.map((c) => `COALESCE(sum(${c}), 0)::text AS ${c}`).join(', '))}
      FROM per_host`);
    return {
      total: int(s.hosts),
      rows: rows.map((r) => ({ hostId: r.id, name: r.full_name, zone: r.assigned_zone, entries: int(r.entries), ...toMoney(r) })),
      summary: { hosts: int(s.hosts), entries: int(s.entries), ...toMoney(s) },
    };
  },
};
