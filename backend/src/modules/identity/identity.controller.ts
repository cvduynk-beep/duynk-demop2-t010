import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { EkycVerificationRequestDto } from './dto/identity.dto';

@ApiTags('6. FPT.AI eKYC & Zero-Storage')
@ApiCookieAuth('session-cookie')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('ekyc/verify')
  @ApiOperation({
    summary: 'FPT.AI eKYC: Quét CCCD 2 mặt, Face Liveness & Đối chiếu C06',
    description: 'Cơ chế Zero-Storage RAM (0 byte ảnh lưu trên server), loại trừ rủi ro dữ liệu cá nhân theo NĐ 356/2025/NĐ-CP. Trả độ tin cậy theo từng trường.',
  })
  async verifyEkyc(@Body() dto: EkycVerificationRequestDto) {
    return this.identityService.processEkyc(dto);
  }

  @Get(':depositId')
  @ApiOperation({ summary: 'Lấy kết quả xác thực eKYC theo mã cọc' })
  async getEkycResult(@Param('depositId') depositId: string) {
    return this.identityService.getEkycResult(depositId);
  }
}
