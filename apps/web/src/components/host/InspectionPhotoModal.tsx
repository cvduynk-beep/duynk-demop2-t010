"use client";

import { useEffect } from "react";
import { X, Download, Clock, ShieldCheck, MapPin, Sparkles } from "lucide-react";
import styles from "../consign/Consign.module.css";

interface InspectionPhotoModalProps {
  url: string;
  title: string;
  time?: string;
  aiDetected?: string;
  aiConfidence?: number;
  aiStatus?: "match" | "warning" | "unclear";
  locationTag?: string;
  onClose: () => void;
}

export function InspectionPhotoModal({
  url,
  title,
  time,
  aiDetected,
  aiConfidence,
  aiStatus = "match",
  locationTag = "Vinhomes Ocean Park (Gia Lâm, Hà Nội)",
  onClose,
}: InspectionPhotoModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.photoLightboxOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={styles.photoLightboxModal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.photoLightboxHeader}>
          <div>
            <h4 className={styles.photoLightboxTitle}>{title}</h4>
            {time && (
              <span className={styles.photoLightboxMeta}>
                <Clock size={12} /> Chụp lúc {time}
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.photoLightboxClose}
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.photoLightboxBody}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={title}
            className={styles.photoLightboxImg}
          />
        </div>

        {/* Khối Kiểm soát 3 lớp (3-Tier Verification Architecture) */}
        <div className={styles.photoVerificationBar}>
          <div className={styles.photoVerificationGrid}>
            <div className={styles.photoVerificationItem}>
              <Sparkles size={16} color="var(--brand, #2563eb)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>Lớp 1: AI Vision Object Validation</strong>
                {aiStatus === "match" ? (
                  <span className={`${styles.aiBadgePill} ${styles.aiBadgeMatch}`}>
                    ✓ Khớp: {aiDetected || title} ({aiConfidence ?? 94}%)
                  </span>
                ) : aiStatus === "warning" ? (
                  <span className={`${styles.aiBadgePill} ${styles.aiBadgeWarning}`}>
                    ⚠️ Cảnh báo: {aiDetected || "Chưa rõ"}
                  </span>
                ) : (
                  <span className={`${styles.aiBadgePill} ${styles.aiBadgeUnclear}`}>
                    ⚠️ Ảnh không rõ / Thiếu sáng
                  </span>
                )}
              </div>
            </div>

            <div className={styles.photoVerificationItem}>
              <MapPin size={16} color="var(--lagoon, #0e7490)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>Lớp 2: Metadata & Geofence</strong>
                <span style={{ fontSize: "11.5px", color: "var(--ink-2)", fontWeight: 500 }}>
                  {locationTag}
                </span>
              </div>
            </div>

            <div className={styles.photoVerificationItem}>
              <ShieldCheck size={16} color="var(--ok, #16a34a)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>Lớp 3: Đối soát pháp lý 3 bên</strong>
                <span style={{ fontSize: "11.5px", color: "var(--ok)", fontWeight: 600 }}>
                  Sẵn sàng duyệt Hộ chiếu bàn giao Điều 5
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.photoLightboxFooter}>
          <a
            href={url}
            download={`anh-kiem-dinh-${title.replace(/\s+/g, "_")}.jpg`}
            className={styles.photoLightboxDownload}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} /> Tải ảnh gốc
          </a>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "var(--fs-13)", padding: "6px 14px" }}
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
