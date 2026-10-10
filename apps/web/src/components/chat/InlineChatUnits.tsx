"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, Sparkles, Zap } from "lucide-react";
import { VerifiedPhoto } from "@/components/unit/VerifiedPhoto";
import { allInCost, DEFAULT_HOUSEHOLD, isBargain, savingsPct } from "@/lib/mock/cost";
import { vnd, vndShort } from "@/lib/mock/format";
import { unitAddress, unitById, zoneById, type Unit } from "@/lib/mock/units";
import type { CriteriaState } from "@/lib/mock/types";
import styles from "./InlineChatUnits.module.css";

interface InlineChatUnitsProps {
  unitIds: string[];
  criteria?: CriteriaState;
  onShowResults?: (count: number) => void;
  title?: string;
}

export function InlineChatUnits({ unitIds, criteria, onShowResults, title }: InlineChatUnitsProps) {
  const units = unitIds
    .map((id) => unitById(id))
    .filter((u): u is Unit => Boolean(u));

  if (units.length === 0) return null;

  const household = criteria?.household || DEFAULT_HOUSEHOLD;

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
          const cost = allInCost(unit, household);
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
