import Link from "next/link";
import { Bath, BedDouble, Compass, Ruler, Sparkles } from "lucide-react";
import { vnd } from "@/lib/format";
import type { CostBreakdown } from "@/lib/pricing/cost";
import type { UnitWithExtras } from "@/lib/tenant/adapters";
import { unitAddress, zoneById } from "@/lib/units";
import { FavoriteButton } from "./FavoriteButton";
import { UnitBadges } from "./UnitBadges";
import { VerifiedPhoto } from "./VerifiedPhoto";
import styles from "./UnitCard.module.css";

interface UnitCardProps {
  unit: UnitWithExtras;
  cost: CostBreakdown;
  /** "feature" = thẻ lớn có lý do AI chọn; "grid" = thẻ gọn. */
  variant?: "grid" | "feature";
  rank?: number;
  reasons?: string[];
  priority?: boolean;
}

export function UnitCard({ unit, variant = "grid", rank, reasons, priority }: UnitCardProps) {
  const zoneName = unit.zoneName || zoneById(unit.zoneId)?.name || "Phân khu chưa cập nhật";
  const feature = variant === "feature";
  return (
    <article className={`${styles.card} ${feature ? styles.feature : ""}`}>
      <div className={styles.photo}>
        <Link href={`/units/${encodeURIComponent(unit.code)}`} aria-label={`Xem chi tiết căn ${unitAddress(unit)}`} className={styles.photoLink}>
          <VerifiedPhoto
            unit={unit}
            sizes={feature ? "(max-width: 900px) 100vw, 420px" : "(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 340px"}
            priority={priority}
            className={styles.photoFrame}
          />
        </Link>
        <div className={styles.badges}>
          {rank && <span className={`badge badge-plain ${styles.rank}`}>AI chọn #{rank}</span>}
          <UnitBadges unit={unit} />
        </div>
        <FavoriteButton unitCode={unit.code} />
      </div>

      <div className={styles.body}>
        <div>
          <h3 className={styles.addr}>{unitAddress(unit)}</h3>
          <p className={`muted small ${styles.zone}`}>
            {zoneName}
            {unit.view && unit.view !== "Chưa cập nhật" ? ` · ${unit.view}` : ""}
          </p>
        </div>

        <ul className={styles.stats}>
          <li>
            <Ruler size={15} /> {unit.areaM2} m²
          </li>
          <li>
            <BedDouble size={15} /> {unit.layoutLabel}
          </li>
          <li>
            <Bath size={15} /> {unit.bathrooms} WC
          </li>
          <li>
            <Compass size={15} /> {unit.direction}
          </li>
        </ul>

        <div className={styles.price}>
          <div>
            <span className={`num ${styles.total}`}>{vnd(unit.rent)}</span>
            <span className={`muted small ${styles.per}`}>đ/tháng (thuê)</span>
          </div>
          <p className="muted xs">
            Chưa bao gồm phí quản lý
          </p>
        </div>

        {feature && reasons && reasons.length > 0 && (
          <div className={styles.cleanHighlight} title={reasons[0]}>
            <Sparkles size={13} className={styles.highlightIcon} />
            <span className={styles.highlightText}>{reasons[0]}</span>
          </div>
        )}

        <div className={styles.actions}>
          <Link href={`/units/${unit.id}`} className="btn btn-quiet btn-sm">
            Xem chi tiết
          </Link>
          <Link href={`/units/${unit.id}?book=1`} className="btn btn-primary btn-sm">
            Đặt lịch xem
          </Link>
        </div>
      </div>
    </article>
  );
}
