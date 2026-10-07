"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Compass,
  Heart,
  LocateFixed,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { allInCost } from "@/lib/mock/cost";
import { vnd, vndShort } from "@/lib/mock/format";
import { hostForUnit, unitAddress, unitPhoto, zoneById, type Unit, type ZoneId } from "@/lib/mock/units";
import { OceanParkInteractiveMap } from "@/components/map/OceanParkInteractiveMap";
import { UNITS } from "@/lib/mock/units";
import { toggleFavorite } from "@/lib/mock/actions";
import { useMock } from "@/lib/mock/store";
import styles from "./LuxeExplorer.module.css";

type SheetPosition = "peek" | "half" | "full";

export function LuxeExplorer() {
  const store = useMock();
  const [query, setQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<"all" | "under7" | "7to10" | "above10">("all");
  const [bedFilter, setBedFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);

  // Trạng thái Bottom Sheet (peek: thấp, half: vừa, full: cao)
  const [sheetState, setSheetState] = useState<SheetPosition>("half");

  // Xử lý kéo vuốt Bottom Sheet bằng cảm ứng và chuột
  const startYRef = useRef<number | null>(null);
  const currentDeltaYRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Lọc danh sách căn hộ theo các tiêu chí tìm kiếm
  const filteredUnits = useMemo(() => {
    return UNITS.filter((u) => {
      // 1. Text Search
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        const matchCode = u.code.toLowerCase().includes(q);
        const matchBuilding = u.building.toLowerCase().includes(q);
        const matchZone = zoneById(u.zoneId).name.toLowerCase().includes(q);
        const matchLayout = u.layoutLabel.toLowerCase().includes(q);
        if (!matchCode && !matchBuilding && !matchZone && !matchLayout) return false;
      }

      // 2. Zone Filter
      if (zoneFilter !== "all" && u.zoneId !== zoneFilter) {
        return false;
      }

      // 3. Bed Filter
      if (bedFilter !== "all" && u.layout !== bedFilter) {
        return false;
      }

      // 4. Price Filter
      const cost = allInCost(u);
      if (priceFilter === "under7" && cost.total >= 7_000_000) return false;
      if (priceFilter === "7to10" && (cost.total < 7_000_000 || cost.total > 10_000_000)) return false;
      if (priceFilter === "above10" && cost.total <= 10_000_000) return false;

      return true;
    });
  }, [query, zoneFilter, bedFilter, priceFilter]);

  const handleToggleFav = (unitId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(unitId);
  };

  // Các hàm vuốt kéo Bottom Sheet
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (startYRef.current === null) return;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    currentDeltaYRef.current = clientY - startYRef.current;
  };

  const handleTouchEnd = () => {
    if (startYRef.current === null) return;
    const deltaY = currentDeltaYRef.current;
    startYRef.current = null;
    currentDeltaYRef.current = 0;
    setIsDragging(false);

    // Vuốt lên > 40px
    if (deltaY < -40) {
      if (sheetState === "peek") setSheetState("half");
      else if (sheetState === "half") setSheetState("full");
    }
    // Vuốt xuống > 40px
    else if (deltaY > 40) {
      if (sheetState === "full") setSheetState("half");
      else if (sheetState === "half") setSheetState("peek");
    }
  };

  const cycleSheetState = () => {
    if (sheetState === "peek") setSheetState("half");
    else if (sheetState === "half") setSheetState("full");
    else setSheetState("half");
  };

  return (
    <div className={styles.container}>
      {/* Vệt sáng lấp lánh (Lens Flare ambient accents) */}
      <div className={styles.flareTL} aria-hidden />
      <div className={styles.flareBL} aria-hidden />

      <div className={styles.phoneFrame}>
        {/* ── 1. Top Bar ───────────────────────────────────────── */}
        <header className={styles.topBar}>
          <Link href="/" className={styles.brand} aria-label="VinStay AI trang chủ">
            <span className={styles.brandTitle}>
              VinStay<span className={styles.brandAITag}> AI</span>
            </span>
          </Link>

          <div className={styles.topActions}>
            <Link href="/login" className={styles.iconBtn} aria-label="Tài khoản">
              <User size={18} />
            </Link>
            <Link href="/account" className={styles.iconBtn} aria-label="Thông báo">
              <Bell size={18} />
              <span className={styles.notifDot} />
            </Link>
          </div>
        </header>

        {/* ── 2. Floating Search Bar & Filter Pills ────────────── */}
        <section className={styles.searchWrapper}>
          <div className={styles.searchMain}>
            <Search size={20} className={styles.searchIcon} />
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Tìm căn hộ Ocean Park 1..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm kiếm căn hộ"
              />
              <span className={styles.searchSubtext}>Theo phân khu, mức giá, layout phòng</span>
            </div>
            <button
              type="button"
              className={styles.searchCircleBtn}
              onClick={() => {}}
              aria-label="Nút tìm kiếm"
            >
              <Search size={18} />
            </button>
          </div>

          {/* Dải nút lọc con nhộng (Pill Filters) */}
          <div className={styles.filterPillsRow}>
            {/* Bộ lọc Giá */}
            <button
              type="button"
              className={`${styles.filterPill} ${priceFilter !== "all" ? styles.filterPillActive : ""}`}
              onClick={() => {
                const next = priceFilter === "all" ? "under7" : priceFilter === "under7" ? "7to10" : priceFilter === "7to10" ? "above10" : "all";
                setPriceFilter(next);
              }}
            >
              {priceFilter === "all" ? "Khoảng giá" : priceFilter === "under7" ? "< 7 triệu" : priceFilter === "7to10" ? "7–10 triệu" : "> 10 triệu"}
              <ChevronDown size={13} />
            </button>

            {/* Bộ lọc Phòng ngủ */}
            <button
              type="button"
              className={`${styles.filterPill} ${bedFilter !== "all" ? styles.filterPillActive : ""}`}
              onClick={() => {
                const next = bedFilter === "all" ? "Studio" : bedFilter === "Studio" ? "1PN" : bedFilter === "1PN" ? "2PN" : "all";
                setBedFilter(next);
              }}
            >
              {bedFilter === "all" ? "Phòng ngủ" : bedFilter}
              <ChevronDown size={13} />
            </button>

            {/* Bộ lọc Phân khu */}
            <button
              type="button"
              className={`${styles.filterPill} ${zoneFilter !== "all" ? styles.filterPillActive : ""}`}
              onClick={() => {
                const next = zoneFilter === "all" ? "sapphire2" : zoneFilter === "sapphire2" ? "sapphire1" : zoneFilter === "sapphire1" ? "zenpark" : "all";
                setZoneFilter(next);
              }}
            >
              {zoneFilter === "all" ? "Phân khu" : zoneFilter === "sapphire2" ? "Sapphire 2" : zoneFilter === "sapphire1" ? "Sapphire 1" : "Zenpark"}
              <ChevronDown size={13} />
            </button>
          </div>
        </section>

        {/* ── 3. Interactive Ocean Park Map Section (Bản đồ Leaflet thực tế) ────────────── */}
        <section className={`${styles.mapCard} ${sheetState === "peek" ? styles.mapCardExpanded : ""}`}>
          <OceanParkInteractiveMap
            selectedZone={zoneFilter === "all" ? null : (zoneFilter as ZoneId)}
            onSelectZone={(z) => {
              const next = z ?? "all";
              setZoneFilter(next);
              if (z) {
                if (sheetState === "peek") setSheetState("half");
                const firstInZone = UNITS.find((u) => u.zoneId === z);
                if (firstInZone) setActiveUnitId(firstInZone.id);
              }
            }}
            totalUnits={filteredUnits.length}
            height="100%"
          />
        </section>

        {/* ── 4. Interactive Bottom Sheet & Stacked Cards (Vuốt kéo mượt mà) ── */}
        <section
          className={styles.bottomSheet}
          style={{
            transform:
              sheetState === "peek"
                ? "translateY(160px)"
                : sheetState === "full"
                ? "translateY(-120px)"
                : "translateY(0px)",
          }}
          aria-label="Danh sách căn hộ nổi"
        >
          {/* Thanh kéo vuốt Bottom Sheet (Drag Handle Header) */}
          <div
            className={styles.bottomSheetHeader}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onClick={cycleSheetState}
          >
            <div className={styles.dragHandleBar} />
            <div className={styles.sheetSummaryRow}>
              <span>
                <strong className={styles.sheetSummaryCount}>{filteredUnits.length} căn hộ</strong> đang mở tại Ocean Park 1
              </span>
              <button type="button" className={styles.sheetModeToggle} onClick={cycleSheetState}>
                {sheetState === "full" ? (
                  <>Thu gọn <ChevronDown size={13} /></>
                ) : sheetState === "peek" ? (
                  <>Xem danh sách <ChevronUp size={13} /></>
                ) : (
                  <>Mở rộng <ChevronUp size={13} /></>
                )}
              </button>
            </div>
          </div>

          {/* Danh sách thẻ căn hộ xếp tầng kính mờ */}
          <div className={styles.cardsList}>
            {filteredUnits.slice(0, sheetState === "peek" ? 1 : sheetState === "half" ? 4 : 10).map((unit, index) => {
              const cost = allInCost(unit);
              const zone = zoneById(unit.zoneId);
              const host = hostForUnit(unit);
              const isFav = store.favorites.includes(unit.id);
              const isSelected = activeUnitId === unit.id;
              const photoUrl = unitPhoto(unit, 1);

              return (
                <article
                  key={unit.id}
                  className={`${styles.glassCard} ${isSelected ? styles.glassCardActive : ""}`}
                  onClick={() => setActiveUnitId(unit.id)}
                >
                  {/* Cột trái: Ảnh căn hộ có số thứ tự */}
                  <div className={styles.photoWrap}>
                    <img
                      src={photoUrl}
                      alt={unitAddress(unit)}
                      className={styles.cardPhoto}
                      loading={index < 2 ? "eager" : "lazy"}
                    />
                    <span className={styles.rankBadge}>{index + 1}</span>
                    {cost.total <= 7_500_000 && <span className={styles.dealTag}>Căn hời ⚡</span>}
                  </div>

                  {/* Cột phải: Thông tin căn hộ */}
                  <div className={styles.cardContent}>
                    <div>
                      <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>{unitAddress(unit)}</h3>
                        <button
                          type="button"
                          className={`${styles.favBtn} ${isFav ? styles.favBtnActive : ""}`}
                          onClick={(e) => handleToggleFav(unit.id, e)}
                          aria-label="Yêu thích"
                        >
                          <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                        </button>
                      </div>

                      <div className={styles.priceLocRow}>
                        <span className={styles.priceMain}>{vnd(cost.total)}đ</span>
                        <span className={styles.locText}>
                          • {zone.name}
                        </span>
                      </div>

                      <div className={styles.specsRow}>
                        <span className={styles.specItem}>{unit.layoutLabel}</span>
                        <span>•</span>
                        <span className={styles.specItem}>{unit.bathrooms} WC</span>
                        <span>•</span>
                        <span className={styles.specItem}>{unit.areaM2} m²</span>
                      </div>
                    </div>

                    {/* Chân thẻ: Host đón + Nút xem chi tiết */}
                    <div className={styles.cardFooter}>
                      <div className={styles.hostWrap}>
                        <div className={styles.hostAvatar}>
                          {host.name.split(" ").slice(-1)[0].charAt(0)}
                        </div>
                        <div className={styles.hostLabel}>
                          <span className={styles.hostRole}>{host.name}</span>
                          <span>Đón sảnh</span>
                        </div>
                      </div>

                      <div className={styles.footerActions}>
                        <Link href={`/units/${unit.id}`} className={styles.viewBtn}>
                          Xem chi tiết
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
