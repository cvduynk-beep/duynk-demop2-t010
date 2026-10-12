import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MATCH_FLOORS, MATCH_FURNISHINGS, MATCH_LAYOUTS, MATCH_ZONES } from '../../matchmaker/dto/matchmaker-request.dto';

/** AGENTS.md lớp 1: tối đa 250 ký tự (chống prompt stuffing). */
export const CHAT_MESSAGE_MAX = 250;

export class ChatHouseholdDto {
  @IsInt()
  @Min(1)
  @Max(10)
  persons: number;

  @IsInt()
  @Min(0)
  @Max(10)
  motorbikes: number;

  @IsInt()
  @Min(0)
  @Max(5)
  cars: number;
}

/** Bộ lọc hiện tại của FE (cùng hình `CriteriaState`); khoá lạ bị ValidationPipe whitelist bỏ đi. */
export class ChatContextDto {
  @ApiPropertyOptional({ description: 'Ngân sách trần All-in (VNĐ/tháng)' })
  @IsOptional()
  @IsNumber()
  @Min(3_000_000)
  @Max(200_000_000)
  budget?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(MATCH_LAYOUTS, { each: true })
  layouts?: (typeof MATCH_LAYOUTS)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(MATCH_ZONES, { each: true })
  zones?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  buildings?: string[];

  @IsOptional()
  @IsIn(MATCH_FLOORS)
  floor?: (typeof MATCH_FLOORS)[number];

  @IsOptional()
  @IsIn(MATCH_FURNISHINGS)
  furnishing?: (typeof MATCH_FURNISHINGS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  items?: string[];

  @IsOptional()
  @IsBoolean()
  pets?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatHouseholdDto)
  household?: ChatHouseholdDto;

  @ApiPropertyOptional({ description: 'Đã có lượt tìm trước đó (để hiểu câu nối tiếp "rẻ hơn nữa")' })
  @IsOptional()
  @IsBoolean()
  searched?: boolean;
}

export class ChatRequestDto {
  @ApiProperty({ example: 'Studio dưới 8 triệu ở Sapphire 1, 1 xe máy', maxLength: CHAT_MESSAGE_MAX })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'message_required' })
  @MaxLength(CHAT_MESSAGE_MAX, { message: 'message_too_long' })
  message: string;

  @ApiPropertyOptional({ description: 'Id hội thoại do server cấp ở lượt đầu; gửi lại để gắn các lượt sau.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  conversationId?: string;

  @ApiPropertyOptional({ type: ChatContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
