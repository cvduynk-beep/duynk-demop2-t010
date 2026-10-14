import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Query,
  Req,
  UnauthorizedException,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DepositService } from './deposit.service';
import {
  CreateDepositDto,
  VietQrWebhookInputDto,
  UploadHostReceiptDto,
} from './dto/deposit.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HostRoles } from '../../common/decorators/host-roles.decorator';

@ApiTags('5. Cọc VietQR 2M & Khóa Giữ Chỗ')
@Controller()
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Public()
  @Get('legal/deposit-terms')
  @ApiOperation({
    summary: 'A14 (công khai): biên bản điều khoản đặt Tiền cọc bảo đảm — khách đọc trước khi tick và quét VietQR',
    description: 'Có `?unitCode=` thì số tiền cọc và số giờ giữ chỗ là của căn đó; không có thì câu chữ chung + giờ mặc định Admin cài.',
  })
  async getPublicDepositTerms(@Query('unitCode') unitCode?: string) {
    return this.depositService.getPublicDepositTerms(unitCode);
  }

  @Roles('tenant')
  @Get('bookings/:ref/deposit/terms')
  @ApiOperation({
    summary: 'A14: Lấy biên bản điều khoản đặt Tiền cọc bảo đảm (số tiền của căn) trước khi tick chấp thuận',
  })
  async getDepositTerms(@Param('ref') ref: string, @CurrentUser() user: any) {
    return this.depositService.getDepositTerms(ref, user);
  }

  @Roles('tenant')
  @Get('bookings/:ref/fast-close')
  @ApiOperation({
    summary: 'Báo giá Chốt nhanh của chủ lịch hẹn (bước chốt cọc): giá thuê theo chu kỳ 1/3/6 tháng + tiền cọc đã giảm',
    description: 'Chỉ khi chủ nhà ủy quyền chốt nhanh và lịch ở trạng thái closing; không lộ giá sàn. Không đủ điều kiện ⇒ `eligible: false`.',
  })
  async getFastCloseQuotes(@Param('ref') ref: string, @CurrentUser() user: any) {
    return this.depositService.getFastCloseQuotes(ref, user);
  }

  @Roles('tenant')
  @Post('bookings/:ref/deposit')
  @ApiOperation({
    summary: 'A15: Chấp thuận điều khoản & tạo giao dịch VietQR Tiền cọc bảo đảm (số tiền do server tính; `fastCloseCycle` tuỳ chọn)',
    description:
      'Số tiền = Tiền cọc bảo đảm của căn (units.security_deposit, chưa đặt ⇒ 1 tháng tiền thuê); chốt nhanh ⇒ giảm ~5% cọc, ưu đãi giữ 24 giờ. ' +
      'Cọc chưa có tiền về được báo giá lại trên cùng khoản. Lỗi: 400 invalid_request (errors.fastCloseCycle), 409 fast_close_unavailable / deposit_unavailable / bad_status / terms_version_stale.',
  })
  async createDeposit(
    @Param('ref') ref: string,
    @CurrentUser() user: any,
    @Body() dto: CreateDepositDto,
    @Req() req: Request,
  ) {
    return this.depositService.createDeposit(ref, user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Roles('tenant')
  @Post('bookings/:ref/deposit/demo-pay')
  @ApiOperation({
    summary: 'DEMO: giả lập ngân hàng báo có cọc (chỉ khi DEMO_TOOLS=true và không phải production)',
  })
  async demoPay(@Param('ref') ref: string, @CurrentUser() user: any) {
    return this.depositService.demoPay(ref, user);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('vietqr/webhook')
  @ApiOperation({
    summary: 'A16: Webhook Ngân hàng tự động gạch nợ (First-to-Pay Wins)',
  })
  async vietqrWebhook(
    @Headers('x-vietqr-secret') secretHeader: string = '',
    @Body() dto: VietQrWebhookInputDto,
  ) {
    const expectedSecret = process.env.VIETQR_WEBHOOK_SECRET;
    if (!expectedSecret) {
      throw new ServiceUnavailableException({
        message: 'VietQR webhook secret is not configured.',
        code: 'webhook_not_configured',
      });
    }

    const secretBuf = Buffer.from(secretHeader);
    const expectedBuf = Buffer.from(expectedSecret);

    if (
      secretBuf.length !== expectedBuf.length ||
      !timingSafeEqual(secretBuf, expectedBuf)
    ) {
      throw new UnauthorizedException({
        message: 'Mã bí mật webhook không hợp lệ.',
        code: 'webhook_secret_invalid',
      });
    }

    const outcome = await this.depositService.markPaid({
      depositCode: dto.depositCode,
      transferContent: dto.transferContent,
      amount: dto.amount,
      bankRefNumber: dto.bankRefNumber,
      actor: 'bank',
    });

    return { success: true, outcome };
  }

  @Roles('field_host')
  @HostRoles('sale')
  @Post('deposits/:id/host-receipt')
  @ApiOperation({
    summary: 'Host tải ảnh ủy nhiệm chi (UNC) khi webhook ngân hàng chậm',
  })
  async uploadHostReceipt(
    @Param('id') id: string,
    @Body() dto: UploadHostReceiptDto,
    @CurrentUser() user: any,
  ) {
    return this.depositService.uploadHostReceipt(id, dto, user.id);
  }
}
