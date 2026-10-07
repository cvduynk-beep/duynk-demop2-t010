"use client";

import { useEffect, useRef, useState } from "react";
import {
  Compass,
  Footprints,
  GraduationCap,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Waves,
  X,
  Zap,
} from "lucide-react";
import type { ZoneId } from "@/lib/mock/units";
import styles from "./OceanParkInteractiveMap.module.css";

export interface ZoneGeo {
  zoneId: ZoneId;
  name: string;
  short: string;
  lat: number;
  lng: number;
  minPrice: string;
  unitCount: number;
  isDeal?: boolean;
  buildings: string;
  highlight: string;
  walks: {
    lake: string;
    vinUni: string;
    mall: string;
    bus: string;
  };
}

export const ZONES_GEO: ZoneGeo[] = [
  {
    zoneId: "sapphire1",
    name: "The Sapphire 1",
    short: "Sapphire 1",
    lat: 20.9958,
    lng: 105.9432,
    minPrice: "7.0Tr",
    unitCount: 10,
    buildings: "11 toà (S1.01 – S1.12)",
    highlight: "Sát hồ cát trắng 24.5ha, view biển hồ thoáng mát, nhiều shophouse sầm uất",
    walks: { lake: "2 phút", vinUni: "10 phút", mall: "5 phút", bus: "1 phút" },
  },
  {
    zoneId: "sapphire2",
    name: "The Sapphire 2",
    short: "Sapphire 2",
    lat: 20.9922,
    lng: 105.9372,
    minPrice: "6.5Tr",
    unitCount: 14,
    isDeal: true,
    buildings: "16 toà (S2.01 – S2.19)",
    highlight: "Cạnh ĐH VinUni & TechnoPark, ga VinBus trung tâm, giá thuê All-in tốt nhất",
    walks: { lake: "7 phút", vinUni: "4 phút", mall: "10 phút", bus: "1 phút" },
  },
  {
    zoneId: "zenpark",
    name: "The Zenpark",
    short: "The Zenpark",
    lat: 20.988,
    lng: 105.9418,
    minPrice: "8.5Tr",
    unitCount: 6,
    buildings: "Phân khu Ruby (R1.01 – R1.05)",
    highlight: "Căn hộ tiêu chuẩn Ruby cao cấp, vườn Nhật Bản & hồ cá Koi, lễ tân 24/7",
    walks: { lake: "8 phút", vinUni: "6 phút", mall: "12 phút", bus: "2 phút" },
  },
  {
    zoneId: "pavilion",
    name: "The Pavilion",
    short: "The Pavilion",
    lat: 20.9852,
    lng: 105.9402,
    minPrice: "9.2Tr",
    unitCount: 4,
    buildings: "4 toà (P1 – P4)",
    highlight: "Phong cách nhiệt đới Singapore, vườn thực vật Botanic Garden, bàn giao mới",
    walks: { lake: "10 phút", vinUni: "8 phút", mall: "14 phút", bus: "2 phút" },
  },
  {
    zoneId: "masteri",
    name: "Masteri Waterfront",
    short: "Masteri Waterfront",
    lat: 20.9942,
    lng: 105.9488,
    minPrice: "12.5Tr",
    unitCount: 5,
    buildings: "6 toà (Miami & Hawaii)",
    highlight: "Căn hộ Masterise Homes sang trọng, bể bơi panorama tầng thượng, view biển hồ",
    walks: { lake: "1 phút", vinUni: "12 phút", mall: "3 phút", bus: "2 phút" },
  },
];

interface LandmarkGeo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  icon: string;
  badge: string;
}

const LANDMARKS_GEO: LandmarkGeo[] = [
  { id: "lake", name: "Hồ Ngọc Trai", lat: 20.9938, lng: 105.946, icon: "🌊", badge: "Hồ nước ngọt 24.5ha" },
  { id: "lagoon", name: "Biển hồ nước mặn", lat: 20.9972, lng: 105.9525, icon: "🏖️", badge: "Crystal Lagoon 6.1ha" },
  { id: "vinuni", name: "ĐH VinUni", lat: 20.989, lng: 105.9388, icon: "🎓", badge: "Đại học Tinh hoa" },
  { id: "vincom", name: "Vincom Mega Mall", lat: 20.9985, lng: 105.9508, icon: "🛍️", badge: "TTTM Biển hồ" },
  { id: "technopark", name: "TechnoPark Tower", lat: 20.9902, lng: 105.9352, icon: "🏢", badge: "Toà văn phòng 45 tầng" },
  { id: "vinschool", name: "Vinschool", lat: 20.995, lng: 105.9398, icon: "🏫", badge: "Trường liên cấp" },
];

const OCP1_CENTER = { lat: 20.9926, lng: 105.9442, zoom: 15 };

interface OceanParkInteractiveMapProps {
  selectedZone?: ZoneId | null;
  onSelectZone?: (zoneId: ZoneId | null) => void;
  height?: number | string;
  totalUnits?: number;
  className?: string;
}

export function OceanParkInteractiveMap({
  selectedZone = null,
  onSelectZone,
  height = 420,
  totalUnits = 71,
  className,
}: OceanParkInteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<"clean" | "satellite">("clean");

  const activeZoneData = ZONES_GEO.find((z) => z.zoneId === selectedZone);

  // 1. Khởi tạo Leaflet Map an toàn trên Client Side
  useEffect(() => {
    let mounted = true;

    async function initMap() {
      if (!containerRef.current || mapRef.current) return;

      const L = await import("leaflet");
      if (!mounted || !containerRef.current) return;

      // Khởi tạo map
      const map = L.map(containerRef.current, {
        center: [OCP1_CENTER.lat, OCP1_CENTER.lng],
        zoom: OCP1_CENTER.zoom,
        minZoom: 14,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: false,
      });

      // Layer mặc định: CartoDB Positron (sạch, thanh lịch cho BĐS)
      const cleanTiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      });

      cleanTiles.addTo(map);
      tileLayerRef.current = cleanTiles;

      // Group chứa markers
      const markerGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markerGroup;

      mapRef.current = map;
      setMapReady(true);
    }

    initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Chuyển đổi giữa Layer Đô thị và Layer Vệ tinh
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    import("leaflet").then((L) => {
      if (tileLayerRef.current) {
        mapRef.current.removeLayer(tileLayerRef.current);
      }

      if (mapLayer === "clean") {
        tileLayerRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 19,
        }).addTo(mapRef.current);
      } else {
        // Ảnh vệ tinh thực tế độ phân giải cao của Esri
        tileLayerRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 18 }
        ).addTo(mapRef.current);
      }
    });
  }, [mapLayer, mapReady]);

  // 3. Render các Marker phân khu và Landmark
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markersLayerRef.current) return;

    import("leaflet").then((L) => {
      const group = markersLayerRef.current;
      group.clearLayers();

      // (A) Thêm Landmark Pins
      LANDMARKS_GEO.forEach((lm) => {
        const landmarkIcon = L.divIcon({
          className: "vinstay-landmark-wrap",
          html: `
            <div class="vinstay-landmark-node" title="${lm.name}">
              <span class="vinstay-landmark-icon">${lm.icon}</span>
              <span>${lm.name}</span>
            </div>
          `,
          iconSize: [120, 26],
          iconAnchor: [60, 13],
        });

        const m = L.marker([lm.lat, lm.lng], { icon: landmarkIcon, interactive: true });
        m.bindPopup(
          `<div style="padding: 10px 12px; font-family: inherit;">
            <strong style="color: #0e5263; font-size: 13px;">${lm.icon} ${lm.name}</strong>
            <p style="margin: 4px 0 0; color: #475569; font-size: 11px;">${lm.badge}</p>
          </div>`
        );
        m.addTo(group);
      });

      // (B) Thêm Zone Price Pins
      ZONES_GEO.forEach((z) => {
        const isActive = selectedZone === z.zoneId;
        const isDeal = z.isDeal;

        const pinIcon = L.divIcon({
          className: "vinstay-map-pin-wrap",
          html: `
            <div class="vinstay-pin-node ${isDeal ? "vinstay-pin-deal" : ""} ${isActive ? "vinstay-pin-active" : ""}">
              <div class="vinstay-pin-body">
                ${isDeal ? "<span>⚡</span>" : ""}
                <span>${z.minPrice}</span>
              </div>
              <div class="vinstay-pin-pointer"></div>
            </div>
          `,
          iconSize: [60, 36],
          iconAnchor: [30, 36],
        });

        const marker = L.marker([z.lat, z.lng], { icon: pinIcon, zIndexOffset: isActive ? 1000 : 100 });

        marker.on("click", () => {
          if (onSelectZone) {
            onSelectZone(selectedZone === z.zoneId ? null : z.zoneId);
          }
        });

        marker.addTo(group);
      });
    });
  }, [mapReady, selectedZone, onSelectZone]);

  // 4. Tự động flyTo khi có selectedZone từ bên ngoài
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (activeZoneData) {
      mapRef.current.flyTo([activeZoneData.lat, activeZoneData.lng], 16, {
        duration: 0.8,
        easeLinearity: 0.25,
      });
    }
  }, [activeZoneData, mapReady]);

  // Điều khiển phóng to / thu nhỏ / reset
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleRecenter = () => {
    if (onSelectZone) onSelectZone(null);
    mapRef.current?.flyTo([OCP1_CENTER.lat, OCP1_CENTER.lng], OCP1_CENTER.zoom, { duration: 0.6 });
  };

  return (
    <section className={`${styles.mapContainer} ${className ?? ""}`} style={{ height }}>
      {/* Bản đồ Leaflet Canvas */}
      <div ref={containerRef} className={styles.mapElement} />

      {!mapReady && (
        <div className={styles.mapLoading}>
          <Compass className="spin" size={18} />
          <span>Đang tải bản đồ thực tế Ocean Park 1...</span>
        </div>
      )}

      {/* ── Top Bar: Quick Zone Chips + Layer Switcher ─────────────────── */}
      <div className={styles.mapTopBar}>
        <div className={styles.topBarLeft} role="group" aria-label="Lọc nhanh phân khu">
          {ZONES_GEO.map((z) => {
            const active = selectedZone === z.zoneId;
            return (
              <button
                key={z.zoneId}
                type="button"
                className={`${styles.zoneQuickPill} ${active ? styles.zoneQuickPillActive : ""}`}
                onClick={() => {
                  if (onSelectZone) onSelectZone(active ? null : z.zoneId);
                }}
                aria-pressed={active}
              >
                {z.isDeal && <span className={styles.dealBadgeTiny}>⚡ Deal</span>}
                <span>{z.short}</span>
                <span style={{ opacity: 0.85, fontSize: 11 }}>({z.minPrice})</span>
              </button>
            );
          })}
        </div>

        {/* Nút chuyển đổi Layer Đô thị / Vệ tinh */}
        <div className={styles.layerToggleGroup}>
          <button
            type="button"
            className={`${styles.layerBtn} ${mapLayer === "clean" ? styles.layerBtnActive : ""}`}
            onClick={() => setMapLayer("clean")}
            title="Bản đồ giao thông và đô thị sạch"
          >
            <MapPin size={12} />
            <span>Đô thị</span>
          </button>
          <button
            type="button"
            className={`${styles.layerBtn} ${mapLayer === "satellite" ? styles.layerBtnActive : ""}`}
            onClick={() => setMapLayer("satellite")}
            title="Ảnh chụp vệ tinh thực tế độ phân giải cao"
          >
            <Layers size={12} />
            <span>Vệ tinh</span>
          </button>
        </div>
      </div>

      {/* ── Right Controls: Zoom & Recenter ───────────────────────────── */}
      <div className={styles.mapRightControls}>
        <button
          type="button"
          className={styles.mapControlIconBtn}
          onClick={handleZoomIn}
          aria-label="Phóng to bản đồ"
          title="Phóng to"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className={styles.mapControlIconBtn}
          onClick={handleZoomOut}
          aria-label="Thu nhỏ bản đồ"
          title="Thu nhỏ"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className={styles.mapControlIconBtn}
          onClick={handleRecenter}
          aria-label="Xem toàn bộ Ocean Park 1"
          title="Xem toàn khu vực"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* ── Bottom Floating Card: Walkability & Zone Details ──────────── */}
      {activeZoneData && (
        <aside className={styles.walkabilityCard} aria-label={`Thông tin phân khu ${activeZoneData.name}`}>
          <div className={styles.walkCardHead}>
            <div>
              <div className={styles.walkZoneName}>
                <MapPin size={15} style={{ color: "#0e5263" }} />
                <span>{activeZoneData.name}</span>
                {activeZoneData.isDeal && <span className={styles.dealBadgeTiny}>⚡ Căn hời</span>}
              </div>
              <span className="muted xs">{activeZoneData.buildings}</span>
            </div>
            <div className={styles.walkPriceTag}>Từ {activeZoneData.minPrice}/tháng</div>
          </div>

          <p className={styles.walkDesc}>{activeZoneData.highlight}</p>

          {/* Thước đo khoảng cách đi bộ thực tế */}
          <div className={styles.walkGrid}>
            <div className={styles.walkItem}>
              <span className={styles.walkItemLabel}>
                <Waves size={11} style={{ color: "#0284c7" }} /> Hồ Ngọc Trai
              </span>
              <span className={styles.walkItemValue}>{activeZoneData.walks.lake}</span>
            </div>
            <div className={styles.walkItem}>
              <span className={styles.walkItemLabel}>
                <GraduationCap size={11} style={{ color: "#7c3aed" }} /> ĐH VinUni
              </span>
              <span className={styles.walkItemValue}>{activeZoneData.walks.vinUni}</span>
            </div>
            <div className={styles.walkItem}>
              <span className={styles.walkItemLabel}>
                <ShoppingBag size={11} style={{ color: "#ea580c" }} /> Vincom Mall
              </span>
              <span className={styles.walkItemValue}>{activeZoneData.walks.mall}</span>
            </div>
          </div>

          <div className={styles.walkCardActions}>
            <button
              type="button"
              className={styles.walkFilterBtn}
              onClick={() => {
                if (onSelectZone) onSelectZone(activeZoneData.zoneId);
              }}
            >
              Xem {activeZoneData.unitCount} căn tại {activeZoneData.short}
            </button>
            <button
              type="button"
              className={styles.walkCloseBtn}
              onClick={() => {
                if (onSelectZone) onSelectZone(null);
              }}
              aria-label="Đóng chi tiết"
            >
              <X size={14} />
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
