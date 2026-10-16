import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ChatService } from './chat.service';
import { ChatResponseData } from './chat.types';
import { ChatRequestDto } from './dto/chat.dto';

@ApiTags('Trợ lý AI')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Public()
  @Post()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  // AGENTS.md lớp 1: 8 request/phút/IP.
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @ApiOperation({
    summary: 'Khung chat trang chủ: danh sách căn từ AI Matchmaker + lời giải thích (Gemini)',
    description:
      'Danh sách/thứ tự/điểm lấy nguyên từ matchmaker; LLM chỉ giải thích và bị kiểm lại. Gemini lỗi ⇒ vẫn trả danh sách thật kèm `degraded: true`; matchmaker lỗi ⇒ chỉ trả chữ, không có danh sách giả.',
  })
  @ApiResponse({ status: 400, description: 'message rỗng / quá 250 ký tự / context sai kiểu' })
  @ApiResponse({ status: 401, description: 'LOGIN_REQUIRED — khách vãng lai hết lượt' })
  @ApiResponse({ status: 429, description: 'rate_limited — quá 8 lượt/phút' })
  async send(@Body() dto: ChatRequestDto, @Req() req: Request): Promise<ChatResponseData> {
    await this.chat.assertQuota(req);
    // Danh tính khách (công cụ my_bookings / my_contracts) lấy từ cookie phiên, không bao giờ từ body.
    return this.chat.chat(dto, await this.chat.tenantUserId(req));
  }
}
