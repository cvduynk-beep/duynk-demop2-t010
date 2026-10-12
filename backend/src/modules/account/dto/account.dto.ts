import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn An', description: '2–100 ký tự sau khi bỏ khoảng trắng thừa' })
  @IsOptional()
  @IsString()
  fullName?: string;

  /** Không cho sửa: gửi lên ⇒ 400 field_not_editable (khai ở DTO để whitelist không lặng lẽ bỏ đi). */
  @ApiPropertyOptional({ example: '0912345678', description: 'KHÔNG sửa được — gửi lên ⇒ 400 field_not_editable' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'nguyenvanan@example.com', description: 'KHÔNG sửa được — gửi lên ⇒ 400 field_not_editable' })
  @IsOptional()
  @IsString()
  email?: string;
}
