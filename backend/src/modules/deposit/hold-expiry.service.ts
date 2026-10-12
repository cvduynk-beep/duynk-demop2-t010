import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DepositStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DepositService } from './deposit.service';

export const DEFAULT_HOLD_SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Hết hạn giữ chỗ (legal/02 Điều 6.1): cọc `PAID_HOLDING` quá `expiresAt` ⇒ `FORFEITED`, căn `HOLDING` ⇒ `AVAILABLE`.
 * `DepositService.expireIfDue` chỉ chạy khi có thao tác trên đúng căn đó, nên căn không ai đụng tới sẽ bị khoá mãi.
 * Dịch vụ này quét định kỳ ở nền và cho các màn đọc (chủ nhà) gọi trước khi tính số để không hiển thị trạng thái cũ.
 */
@Injectable()
export class HoldExpiryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HoldExpiryService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deposits: DepositService,
  ) {}

  onApplicationBootstrap() {
    const ms = Number(process.env.HOLD_EXPIRY_SWEEP_INTERVAL_MS ?? DEFAULT_HOLD_SWEEP_INTERVAL_MS);
    if (process.env.NODE_ENV === 'test' || !Number.isFinite(ms) || ms <= 0) return;
    this.timer = setInterval(() => void this.backgroundSweep(), ms);
    this.timer.unref();
    void this.backgroundSweep();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async backgroundSweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const n = await this.sweep();
      if (n > 0) this.logger.log(`[HOLD] Hết hạn giữ chỗ ${n} căn`);
    } catch (err) {
      this.logger.warn(`Quét hết hạn giữ chỗ lỗi: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** Xử lý mọi căn có cọc quá hạn (lọc theo chủ nhà nếu truyền). Trả số căn đã xử lý. Mỗi căn một transaction riêng. */
  async sweep(filter: { landlordId?: string } = {}, now = new Date()): Promise<number> {
    const due = await this.prisma.holdingDeposit.findMany({
      where: {
        paymentStatus: { in: [DepositStatus.PAID_HOLDING, DepositStatus.UNC_PENDING_REVIEW] },
        expiresAt: { lte: now },
        ...(filter.landlordId ? { unit: { landlordId: filter.landlordId } } : {}),
      },
      select: { unitId: true },
      distinct: ['unitId'],
    });
    let done = 0;
    for (const { unitId } of due) {
      try {
        await this.prisma.$transaction((tx) => this.deposits.expireIfDue(unitId, tx));
        done += 1;
      } catch (err) {
        this.logger.warn(`Không hết hạn được giữ chỗ căn ${unitId}: ${(err as Error).message}`);
      }
    }
    return done;
  }
}
