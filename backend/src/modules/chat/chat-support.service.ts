import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatHandoffCategory } from './chat.types';
import { redactPii } from './vinny-guard';

export const HANDOFF_CATEGORIES: ChatHandoffCategory[] = ['complaint', 'deposit_dispute', 'payment', 'contract', 'damage', 'human_request'];
export const SUPPORT_SLA_TEXT = 'khoảng 2 giờ làm việc';
const SUMMARY_MAX = 1000;
const LIST_LIMIT = 50;

export interface SupportRequestView {
  id: string;
  category: string;
  summary: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  requester: { id: string; name: string | null };
  handler: { id: string; name: string | null } | null;
  note: string | null;
  /** Cùng giá trị gửi lại khi đổi trạng thái; lệch ⇒ 409. */
  version: string;
}

const STATUS_WEB: Record<SupportRequestStatus, SupportRequestView['status']> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
};
const STATUS_DB: Record<string, SupportRequestStatus> = { open: 'OPEN', in_progress: 'IN_PROGRESS', resolved: 'RESOLVED' };

/** Tóm tắt cho nhân viên: tối đa 4 câu gần nhất của KHÁCH (không lấy câu bot), đã che PII. */
export function buildSummary(category: ChatHandoffCategory, userTexts: string[]): string {
  const lines = userTexts
    .map((t) => redactPii(t.replace(/\s+/g, ' ').trim()).slice(0, 240))
    .filter(Boolean)
    .slice(-4);
  return `[${category}] ${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '(khách chưa mô tả)'}`.slice(0, SUMMARY_MAX);
}

/**
 * Chuyển người thật + phản hồi 👍/👎 của Vinny. Ghi DB thật (support_requests, chat_feedback); KHÔNG lưu nội dung
 * hội thoại, chỉ tóm tắt đã che PII. Yêu cầu hỗ trợ cần khách `tenant` đăng nhập (liên hệ lại qua SĐT đã xác thực).
 */
@Injectable()
export class ChatSupportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent: hội thoại đã có yêu cầu đang mở ⇒ trả lại yêu cầu đó, không tạo trùng. */
  async createHandoff(profileId: string, dto: { conversationId: string; category: ChatHandoffCategory; messages?: string[] }) {
    if (!HANDOFF_CATEGORIES.includes(dto.category)) throw new BadRequestException({ code: 'invalid_request', message: 'Loại yêu cầu không hợp lệ.' });
    const existing = await this.prisma.supportRequest.findFirst({
      where: { profileId, conversationId: dto.conversationId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    if (existing) return { id: existing.id, status: STATUS_WEB[existing.status], created: false, sla: SUPPORT_SLA_TEXT };
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportRequest.create({
        data: { profileId, conversationId: dto.conversationId, category: dto.category, summary: buildSummary(dto.category, dto.messages ?? []) },
      });
      await tx.auditLog.create({
        data: {
          actorId: profileId,
          actorRole: 'tenant',
          actionType: 'SUPPORT_REQUEST_CREATED',
          entityName: 'support_requests',
          entityId: created.id,
          newValue: { category: dto.category, source: 'vinny' },
        },
      });
      return created;
    });
    return { id: row.id, status: STATUS_WEB[row.status], created: true, sla: SUPPORT_SLA_TEXT };
  }

  /** Một phản hồi mỗi lượt (`messageId` unique); gửi lại ⇒ cập nhật. Không gắn danh tính, không lưu nội dung. */
  async saveFeedback(dto: { messageId: string; conversationId: string; rating: 'up' | 'down'; reason?: string; promptVersion: string; kind?: string }) {
    const reason = dto.reason ? redactPii(dto.reason.replace(/\s+/g, ' ').trim()).slice(0, 200) : null;
    const data = { conversationId: dto.conversationId, rating: dto.rating, reason, promptVersion: dto.promptVersion, kind: dto.kind ?? null };
    const row = await this.prisma.chatFeedback.upsert({
      where: { messageId: dto.messageId },
      create: { messageId: dto.messageId, ...data },
      update: data,
    });
    return { messageId: row.messageId, rating: row.rating };
  }

  async list(status?: string): Promise<SupportRequestView[]> {
    const where: Prisma.SupportRequestWhereInput = status && STATUS_DB[status] ? { status: STATUS_DB[status] } : {};
    const rows = await this.prisma.supportRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: LIST_LIMIT,
      include: { requester: { select: { id: true, fullName: true } }, handler: { select: { id: true, fullName: true } } },
    });
    return rows.map((r) => this.view(r));
  }

  /** Đổi trạng thái có điều kiện theo `version` (= updatedAt) + audit trong cùng transaction. */
  async updateStatus(id: string, dto: { status: string; note?: string; version: string }, actor: { id: string; role: string }) {
    const next = STATUS_DB[dto.status];
    if (!next) throw new BadRequestException({ code: 'invalid_request', message: 'Trạng thái không hợp lệ.', errors: { status: 'open | in_progress | resolved' } });
    const note = dto.note ? redactPii(dto.note.trim()).slice(0, 500) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.supportRequest.findUnique({ where: { id } });
      if (!cur) throw new NotFoundException({ code: 'not_found', message: 'Không tìm thấy yêu cầu hỗ trợ.' });
      if (cur.updatedAt.toISOString() !== dto.version) throw new ConflictException({ code: 'support_request_conflict', message: 'Yêu cầu vừa được người khác cập nhật. Tải lại rồi thử lại.' });
      const res = await tx.supportRequest.updateMany({
        where: { id, updatedAt: cur.updatedAt },
        data: { status: next, handledBy: actor.id, note: note ?? cur.note, resolvedAt: next === 'RESOLVED' ? new Date() : null },
      });
      if (res.count !== 1) throw new ConflictException({ code: 'support_request_conflict', message: 'Yêu cầu vừa được người khác cập nhật. Tải lại rồi thử lại.' });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          actionType: 'SUPPORT_REQUEST_STATUS',
          entityName: 'support_requests',
          entityId: id,
          oldValue: { status: STATUS_WEB[cur.status] },
          newValue: { status: dto.status, ...(note ? { note } : {}) },
        },
      });
      const row = await tx.supportRequest.findUnique({
        where: { id },
        include: { requester: { select: { id: true, fullName: true } }, handler: { select: { id: true, fullName: true } } },
      });
      return this.view(row!);
    });
  }

  private view(r: any): SupportRequestView {
    return {
      id: r.id,
      category: r.category,
      summary: r.summary,
      status: STATUS_WEB[r.status as SupportRequestStatus],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      requester: { id: r.requester?.id ?? r.profileId, name: r.requester?.fullName ?? null },
      handler: r.handler ? { id: r.handler.id, name: r.handler.fullName ?? null } : null,
      note: r.note ?? null,
      version: r.updatedAt.toISOString(),
    };
  }
}
