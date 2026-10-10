"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, LayoutGrid, Map, SearchX, Sparkles, X } from "lucide-react";
import { Facade } from "@/components/brand/Facade";
import { UnitCard } from "@/components/unit/UnitCard";
import { OceanParkInteractiveMap } from "@/components/map/OceanParkInteractiveMap";
import { criteriaChips, relaxHint, type MatchResult } from "@/lib/mock/matchmaker";
import type { CriteriaState } from "@/lib/mock/types";
import { unitStatus } from "@/lib/mock/selectors";
import type { MockState } from "@/lib/mock/types";
import { zoneById, type ZoneId } from "@/lib/mock/units";
import styles from "./ResultsPanel.module.css";

type Sort = "best" | "price" | "area";
type ViewMode = "list" | "map";

interface ResultsPanelProps {
  results: MatchResult[];
  criteria: CriteriaState;
  onCriteria: (c: CriteriaState) => void;
  state: MockState;
  totalOpen: number;
}

export function ResultsPanel({ results, criteria, onCriteria, state, totalOpen }: ResultsPanelProps) {
  const [sort, setSort] = useState<Sort>("best");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [mapZone, setMapZone] = useState<string | null>(null);

  const chips = criteriaChips(criteria);
  const hh = criteria.household;

  const sorted = useMemo(() => {
    const list = [...results];
    if (sort === "price") list.sort((a, b) => a.cost.total - b.cost.total);
    if (sort === "area") list.sort((a, b) => b.unit.areaM2 - a.unit.areaM2);
    return list;
  }, [results, sort]);

  const top = results.slice(0, 3);
  const rest = sort === "best" ? results.slice(3) : sorted;

  // Căn hộ được lọc theo phân khu trên bản đồ khi ở chế độ Map View
  const zoneResults = useMemo(() => {
    if (!mapZone) return results;
    return results.filter((r) => r.unit.zoneId === mapZone);
  }, [results, mapZone]);

  return (
    <div className={styles.panel}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <div>
            <h2 className={styles.title}>
              {results.length ? (chips.length === 0 ? `Tất cả ${results.length} căn hộ đang mở` : `${results.length} căn khớp yêu cầu`) : "Chưa có căn khớp"}
            </h2>
            <p className="muted small">
              Đã quét {totalOpen} căn đang mở · tính cho {hh.persons} người, {hh.motorbikes} xe máy{hh.cars ? `, ${hh.cars} ô tô` : ""}
            </p>
          </div>

          <div className={styles.controls}>
            {/* Bộ chuyển đổi giao diện Danh sách / Bản đồ */}
            <div className={styles.viewSwitch} role="group" aria-label="Chế độ hiển thị">
              <button
                type="button"
                className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`}
                onClick={() => setViewMode("list")}
              >
                <LayoutGrid size={14} /> Danh sách
              </button>
              <button
                type="button"
                className={`${styles.viewBtn} ${viewMode === "map" ? styles.viewBtnActive : ""}`}
                onClick={() => setViewMode("map")}
              >
                <Map size={14} /> Bản đồ
              </button>
            </div>

            {results.length > 3 && (
              <label className={styles.sort}>
                <span className="sr-only">Sắp xếp</span>
                <select className={styles.selectInput} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="best">Phù hợp nhất</option>
                  <option value="price">All-in thấp đến cao</option>
                  <option value="area">Diện tích lớn nhất</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {chips.length > 0 && (
          <ul className={styles.chips} aria-label="Bộ lọc đang áp dụng">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" className={styles.chip} onClick={() => onCriteria(c.clear(criteria))} aria-label={`Bỏ bộ lọc ${c.label}`}>
                  {c.label} <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </header>

      {results.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyArt}>
            <Facade lit={0} label="" />
          </div>
          <div>
            <h3>
              <SearchX size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Không có căn nào vừa với bộ lọc này
            </h3>
            <p className="muted">{relaxHint(criteria, (u) => unitStatus(state, u))}</p>
            <div className={styles.emptyActions}>
              {criteria.budget && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onCriteria({ ...criteria, budget: criteria.budget! + 1_000_000 })}>
                  Nâng ngân sách thêm 1 triệu
                </button>
              )}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onCriteria({ ...criteria, layouts: [], zones: [], buildings: [], floor: undefined, furnishing: undefined, items: [], pets: undefined })}>
                Bỏ bớt điều kiện
              </button>
            </div>
          </div>
        </div>
      ) : viewMode === "map" ? (
        /* ─── Chế độ hiển thị Bản đồ tương tác ─── */
        <div className={styles.mapViewWrap}>
          <OceanParkInteractiveMap
            selectedZone={mapZone as ZoneId | null}
            onSelectZone={(z) => setMapZone(z)}
            totalUnits={results.length}
            height={440}
          />

          {mapZone ? (
            <div className={styles.zoneFilterBanner}>
              <span>
                Đang lọc phân khu: <strong>{zoneById(mapZone as ZoneId).name}</strong> ({zoneResults.length} căn khớp)
              </span>
              <button type="button" className={styles.clearZoneBtn} onClick={() => setMapZone(null)}>
                Xem tất cả ({results.length} căn)
              </button>
            </div>
          ) : (
            <div className={styles.zoneFilterBanner}>
              <span>Nhấn vào các ghim giá trên bản đồ để xem chi tiết từng phân khu</span>
              <span className="muted xs">Sapphire 1, Sapphire 2, Zenpark, Pavilion, Masteri</span>
            </div>
          )}

          <div className={styles.grid}>
            {zoneResults.map((r) => (
              <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} />
            ))}
          </div>
        </div>
      ) : (
        /* ─── Chế độ hiển thị Danh sách ─── */
        <>
          {sort === "best" && (
            <section aria-label="AI chọn cho bạn">
              <h3 className={styles.section}>
                <Sparkles size={18} style={{ color: "#b6801e" }} />
                AI chọn cho bạn
                <span className={styles.sectionBadge}>Top đề xuất</span>
              </h3>
              <div className={styles.top}>
                {top.map((r, i) => (
                  <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} variant="feature" rank={i + 1} reasons={r.reasons} priority={i === 0} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-label="Các căn khớp khác">
              <h3 className={styles.section}>{sort === "best" ? `Các căn khớp khác (${rest.length})` : "Tất cả căn khớp"}</h3>
              <div className={styles.grid}>
                {rest.map((r) => (
                  <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
