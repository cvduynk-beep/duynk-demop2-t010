"use client";

import { useState } from "react";
import Image from "next/image";
import { fmtDate } from "@/lib/mock/format";
import { unitPhoto, type Unit } from "@/lib/mock/units";
import { BadgeCheck } from "lucide-react";
import styles from "./VerifiedPhoto.module.css";

interface VerifiedPhotoProps {
  unit: Unit;
  index?: number;
  sizes: string;
  priority?: boolean;
  /** Hiện dấu xác minh đầy đủ (mã căn + thời điểm chụp). */
  stamp?: "full" | "compact" | "none";
  className?: string;
  style?: React.CSSProperties;
}

const FALLBACK_PHOTO = "/units/s1-02-05-0502/1.jpg";

/** Ảnh thật của căn, kèm dấu Verified có timestamp (chống tin mồi, chống môi giới copy ảnh). */
export function VerifiedPhoto({ unit, index = 1, sizes, priority, stamp = "compact", className, style }: VerifiedPhotoProps) {
  const [imgSrc, setImgSrc] = useState<string>(() => unitPhoto(unit, index));

  return (
    <div className={`${styles.frame} ${className ?? ""}`} style={style}>
      <Image
        src={imgSrc}
        alt={`Căn ${unit.code}, ảnh ${index}: ${unit.title}`}
        fill
        sizes={sizes}
        priority={priority}
        className={styles.img}
        onError={() => {
          if (imgSrc !== FALLBACK_PHOTO) {
            setImgSrc(FALLBACK_PHOTO);
          }
        }}
      />
      {stamp !== "none" && (
        <span className={styles.stamp}>
          <BadgeCheck size={13} />
          {stamp === "full" ? (
            <>
              <b>Verified</b> {fmtDate(unit.verifiedAt)} 14:20 · {unit.code}
            </>
          ) : (
            <>Đã xác minh {fmtDate(unit.verifiedAt).slice(0, 5)}</>
          )}
        </span>
      )}
    </div>
  );
}
