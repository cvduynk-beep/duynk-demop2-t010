"use client";

import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { FilterTray } from "@/components/chat/FilterTray";
import { recommendQuery } from "@/lib/chat/api";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { useCatalog } from "@/lib/tenant/catalog";
import { useFavorites } from "@/lib/tenant/favorites";
import { criteriaChips, emptyCriteria } from "@/lib/tenant/matchmaker";
import { UnitCard } from "./UnitCard";
import styles from "./UnitsBrowser.module.css";

type Sort = "best" | "price" | "area";

/** Trang duyệt toàn bộ căn (không cần chat): bộ lọc giống khung chat, sắp xếp và danh sách đã lưu. */
export function UnitsBrowser() {
  const { units } = useCatalog();
  const { isSaved, count: savedCount } = useFavorites();
  const [criteria, setCriteria] = useState(emptyCriteria);
  const [sort, setSort] = useState<Sort>("best");
  const [onlySaved, setOnlySaved] = useState(false);

  // Thứ hạng "Phù hợp nhất" do AI Matchmaker (backend) quyết định; catalog chỉ cấp ảnh/thông tin để vẽ thẻ.
  const ranked = useApiQuery(recommendQuery(criteria));
  const all = useMemo(() => {
    if (ranked.state.status !== "ready") return [];
    const byCode = new Map(units.map((u) => [u.code, u]));
    return ranked.state.data.topRecommendations.flatMap((r) => {
      const unit = byCode.get(r.unitCode);
      const c = r.allInCost;
      return unit
        ? [{ unit, cost: { rent: c.baseRent, mgmt: c.managementFee, parking: c.parkingFee, utility: c.utilityCost, total: c.allInTotal } }]
        : [];
    });
  }, [ranked.state, units]);
  let list = onlySaved ? all.filter((r) => isSaved(r.unit.code)) : [...all];
  if (sort === "price") list = [...list].sort((a, b) => a.cost.total - b.cost.total);
  if (sort === "area") list = [...list].sort((a, b) => b.unit.areaM2 - a.unit.areaM2);

  const chips = criteriaChips(criteria);
  const holding = units.filter((u) => u.baseStatus === "holding").length;

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.h1}>Tất cả căn đang mở tại Ocean Park 1</h1>
        <p className="muted">
          {all.length} căn đã xác minh, giá hiển thị là All-in Cost mỗi tháng.{holding > 0 ? ` ${holding} căn khác đang được giữ căn.` : ""}
        </p>
      </header>

      <div className={styles.bar}>
        <FilterTray criteria={criteria} onChange={setCriteria} />
        <div className={styles.barRight}>
          <button type="button" className={`${styles.saved} ${onlySaved ? styles.savedOn : ""}`} aria-pressed={onlySaved} onClick={() => setOnlySaved((v) => !v)}>
            <Heart size={15} fill={onlySaved ? "currentColor" : "none"} /> Đã lưu ({savedCount})
          </button>
          <label>
            <span className="sr-only">Sắp xếp</span>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="best">Phù hợp nhất</option>
              <option value="price">All-in thấp đến cao</option>
              <option value="area">Diện tích lớn nhất</option>
            </select>
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <p className="muted small">
          Đang lọc: {chips.map((c) => c.label).join(" · ")} ·{" "}
          <button type="button" className="link" onClick={() => setCriteria(emptyCriteria())}>
            Xoá bộ lọc
          </button>
        </p>
      )}

      {ranked.state.status === "loading" && all.length === 0 ? (
        <p className="muted">Đang tải danh sách căn…</p>
      ) : ranked.state.status === "error" ? (
        <div className={styles.empty}>
          <h2>{ranked.state.message}</h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={ranked.reload}>
            Tải lại
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          <h2>{onlySaved ? "Bạn chưa lưu căn nào" : "Không có căn nào khớp bộ lọc"}</h2>
          <p className="muted">{onlySaved ? "Bấm biểu tượng trái tim trên thẻ căn để lưu lại xem sau." : "Thử nâng ngân sách hoặc bớt một điều kiện."}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {list.map((r, i) => (
            <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} priority={i < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
