"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UnitCard } from "@/components/unit/UnitCard";
import { allInCost, DEFAULT_HOUSEHOLD } from "@/lib/pricing/cost";
import { useFavorites } from "@/lib/tenant/favorites";
import styles from "./AccountSaved.module.css";

/** Căn không còn trống: vẫn hiện để khách bỏ lưu, kèm nhãn rõ ràng (không hiện như căn đặt lịch được). */
const UNAVAILABLE_LABEL: Record<string, string> = {
  holding: "Đang có khách giữ chỗ",
  rented: "Đã cho thuê",
  unlisted: "Ngừng niêm yết",
  maintenance: "Đang bảo trì",
};

/** Căn đã lưu: `GET /me/favorites` (DB); lưu / bỏ lưu đồng bộ với nút trái tim ở `/units`, `/units/[id]`. */
export function AccountSaved() {
  const { units, loading, error, reload } = useFavorites();
  const header = <PageHeader title="Căn đã lưu" description="Những căn bạn đã bấm biểu tượng trái tim để lưu lại." />;

  if (loading) {
    return (
      <div>
        {header}
        <div className="skeleton" style={{ height: 320 }} aria-busy="true" />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        {header}
        <Section>
          <div role="alert" style={{ textAlign: "center", padding: 24 }}>
            <p>{error}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={reload}>
              Thử lại
            </button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div>
      {header}
      {units.length === 0 ? (
        <EmptyState
          title="Chưa lưu căn nào"
          description="Bấm biểu tượng trái tim ở một căn để lưu lại."
          action={
            <Link href="/units" className="btn btn-primary">
              Tìm căn
            </Link>
          }
          art
        />
      ) : (
        <div className={styles.grid}>
          {units.map((u) => {
            const unavailable = u.baseStatus !== "available" ? UNAVAILABLE_LABEL[u.baseStatus] ?? "Không còn cho thuê" : null;
            return (
              <div key={u.id} data-unavailable={unavailable ? "true" : undefined}>
                {unavailable && (
                  <p style={{ margin: "0 0 6px" }}>
                    <StatusBadge tone="warn">{unavailable}</StatusBadge>
                  </p>
                )}
                <UnitCard unit={u} cost={allInCost(u, DEFAULT_HOUSEHOLD)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
