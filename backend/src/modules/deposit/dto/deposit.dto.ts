import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

export class CreateDepositDto {
  @ApiProperty({ description: 'Đồng ý điều khoản cọc' })
  @IsNotEmpty()
  @IsBoolean()
  acceptTerms: boolean;

  @ApiProperty({ example: 'DEP-2026.10-v3', description: 'Phiên bản điều khoản cọc' })
  @IsNotEmpty()
  @IsString()
  termsVersion: string;

  // Chu kỳ 1/3/6 KHÔNG chọn ở đây (hồ sơ 20): chọn khi ký HĐ. Điều kiện chủ nhà ủy quyền kiểm ở DepositService.
  @ApiPropertyOptional({ description: 'Chốt nhanh: giảm ~5% tiền cọc nếu tiền về trong 24 giờ. Số tiền luôn do server tính.' })
  @IsOptional()
  @IsBoolean()
  fastClose?: boolean;
}

/** `POST /bookings/fast-deposit`: cọc chốt nhanh ngay trên trang căn, không cần lịch xem (hồ sơ 20 · 01-CONTRACTS §3.2). */
export class FastDepositDto {
  @ApiProperty({ example: 'VHOP-S1.02-0405', description: 'Mã căn hộ' })
  @IsNotEmpty()
  @IsString()
  unitCode: string;

  @ApiProperty({ example: 'Nguyễn Văn An', description: 'Họ và tên người đặt cọc' })
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  contactName: string;

  @ApiProperty({ example: '0912345678', description: 'Số điện thoại (đã/ sẽ xác thực OTP Zalo)' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiPropertyOptional({ default: 1, example: 2, description: 'Số người dự kiến ở (1-10)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  partySize?: number = 1;

  @ApiPropertyOptional({ description: 'Token OTP mục đích TENANT_VIEWING' })
  @IsOptional()
  @IsString()
  actionToken?: string;

  @ApiProperty({ description: 'Đồng ý điều khoản cọc' })
  @IsNotEmpty()
  @IsBoolean()
  acceptTerms: boolean;

  @ApiProperty({ description: 'Xác nhận chốt cọc mà không xem trực tiếp' })
  @IsNotEmpty()
  @IsBoolean()
  acknowledgeNoViewing: boolean;

  @ApiProperty({ example: 'DEP-2026.10-v3', description: 'Phiên bản điều khoản cọc' })
  @IsNotEmpty()
  @IsString()
  termsVersion: string;
}

export class VietQrWebhookInputDto {
  @ApiPropertyOptional({ example: 'DEP-VS-89212', description: 'Mã cọc định danh' })
  @IsOptional()
  @IsString()
  depositCode?: string;

  @ApiPropertyOptional({ example: 'COC S1.02-12A08 0912345678', description: 'Nội dung chuyển khoản' })
  @IsOptional()
  @IsString()
  transferContent?: string;

  @ApiProperty({ example: 6_500_000, description: 'Số tiền chuyển khoản (phải đúng số tiền của khoản cọc)' })
  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'FT2401019999', description: 'Mã giao dịch ngân hàng' })
  @IsNotEmpty()
  @IsString()
  bankRefNumber: string;
}

export class UploadHostReceiptDto {
  @ApiProperty({ example: 'https://storage.vinstay.vn/receipts/unc-8921.jpg', description: 'Đường dẫn ảnh ủy nhiệm chi (UNC)' })
  @IsNotEmpty()
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  receiptUrl: string;

  @ApiPropertyOptional({ example: 'Khách đã chuyển khoản 2.000.000đ tại Techcombank, webhook ngân hàng chưa báo', description: 'Ghi chú của Host' })
  @IsOptional()
  @IsString()
  note?: string;
}
