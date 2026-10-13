import { BadRequestException, Injectable } from '@nestjs/common';
import { MandateStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { consignmentStage, readConsignmentMeta } from '../landlord/landlord.mappers';
import { AdminContractRegistryService } from './admin-contract-registry.service';
import { AdminDispatchService } from './admin-dispatch.service';

export const ACTIVITY_DEFAULT_LIMIT = 20;
export const ACTIVITY_MAX_LIMIT = 50;

/** Một dòng sự kiện cho dashboard — CHỈ siêu dữ liệu; KHÔNG trả oldValue/newValue/IP/user-agent (có thể chứa PII). */
export interface ActivityItem {
  id: string;
  actionType: string;
  entityName: string;
  entityId: string;
  actorRole: string;
  actorName: string | null;
  createdAt: string;
}

const encodeCursor = (createdAt: Date, id: string) => Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');

function decodeCursor(raw: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException({ code: 'invalid_cursor', message: 'Con trỏ phân trang không hợp lệ.', errors: { before: 'Không hợp lệ.' } });
  }
  return { createdAt, id };
}

export function parseActivityLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return ACTIVITY_DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > ACTIVITY_MAX_LIMIT) {
    const message = `limit phải là số nguyên từ 1 đến ${ACTIVITY_MAX_LIMIT}.`;
    throw new BadRequestException({ code: 'invalid_request', message, errors: { limit: message } });
  }
  return n;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: AdminDispatchService,
    private readonly registry: AdminContractRegistryService,
  ) {}

  /** Số việc Admin cần xử lý — ảnh chụp hiện tại, đếm phía server (không tải danh sách về client). */
  async getWorkItems(now: Date = new Date()) {
    const [sla, pendingMandates, mandatesExiting, registryRows] = await Promise.all([
      this.dispatch.getSlaSummary(now),
      this.prisma.exclusiveMandate.findMany({
        where: { status: MandateStatus.PENDING_INSPECTION, signedAt: { not: null } },
        select: { status: true, signedAt: true, doorAccessConfig: true },
      }),
      this.prisma.exclusiveMandate.count({ where: { status: MandateStatus.EXIT_REQUESTED } }),
      this.registry.list(now),
    ]);

    // Hồ sơ ký gửi đã ký, chưa có Host thẩm định nhận (`awaiting_host`) ⇒ Admin duyệt & phân Host;
    // quá hạn thẩm định (SLA 2h, `inspectDueAt`) khi vẫn còn ở awaiting_host/inspecting.
    let awaitingHost = 0;
    let overdue = 0;
    let total = 0; // số hồ sơ KHÔNG trùng cần Admin để mắt (chờ phân Host và/hoặc quá hạn) — dùng cho badge menu
    for (const m of pendingMandates as any[]) {
      const stage = consignmentStage(m);
      const due = readConsignmentMeta(m.doorAccessConfig)?.inspectDueAt;
      const waiting = stage === 'awaiting_host';
      const late = (waiting || stage === 'inspecting') && !!due && Date.parse(due) < now.getTime();
      if (waiting) awaitingHost += 1;
      if (late) overdue += 1;
      if (waiting || late) total += 1;
    }

    const flagged = registryRows.filter((r) => r.needsAction);
    const byKind: Record<string, number> = {};
    for (const r of flagged) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

    return {
      generatedAt: now.toISOString(),
      dispatch: sla.actionable,
      consignments: { awaitingHost, overdue, total },
      mandatesExiting,
      contracts: { needsAction: flagged.length, byKind },
    };
  }

  /** Dòng sự kiện mới nhất từ audit_logs, phân trang theo con trỏ (createdAt, id) giảm dần. */
  async getActivity(limit: number, before?: string): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
    const cursor = before ? decodeCursor(before) : null;
    const rows: any[] = await this.prisma.auditLog.findMany({
      where: cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        actionType: true,
        entityName: true,
        entityId: true,
        actorRole: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        actionType: r.actionType,
        entityName: r.entityName,
        entityId: r.entityId,
        actorRole: r.actorRole,
        actorName: r.actor?.fullName ?? null,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(new Date(last.createdAt), last.id) : null,
    };
  }
}
