"use client";

import Image from "next/image";
import { BadgeCheck, ImageOff } from "lucide-react";
import { unitPhoto } from "@/lib/units";
import styles from "./VerifiedPhoto.module.css";

/** Tối thiểu cần để hiện ảnh thật của một căn: mã căn, danh sách URL ảnh (API) và mốc xác minh. */
export interface PhotoUnit {
  id?: string;
  code: string;
  photos?: string[];
  verifiedAt?: string | null;
}

interface VerifiedPhotoProps {
  unit: PhotoUnit;
  index?: number;
  sizes: string;
  priority?: boolean;
  /** Hiện dấu xác minh đầy đủ (mã căn + thời điểm chụp). */
  stamp?: "full" | "compact" | "none";
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ảnh thật của căn (URL từ backend), kèm dấu Verified có timestamp thật (chống tin mồi, chống môi giới copy ảnh).
 * Căn chưa có ảnh ⇒ ô "Chưa có ảnh", tuyệt đối không mượn ảnh của căn khác.
 */
export function VerifiedPhoto({ unit, index = 1, sizes, priority, stamp = "compact", className, style }: VerifiedPhotoProps) {
  const photo = unitPhoto({ id: unit.id ?? unit.code, photos: unit.photos }, index);
  const verifiedAt =
    unit.verifiedAt && Number.isFinite(Date.parse(unit.verifiedAt))
      ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(unit.verifiedAt))
      : null;

  return (
    <div className={`${styles.frame} ${className ?? ""}`} style={style}>
      {photo ? (
        <Image src={photo} alt={`Căn ${unit.code}, ảnh ${index}`} fill sizes={sizes} priority={priority} className={styles.img} />
      ) : (
        <div className={styles.noPhoto}>
          <ImageOff size={22} />
          <span>Chưa có ảnh trong hệ thống</span>
        </div>
      )}
      {photo && verifiedAt && stamp !== "none" && (
        <span className={styles.stamp}>
          <BadgeCheck size={13} />
          {stamp === "full" ? (
            <>
              <b>Verified</b> {verifiedAt} · {unit.code}
            </>
          ) : (
            <>Đã xác minh {verifiedAt}</>
          )}
        </span>
      )}
    </div>
  );
}
