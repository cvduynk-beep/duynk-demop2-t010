import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LayoutType } from '@prisma/client';
import { ZONE_BUILDINGS } from '../../tenant/tenant.mappers';

export const MATCH_LAYOUTS = ['Studio', '1PN', '2PN', '3PN'] as const;
export const MATCH_FLOORS = ['low', 'mid', 'high'] as const;
export const MATCH_FURNISHINGS = ['full', 'basic', 'empty'] as const;
export const MATCH_ZONES = Object.keys(ZONE_BUILDINGS);
export const MATCH_LIMIT_MAX = 100;

export class MatchmakerRequestDto {
  @ApiPropertyOptional({
    example: 10000000,
    description: 'Ngân sách trần All-in tối đa (VNĐ/tháng). Bỏ trống = không lọc theo ngân sách (vẫn xếp hạng như thường).',
  })
  @IsOptional()
  @IsNumber()
  @Min(3000000)
  maxAllInBudget?: number;

  @ApiPropertyOptional({ enum: LayoutType, description: 'Loại căn hộ mong muốn (enum DB)' })
  @IsOptional()
  @IsEnum(LayoutType)
  preferredLayout?: LayoutType;

  @ApiPropertyOptional({ enum: MATCH_LAYOUTS, isArray: true, description: 'Nhóm layout (2PN gồm cả 2PN1WC và 2PN2WC)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(MATCH_LAYOUTS, { each: true })
  layouts?: (typeof MATCH_LAYOUTS)[number][];

  @ApiPropertyOptional({ enum: MATCH_ZONES, isArray: true, description: 'Phân khu (bị bỏ qua khi có `buildings`)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(MATCH_ZONES, { each: true })
  zones?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Mã toà (vd S1.02)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  buildings?: string[];

  @ApiPropertyOptional({ enum: MATCH_FLOORS, description: 'Dải tầng: low 1–10, mid 11–20, high 21+' })
  @IsOptional()
  @IsIn(MATCH_FLOORS)
  floor?: (typeof MATCH_FLOORS)[number];

  @ApiPropertyOptional({ enum: MATCH_FURNISHINGS })
  @IsOptional()
  @IsIn(MATCH_FURNISHINGS)
  furnishing?: (typeof MATCH_FURNISHINGS)[number];

  @ApiPropertyOptional({ type: [String], description: 'Đồ dùng bắt buộc có (ac, fridge, washer…)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  items?: string[];

  @ApiPropertyOptional({ description: 'Chỉ căn cho nuôi thú cưng' })
  @IsOptional()
  @IsBoolean()
  pets?: boolean;

  @ApiProperty({ default: 1, description: 'Số lượng xe máy' })
  @IsNumber()
  motorbikes: number = 1;

  @ApiProperty({ default: 0, description: 'Số lượng ô tô' })
  @IsNumber()
  cars: number = 0;

  @ApiProperty({ default: 2, description: 'Số lượng người ở' })
  @IsNumber()
  occupants: number = 2;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: MATCH_LIMIT_MAX, description: 'Số căn tối đa trả về (mặc định 3)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MATCH_LIMIT_MAX)
  limit?: number;
}
