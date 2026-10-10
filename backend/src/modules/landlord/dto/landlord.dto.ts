import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RequestExitMandateDto {
  @ApiProperty({ description: 'ID của ủy quyền (lấy từ `mandate.id` trong GET /landlord/units)' })
  @IsUUID()
  mandateId: string;

  @ApiProperty({ example: 'Tôi có nhu cầu tự ở hoặc bán căn hộ', description: 'Lý do yêu cầu dừng ký gửi' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  reason: string;
}

export class CancelExitMandateDto {
  @ApiProperty({ description: 'ID của ủy quyền' })
  @IsUUID()
  mandateId: string;
}

export class CreateConsignmentDto {
  @ApiProperty({ example: 'S1.02', description: 'Mã tòa (phải có trong bảng buildings)' })
  @IsNotEmpty()
  @IsString()
  building: string;

  @ApiProperty({ example: 12, description: 'Số tầng (1–60)' })
  @IsInt()
  @Min(1)
  @Max(60)
  floor: number;

  @ApiProperty({ example: '08', description: 'Số căn' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Số căn chỉ gồm chữ và số' })
  door: string;

  @ApiProperty({ example: '1PN', description: 'Studio | 1PN | 2PN | 3PN (hoặc enum Prisma: STUDIO, ONE_BED_PLUS, ...)' })
  @IsNotEmpty()
  @IsString()
  layout: string;

  @ApiProperty({ example: 47, description: 'Diện tích tim tường chủ nhà khai (m², 20–300)' })
  @IsNumber()
  @Min(20)
  @Max(300)
  areaM2: number;

  @ApiProperty({ example: 6500000, description: 'Giá thuê kỳ vọng (VNĐ/tháng, 3.000.000 → 80.000.000)' })
  @IsNumber()
  @Min(3_000_000)
  @Max(80_000_000, { message: 'Giá thuê kỳ vọng không được vượt quá 80.000.000 VNĐ/tháng' })
  askRent: number;

  @ApiPropertyOptional({ example: 6500000, description: 'Tiền cọc bảo đảm đề xuất: 2.000.000 → 3 lần giá thuê. Mặc định = giá thuê' })
  @IsOptional()
  @IsNumber()
  suggestedDeposit?: number;

  @ApiPropertyOptional({ example: 'flexible', description: 'Thời gian thuê mong muốn: flexible (từ 1 tháng) | mid (3–12 tháng) | long (từ 12 tháng) | fixed (cố định 12 tháng)' })
  @IsOptional()
  @IsIn(['flexible', 'mid', 'long', 'fixed'])
  leaseTerm?: 'flexible' | 'mid' | 'long' | 'fixed';

  @ApiPropertyOptional({ example: true, description: 'Đã có đầy đủ nội thất' })
  @IsOptional()
  @IsBoolean()
  furnished?: boolean;

  @ApiPropertyOptional({ example: ['smart'], description: '1–2 hình thức khóa: smart | physical (hoặc ELECTRONIC_PIN | PHYSICAL_KEY)' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsString({ each: true })
  locks?: string[];

  @ApiPropertyOptional({ example: '839201', description: 'Mã mở khóa điện tử — lưu mã hóa, không bao giờ trả lại qua API' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  doorCode?: string;

  @ApiPropertyOptional({ example: 'Techcombank', description: 'Ngân hàng thụ hưởng nhận tiền thuê hàng tháng (Smart Onboarding)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankName?: string;

  @ApiPropertyOptional({ example: '190388889999', description: 'Số tài khoản ngân hàng thụ hưởng' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankAccount?: string;

  @ApiPropertyOptional({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản thụ hưởng' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountHolder?: string;

  @ApiPropertyOptional({ default: true, description: 'Lưu làm tài khoản thụ hưởng mặc định cấp Profile cho toàn bộ căn hộ của chủ nhà' })
  @IsOptional()
  @IsBoolean()
  saveAsDefaultPayout?: boolean;

  @ApiPropertyOptional({ example: 'Ưu tiên khách ở lâu dài, giữ gìn vệ sinh' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ default: false, description: 'true = bản nháp: bỏ kiểm tra tiền cọc đề xuất' })
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}

export class SignConsignmentDto {
  @ApiProperty({ example: true, description: 'Cam kết quyền sở hữu/sử dụng hợp pháp (Điều 2 legal/01) — bắt buộc true' })
  @IsBoolean()
  ownershipWarranted: boolean;

  @ApiProperty({ example: '4829', description: 'OTP Zalo gửi tới SĐT đã xác thực của chủ nhà (gửi trước bằng POST /auth/otp/send, purpose PHONE_VERIFY)' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'OTP gồm 4 chữ số' })
  otp: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Chỉ cần khi hồ sơ chủ nhà chưa có SĐT: OTP đúng sẽ gắn SĐT này vào hồ sơ' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class SendConsignmentOtpDto {
  @ApiPropertyOptional({ example: '0901234567', description: 'Chỉ cần khi hồ sơ chủ nhà chưa có SĐT; đã có thì bỏ qua và gửi tới SĐT đã lưu' })
  @IsOptional()
  @IsString()
  phone?: string;
}
