import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  UpdateCommissionParamDto,
  ApproveConsignmentDto,
  RejectConsignmentDto,
  ReassignBookingDto,
  VoidHoldDto,
  UpdateHoldPolicyDto,
} from './dto/admin.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('10. Admin Portal & Quản trị vận hành')
@ApiCookieAuth('session-cookie')
@Roles('ops_admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('bi-funnel')
  @ApiOperation({
    summary: 'Module 1: BI Funnel & Bản đồ nhiệt lấp đầy (Occupancy Heatmap)',
    description: 'Phễu 6 giai đoạn thời gian thực (no-show 3.8%) và Heatmap phân khu Sapphire 1 & 2',
  })
  async getBiFunnel() {
    return this.adminService.getBiFunnelAndHeatmap();
  }

  @Get('exclusive-inventory')
  @ApiOperation({
    summary: 'Module 2: Quản lý Rổ hàng Độc quyền & Giám sát Thoát 15 ngày',
    description: 'Theo dõi 128 căn hộ và countdown widget đếm ngược thoát ủy quyền linh hoạt',
  })
  async getInventory() {
    return this.adminService.getExclusiveInventory();
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
    return this.adminService.getDispatchSlaMonitoring();
  }

  @Post('bookings/:id/reassign')
  @ApiOperation({ summary: 'Điều phối tay lịch hẹn sang Field Host khác' })
  async reassignBooking(@Param('id') id: string, @Body() dto: ReassignBookingDto) {
    return this.adminService.reassignBooking(id, dto);
  }

  @Get('contracts')
  @ApiOperation({ summary: 'Sổ hợp đồng toàn hệ thống (Ủy quyền, Giữ chỗ, Thuê)' })
  async getContracts() {
    return this.adminService.getContracts();
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Chi tiết hợp đồng và gói chứng cứ pháp lý' })
  async getContractById(@Param('id') id: string) {
    return this.adminService.getContractById(id);
  }

  @Post('contracts/:id/void-hold')
  @ApiOperation({ summary: 'Hủy cọc giữ chỗ (Chủ nhà vi phạm hoặc Bất khả kháng)' })
  async voidHold(@Param('id') id: string, @Body() dto: VoidHoldDto) {
    return this.adminService.voidHold(id, dto);
  }

  @Post('contracts/:id/complete-exit')
  @ApiOperation({ summary: 'Hoàn tất thoát ủy quyền sau 15 ngày đếm ngược' })
  async completeExit(@Param('id') id: string) {
    return this.adminService.completeExit(id);
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
  @ApiOperation({
    summary: 'Module 4: Dynamic Commission & Incentive Engine',
    description: 'Bảng kê thanh toán tuần của Host và 4 tham số biến phí tự động tính toán',
  })
  async getCommissionEngine() {
    return this.adminService.getCommissionEngine();
  }

  @Post('commission-engine/config')
  @ApiOperation({
    summary: 'Điều chỉnh tham số biến phí (Dynamic Commission) có ghi nhận Audit Log',
    description: 'Thay đổi thù lao dẫn, hoa hồng chốt cọc, hệ số sao 5-star, ghi lại audit old/new/reason',
  })
  async updateCommissionParam(@Body() dto: UpdateCommissionParamDto) {
    return this.adminService.updateCommissionParam(dto);
  }

  @Get('settings/hold-policy')
  @ApiOperation({ summary: 'Chính sách thời hạn giữ chỗ toàn sàn & riêng từng căn' })
  getHoldPolicy() {
    return this.adminService.getHoldPolicy();
  }

  @Post('settings/hold-policy')
  @ApiOperation({ summary: 'Cập nhật chính sách thời hạn giữ chỗ' })
  updateHoldPolicy(@Body() dto: UpdateHoldPolicyDto) {
    return this.adminService.updateHoldPolicy(dto);
  }
}
