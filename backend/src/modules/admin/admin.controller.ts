import { Controller, Get, Post, Body, Param, Query, Res, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminFeeService } from './admin-fee.service';
import { AdminPayoutService } from './admin-payout.service';
import { AdminDispatchService } from './admin-dispatch.service';
import { AdminBiService } from './admin-bi.service';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminDashboardService, parseActivityLimit } from './admin-dashboard.service';
import { parseReportRange } from './admin-range';
import { AdminInventoryService } from './admin-inventory.service';
import { AdminDepositService } from './admin-deposit.service';
import { AdminKeyService } from './admin-key.service';
import { AdminContractRegistryService } from './admin-contract-registry.service';
import {
  TerminateMandateDto,
  UpdateCommissionParamDto,
  ApproveConsignmentDto,
  RejectConsignmentDto,
  ReassignBookingDto,
  EscalateTicketDto,
  VoidHoldDto,
  UpdateUnitHoldHoursDto,
  // UpdateLandlordFeeDto, // tạm tắt cùng endpoint phí dịch vụ chủ nhà
  PayoutQueryDto,
  ResolveUncDto,
  KeyReasonDto,
  DepositQueryDto,
  UpdateDepositPolicyDto,
} from './dto/admin.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('10. Admin Portal & Quản trị vận hành')
@Roles('ops_admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly feeService: AdminFeeService,
    private readonly payoutService: AdminPayoutService,
    private readonly dispatchService: AdminDispatchService,
    private readonly biService: AdminBiService,
    private readonly inventoryService: AdminInventoryService,
    private readonly depositService: AdminDepositService,
    private readonly keyService: AdminKeyService,
    private readonly registryService: AdminContractRegistryService,
    private readonly dashboardService: AdminDashboardService,
    private readonly bookingsService: AdminBookingsService,
  ) {}

  @Get('bi-funnel')
  @ApiOperation({
    summary: 'Module 1: BI Funnel & Bản đồ nhiệt lấp đầy (Occupancy Heatmap)',
    description:
      'Phễu + no-show theo NHÓM lịch xem tạo trong [from, to] (YYYY-MM-DD, giờ Asia/Ho_Chi_Minh, mặc định 7 ngày gần nhất, ' +
      'tối đa 90 ngày; sai ⇒ 400 invalid_range). Lấp đầy, heatmap, rổ hàng, lịch xem hôm nay là ảnh chụp hiện tại.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-10-07' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-13' })
  async getBiFunnel(@Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    return this.biService.getBiFunnelAndHeatmap(parseReportRange(from, to, now), now);
  }

  @Get('dashboard/work-items')
  @ApiOperation({
    summary: 'Số việc cần Admin xử lý (ảnh chụp hiện tại)',
    description:
      'dispatch.manualDispatch (ESCALATED + OFFERED tầng 3 quá hạn) · dispatch.overSla (OFFERED tầng 1–2 quá hạn) — chỉ lịch xem còn mở; ' +
      'consignments.awaitingHost / overdue (SLA thẩm định 2h); mandatesExiting (EXIT_REQUESTED); contracts.needsAction (sổ hợp đồng).',
  })
  async getDashboardWorkItems() {
    return this.dashboardService.getWorkItems();
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Dòng sự kiện mới nhất từ audit log (phân trang con trỏ)',
    description: 'Chỉ trả loại hành động, đối tượng, vai + tên người làm, thời điểm — không trả giá trị cũ/mới, IP, user-agent.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'before', required: false, description: 'nextCursor của trang trước' })
  async getActivity(@Query('limit') limit?: string, @Query('before') before?: string) {
    return this.dashboardService.getActivity(parseActivityLimit(limit), before || undefined);
  }

  @Get('exclusive-inventory')
  @ApiOperation({
    summary: 'Module 2: Quản lý Rổ hàng Độc quyền & Giám sát Thoát 15 ngày',
    description: 'Theo dõi 128 căn hộ và countdown widget đếm ngược thoát ủy quyền linh hoạt',
  })
  async getInventory() {
    return this.inventoryService.getExclusiveInventory();
  }

  @Get('exclusive-inventory/:id')
  @ApiOperation({ summary: 'Chi tiết căn hộ trong rổ hàng độc quyền' })
  async getInventoryDetail(@Param('id') id: string) {
    return this.inventoryService.getExclusiveInventoryDetail(id);
  }

  @Post('exclusive-inventory/:id/hold-hours')
  @ApiOperation({
    summary: 'Đặt thời gian khoá căn (12–72 giờ, mặc định 48) cho MỘT căn còn trống, có Audit Log',
    description: 'Từ chối (409) khi căn không còn AVAILABLE. hours = null để về mặc định.',
  })
  async updateHoldHours(@Param('id') id: string, @Body() dto: UpdateUnitHoldHoursDto, @CurrentUser() user: any) {
    return this.inventoryService.updateHoldHours(id, dto.hours, dto.reason, { id: user.id, role: user.role });
  }

  @Post('mandates/:id/terminate')
  @ApiOperation({
    summary: 'Chấm dứt ủy quyền độc quyền sau khi chủ nhà báo thoát đủ 15 ngày',
    description: 'Từ chối (409) khi căn HOLDING hoặc có hợp đồng hiệu lực (SAD_v2 §10.4)',
  })
  async terminateMandate(@Param('id') id: string, @Body() dto: TerminateMandateDto, @CurrentUser() user: any) {
    return this.inventoryService.terminateMandate(id, dto.reason, user);
  }

  @Post('consignments/:id/approve')
  @ApiOperation({ summary: 'Admin duyệt hồ sơ ký gửi căn hộ sau khi có báo cáo thẩm định của Host' })
  async approveConsignment(@Param('id') id: string, @Body() dto: ApproveConsignmentDto) {
    return this.adminService.approveConsignment(id, dto);
  }

  @Post('consignments/:id/reject')
  @ApiOperation({ summary: 'Admin từ chối hồ sơ ký gửi kèm lý do' })
  async rejectConsignment(@Param('id') id: string, @Body() dto: RejectConsignmentDto) {
    return this.adminService.rejectConsignment(id, dto);
  }

  @Get('dispatch-sla')
  @ApiOperation({
    summary: 'Module 3: Giám sát Điều phối SLA Field Host',
    description: 'Giám sát thời gian phản hồi ca trực 3-5 phút, cảnh báo đỏ khi quá hạn cho Area Lead',
  })
  async getDispatchSla() {
    return this.dispatchService.getSlaMonitoring();
  }

  @Get('dispatch-sla/summary')
  @ApiOperation({
    summary: 'Tóm tắt SLA theo tầng, số ticket quá hạn và thời gian nhận ca của Host',
    description: 'from/to (tuỳ chọn, như bi-funnel) chỉ lọc thời gian nhận ca theo offeredAt; không truyền ⇒ toàn bộ.',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getDispatchSlaSummary(@Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    return this.dispatchService.getSlaSummary(now, from || to ? parseReportRange(from, to, now) : undefined);
  }

  @Post('dispatch/:ticketId/escalate')
  @ApiOperation({ summary: 'Leo thang ticket điều phối lên tầng kế tiếp (tối đa tầng 3)' })
  async escalateTicket(@Param('ticketId') ticketId: string, @Body() dto: EscalateTicketDto, @CurrentUser() user: any) {
    return this.dispatchService.escalate(ticketId, dto, user);
  }

  @Get('bookings')
  @ApiOperation({
    summary: 'Danh sách lịch xem cho điều phối (phân trang/lọc/tìm phía server)',
    description: 'tab=open (đang xử lý, mặc định) | today (giờ hẹn hôm nay, giờ VN) | all; q tìm theo mã booking/mã căn; page ≥ 1; pageSize 1–50.',
  })
  @ApiQuery({ name: 'tab', required: false, enum: ['open', 'today', 'all'] })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async listBookings(@Query('tab') tab?: string, @Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.bookingsService.list({ tab, q, page, pageSize });
  }

  @Get('bookings/:id/reassign-candidates')
  @ApiOperation({ summary: 'Field Host đủ điều kiện nhận ca của lịch xem (:id = Viewing id) — cùng quy tắc với lúc giao lại' })
  async reassignCandidates(@Param('id') id: string) {
    return this.bookingsService.candidates(id);
  }

  @Post('bookings/:id/reassign')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Điều phối tay lịch hẹn sang Field Host khác (:id = Viewing id)',
    description:
      'Body {hostId, reason 5–300 ký tự, version}. Một transaction: ghi có điều kiện + AuditLog DISPATCH_REASSIGNED. ' +
      '404 not_found · 400 invalid_request (errors theo field) · 409 reassign_not_allowed (trạng thái) · ' +
      '409 reassign_conflict (version lệch, errors.latest = dòng mới nhất) · 422 reassign_target_invalid (errors.hostId). Trả dòng booking đã cập nhật.',
  })
  async reassignBooking(@Param('id') id: string, @Body() dto: ReassignBookingDto, @CurrentUser() user: any) {
    return this.bookingsService.reassign(id, dto, { id: user.id, role: user.role });
  }

  @Get('deposits')
  @ApiOperation({ summary: 'Giám sát cọc giữ chỗ (lọc theo trạng thái, phân trang)' })
  async listDeposits(@Query() q: DepositQueryDto) {
    return this.depositService.listDeposits(q);
  }

  @Post('deposits/:id/resolve-unc')
  @ApiOperation({ summary: 'Duyệt/từ chối UNC thủ công (409 nếu căn không còn AVAILABLE)' })
  async resolveUnc(@Param('id') id: string, @Body() dto: ResolveUncDto, @CurrentUser() user: any) {
    return this.depositService.resolveUnc(id, dto, user);
  }

  @Get('door-keys')
  @ApiOperation({ summary: 'Danh sách mã khóa cửa (chỉ metadata, không trả mã)' })
  async listDoorKeys() {
    return this.keyService.listKeys();
  }

  @Post('door-keys/:id/rotate')
  @ApiOperation({ summary: 'Xoay mã khóa điện tử (không trả plaintext)' })
  async rotateDoorKey(@Param('id') id: string, @Body() dto: KeyReasonDto, @CurrentUser() user: any) {
    return this.keyService.rotateKey(id, dto, user);
  }

  @Post('door-keys/:id/revoke')
  @ApiOperation({ summary: 'Thu hồi mã khóa cửa' })
  async revokeDoorKey(@Param('id') id: string, @Body() dto: KeyReasonDto, @CurrentUser() user: any) {
    return this.keyService.revokeKey(id, dto, user);
  }
  @Get('contract-registry')
  @ApiOperation({ summary: 'Sổ hợp đồng hợp nhất 4 loại: ký gửi, cọc giữ chỗ, thuê, đối tác Field Host' })
  getContractRegistry() {
    return this.registryService.list();
  }

  @Get('contract-registry/:kind/:id')
  @ApiOperation({ summary: 'Chi tiết một văn bản trong sổ hợp đồng (kind = mandate | holding | lease | partnership)' })
  getContractRegistryDetail(@Param('kind') kind: string, @Param('id') id: string) {
    return this.registryService.detail(kind, id);
  }

  @Get('contracts')
  @ApiOperation({ summary: 'Danh sách hợp đồng thuê (giữ cho các màn đang dùng; sổ đầy đủ ở contract-registry)' })
  async getContracts() {
    return this.depositService.getContracts();
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Chi tiết hợp đồng và gói chứng cứ pháp lý' })
  async getContractById(@Param('id') id: string) {
    return this.adminService.getContractById(id);
  }

  @Post('contracts/:id/void-hold')
  @ApiOperation({ summary: 'Hủy cọc giữ chỗ (Chủ nhà vi phạm hoặc Bất khả kháng)' })
  async voidHold(@Param('id') id: string, @Body() dto: VoidHoldDto, @CurrentUser() user: any) {
    return this.depositService.voidHold(id, dto, user);
  }

  @Post('contracts/:id/complete-exit')
  @ApiOperation({ summary: 'Hoàn tất thoát ủy quyền sau 15 ngày đếm ngược' })
  async completeExit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.adminService.completeExit(id, { id: user.id, role: user.role });
  }

  @Post('contracts/:id/remind-renewal')
  @ApiOperation({ summary: 'Gửi nhắc gia hạn hợp đồng thuê sắp hết hạn' })
  async remindRenewal(@Param('id') id: string) {
    return this.adminService.remindRenewal(id);
  }

  @Get('contract-templates')
  @ApiOperation({ summary: 'Thư viện mẫu văn bản pháp lý' })
  getContractTemplates() {
    return this.adminService.getContractTemplates();
  }

  @Get('contract-templates/:id')
  @ApiOperation({ summary: 'Chi tiết mẫu văn bản pháp lý' })
  getContractTemplateById(@Param('id') id: string) {
    return this.adminService.getContractTemplateById(id);
  }

  @Get('contract-parties')
  @ApiOperation({ summary: 'Danh bạ các bên ký kết' })
  getContractParties() {
    return this.adminService.getContractParties();
  }

  @Get('contract-parties/:id')
  @ApiOperation({ summary: 'Chi tiết bên ký kết' })
  getContractPartyById(@Param('id') id: string) {
    return this.adminService.getContractPartyById(id);
  }

  @Get('commission-engine')
  @ApiOperation({ summary: 'Module 4: Dynamic Commission & Incentive Engine (đọc FeeConfig)' })
  async getCommissionEngine() {
    return this.feeService.getCommissionEngine();
  }

  @Get('commission-engine/audit')
  @ApiOperation({ summary: 'Nhật ký thay đổi tham số biến phí (30 lần gần nhất)' })
  getCommissionAudit() {
    return this.feeService.getCommissionAudit();
  }

  @Post('commission-engine/config')
  @ApiOperation({ summary: 'Điều chỉnh tham số biến phí, có kiểm tra khoảng SAD_v2 §3.2 và Audit Log' })
  async updateCommissionParam(@Body() dto: UpdateCommissionParamDto, @CurrentUser() user: any) {
    return this.feeService.updateCommissionParam(dto, { id: user.id, role: user.role });
  }

  // TẠM TẮT: cài đặt phí dịch vụ ký gửi (chủ nhà). Đang dùng mặc định 5% (landlord.mappers DEFAULT_SERVICE_FEE_PERCENT).
  // Bỏ comment cùng mục LandlordFeeSettings ở AdminSettings.tsx và 2 dòng trong admin.http.spec.ts để bật lại.
  // @Get('settings/landlord-fee')
  // @ApiOperation({ summary: 'Phí dịch vụ ký gửi thu của chủ nhà (% tiền thuê, khoá landlord_service_fee_rate)' })
  // getLandlordFee() {
  //   return this.feeService.getLandlordFee();
  // }
  //
  // @Post('settings/landlord-fee')
  // @ApiOperation({ summary: 'Cập nhật phí dịch vụ ký gửi (0–30%), có Audit Log' })
  // updateLandlordFee(@Body() dto: UpdateLandlordFeeDto, @CurrentUser() user: any) {
  //   return this.feeService.updateLandlordFee(dto, { id: user.id, role: user.role });
  // }

  @Get('settings/deposit-policy')
  @ApiOperation({ summary: 'Xem quy định tiền cọc (tối thiểu 50%, tối đa 4 lần giá thuê tháng)' })
  getDepositPolicy() {
    return this.feeService.getDepositPolicy();
  }

  @Post('settings/deposit-policy')
  @ApiOperation({ summary: 'Cập nhật quy định tiền cọc theo giá thuê, có Audit Log' })
  updateDepositPolicy(@Body() dto: UpdateDepositPolicyDto, @CurrentUser() user: any) {
    return this.feeService.updateDepositPolicy(dto, { id: user.id, role: user.role });
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Bảng kê thu nhập Host theo tuần ISO' })
  getPayouts(@Query() q: PayoutQueryDto) {
    return this.payoutService.getWeeklyStatement(q.period);
  }

  @Get('payouts.csv')
  @ApiOperation({ summary: 'Xuất CSV bảng kê thu nhập Host theo tuần ISO' })
  async exportPayoutsCsv(@Query() q: PayoutQueryDto, @CurrentUser() user: any, @Res() res: Response) {
    const csv = await this.payoutService.toCsv(q.period, { id: user.id, role: user.role });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="host-payouts-' + (q.period ?? 'current') + '.csv"');
    res.send(csv);
  }

  @Post('payouts/sweep')
  @ApiOperation({ summary: 'Quét và ghi các khoản thu nhập Host còn thiếu (idempotent theo transRef)' })
  sweepPayouts(@CurrentUser() user: any) {
    return this.payoutService.sweep({ id: user.id, role: user.role });
  }
}
