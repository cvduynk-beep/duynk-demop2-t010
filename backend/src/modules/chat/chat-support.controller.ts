import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ChatSupportService } from './chat-support.service';
import { ChatFeedbackDto, ChatHandoffDto, SupportStatusDto } from './dto/chat-support.dto';

@ApiTags('Trợ lý AI')
@Controller('chat')
@UseGuards(ThrottlerGuard)
export class ChatSupportController {
  constructor(private readonly support: ChatSupportService) {}

  @Public()
  @Post('feedback')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Phản hồi 👍/👎 cho một lượt trả lời của Vinny (theo messageId + phiên bản prompt; không lưu nội dung)' })
  feedback(@Body() dto: ChatFeedbackDto) {
    return this.support.saveFeedback(dto);
  }

  @Roles('tenant')
  @ApiCookieAuth('session-cookie')
  @Post('handoff')
  @HttpCode(200)
  @Throttle({ default: { ttl: 600_000, limit: 3 } })
  @ApiOperation({
    summary: 'Khách bấm "Gặp nhân viên": tạo yêu cầu hỗ trợ thật (support_requests) kèm tóm tắt đã che PII',
    description: 'Cần đăng nhập tenant (nhân viên liên hệ qua SĐT đã xác thực). Cùng hội thoại đã có yêu cầu đang mở ⇒ trả yêu cầu đó (`created: false`).',
  })
  handoff(@CurrentUser('id') userId: string, @Body() dto: ChatHandoffDto) {
    return this.support.createHandoff(userId, dto);
  }
}

@ApiTags('10. Admin Portal & Biến phí Host')
@ApiCookieAuth('session-cookie')
@Roles('ops_admin')
@Controller('admin/support-requests')
export class AdminSupportController {
  constructor(private readonly support: ChatSupportService) {}

  @Get()
  @ApiOperation({ summary: 'Yêu cầu gặp nhân viên từ Vinny (mở trước, cũ nhất trước; tối đa 50)' })
  list(@Query('status') status?: string) {
    return this.support.list(status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Nhận xử lý / đóng yêu cầu (ghi audit SUPPORT_REQUEST_STATUS, kiểm version)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportStatusDto, @CurrentUser() user: { id: string; role: string }) {
    return this.support.updateStatus(id, dto, { id: user.id, role: user.role ?? 'ops_admin' });
  }
}
