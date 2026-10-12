import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { EkycScanRequestDto, SubmitEkycInputDto } from './dto/identity.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('6. FPT.AI eKYC & Zero-Storage')
@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Roles('tenant')
  @Post('bookings/:ref/ekyc/scan')
  @ApiOperation({
    summary: 'A17: Quét CCCD (MÔ PHỎNG OCR — chưa tích hợp FPT.AI)',
    description: 'Trả kết quả OCR giả lập + độ tin cậy từng trường và scanId ký HMAC hạn 15 phút. Chỉ chủ lịch, lịch đang giữ chỗ.',
  })
  async scan(
    @Param('ref') ref: string,
    @CurrentUser() user: any,
    @Body() dto: EkycScanRequestDto,
  ) {
    return this.identityService.scan(ref, user, dto);
  }

  @Roles('tenant')
  @Post('bookings/:ref/ekyc')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'A18: Lưu thông tin CCCD đã xác nhận (mã hoá AES-256)',
    description: 'Ghi IdentityVerification thật cho lịch đang giữ chỗ. Hợp đồng thuê lập ở POST /contracts/lease/sign.',
  })
  async submit(
    @Param('ref') ref: string,
    @CurrentUser() user: any,
    @Body() dto: SubmitEkycInputDto,
  ) {
    return this.identityService.submit(ref, user, dto);
  }
}
