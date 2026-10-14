"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, ChevronRight, Sparkles, Zap } from "lucide-react";
import { VerifiedPhoto } from "@/components/unit/VerifiedPhoto";
import { isBargain, savingsPct } from "@/lib/pricing/cost";
import { vnd } from "@/lib/format";
import type { CriteriaState } from "@/lib/chat/types";
import { useCatalog } from "@/lib/tenant/catalog";
import { unitAddress, zoneById } from "@/lib/units";
import styles from "./InlineChatUnits.module.css";

interface InlineChatUnitsProps {
  /** Mã căn theo đúng thứ hạng backend trả; FE chỉ tra thông tin hiển thị từ catalog, không sắp lại. */
  unitIds: string[];
  criteria?: CriteriaState;
  onShowResults?: (count: number) => void;
  title?: string;
}

export function InlineChatUnits({ unitIds, onShowResults, title }: InlineChatUnitsProps) {
  const { units: catalog } = useCatalog();
  const units = useMemo(() => {
    const byCode = new Map(catalog.map((u) => [u.code, u]));
    return unitIds.map((id) => byCode.get(id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  }, [catalog, unitIds]);

  if (units.length === 0) return null;


  return (
    <div className={styles.wrapper} aria-label="Băng chuyền căn hộ đề xuất thực tế">
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Sparkles size={13} />
          <span>{title || `Gợi ý thực tế (${units.length} căn)`}</span>
        </div>
        <span className={styles.swipeCue}>
          <span>Vuốt ngang</span>
          <ChevronRight size={12} />
        </span>
      </div>

      <div className={styles.carouselTrack} role="region" aria-label="Danh sách căn hộ vuốt ngang">
        {units.map((unit, idx) => {
          const zone = zoneById(unit.zoneId);
          const bargain = isBargain(unit);
          const pct = savingsPct(unit);

          return (
            <Link
              key={unit.id}
              href={`/units/${unit.id}`}
              className={styles.miniCard}
              title={`Xem chi tiết & đặt lịch căn ${unitAddress(unit)}`}
            >
              <div className={styles.photoWrap}>
                <VerifiedPhoto
                  unit={unit}
                  sizes="210px"
                  stamp="compact"
                  className={styles.photoFrame}
                />

                <div className={styles.badgesOverlay}>
                  <span className={styles.rankBadge}>Top #{idx + 1}</span>
                  {bargain && pct > 0 && (
                    <span className={styles.bargainBadge}>
                      <Zap size={10} /> -{pct}%
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.unitCode}>{unitAddress(unit)}</div>

                <div className={styles.specsLine}>
                  {unit.layoutLabel} · {unit.areaM2}m² · {zone?.name || "Ocean Park"}
                </div>

                <div className={styles.priceRow}>
                  <span className={styles.priceAmount}>{vnd(unit.rent)}</span>
                  <span className={styles.priceUnit}>đ/tháng (thuê)</span>
                </div>

                <div className={styles.priceDetail}>
                  Chưa bao gồm phí quản lý
                </div>

                <div className={styles.cardFooter}>
                  <span>Xem & Đặt lịch</span>
                  <ArrowRight size={11} className={styles.arrowIcon} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {onShowResults && (
        <button
          type="button"
          className={styles.viewAllStrip}
          onClick={() => onShowResults(units.length)}
          aria-label="Xem toàn bộ danh mục rổ hàng"
        >
          <span>Xem tất cả {units.length} căn trên danh mục lọc chi tiết</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
