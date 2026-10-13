import { applyDecorators, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminReportsService, EXPORT_MAX_ROWS, PAGE_SIZE_MAX, REPORT_MAX_DAYS } from './admin-reports.service';

const QUERY_DOC = [
  { name: 'from', required: false, example: '2026-10-01', description: 'YYYY-MM-DD giờ VN (gồm). Mặc định 30 ngày gần nhất.' },
  { name: 'to', required: false, example: '2026-10-13', description: `YYYY-MM-DD giờ VN (gồm). Tối đa ${REPORT_MAX_DAYS} ngày.` },
  { name: 'zone', required: false, description: 'Phân khu của Host (một giá trị trong `zones` của danh mục).' },
  { name: 'hostId', required: false, description: 'UUID Field Host.' },
  { name: 'status', required: false, description: 'Chỉ báo cáo có `statuses` (vd. deals).' },
  { name: 'sort', required: false, description: 'Một khoá trong `sorts` của báo cáo.' },
  { name: 'dir', required: false, enum: ['asc', 'desc'] },
];
const ReportQueryDocs = () => applyDecorators(...QUERY_DOC.map((q) => ApiQuery(q as any)));

/** Báo cáo admin: tổng hợp ở Postgres (GROUP BY / percentile), chỉ `ops_admin` (RolesGuard toàn cục: 401 / 403). */
@ApiTags('10. Admin Portal & Quản trị vận hành')
@Roles('ops_admin')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh mục báo cáo: id, tên, bộ lọc, khoá sắp xếp, cột; kèm danh sách phân khu và giới hạn' })
  catalog() {
    return this.reports.catalog();
  }

  @Get(':reportId')
  @ApiOperation({
    summary: 'Dữ liệu một báo cáo',
    description:
      'Trả `{rows, summary, page, pageSize, total, meta{from, to, timezone, days, filters, generatedAt, currency, definitions}}`. ' +
      '`summary` tính trên TOÀN BỘ tập đã lọc. Tiền là chuỗi decimal VND. Sai tham số ⇒ 400 `invalid_range` / `invalid_report_query` ' +
      'kèm `errors.<field>`; id lạ ⇒ 404 `report_not_found`.',
  })
  @ReportQueryDocs()
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20, description: `1–${PAGE_SIZE_MAX}` })
  run(@Param('reportId') reportId: string, @Query() query: Record<string, unknown>) {
    return this.reports.run(reportId, query);
  }

  @Get(':reportId/export')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Xuất CSV (UTF-8 BOM, chống CSV injection) cùng bộ lọc với màn hình; ghi Audit Log REPORT_EXPORTED',
    description: `Tối đa ${EXPORT_MAX_ROWS} dòng (quá ⇒ 422 export_too_large). Giới hạn 5 lần/phút ⇒ 429.`,
  })
  @ReportQueryDocs()
  @ApiQuery({ name: 'format', required: false, enum: ['csv'] })
  async export(
    @Param('reportId') reportId: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const file = await this.reports.exportCsv(reportId, query, { id: user.id, role: user.role });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Report-Rows', String(file.rows));
    res.send(file.content);
  }
}

