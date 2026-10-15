import { Controller, Post, Body, Param, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import {
  CreateBookingDto,
  CancelBookingDto,
  RescheduleBookingDto,
  RateBookingDto,
} from './dto/booking.dto';
import { FastDepositDto } from '../deposit/dto/deposit.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('3. Booking & Đón sảnh 1-chạm')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Roles('tenant')
  @Post()
  @ApiOperation({
    summary: 'A6: Đặt lịch xem phòng trực tiếp',
    description: 'Tạo Viewing, phân bổ Field Host phân khu và tạo Dispatch Ticket (SLA 180s)',
  })
  async createBooking(@CurrentUser() user: any, @Body() dto: CreateBookingDto) {
    return this.bookingService.createBooking(user, dto);
  }

  @Roles('tenant')
  @Post('fast-deposit')
  @ApiOperation({
    summary: 'Chốt cọc nhanh trên trang căn, không cần lịch xem (chỉ căn chủ nhà ủy quyền chốt nhanh)',
    description:
      'Tạo lịch trực tiếp (closing, không Host) + khoản cọc chốt nhanh: Tiền cọc bảo đảm giảm ~5% nếu tiền về trong 24 giờ; chu kỳ 1/3/6 chọn khi ký HĐ. ' +
      'Lỗi: 400 invalid_request · 403 otp_required · 401 action_token_invalid · 404 unit_not_found · 409 unit_not_available / fast_close_unavailable / unit_already_held / terms_version_stale / deposit_unavailable.',
  })
  async createFastDeposit(@CurrentUser() user: any, @Body() dto: FastDepositDto, @Req() req: Request) {
    return this.bookingService.createFastDeposit(user, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Roles('tenant')
  @Get(':ref')
  @ApiOperation({ summary: 'A8: Xem chi tiết lịch hẹn xem phòng theo mã ref (VS-XXXXX)' })
  async getBookingByRef(@Param('ref') ref: string, @CurrentUser() user: any) {
    return this.bookingService.getBookingByRef(ref, user);
  }

  @Roles('tenant')
  @Post(':ref/cancel')
  @ApiOperation({ summary: 'A9: Hủy lịch hẹn xem phòng (trước giờ xem tối thiểu 2h)' })
  async cancelBooking(
    @Param('ref') ref: string,
    @CurrentUser() user: any,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelBooking(ref, user, dto);
  }

  @Roles('tenant')
  @Post(':ref/reschedule')
  @ApiOperation({ summary: 'A10: Đổi khung giờ xem phòng (trước giờ xem tối thiểu 2h)' })
  async rescheduleBooking(
    @Param('ref') ref: string,
    @CurrentUser() user: any,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookingService.rescheduleBooking(ref, user, dto);
  }

  @Roles('tenant')
  @Post(':ref/late')
  @ApiOperation({ summary: 'A11: Báo trễ 10 phút' })
  async requestLate(@Param('ref') ref: string, @CurrentUser() user: any) {
    return this.bookingService.requestLate(ref, user);
  }

  @Roles('tenant')
  @Post(':ref/lobby-checkin')
  @ApiOperation({
    summary: 'A12: Nút 1-chạm: [📍 Tôi đã có mặt tại sảnh]',
    description: 'Chuyển trạng thái LOBBY để Field Host quẹt thẻ cư dân đón khách',
  })
  async lobbyCheckIn(@Param('ref') ref: string, @CurrentUser() user: any) {
    return this.bookingService.lobbyCheckIn(ref, user);
  }

  @Roles('tenant')
  @Post(':ref/rating')
  @ApiOperation({ summary: 'A13: Đánh giá chất lượng phục vụ của Field Host sau buổi xem' })
  async rateBooking(
    @Param('ref') ref: string,
    @CurrentUser() user: any,
    @Body() dto: RateBookingDto,
  ) {
    return this.bookingService.rateBooking(ref, user, dto);
  }
}
