import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EkycScanRequestDto {
  @ApiProperty({ description: 'Đồng ý chính sách xử lý dữ liệu cá nhân' })
  @IsBoolean()
  consent: boolean;

  @ApiProperty({ example: 'PRIVACY-2026.10-v1', description: 'Phiên bản thỏa thuận dữ liệu' })
  @IsNotEmpty()
  @IsString()
  consentVersion: string;
}

export class SubmitEkycFieldsDto {
  @ApiProperty({ example: 'NGUYỄN VĂN AN' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '001095012345' })
  @IsNotEmpty()
  @IsString()
  idNumber: string;

  @ApiProperty({ example: '12/04/2001' })
  @IsNotEmpty()
  @IsString()
  dob: string;

  @ApiProperty({ example: '18/08/2021' })
  @IsNotEmpty()
  @IsString()
  issuedDate: string;

  @ApiProperty({ example: 'Số 18, Ngõ 42, Phố Vọng, Phường Phương Mai, Quận Đống Đa, Hà Nội' })
  @IsNotEmpty()
  @IsString()
  address: string;
}

export class SubmitEkycInputDto {
  @ApiProperty({ description: 'Mã phiên quét eKYC' })
  @IsNotEmpty()
  @IsString()
  scanId: string;

  @ApiProperty({ example: 'PRIVACY-2026.10-v1' })
  @IsNotEmpty()
  @IsString()
  consentVersion: string;

  @ApiProperty({ type: SubmitEkycFieldsDto })
  @ValidateNested()
  @Type(() => SubmitEkycFieldsDto)
  fields: SubmitEkycFieldsDto;

  @ApiProperty({ description: 'Xác nhận trường độ tin cậy thấp' })
  @IsBoolean()
  confirmedLowConfidence: boolean;

  @ApiPropertyOptional({ description: 'Xác nhận lệch tên so với lịch hẹn' })
  @IsOptional()
  @IsBoolean()
  confirmedNameMismatch?: boolean;
}
