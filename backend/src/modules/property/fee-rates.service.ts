import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Đơn giá dùng để tính All-in (phí gửi xe, định mức điện nước). Quản trị viên chỉnh trong bảng `fee_configs`. */
export interface FeeRates {
  motorbike: number;
  car: number;
  utilityPerPerson: number;
}

/**
 * Giá trị dự phòng khi `fee_configs` thiếu khoá hoặc DB lỗi: đúng bằng giá trị seed hiện tại (đo 2026-10-12).
 * Có dự phòng để luồng tìm căn không gãy; mỗi lần dùng dự phòng đều ghi cảnh báo vào log.
 */
export const DEFAULT_FEE_RATES: FeeRates = { motorbike: 150_000, car: 1_250_000, utilityPerPerson: 300_000 };

const KEYS: Record<keyof FeeRates, string> = {
  motorbike: 'parking_fee_motorbike',
  car: 'parking_fee_car',
  utilityPerPerson: 'utility_per_person',
};
export const FEE_RATES_CACHE_MS = 60_000;

/** Nguồn DUY NHẤT của đơn giá All-in phía backend (matchmaker, chi tiết căn) — đọc `fee_configs`, cache 60s. */
@Injectable()
export class FeeRatesService {
  private readonly logger = new Logger(FeeRatesService.name);
  private cache: { at: number; rates: FeeRates } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<FeeRates> {
    if (this.cache && Date.now() - this.cache.at < FEE_RATES_CACHE_MS) return this.cache.rates;
    let rows: { configKey: string; paramValue: unknown }[] = [];
    try {
      rows = await this.prisma.feeConfig.findMany({
        where: { configKey: { in: Object.values(KEYS) } },
        select: { configKey: true, paramValue: true },
      });
    } catch (err) {
      this.logger.warn(`Không đọc được fee_configs, dùng biểu phí dự phòng: ${(err as Error)?.message ?? err}`);
      return DEFAULT_FEE_RATES; // không cache: lần sau thử đọc DB lại
    }
    const byKey = new Map(rows.map((r) => [r.configKey, Number(r.paramValue)]));
    const rates = { ...DEFAULT_FEE_RATES };
    const missing: string[] = [];
    for (const [field, key] of Object.entries(KEYS) as [keyof FeeRates, string][]) {
      const v = byKey.get(key);
      if (v != null && Number.isFinite(v) && v >= 0) rates[field] = v;
      else missing.push(key);
    }
    if (missing.length) this.logger.warn(`fee_configs thiếu ${missing.join(', ')} — dùng giá trị dự phòng cho các khoá này.`);
    this.cache = { at: Date.now(), rates };
    return rates;
  }

  /** Dùng sau khi Admin sửa biểu phí để áp ngay, không chờ hết cache. */
  invalidate(): void {
    this.cache = null;
  }
}
