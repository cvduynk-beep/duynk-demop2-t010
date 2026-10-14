"use client";

import { Clock, Flame, Lock, Sparkles } from "lucide-react";
import { isBargain, savingsPct } from "@/lib/pricing/cost";
import { HOT_THRESHOLD, type Unit } from "@/lib/units";

type BadgeUnit = Pick<Unit, "baseStatus" | "interest24h" | "rent" | "marketAvg"> & { activeViewingAt?: string | null };

/**
 * Huy hiệu động của căn: Đang giữ chỗ · Đã cho thuê · Căn hời phân khu (≥10% dưới giá TB) · FOMO "khách đang xem"
 * (ca xem đang diễn ra hôm nay) hoặc HOT (≥3 lượt quan tâm 24h). Mọi số liệu đến thẳng từ backend.
 */
export function UnitBadges({ unit }: { unit: BadgeUnit }) {
  const status = unit.baseStatus;
  const viewingAt = unit.activeViewingAt ? new Date(unit.activeViewingAt) : null;
  const viewingLabel =
    viewingAt && !isNaN(viewingAt.getTime())
      ? `${String(viewingAt.getHours()).padStart(2, "0")}:${String(viewingAt.getMinutes()).padStart(2, "0")}`
      : null;

  return (
    <>
      {status === "holding" && (
        <span className="badge badge-ink">
          <Lock size={12} /> Đang giữ căn
        </span>
      )}
      {status === "rented" && <span className="badge badge-ink">Đã cho thuê</span>}
      {status === "available" && isBargain(unit) && (
        <span className="badge badge-amber">
          <Sparkles size={12} /> Căn hời −{savingsPct(unit)}%
        </span>
      )}
      {status === "available" && viewingLabel && (
        <span className="badge badge-coral">
          <Clock size={12} /> Đang có khách xem lúc {viewingLabel}
        </span>
      )}
      {status === "available" && !viewingLabel && unit.interest24h >= HOT_THRESHOLD && (
        <span className="badge badge-coral">
          <Flame size={12} /> HOT · {unit.interest24h} người đang xem
        </span>
      )}
    </>
  );
}
