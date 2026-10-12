import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { LayoutType } from '@prisma/client';

export class MatchmakerRequestDto {
  @ApiProperty({ example: 10000000, description: 'Ngân sách trần All-in tối đa chấp nhận được (VNĐ/tháng)' })
  @IsNumber()
  @Min(3000000)
  maxAllInBudget: number;

  @ApiPropertyOptional({ enum: LayoutType, description: 'Loại căn hộ mong muốn' })
  @IsOptional()
  @IsEnum(LayoutType)
  preferredLayout?: LayoutType;

  @ApiPropertyOptional({ default: 1, description: 'Số lượng xe máy' })
  @IsOptional()
  @IsNumber()
  motorbikes?: number = 1;

  @ApiPropertyOptional({ default: 0, description: 'Số lượng ô tô' })
  @IsOptional()
  @IsNumber()
  cars?: number = 0;

  @ApiPropertyOptional({ default: 2, description: 'Số lượng người ở' })
  @IsOptional()
  @IsNumber()
  occupants?: number = 2;
}
