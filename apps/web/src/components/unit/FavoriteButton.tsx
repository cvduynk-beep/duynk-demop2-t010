"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/lib/tenant/favorites";
import styles from "./UnitCard.module.css";

/**
 * Lưu / bỏ lưu căn vào tài khoản khách thuê (`PUT|DELETE /me/favorites/:code`, lưu trong DB). Khách chưa đăng nhập
 * bấm tim ⇒ chuyển sang đăng nhập (không lưu tạm vào trình duyệt).
 */
export function FavoriteButton({ unitCode, variant = "overlay" }: { unitCode: string; variant?: "overlay" | "plain" }) {
  const { isSaved, toggle, busy } = useFavorites();
  const saved = isSaved(unitCode);
  return (
    <button
      type="button"
      className={variant === "overlay" ? styles.fav : "icon-btn"}
      aria-pressed={saved}
      aria-label={saved ? "Bỏ khỏi danh sách đã lưu" : "Lưu căn này"}
      disabled={busy === unitCode}
      onClick={() => void toggle(unitCode)}
    >
      <Heart size={variant === "overlay" ? 18 : 20} fill={saved ? "currentColor" : "none"} className={saved ? styles.saved : ""} />
    </button>
  );
}
