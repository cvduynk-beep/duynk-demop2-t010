import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, Max } from 'class-validator';

export class CreateMandateDto {
  @ApiProperty({ description: 'Mã căn hộ (ví dụ: VHOP-S1.02-12A08)' })
  @IsNotEmpty()
  @IsString()
  unitCode: string;

  @ApiProperty({ example: 6500000, description: 'Giá kỳ vọng cho thuê (VNĐ)' })
  @IsNotEmpty()
  expectedRentPrice: number;

  @ApiProperty({ example: '482910#', description: 'Mã số khóa cửa điện tử do chủ nhà thiết lập' })
  @IsNotEmpty()
  @IsString()
  doorPin: string;

  @ApiPropertyOptional({ default: true, description: 'Đăng ký Host thẩm định chụp ảnh 0đ' })
  @IsOptional()
  freeInspectionRequest?: boolean = true;
}

export class SignLeaseDto {
  @ApiProperty({ example: 'VS-4F7K2', description: 'Mã lịch hẹn đang giữ chỗ (đã eKYC)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  bookingRef: string;

  @ApiProperty({ example: '2026-10-15', description: 'Ngày bắt đầu thuê (YYYY-MM-DD), trong 30 ngày tới' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;

  @ApiProperty({ example: 12, description: 'Thời hạn thuê (tháng): từ min_lease_months của căn đến 36' })
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;

  @ApiProperty({ example: 1, enum: [1, 3, 6] })
  @IsIn([1, 3, 6])
  paymentCycle: 1 | 3 | 6;
}
