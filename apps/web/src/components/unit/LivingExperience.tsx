"use client";

import { Building2, Bus, Car, Compass, GraduationCap, Layers, Sparkles } from "lucide-react";
import type { Unit } from "@/lib/mock/units";
import type { CriteriaState } from "@/lib/mock/types";
import { getUnitLivingInsights } from "@/lib/property/livingIntelligence";
import styles from "./LivingExperience.module.css";

interface LivingExperienceProps {
  unit: Unit;
  criteria?: CriteriaState;
}

export function LivingExperience({ unit, criteria }: LivingExperienceProps) {
  const insights = getUnitLivingInsights(unit, criteria);

  // Rút gọn text gửi xe
  const motoShort = insights.commute.parking.motorbike.replace(/ tòa nhà/g, "").replace(/ tòa/g, "");
  const carShort = insights.commute.parking.car.replace(/ tòa nhà/g, "").replace(/ tòa/g, "");

  // Điểm sáng không gian cô đọng
  const spaceHighlight = insights.layoutInsight.plusOneHighlight || insights.layoutInsight.title;
  const floorHighlight = insights.floorInsight.title.replace(`Tầng ${unit.floor} `, "");
  const dirHighlight = insights.directionInsight.title.replace(`Ban công hướng ${unit.direction} `, "");

  return (
    <div className={styles.wrap} aria-label="Khoảng cách di chuyển và đặc điểm căn hộ">
      {/* ─── Lưới 4 thẻ di chuyển cốt lõi (Gọn gàng, đối xứng) ─── */}
      <div className={styles.grid4}>
        {/* ĐH VinUni */}
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <GraduationCap size={15} className={styles.icon} />
            <span className={styles.label}>ĐH VinUni</span>
          </div>
          <div className={styles.val}>~{insights.commute.vinUni.distanceM}m</div>
          <div className={styles.sub}>
            {insights.commute.vinUni.bikeMin}p xe đạp · {insights.commute.vinUni.walkMin}p đi bộ
          </div>
        </div>

        {/* TechnoPark */}
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <Building2 size={15} className={styles.icon} />
            <span className={styles.label}>TechnoPark</span>
          </div>
          <div className={styles.val}>~{insights.commute.technoPark.distanceM}m</div>
          <div className={styles.sub}>
            {insights.commute.technoPark.bikeMin}p xe · {insights.commute.technoPark.walkMin || 8}p đi bộ
          </div>
        </div>

        {/* Trạm VinBus */}
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <Bus size={15} className={styles.icon} />
            <span className={styles.label}>VinBus đón sảnh</span>
          </div>
          <div className={styles.val}>Cách {insights.commute.vinBus.distanceM}m</div>
          <div className={styles.sub}>
            Tuyến {insights.commute.vinBus.routes.slice(0, 2).join(", ")} nội khu
          </div>
        </div>

        {/* Chỗ để xe */}
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <Car size={15} className={styles.icon} />
            <span className={styles.label}>Gửi xe</span>
          </div>
          <div className={styles.val}>{motoShort}</div>
          <div className={styles.sub}>Ô tô: {carShort}</div>
        </div>
      </div>

      {/* ─── Lưới 3 thẻ điểm sáng căn hộ (Súc tích, không văn vở) ─── */}
      <div className={styles.grid3}>
        <div className={styles.featureCard}>
          <div className={styles.cardTop}>
            <Sparkles size={15} className={styles.icon} />
            <span className={styles.label}>{insights.layoutInsight.badge}</span>
          </div>
          <div className={styles.featureTitle}>{spaceHighlight}</div>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.cardTop}>
            <Layers size={15} className={styles.icon} />
            <span className={styles.label}>Tầng {unit.floor}</span>
          </div>
          <div className={styles.featureTitle}>{floorHighlight}</div>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.cardTop}>
            <Compass size={15} className={styles.icon} />
            <span className={styles.label}>Hướng {unit.direction}</span>
          </div>
          <div className={styles.featureTitle}>{dirHighlight}</div>
        </div>
      </div>
    </div>
  );
}
