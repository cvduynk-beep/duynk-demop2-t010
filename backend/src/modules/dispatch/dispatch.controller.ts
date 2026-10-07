import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiCookieAuth } from '@nestjs/swagger';
import { DispatchService } from './dispatch.service';
import { AcceptTicketDto, RejectTicketDto, ClaimTicketDto, EmergencyReportDto, NoShowDto, NotInterestedDto } from './dto/dispatch.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('4. Field Host PWA & Điều phối')
@ApiCookieAuth('session-cookie')
@Roles('field_host', 'ops_admin')
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('tickets')
  @ApiOperation({ summary: 'Lấy danh sách Ticket ca trực của Field Host & Open Pool' })
  @ApiQuery({ name: 'hostId', required: false })
  async getHostTickets(@Query('hostId') hostId?: string) {
    return this.dispatchService.getHostTickets(hostId);
  }

  @Post('tickets/:id/accept')
  @ApiOperation({
    summary: 'Nút 1-chạm: [⚡ NHẬN CA TRỰC NGAY] (SLA đếm ngược 3-5 phút)',
    description: 'Host bấm nhận ticket, chuyển trạng thái ACCEPTED, chuẩn bị đón sảnh',
  })
  async acceptTicket(@Param('id') id: string, @Body() dto: AcceptTicketDto) {
    return this.dispatchService.acceptTicket(id, dto.hostId);
  }

  @Post('tickets/:id/reject')
  @ApiOperation({ summary: 'Từ chối ca trực (tự động leo thang điều phối sang Open Pool 500m)' })
  async rejectTicket(@Param('id') id: string, @Body() dto: RejectTicketDto) {
    return this.dispatchService.rejectTicket(id, dto);
  }

  @Post('tickets/:id/claim')
  @ApiOperation({ summary: 'Nhận ticket mở trong Open Pool 500m' })
  async claimTicket(@Param('id') id: string, @Body() dto: ClaimTicketDto) {
    return this.dispatchService.claimTicket(id, dto.hostId);
  }

  @Post('tickets/:id/elevator-rfid')
  @ApiOperation({
    summary: 'Nút 1-chạm: [💳 QUẸT THẺ CƯ DÂN THANG MÁY]',
    description: 'Xác nhận Host đã quẹt thẻ RFID đưa khách lên tầng phòng trong 60 giây',
  })
  async swipeElevatorRfid(@Param('id') id: string) {
    return this.dispatchService.swipeElevatorRfid(id);
  }

  @Post('tickets/:id/reveal-key')
  @ApiOperation({
    summary: 'Nút 1-chạm tại cửa căn hộ: [🔓 XÁC NHẬN XEM PHÒNG & CẤP MÃ CỬA]',
    description: 'Cấp mã PIN cố định từ Vault (AES-256) chỉ khi ticket active. Không dùng Lockbox. Tự gửi alert Zalo báo cho Chủ nhà.',
  })
  async revealDoorKey(@Param('id') id: string) {
    return this.dispatchService.revealDoorKey(id);
  }

  @Post('tickets/:id/emergency')
  @ApiOperation({ summary: 'Báo cáo sự cố khẩn cấp (Khách hủy sát giờ, sự cố căn hộ...)' })
  async reportEmergency(@Param('id') id: string, @Body() dto: EmergencyReportDto) {
    return this.dispatchService.reportEmergency(id, dto);
  }

  @Post('tickets/:id/no-show')
  @ApiOperation({ summary: 'Ghi nhận khách vắng mặt (No-show) sau 15 phút đệm' })
  async reportNoShow(@Param('id') id: string, @Body() dto: NoShowDto) {
    return this.dispatchService.reportNoShow(id, dto);
  }

  @Post('tickets/:id/not-interested')
  @ApiOperation({ summary: 'Khách không ưng ý sau buổi xem phòng' })
  async reportNotInterested(@Param('id') id: string, @Body() dto: NotInterestedDto) {
    return this.dispatchService.reportNotInterested(id, dto);
  }
}
