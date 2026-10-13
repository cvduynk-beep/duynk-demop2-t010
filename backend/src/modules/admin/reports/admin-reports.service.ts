import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PhoneService } from '../../auth/phone/phone.service';
import { decryptPhoneForDisplay } from '../../auth/phone/phone-display';
import { parseReportRange, publicRange } from '../admin-range';
import type { AdminActor } from '../admin-fee.service';
import { dealsReport } from './deals.report';
import { hostEarningsReport } from './host-earnings.report';
import { hostPerformanceReport } from './host-performance.report';
import { csvFilename, toCsv } from './report-csv';
import type { ReportDefinition, ReportQuery, ReportRunOptions, SortDir } from './report-types';

/** Thêm báo cáo mới: viết một ReportDefinition rồi đăng ký ở đây. */
export const REPORTS: readonly ReportDefinition[] = [hostPerformanceReport, dealsReport, hostEarningsReport];

export const REPORT_DEFAULT_DAYS = 30;
export const REPORT_MAX_DAYS = 366;
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
/** Xuất file đồng bộ: quá ngưỡng ⇒ 422, yêu cầu thu hẹp bộ lọc (chưa có hạ tầng job/queue). */
export const EXPORT_MAX_ROWS = 10_000;
/** Mỗi lần chạy báo cáo bị cắt sau thời gian này ở Postgres (không làm nghẽn API chính). */
export const STATEMENT_TIMEOUT_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONE_MAX = 50;

type RawQuery = Record<string, unknown>;

const bad = (field: string, message: string) =>
  new BadRequestException({ code: 'invalid_report_query', message, errors: { [field]: message } });
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? String(v[0] ?? '').trim() : '');

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneService,
  ) {}

  async catalog() {
    return {
      zones: await this.zones(),
      timezone: 'Asia/Ho_Chi_Minh',
      defaultDays: REPORT_DEFAULT_DAYS,
      maxDays: REPORT_MAX_DAYS,
      pageSizeMax: PAGE_SIZE_MAX,
      exportFormats: ['csv'],
      exportMaxRows: EXPORT_MAX_ROWS,
      reports: REPORTS.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        filters: r.filters,
        statuses: r.statuses ?? [],
        sorts: Object.keys(r.sorts),
        defaultSort: r.defaultSort,
        defaultDir: r.defaultDir,
        columns: r.columns.map((c) => ({ key: c.key, label: c.label })),
      })),
    };
  }

  /** Danh sách phân khu hợp lệ cho bộ lọc (cùng nguồn `buildings.zone_name` như màn Field Host). */
  async zones(): Promise<string[]> {
    const rows = await this.prisma.building.findMany({ distinct: ['zoneName'], select: { zoneName: true }, orderBy: { zoneName: 'asc' } });
    return rows.map((r) => r.zoneName);
  }

  definition(id: string): ReportDefinition {
    const def = REPORTS.find((r) => r.id === id);
    if (!def) throw new NotFoundException({ code: 'report_not_found', message: 'Không có báo cáo này.' });
    return def;
  }

  /** Whitelist mọi tham số: chỉ khoá đã khai báo trong định nghĩa báo cáo mới được đưa xuống SQL. */
  async parseQuery(def: ReportDefinition, raw: RawQuery, now = new Date()): Promise<ReportQuery> {
    const range = parseReportRange(str(raw.from) || undefined, str(raw.to) || undefined, now, { defaultDays: REPORT_DEFAULT_DAYS, maxDays: REPORT_MAX_DAYS });

    const zone = str(raw.zone) || null;
    if (zone !== null) {
      if (!def.filters.includes('zone')) throw bad('zone', 'Báo cáo này không lọc theo phân khu.');
      if (zone.length > ZONE_MAX || !(await this.zones()).includes(zone)) throw bad('zone', 'Phân khu không hợp lệ.');
    }
    const hostId = str(raw.hostId) || null;
    if (hostId !== null && (!def.filters.includes('hostId') || !UUID_RE.test(hostId))) throw bad('hostId', 'Field Host không hợp lệ.');
    const status = str(raw.status) || null;
    if (status !== null && !(def.statuses ?? []).includes(status)) throw bad('status', 'Trạng thái không hợp lệ.');

    const pageRaw = str(raw.page) || '1';
    const sizeRaw = str(raw.pageSize) || String(PAGE_SIZE_DEFAULT);
    if (!/^\d{1,6}$/.test(pageRaw) || Number(pageRaw) < 1) throw bad('page', 'Trang phải là số nguyên ≥ 1.');
    if (!/^\d{1,3}$/.test(sizeRaw) || Number(sizeRaw) < 1 || Number(sizeRaw) > PAGE_SIZE_MAX) {
      throw bad('pageSize', `Số dòng mỗi trang từ 1 đến ${PAGE_SIZE_MAX}.`);
    }
    const sort = str(raw.sort) || def.defaultSort;
    if (!Object.prototype.hasOwnProperty.call(def.sorts, sort)) throw bad('sort', 'Cột sắp xếp không hợp lệ.');
    const dirRaw = str(raw.dir) || def.defaultDir;
    if (dirRaw !== 'asc' && dirRaw !== 'desc') throw bad('dir', 'Chiều sắp xếp phải là asc hoặc desc.');

    return { range, zone, hostId, status, page: Number(pageRaw), pageSize: Number(sizeRaw), sort, dir: dirRaw as SortDir };
  }

  /** Chạy trong MỘT transaction chỉ đọc (một kết nối — pool Supabase giới hạn), có statement_timeout. */
  private execute(def: ReportDefinition, q: ReportQuery, limit?: number) {
    const opts: ReportRunOptions = { limit, decryptPhone: (enc) => decryptPhoneForDisplay(this.phones, enc) };
    return this.prisma.$transaction(
      async (tx) => {
        // SET TRANSACTION phải đứng trước mọi lệnh khác của transaction. Chuỗi hằng số, không có dữ liệu người dùng.
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        return def.run(tx, q, opts);
      },
      { timeout: STATEMENT_TIMEOUT_MS + 5_000, maxWait: 5_000 },
    );
  }

  private meta(def: ReportDefinition, q: ReportQuery, now: Date) {
    return {
      reportId: def.id,
      ...publicRange(q.range),
      filters: { zone: q.zone, hostId: q.hostId, status: q.status },
      sort: q.sort,
      dir: q.dir,
      generatedAt: now.toISOString(),
      currency: 'VND',
      moneyFormat: 'string-decimal',
      definitions: def.definitions,
    };
  }

  async run(id: string, raw: RawQuery, now = new Date()) {
    const def = this.definition(id);
    const q = await this.parseQuery(def, raw, now);
    const res = await this.execute(def, q);
    return {
      rows: res.rows,
      summary: res.summary,
      page: q.page,
      pageSize: q.pageSize,
      total: res.total,
      meta: this.meta(def, q, now),
    };
  }

  /**
   * Xuất CSV cùng bộ lọc với màn hình (không phân trang). Ghi audit `REPORT_EXPORTED` (ai, báo cáo, bộ lọc, số dòng — không
   * PII) TRƯỚC khi trả file; ghi audit lỗi ⇒ không trả file.
   */
  async exportCsv(id: string, raw: RawQuery, actor: AdminActor, now = new Date()) {
    const format = str(raw.format) || 'csv';
    if (format !== 'csv') throw bad('format', 'Chỉ hỗ trợ xuất CSV.');
    const def = this.definition(id);
    const q = await this.parseQuery(def, raw, now);
    const res = await this.execute(def, q, EXPORT_MAX_ROWS + 1);
    if (res.rows.length > EXPORT_MAX_ROWS) {
      throw new UnprocessableEntityException({
        code: 'export_too_large',
        message: `Kết quả có ${res.total.toLocaleString('vi-VN')} dòng, vượt giới hạn ${EXPORT_MAX_ROWS.toLocaleString('vi-VN')} dòng. Thu hẹp khoảng thời gian hoặc bộ lọc.`,
        errors: { total: res.total, max: EXPORT_MAX_ROWS },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actionType: 'REPORT_EXPORTED',
        entityName: 'reports',
        entityId: def.id,
        newValue: { format: 'csv', from: q.range.from, to: q.range.to, zone: q.zone, hostId: q.hostId, status: q.status, sort: q.sort, dir: q.dir, rows: res.rows.length },
      },
    });
    return { filename: csvFilename(def.id, q.range.from, q.range.to), content: toCsv(def.columns, res.rows), rows: res.rows.length };
  }
}
