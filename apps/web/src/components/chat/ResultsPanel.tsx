"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Map, SearchX, Sparkles, X } from "lucide-react";
import { Facade } from "@/components/brand/Facade";
import { UnitCard } from "@/components/unit/UnitCard";
import { OceanParkInteractiveMap } from "@/components/map/OceanParkInteractiveMap";
import type { CriteriaState } from "@/lib/chat/types";
import type { CostBreakdown } from "@/lib/pricing/cost";
import type { UnitWithExtras } from "@/lib/tenant/adapters";
import { criteriaChips } from "@/lib/tenant/matchmaker";
import { zoneById, type ZoneId } from "@/lib/units";
import { UnitPreview } from "./UnitPreview";
import styles from "./ResultsPanel.module.css";

type Sort = "best" | "price" | "area";
type ViewMode = "list" | "map";

/** Một căn trong danh sách kết quả: thứ hạng, All-in và lý do lấy từ AI Matchmaker (backend), ảnh/thông tin từ catalog. */
export interface RankedResult {
  unit: UnitWithExtras;
  rank: number;
  cost: CostBreakdown;
  reasons: string[];
}

interface ResultsPanelProps {
  /** Đúng thứ tự backend trả ("Phù hợp nhất"); FE chỉ sắp lại khi khách tự chọn tiêu chí sắp xếp khác. */
  results: RankedResult[];
  criteria: CriteriaState;
  onCriteria: (c: CriteriaState) => void;
  totalOpen: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Báo cho khung chứa biết đang mở/đóng chi tiết căn (khung chứa đổi sang bố cục header / thân cuộn / đáy cố định). */
  onPreviewChange?: (open: boolean) => void;
}

export function ResultsPanel({ results, criteria, onCriteria, totalOpen, loading, error, onRetry, onPreviewChange }: ResultsPanelProps) {
  const [sort, setSort] = useState<Sort>("best");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [mapZone, setMapZone] = useState<string | null>(null);
  // Căn đang xem chi tiết ngay trong khung (không chuyển sang /units/:code ⇒ khách vẫn chat bên trái).
  const [preview, setPreview] = useState<{ code: string; book: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  // Khung cuộn là phần tử cha (section .results của ChatExperience).
  const scroller = () => rootRef.current?.parentElement ?? null;
  const openUnit = (unit: UnitWithExtras, opts?: { book?: boolean }) => {
    savedScroll.current = scroller()?.scrollTop ?? 0;
    setPreview({ code: unit.code, book: !!opts?.book });
    onPreviewChange?.(true);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }));
  };
  const closePreview = () => {
    setPreview(null);
    onPreviewChange?.(false);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: savedScroll.current }));
  };
  // Panel bị gỡ (vd. bắt đầu chat mới) khi đang xem chi tiết ⇒ trả khung chứa về chế độ danh sách.
  useEffect(() => () => onPreviewChange?.(false), [onPreviewChange]);

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

  if (preview) {
    return (
      <div ref={rootRef} className={`${styles.panel} ${styles.panelPreview}`}>
        <UnitPreview
          code={preview.code}
          book={preview.book}
          fallback={results.find((r) => r.unit.code === preview.code)?.unit ?? null}
          onBack={closePreview}
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className={styles.panel}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <div>
            <h2 className={styles.title}>
              {loading
                ? "Đang xếp hạng căn phù hợp…"
                : error
                ? "Chưa tải được danh sách"
                : results.length
                ? chips.length === 0
                  ? `Tất cả ${results.length} căn hộ đang mở`
                  : `${results.length} căn khớp yêu cầu`
                : "Chưa có căn khớp"}
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

      {error ? (
        <div className={styles.empty}>
          <div>
            <h3>
              <SearchX size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {error}
            </h3>
            <p className="muted">Danh sách và thứ hạng căn do AI Matchmaker tính trên dữ liệu thật; bạn thử tải lại nhé.</p>
            {onRetry && (
              <div className={styles.emptyActions}>
                <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                  Tải lại
                </button>
              </div>
            )}
          </div>
        </div>
      ) : loading && results.length === 0 ? (
        <p className="muted small">Đang tải danh sách căn…</p>
      ) : results.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyArt}>
            <Facade lit={0} label="" />
          </div>
          <div>
            <h3>
              <SearchX size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Không có căn nào vừa với bộ lọc này
            </h3>
            <p className="muted">Bạn thử nâng ngân sách hoặc bớt tầng, đồ dùng, phân khu để có thêm căn nhé.</p>
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
            height={440}
          />

          {mapZone ? (
            <div className={styles.zoneFilterBanner}>
              <span>
                Đang lọc phân khu: <strong>{zoneById(mapZone as ZoneId)?.name ?? mapZone}</strong> ({zoneResults.length} căn khớp)
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
              <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} onOpen={openUnit} />
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
                  <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} variant="feature" rank={r.rank} reasons={r.reasons} priority={i === 0} onOpen={openUnit} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-label="Các căn khớp khác">
              <h3 className={styles.section}>{sort === "best" ? `Các căn khớp khác (${rest.length})` : "Tất cả căn khớp"}</h3>
              <div className={styles.grid}>
                {rest.map((r) => (
                  <UnitCard key={r.unit.id} unit={r.unit} cost={r.cost} onOpen={openUnit} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
