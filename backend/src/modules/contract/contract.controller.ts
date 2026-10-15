import { Controller, Post, Body, Get, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContractService } from './contract.service';
import { CreateMandateDto, SignLeaseDto } from './dto/contract.dto';
import { LeaseSigningService } from './lease-signing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('7. Hợp đồng & Ký số OTP (E-Sign)')
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly leaseSigning: LeaseSigningService,
  ) {}

  @Roles('tenant')
  @Post('lease/sign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Khách thuê ký Hợp đồng thuê chính thức (sau eKYC, khi đang giữ chỗ)',
    description:
      'Tạo Contract ACTIVE + chuyển 100% cọc giữ chỗ thành một phần Tiền cọc bảo đảm (không trừ tháng đầu), căn → RENTED, ' +
      'sinh PDF (SHA-256 thật) và SignedDocument + bản ghi đồng ý (APP_CONSENT). Không ký số / OTP ký / TSA.',
  })
  async signLease(@CurrentUser() user: { id: string }, @Body() dto: SignLeaseDto, @Req() req: Request) {
    return this.leaseSigning.sign(user, dto, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Roles('landlord')
  @Post('mandate/create')
  @ApiOperation({
    summary: 'Chủ nhà: Đăng ký Ký gửi Quản lý Độc quyền (Exclusive Mandate) thẩm định 0đ',
    description: 'Chủ nhà ở nhà 100%, nhập mã cửa bảo mật Vault AES-256, điều khoản thoát 15 ngày linh hoạt',
  })
  async createMandate(@Body() dto: CreateMandateDto, @CurrentUser('id') landlordId: string) {
    return this.contractService.createMandate(dto, landlordId);
  }

  @Roles('ops_admin')
  @Get(':id/evidence-package')
  @ApiOperation({
    summary: 'Xuất Gói chứng cứ pháp lý (Evidence Manifest JSON)',
    description: 'Bao gồm SHA-256, Audit trace, chữ ký điện tử, dấu thời gian RFC 3161 lưu trữ lâu dài',
  })
  async getEvidencePackage(@Param('id') id: string) {
    return this.contractService.getEvidencePackage(id);
  }
}
