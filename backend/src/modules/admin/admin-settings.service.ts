import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { holdingDepositAmount } from '../deposit/deposit-amount';
import { clampHoldHours, HOLD_HOURS_DEFAULT, HOLD_HOURS_KEY, HOLD_HOURS_MAX, HOLD_HOURS_MIN } from '../deposit/hold-policy';
import type { AdminActor } from './admin-fee.service';

export const HOLD_POLICY_ACTION = 'HOLD_POLICY_UPDATED';
/** Cùng `actionType` mà AdminInventoryService ghi khi đổi giờ riêng một căn — gộp vào lịch sử. */
export const UNIT_HOLD_ACTION = 'UNIT_HOLD_HOURS_UPDATED';
export const REASON_MIN = 5;
export const REASON_MAX = 300;
export const HISTORY_LIMIT = 10;
/** `version` khi chưa có dòng `fee_configs` nào (đang dùng mặc định 48 giờ). */
export const DEFAULT_VERSION = 'default';

export interface HoldPolicyChange {
  at: string;
  actorName: string | null;
  scope: 'default' | 'unit';
  unitCode: string | null;
  from: number | null;
  to: number | null;
  reason: string | null;
}

export interface HoldPolicyView {
  defaultHours: number;
  minHours: number;
  maxHours: number;
  /** true = chưa ai lưu, đang dùng mặc định cấu hình 48 giờ. */
  isDefault: boolean;
  /** Gửi lại khi lưu; lệch ⇒ 409 (người khác vừa đổi). */
  version: string;
  updatedAt: string | null;
  updatedBy: { id: string; name: string | null } | null;
  /** Tiền cọc giữ chỗ — ràng buộc cứng (AGENTS), chỉ hiển thị. */
  holdingDepositAmount: number;
  history: HoldPolicyChange[];
}

const invalid = (errors: Record<string, string>) =>
  new BadRequestException({ code: 'invalid_request', message: Object.values(errors)[0], errors });

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * `/admin/settings/hold-policy`: mặc định toàn sàn của thời gian giữ chỗ (`fee_configs.hold_hours_default`).
 * Đọc/ghi đúng khoá mà deposit/hold-policy dùng cho mọi luồng cọc ⇒ lưu xong là cọc tạo SAU đó dùng giá trị mới;
 * cọc đã tạo / đang giữ giữ nguyên số giờ đã chốt.
 */
@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHoldPolicy(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<HoldPolicyView> {
    const row = await db.feeConfig.findUnique({ where: { configKey: HOLD_HOURS_KEY } });
    const [updater, history] = await Promise.all([
      row ? db.profile.findUnique({ where: { id: row.updatedBy }, select: { id: true, fullName: true } }) : null,
      this.history(db),
    ]);
    return {
      defaultHours: clampHoldHours(row ? Number(row.paramValue) : HOLD_HOURS_DEFAULT),
      minHours: HOLD_HOURS_MIN,
      maxHours: HOLD_HOURS_MAX,
      isDefault: !row,
      version: row ? row.updatedAt.toISOString() : DEFAULT_VERSION,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      updatedBy: row ? { id: row.updatedBy, name: updater?.fullName ?? null } : null,
      holdingDepositAmount: holdingDepositAmount(),
      history,
    };
  }

  /**
   * Lưu mặc định toàn sàn. Validate theo field; ghi có điều kiện theo `version` (= `updated_at`) trong transaction cùng
   * audit — lệch version / hai admin lưu cùng lúc ⇒ 409 `hold_policy_conflict` kèm giá trị mới nhất.
   */
  async updateHoldPolicy(dto: { defaultHours?: unknown; reason?: unknown; version?: unknown }, actor: AdminActor) {
    const errors: Record<string, string> = {};
    const hours = dto.defaultHours;
    if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < HOLD_HOURS_MIN || hours > HOLD_HOURS_MAX) {
      errors.defaultHours = `Thời gian giữ chỗ phải là số giờ nguyên từ ${HOLD_HOURS_MIN} đến ${HOLD_HOURS_MAX}.`;
    }
    const reason = typeof dto.reason === 'string' ? dto.reason.trim().replace(/\s+/g, ' ') : '';
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      errors.reason = `Lý do phải từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`;
    }
    if (typeof dto.version !== 'string' || !dto.version) errors.version = 'Thiếu phiên bản dữ liệu, tải lại trang rồi thử lại.';
    if (Object.keys(errors).length) throw invalid(errors);
    const next = hours as number;
    const version = dto.version as string;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.feeConfig.findUnique({ where: { configKey: HOLD_HOURS_KEY } });
        const current = row ? row.updatedAt.toISOString() : DEFAULT_VERSION;
        if (current !== version) throw await this.conflict(tx);
        const before = clampHoldHours(row ? Number(row.paramValue) : HOLD_HOURS_DEFAULT);
        if (before === next) return { ...(await this.getHoldPolicy(tx)), changed: false };

        if (row) {
          // Ghi có điều kiện: chỉ đúng phiên bản vừa đọc mới được đổi (CAS trên updated_at). So theo khoảng 1 ms vì
          // Postgres giữ tới micro giây còn Date của JS chỉ tới mili giây (dòng tạo bằng SQL now() sẽ không bằng tuyệt đối).
          const at = row.updatedAt.getTime();
          const res = await tx.feeConfig.updateMany({
            where: { configKey: HOLD_HOURS_KEY, updatedAt: { gte: new Date(at), lt: new Date(at + 1) } },
            // Đặt rõ updated_at > phiên bản cũ (kể cả cùng mili giây) để version luôn đổi sau mỗi lần lưu.
            data: { paramValue: next, updatedBy: actor.id, updatedAt: new Date(Math.max(Date.now(), at + 1)) },
          });
          if (res.count !== 1) throw await this.conflict(tx);
        } else {
          // Chưa có dòng: hai admin cùng tạo ⇒ unique(config_key) chặn người sau (P2002 ⇒ 409 ở dưới).
          await tx.feeConfig.create({ data: { configKey: HOLD_HOURS_KEY, paramValue: next, paramUnit: 'giờ', updatedBy: actor.id } });
        }
        // Audit trong CÙNG transaction: không ghi được vết thì không đổi chính sách.
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            actionType: HOLD_POLICY_ACTION,
            entityName: 'fee_configs',
            entityId: HOLD_HOURS_KEY,
            oldValue: { defaultHours: before, isDefault: !row },
            newValue: { defaultHours: next, reason },
          },
        });
        return { ...(await this.getHoldPolicy(tx)), changed: true };
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') throw await this.conflict(this.prisma);
      throw err;
    }
  }

  private async conflict(db: Prisma.TransactionClient | PrismaService) {
    const latest = await this.getHoldPolicy(db);
    return new ConflictException({
      code: 'hold_policy_conflict',
      message: 'Chính sách giữ chỗ vừa được quản trị viên khác thay đổi. Xem giá trị mới nhất rồi lưu lại.',
      errors: { latest },
    });
  }

  /** 10 thay đổi gần nhất: mặc định toàn sàn + giờ riêng từng căn, mới nhất trước. */
  private async history(db: Prisma.TransactionClient | PrismaService): Promise<HoldPolicyChange[]> {
    const logs = await db.auditLog.findMany({
      where: { actionType: { in: [HOLD_POLICY_ACTION, UNIT_HOLD_ACTION] } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: { actor: { select: { fullName: true } } },
    });
    const unitIds = [...new Set(logs.filter((l) => l.actionType === UNIT_HOLD_ACTION).map((l) => l.entityId))];
    const units = unitIds.length
      ? await db.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, unitCode: true } })
      : [];
    const codeOf = new Map(units.map((u) => [u.id, u.unitCode]));
    return logs.map((l) => {
      const oldV = (l.oldValue ?? {}) as Record<string, unknown>;
      const newV = (l.newValue ?? {}) as Record<string, unknown>;
      const isUnit = l.actionType === UNIT_HOLD_ACTION;
      return {
        at: l.createdAt.toISOString(),
        actorName: l.actor?.fullName ?? null,
        scope: isUnit ? 'unit' : 'default',
        unitCode: isUnit ? codeOf.get(l.entityId) ?? null : null,
        from: num(isUnit ? oldV.holdHours : oldV.defaultHours),
        to: num(isUnit ? newV.holdHours : newV.defaultHours),
        reason: typeof newV.reason === 'string' ? newV.reason : null,
      };
    });
  }
}
