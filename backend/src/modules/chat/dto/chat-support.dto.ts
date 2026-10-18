import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { HANDOFF_CATEGORIES } from '../chat-support.service';

const CONV_RE = /^[A-Za-z0-9-]{8,64}$/;

export class ChatFeedbackDto {
  @ApiProperty({ description: '`messageId` của lượt trả lời (POST /chat)' })
  @IsUUID()
  messageId: string;

  @ApiProperty()
  @Matches(CONV_RE)
  conversationId: string;

  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  rating: 'up' | 'down';

  @ApiPropertyOptional({ maxLength: 200, description: 'Lý do ngắn (che SĐT/email/CCCD trước khi lưu)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiProperty({ example: 'v1' })
  @Matches(/^v\d{1,3}$/)
  promptVersion: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['search', 'faq', 'clarify', 'greeting', 'refusal', 'answer', 'handoff'])
  kind?: string;
}

export class ChatHandoffDto {
  @ApiProperty()
  @Matches(CONV_RE)
  conversationId: string;

  @ApiProperty({ enum: HANDOFF_CATEGORIES })
  @IsIn(HANDOFF_CATEGORIES)
  category: (typeof HANDOFF_CATEGORIES)[number];

  @ApiPropertyOptional({ type: [String], description: 'Tối đa 4 câu gần nhất của KHÁCH để dựng tóm tắt (server che PII).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  messages?: string[];
}

export class SupportStatusDto {
  @ApiProperty({ enum: ['open', 'in_progress', 'resolved'] })
  @IsIn(['open', 'in_progress', 'resolved'])
  status: 'open' | 'in_progress' | 'resolved';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: '`version` đọc từ danh sách; lệch ⇒ 409 support_request_conflict' })
  @IsString()
  @MaxLength(40)
  version: string;
}
