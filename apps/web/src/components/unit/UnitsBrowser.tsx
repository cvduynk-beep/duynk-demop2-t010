"use client";

import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { FilterTray } from "@/components/chat/FilterTray";
import { MockDataBanner } from "@/components/ui/MockDataBanner";
import { recommendQuery, type RankedCost } from "@/lib/chat/api";
import { allInCost, type CostBreakdown } from "@/lib/pricing/cost";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { useCatalog } from "@/lib/tenant/catalog";
import { useFavorites } from "@/lib/tenant/favorites";
import { criteriaChips, emptyCriteria } from "@/lib/tenant/matchmaker";
import { UnitCard } from "./UnitCard";
import styles from "./UnitsBrowser.module.css";

type Sort = "best" | "price" | "area";

const toCost = (c: RankedCost): CostBreakdown => ({ rent: c.baseRent, mgmt: c.managementFee, parking: c.parkingFee, utility: c.utilityCost, total: c.allInTotal });

/**
 * Trang `/units`: duyệt toàn bộ căn (không cần chat). Danh sách = catalog thật (`/api/catalog/units`), thứ hạng
 * "Phù hợp nhất" = AI Matchmaker (`/matchmaker/recommend`). Đủ trạng thái đang tải / lỗi (có thử lại) / rỗng thật.
 * Catalog trả `source: "mock"` (fallback có cờ, chỉ dev) ⇒ hiện banner, dữ liệu mẫu xếp theo giá thuê, KHÔNG xếp hạng.
 */
export function UnitsBrowser() {
  const catalog = useCatalog();
  const { units } = catalog;
  const isMock = catalog.source === "mock";
  const { isSaved, count: savedCount } = useFavorites();
  const [criteria, setCriteria] = useState(emptyCriteria);
  const [sort, setSort] = useState<Sort>("best");
  const [onlySaved, setOnlySaved] = useState(false);

  const ranked = useApiQuery(recommendQuery(criteria), catalog.source === "api");
  const all = useMemo(() => {
    if (isMock) {
      return [...units].sort((a, b) => a.rent - b.rent).map((unit) => ({ unit, cost: allInCost(unit, criteria.household) }));
    }
    if (ranked.state.status !== "ready") return [];
    const byCode = new Map(units.map((u) => [u.code, u]));
    return ranked.state.data.topRecommendations.flatMap((r) => {
      const unit = byCode.get(r.unitCode);
      return unit ? [{ unit, cost: toCost(r.allInCost) }] : [];
    });
  }, [isMock, units, criteria.household, ranked.state]);
  let list = onlySaved ? all.filter((r) => isSaved(r.unit.code)) : [...all];
  if (sort === "price") list = [...list].sort((a, b) => a.cost.total - b.cost.total);
  if (sort === "area") list = [...list].sort((a, b) => b.unit.areaM2 - a.unit.areaM2);

  const loading = catalog.loading || (!isMock && ranked.state.status === "loading");
  const error = catalog.error ?? (!isMock && ranked.state.status === "error" ? ranked.state.message : null);
  const retry = () => {
    catalog.reload();
    ranked.reload();
  };

  const chips = criteriaChips(criteria);
  const holding = units.filter((u) => u.baseStatus === "holding").length;

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.h1}>Tất cả căn đang mở tại Ocean Park 1</h1>
        {!error && !loading && (
          <p className="muted">
            {isMock
              ? `${all.length} căn MẪU (không phải dữ liệu thật).`
              : `${all.length} căn đã xác minh, giá hiển thị là All-in Cost mỗi tháng.${holding > 0 ? ` ${holding} căn khác đang được giữ căn.` : ""}`}
          </p>
        )}
      </header>

      {isMock && <MockDataBanner detail="Backend không phản hồi nên danh sách là dữ liệu mẫu, xếp theo giá thuê tăng dần, chưa áp bộ lọc." />}

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

      {error ? (
        <div className={styles.empty} role="alert">
          <h2>{error}</h2>
          <p className="muted">Danh sách căn lấy trực tiếp từ hệ thống; không hiển thị dữ liệu thay thế.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={retry}>
            Thử lại
          </button>
        </div>
      ) : loading && all.length === 0 ? (
        <p className="muted" aria-busy="true">
          Đang tải danh sách căn…
        </p>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          <h2>{onlySaved ? "Bạn chưa lưu căn nào" : chips.length ? "Không có căn nào khớp bộ lọc" : "Hiện chưa có căn nào đang mở"}</h2>
          <p className="muted">
            {onlySaved
              ? "Bấm biểu tượng trái tim trên thẻ căn để lưu lại xem sau."
              : chips.length
              ? "Thử nâng ngân sách hoặc bớt một điều kiện."
              : "Các căn mới sẽ xuất hiện ngay khi được thẩm định xong."}
          </p>
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
