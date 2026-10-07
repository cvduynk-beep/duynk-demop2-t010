"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Building,
  CheckCircle2,
  DollarSign,
  Flame,
  Home,
  Info,
  Key,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { allInCost } from "@/lib/mock/cost";
import { vnd } from "@/lib/mock/format";
import { errorText, landlordApi } from "@/lib/landlord/api";
import { LAYOUT_LABEL, LEASE_TERM_LABEL } from "@/lib/landlord/labels";
import type { BuildingOption, Consignment, LayoutKind, LeaseTermPref, LockKind } from "@/lib/landlord/types";
import { queries, type QueryDef } from "@/lib/landlord/queries";
import { invalidateLandlordData, useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { ConsignOtpSign } from "./ConsignOtpSign";
import { PhotoPicker } from "./PhotoPicker";
import { QueryView } from "./QueryView";
import styles from "./Landlord.module.css";

const LABELS = ["Thông tin căn & Định giá", "Khoá cửa, Tài sản & Thanh toán", "Ký ủy quyền độc quyền"];

export interface UrbanProject {
  id: string;
  name: string;
  location: string;
  zones: {
    name: string;
    buildings: string[];
  }[];
}

export const URBAN_PROJECTS: UrbanProject[] = [
  {
    id: "vhop1",
    name: "Vinhomes Ocean Park 1",
    location: "Gia Lâm, Hà Nội (Đang trực chiến)",
    zones: [
      {
        name: "The Sapphire 1",
        buildings: ["S1.01", "S1.02", "S1.03", "S1.05", "S1.06", "S1.07", "S1.08", "S1.09", "S1.10", "S1.11", "S1.12"],
      },
      {
        name: "The Sapphire 2",
        buildings: ["S2.01", "S2.02", "S2.03", "S2.05", "S2.06", "S2.07", "S2.08", "S2.09", "S2.10", "S2.11", "S2.12", "S2.15", "S2.16", "S2.17", "S2.18", "S2.19"],
      },
      {
        name: "The Zenpark",
        buildings: ["R1.01", "R1.02", "R1.03", "R1.05", "ZR1", "ZR2"],
      },
      {
        name: "The Pavilion",
        buildings: ["P1", "P2", "P3", "P4", "BE3"],
      },
      {
        name: "Masteri Waterfront",
        buildings: ["M1", "M2", "M3", "H1", "H2", "H3"],
      },
    ],
  },
  {
    id: "vhsc",
    name: "Vinhomes Smart City",
    location: "Nam Từ Liêm, Hà Nội (Sắp mở)",
    zones: [
      {
        name: "The Sapphire 1 & 2",
        buildings: ["S1.01", "S1.02", "S1.03", "S1.05", "S1.06", "S2.01", "S2.02", "S2.03", "S2.05"],
      },
    ],
  },
  {
    id: "vhgp",
    name: "Vinhomes Grand Park",
    location: "TP. Thủ Đức, TP.HCM (Sắp mở)",
    zones: [
      {
        name: "The Rainbow",
        buildings: ["S1.01", "S1.02", "S1.03", "S1.05", "S2.01", "S2.02"],
      },
    ],
  },
];

/** Dữ liệu giá thị trường tham chiếu tại Vinhomes Ocean Park 1 theo phân khu và layout */
const MARKET_BENCHMARK: Record<string, Record<LayoutKind, { avg: number; min: number; max: number }>> = {
  default: {
    Studio: { avg: 6_500_000, min: 5_800_000, max: 7_200_000 },
    "1PN": { avg: 8_000_000, min: 7_200_000, max: 8_800_000 },
    "2PN": { avg: 10_000_000, min: 9_000_000, max: 11_500_000 },
    "3PN": { avg: 13_500_000, min: 12_000_000, max: 15_500_000 },
  },
  "The Zenpark": {
    Studio: { avg: 7_000_000, min: 6_300_000, max: 7_800_000 },
    "1PN": { avg: 8_800_000, min: 8_000_000, max: 9_800_000 },
    "2PN": { avg: 11_500_000, min: 10_500_000, max: 13_000_000 },
    "3PN": { avg: 15_000_000, min: 13_500_000, max: 17_500_000 },
  },
  "Masteri Waterfront": {
    Studio: { avg: 7_500_000, min: 6_800_000, max: 8_500_000 },
    "1PN": { avg: 9_500_000, min: 8_500_000, max: 10_800_000 },
    "2PN": { avg: 12_500_000, min: 11_200_000, max: 14_500_000 },
    "3PN": { avg: 16_500_000, min: 15_000_000, max: 19_500_000 },
  },
};

function getBenchmark(zoneName: string, layout: LayoutKind) {
  const table = MARKET_BENCHMARK[zoneName] || MARKET_BENCHMARK.default;
  return table[layout] || MARKET_BENCHMARK.default[layout];
}

const PRE_INVENTORY_ITEMS = [
  { key: "ac", label: "Điều hòa Inverter", icon: "❄️" },
  { key: "fridge", label: "Tủ lạnh", icon: "🧊" },
  { key: "washer", label: "Máy giặt", icon: "🧺" },
  { key: "kitchen", label: "Bếp từ & Hút mùi", icon: "🍳" },
  { key: "heater", label: "Bình nóng lạnh", icon: "🚿" },
  { key: "bed", label: "Giường & Đệm", icon: "🛏️" },
  { key: "wardrobe", label: "Tủ quần áo", icon: "🚪" },
  { key: "sofa", label: "Sofa phòng khách", icon: "🛋️" },
  { key: "dining", label: "Bàn ăn & Ghế", icon: "🍽️" },
  { key: "curtains", label: "Rèm cửa & Giàn phơi", icon: "🪟" },
];

const POPULAR_BANKS = [
  "Techcombank",
  "Vietcombank",
  "MB Bank",
  "VPBank",
  "ACB",
  "BIDV",
  "VietinBank",
  "TPBank",
  "VIB",
  "Sacombank",
];

interface Form {
  building: string;
  floor: string;
  door: string;
  layout: LayoutKind;
  areaM2: string;
  askRent: string;
  suggestedDeposit: string;
  leaseTerm: LeaseTermPref;
  maxOccupants: number;
  petPolicy: "no" | "small" | "allowed";
  furnished: boolean;
  preInventory: string[];
  locks: LockKind[];
  smartLockOption: "provide_now" | "at_inspection";
  doorCode: string;
  bankName: string;
  bankAccount: string;
  bankAccountHolder: string;
}

const blank: Form = {
  building: "",
  floor: "",
  door: "",
  layout: "1PN",
  areaM2: "",
  askRent: "",
  suggestedDeposit: "",
  leaseTerm: "long",
  maxOccupants: 2,
  petPolicy: "no",
  furnished: true,
  preInventory: ["ac", "fridge", "washer", "kitchen", "heater", "bed", "wardrobe"],
  locks: ["smart"],
  smartLockOption: "provide_now",
  doorCode: "",
  bankName: "Techcombank",
  bankAccount: "",
  bankAccountHolder: "",
};

const NO_DRAFT: QueryDef<Consignment | null> = {
  key: "consignment:none",
  fetch: () => Promise.resolve({ ok: true, status: 200, data: null }),
};

function useWizardData(draftId?: string) {
  const buildings = useLandlordQuery(queries.buildings);
  const profile = useLandlordQuery(queries.profile);
  const draft = useLandlordQuery<Consignment | null>(draftId ? queries.consignment(draftId) : NO_DRAFT);
  return { buildings, profile, draft };
}

export function ConsignWizard({ draftId }: { draftId?: string }) {
  const { buildings, profile, draft } = useWizardData(draftId);
  return (
    <QueryView query={buildings} skeleton="form">
      {(bs) => (
        <QueryView query={profile} skeleton="form">
          {(p) => (
            <QueryView query={draft} skeleton="form">
              {(d) => (
                <>
                  {d && d.status !== "draft" ? (
                    <div className={`${styles.page} ${styles.wizard}`}>
                      <PageHeader title="Ký gửi căn mới" />
                      <section className={`card ${styles.success}`}>
                        <h1>Hồ sơ này đã ký ủy quyền</h1>
                        <Link href={`/landlord/consignments/${d.id}`} className="btn btn-primary">
                          Xem tiến trình
                        </Link>
                      </section>
                    </div>
                  ) : (
                    <Wizard key={d?.id ?? "new"} buildings={bs} phoneVerified={p.isPhoneVerified} draft={d ?? undefined} />
                  )}
                </>
              )}
            </QueryView>
          )}
        </QueryView>
      )}
    </QueryView>
  );
}

function Wizard({
  buildings,
  phoneVerified,
  draft,
}: {
  buildings: BuildingOption[];
  phoneVerified: boolean;
  draft?: Consignment;
}) {
  const initialProjectId =
    URBAN_PROJECTS.find((p) => p.zones.some((z) => z.buildings.includes(draft?.building || "")))?.id || "vhop1";
  const initialProject = URBAN_PROJECTS.find((p) => p.id === initialProjectId) || URBAN_PROJECTS[0];
  const initialZoneName =
    initialProject.zones.find((z) => z.buildings.includes(draft?.building || ""))?.name || initialProject.zones[0].name;

  const [projectId, setProjectId] = useState<string>(initialProjectId);
  const [zoneNameSelected, setZoneNameSelected] = useState<string>(initialZoneName);

  const activeProject = URBAN_PROJECTS.find((p) => p.id === projectId);
  const activeZone = activeProject?.zones.find((z) => z.name === zoneNameSelected);
  const availableBuildings = activeZone?.buildings || [];

  const [step, setStep] = useState(draft ? 2 : 0);
  const [f, setF] = useState<Form>(
    draft
      ? {
          building: draft.building,
          floor: String(draft.floor),
          door: draft.door ?? "",
          layout: draft.layoutKind,
          areaM2: String(draft.areaM2),
          askRent: String(draft.askRent),
          suggestedDeposit: String(draft.suggestedDeposit || draft.askRent),
          leaseTerm: draft.leaseTerm ?? "long",
          maxOccupants: 2,
          petPolicy: "no",
          furnished: draft.furnished ?? true,
          preInventory: ["ac", "fridge", "washer", "kitchen", "heater", "bed", "wardrobe"],
          locks: draft.locks.length ? draft.locks : ["smart"],
          smartLockOption: "provide_now",
          doorCode: "",
          bankName: "Techcombank",
          bankAccount: "",
          bankAccountHolder: "",
        }
      : { ...blank, building: availableBuildings[0] ?? buildings[0]?.buildingCode ?? "S1.02" },
  );

  const handleProjectChange = (newProjId: string) => {
    setProjectId(newProjId);
    const proj = URBAN_PROJECTS.find((p) => p.id === newProjId);
    if (proj && proj.zones.length > 0) {
      const firstZone = proj.zones[0];
      setZoneNameSelected(firstZone.name);
      if (firstZone.buildings.length > 0) {
        set("building", firstZone.buildings[0]);
      }
    }
  };

  const handleZoneChange = (newZoneName: string) => {
    setZoneNameSelected(newZoneName);
    const proj = URBAN_PROJECTS.find((p) => p.id === projectId);
    const zoneObj = proj?.zones.find((z) => z.name === newZoneName);
    if (zoneObj && zoneObj.buildings.length > 0) {
      set("building", zoneObj.buildings[0]);
    }
  };

  const projectDisplay = activeProject?.name || "Vinhomes Ocean Park 1";
  const zoneDisplay = zoneNameSelected;

  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(draft?.id ?? null);
  const draftIdRef = useRef<string | null>(draft?.id ?? null);
  const [warranted, setWarranted] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadedCount, setUploadedCount] = useState(draft?.photoCount ?? 0);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const rent = Number(f.askRent) || 0;
  const deposit = Number(f.suggestedDeposit) || 0;
  const area = Number(f.areaM2) || 0;
  const maxFloor = buildings.find((b) => b.buildingCode === f.building)?.totalFloors ?? 60;

  // Định giá benchmark & Badge "Căn hời"
  const benchmark = getBenchmark(zoneDisplay, f.layout);
  const rentDiff = benchmark.avg > 0 && rent > 0 ? (benchmark.avg - rent) / benchmark.avg : 0;
  const isDeal = rentDiff >= 0.1; // Tiết kiệm >= 10%
  const isHigh = rentDiff <= -0.15; // Cao hơn >= 15%

  // Bảng tính Dòng tiền thực nhận của Chủ nhà (5% phí dịch vụ)
  const serviceFee = Math.round(rent * 0.05);
  const netIncome = Math.max(0, rent - serviceFee);

  // All-in cost preview cho khách
  const preview = rent && area ? allInCost({ rent, areaM2: area }) : null;

  const handleRentChange = (val: string) => {
    const raw = val.replace(/\D/g, "");
    setF((prev) => {
      const nextRent = Number(raw) || 0;
      const nextDeposit = !prev.suggestedDeposit && nextRent >= 3_000_000 ? raw : prev.suggestedDeposit;
      return {
        ...prev,
        askRent: raw,
        suggestedDeposit: nextDeposit,
      };
    });
  };

  const handleLockToggle = (type: LockKind) => {
    setF((prev) => {
      const exists = prev.locks.includes(type);
      if (exists) {
        return { ...prev, locks: prev.locks.filter((l) => l !== type) };
      }
      return { ...prev, locks: [...prev.locks, type] };
    });
  };

  const toggleInventoryItem = (key: string) => {
    setF((prev) => {
      const exists = prev.preInventory.includes(key);
      const next = exists ? prev.preInventory.filter((k) => k !== key) : [...prev.preInventory, key];
      return { ...prev, preInventory: next };
    });
  };

  const next1 = () => {
    if (projectId !== "vhop1") {
      setErr("Hiện tại hệ thống chỉ nhận ký gửi trực tiếp tại Vinhomes Ocean Park 1 (có sẵn Field Host nội khu).");
      return;
    }
    if (!f.building || !f.building.trim()) {
      setErr("Vui lòng chọn mã toà nhà.");
      return;
    }
    const floorNum = Number(f.floor);
    if (!f.floor || floorNum < 1 || floorNum > maxFloor) {
      setErr(`Tầng phải từ 1 đến ${maxFloor} (toà ${f.building}).`);
      return;
    }
    if (!f.door || !f.door.trim()) {
      setErr("Vui lòng nhập số căn hộ.");
      return;
    }
    if (area < 20 || area > 300) {
      setErr("Diện tích tim tường phải từ 20 đến 300 m².");
      return;
    }
    if (rent < 3_000_000) {
      setErr("Giá thuê tối thiểu 3.000.000đ/tháng.");
      return;
    }
    const currentDeposit = deposit || rent;
    if (currentDeposit < 2_000_000 || currentDeposit > 3 * rent) {
      setErr("Tiền cọc đề xuất phải từ 2.000.000đ đến 3 lần giá thuê.");
      return;
    }

    setErr("");
    setStep(1);
  };

  const next2 = () => {
    if (f.locks.length === 0) {
      setErr("Chọn ít nhất một hình thức khoá cửa.");
      return;
    }
    if (
      f.locks.includes("smart") &&
      f.smartLockOption === "provide_now" &&
      f.doorCode.length < 4 &&
      !draft
    ) {
      setErr("Vui lòng nhập mã mở khóa (tối thiểu 4 số) hoặc chọn 'Cài đặt mã số tạm / Cung cấp mã cho Field Host khi tới thẩm định'.");
      return;
    }
    setErr("");
    setStep(2);
  };

  const ensureDraft = async (): Promise<string | null> => {
    let id = draftIdRef.current;
    if (!id) {
      // Đóng gói ghi chú: quy chế, tài sản kê khai & tài khoản nhận tiền
      const noteParts: string[] = [];
      if (f.preInventory.length) {
        noteParts.push(`Nội thất: ${f.preInventory.join(", ")}`);
      }
      noteParts.push(
        `Quy chế: Tối đa ${f.maxOccupants} người · ${
          f.petPolicy === "no"
            ? "Không thú cưng"
            : f.petPolicy === "small"
            ? "Chó mèo nhỏ"
            : "Nuôi thú cưng tự do"
        }`,
      );
      if (f.bankAccount) {
        noteParts.push(`TK nhận: ${f.bankAccount} (${f.bankName} - ${f.bankAccountHolder || "Chủ hộ"})`);
      }
      const combinedNote = noteParts.join(" | ").slice(0, 300);

      const res = await landlordApi.createConsignment({
        building: f.building,
        floor: Number(f.floor),
        door: f.door.padStart(2, "0"),
        layout: f.layout,
        areaM2: area,
        askRent: rent,
        suggestedDeposit: deposit || rent,
        leaseTerm: f.leaseTerm,
        furnished: f.furnished,
        locks: f.locks,
        ...(f.locks.includes("smart") && f.smartLockOption === "provide_now" && f.doorCode
          ? { doorCode: f.doorCode }
          : {}),
        note: combinedNote,
      });
      if (!res.ok) {
        setErr(errorText(res, "Không tạo được hồ sơ ký gửi."));
        return null;
      }
      id = res.data.id;
      draftIdRef.current = id;
      setCreatedId(id);
    }
    if (photoFiles.length) {
      const up = await landlordApi.uploadPhotos(id, photoFiles);
      if (!up.ok) {
        setErr(
          `Hồ sơ đã được lưu nhưng chưa tải được ảnh: ${errorText(
            up,
            "thử lại sau.",
          )} Bấm gửi lại để thử tiếp, hoặc bỏ ảnh lỗi ở bước trước.`,
        );
        return null;
      }
      setUploadedCount(up.data.length);
      setPhotoFiles([]);
    }
    return id;
  };

  const signed = (c: Consignment) => {
    setCreatedId(c.id);
    setDone(true);
    invalidateLandlordData();
  };

  if (done) {
    return (
      <div className={`${styles.page} ${styles.wizard}`}>
        <PageHeader title="Ký gửi căn mới thành công" />
        <section className={`card ${styles.success}`}>
          <span className={styles.successIcon}>
            <CheckCircle2 size={38} />
          </span>
          <h1>Đã tiếp nhận hồ sơ ký gửi độc quyền</h1>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Bạn đã ký ủy quyền độc quyền căn <b>{f.building} · Tầng {f.floor} · Căn {f.door.padStart(2, "0")}</b> thuộc{" "}
            <b>{zoneDisplay}</b> (Vinhomes Ocean Park 1). Field Host nội khu sẽ liên hệ bạn trong vòng <b>48 giờ</b> để tới căn
            kiểm định hiện trạng 10 hạng mục nội thất (Hộ chiếu bàn giao số Điều 5, chi phí 0đ, bạn không cần có mặt).
          </p>

          <div className={styles.netIncomeCard} style={{ width: "100%", margin: "8px 0" }}>
            <div className={styles.netRow}>
              <span>Giá niêm yết chào thuê:</span>
              <b>{vnd(rent)}đ/tháng</b>
            </div>
            <div className={styles.netRow}>
              <span>Phí dịch vụ nền tảng (-5%):</span>
              <span>- {vnd(serviceFee)}đ/tháng (Chỉ thu khi có khách thuê)</span>
            </div>
            <div className={styles.netTotal}>
              <span>Dòng tiền thực nhận hàng tháng:</span>
              <span className={styles.netAmount}>{vnd(netIncome)}đ/tháng</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--s-3)", justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
            {createdId && (
              <Link href={`/landlord/consignments/${createdId}`} className="btn btn-primary">
                Xem tiến trình thẩm định
              </Link>
            )}
            <Link href="/landlord/units" className="btn btn-secondary">
              Về danh sách căn hộ
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${styles.wizard}`}>
      <PageHeader
        title={draft ? "Ký ủy quyền cho căn đã đăng ký" : "Ký gửi căn hộ mới"}
        description="Cho thuê thần tốc — Khách chuyển cọc VietQR 2.000.000đ giữ chỗ ngay — Chủ nhà ở nhà 100%, không đi lại 20–30km mở cửa."
      />

      <ol className={styles.steps} aria-label="Các bước">
        {LABELS.map((l, i) => (
          <li key={l} className={i <= step ? styles.on : ""} aria-current={i === step ? "step" : undefined}>
            <span />
            {l}
          </li>
        ))}
      </ol>

      <section className={`card ${styles.formCard}`}>
        {/* ====================================================================
            BƯỚC 1: THÔNG TIN CĂN HỘ & ĐỊNH GIÁ THỊ TRƯỜNG
            ==================================================================== */}
        {step === 0 && (
          <>
            <div className={styles.formGrid}>
              <label className="field">
                <span className="label">Khu đô thị / Dự án</span>
                <select
                  className="select"
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  {URBAN_PROJECTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.location})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Phân khu nội khu</span>
                <select
                  className="select"
                  value={zoneNameSelected}
                  onChange={(e) => handleZoneChange(e.target.value)}
                >
                  {activeProject?.zones.map((z) => (
                    <option key={z.name} value={z.name}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </label>

              {projectId !== "vhop1" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.expansionBanner}>
                    <AlertTriangle size={20} style={{ flex: "none", marginTop: 2 }} />
                    <div>
                      <b>Khu vực đang chuẩn bị mở rộng:</b>
                      <p style={{ margin: "4px 0 0" }}>
                        Hiện tại VinStay AI đang vận hành độc quyền với Mạng lưới Field Host nội khu tại{" "}
                        <b>Vinhomes Ocean Park 1</b> để đảm bảo SLA 48h kiểm định và Host đón khách quẹt thẻ thang máy trong 60 giây.
                        Vui lòng chọn phân khu thuộc Vinhomes Ocean Park 1 để được tiếp nhận ngay.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <label className="field">
                <span className="label">Tòa căn hộ</span>
                <select
                  className="select"
                  value={f.building}
                  onChange={(e) => set("building", e.target.value)}
                >
                  {availableBuildings.map((b) => (
                    <option key={b} value={b}>
                      Tòa {b}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Loại layout</span>
                <select
                  className="select"
                  value={f.layout}
                  onChange={(e) => set("layout", e.target.value as LayoutKind)}
                >
                  {(Object.keys(LAYOUT_LABEL) as LayoutKind[]).map((l) => (
                    <option key={l} value={l}>
                      {LAYOUT_LABEL[l]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Tầng</span>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder={`1–${maxFloor}`}
                  value={f.floor}
                  onChange={(e) => set("floor", e.target.value.replace(/\D/g, ""))}
                />
              </label>

              <label className="field">
                <span className="label">Số căn hộ</span>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="Ví dụ: 08, 20..."
                  value={f.door}
                  onChange={(e) => set("door", e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </label>

              <label className="field">
                <span className="label">Diện tích tim tường (m²)</span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="20–300"
                  value={f.areaM2}
                  onChange={(e) => set("areaM2", e.target.value.replace(/[^\d.]/g, ""))}
                />
                <span className="muted xs" style={{ marginTop: 4 }}>
                  Theo sổ hồng / HĐMB. Field Host đo lại diện tích thông thuỷ khi thẩm định.
                </span>
              </label>

              <label className="field">
                <span className="label">Thời gian thuê mong muốn</span>
                <select
                  className="select"
                  value={f.leaseTerm}
                  onChange={(e) => set("leaseTerm", e.target.value as LeaseTermPref)}
                >
                  <option value="long">Dài hạn: 12 tháng (Khuyên dùng)</option>
                  <option value="mid">Trung hạn: 1–6 tháng</option>
                  <option value="fixed">Cố định: 12 tháng</option>
                </select>
              </label>
            </div>

            {/* Khối định giá thị trường & Huy hiệu "Căn hời" */}
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                <label className="field">
                  <span className="label">Giá chào thuê mong muốn (đ/tháng)</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Từ 3.000.000đ"
                    value={f.askRent ? Number(f.askRent).toLocaleString("vi-VN") : ""}
                    onChange={(e) => handleRentChange(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="label">Tiền cọc đề xuất (Security Deposit)</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Mặc định = 1 tháng tiền thuê"
                    value={f.suggestedDeposit ? Number(f.suggestedDeposit).toLocaleString("vi-VN") : ""}
                    onChange={(e) => set("suggestedDeposit", e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              </div>

              {/* Hộp benchmark giá thị trường */}
              <div className={styles.benchmarkBox}>
                <div className={styles.benchmarkHeader}>
                  <span>
                    Mặt bằng <b>{LAYOUT_LABEL[f.layout]}</b> tại <b>{zoneDisplay}</b>:{" "}
                    <b>{vnd(benchmark.avg)}đ/tháng</b> ({vnd(benchmark.min)}đ – {vnd(benchmark.max)}đ)
                  </span>
                  {rent > 0 && isDeal && (
                    <span className={styles.dealBadge}>
                      <Flame size={13} /> Căn hời phân khu (-{Math.round(rentDiff * 100)}%)
                    </span>
                  )}
                  {rent > 0 && isHigh && (
                    <span className={styles.dealBadgeWarn}>
                      <AlertTriangle size={12} /> Cao hơn mặt bằng (+{Math.abs(Math.round(rentDiff * 100))}%)
                    </span>
                  )}
                </div>

                {rent > 0 && isDeal && (
                  <p className="xs" style={{ margin: 0, color: "#065f46" }}>
                    🚀 <b>Ưu thế thanh khoản cao:</b> AI Matchmaker tự động gắn huy hiệu <b>&ldquo;Căn hời phân khu&rdquo;</b>, ưu tiên hiển
                    thị Top 1 tìm kiếm, tiếp cận gấp 3 lần khách thuê và tìm khách trong <b>&lt; 7 ngày</b> mà không bị môi giới
                    ngoài ép dìm giá!
                  </p>
                )}

                {rent > 0 && isHigh && (
                  <p className="xs" style={{ margin: 0, color: "#92400e" }}>
                    Thời gian tìm khách có thể kéo dài hơn (ước tính 15–30 ngày). Bạn có thể điều chỉnh sau khi tham khảo ý kiến
                    Field Host.
                  </p>
                )}
              </div>

              {/* Bảng tính Dòng tiền thực nhận của Chủ nhà */}
              {rent > 0 && (
                <div className={styles.netIncomeCard} style={{ marginTop: 10 }}>
                  <div className={styles.netRow}>
                    <span>Giá thuê chào ra thị trường:</span>
                    <b>{vnd(rent)}đ/tháng</b>
                  </div>
                  <div className={styles.netRow}>
                    <span>
                      Phí dịch vụ nền tảng (<b>5%</b>):
                    </span>
                    <span style={{ color: "var(--ink-2)" }}>
                      - {vnd(serviceFee)}đ/tháng (Chỉ trừ khi có khách thuê thành công · <b>0đ nếu phòng trống</b>)
                    </span>
                  </div>
                  <div className={styles.netTotal}>
                    <span>Dòng tiền thực nhận hàng tháng của bạn:</span>
                    <span className={styles.netAmount}>{vnd(netIncome)}đ/tháng</span>
                  </div>
                  <p className="xs muted" style={{ margin: 0 }}>
                    💡 <b>Bảo đảm an toàn tài chính:</b> Khách cọc 2.000.000đ giữ chỗ qua VietQR động sẽ chuyển 100% thành Tiền Cọc
                    Bảo Đảm Tài Sản khi ký HĐ, <b>tuyệt đối không khấu trừ</b> vào tiền thuê tháng đầu tiên.
                  </p>
                </div>
              )}

              {preview && (
                <p className="small muted" style={{ marginTop: 8 }}>
                  Khách thuê sẽ thấy tổng All-in Cost trọn gói khoảng <b>{vnd(preview.total)}đ/tháng</b> (gồm thuê + phí QL{" "}
                  {vnd(preview.mgmt)} + gửi xe + điện nước EVN).
                </p>
              )}
            </div>

            {/* Quy chế căn hộ & Giới hạn người ở */}
            <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--surface-2)", borderRadius: "var(--r)" }}>
              <b style={{ fontSize: 13.5, color: "var(--ink)" }}>Quy chế căn hộ & Khách thuê mong muốn</b>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <label className="field">
                  <span className="label">Số người ở tối đa</span>
                  <select
                    className="select"
                    value={f.maxOccupants}
                    onChange={(e) => set("maxOccupants", Number(e.target.value))}
                  >
                    <option value={1}>Tối đa 1 người</option>
                    <option value={2}>Tối đa 2 người</option>
                    <option value={3}>Tối đa 3 người</option>
                    <option value={4}>Tối đa 4 người</option>
                    <option value={6}>Tối đa 5–6 người</option>
                  </select>
                </label>

                <label className="field">
                  <span className="label">Quy chế nuôi thú cưng</span>
                  <select
                    className="select"
                    value={f.petPolicy}
                    onChange={(e) => set("petPolicy", e.target.value as "no" | "small" | "allowed")}
                  >
                    <option value="no">Không cho phép nuôi thú cưng</option>
                    <option value="small">Chỉ chó / mèo nhỏ (dưới 5kg)</option>
                    <option value="allowed">Cho phép nuôi thú cưng</option>
                  </select>
                </label>
              </div>
              <p className="xs muted" style={{ margin: "6px 0 0" }}>
                ⚖️ <b>Bảo vệ chủ nhà:</b> Hợp đồng quy định mọi khoản phạt từ BQL Vinhomes (tiếng ồn sau 22h, nuôi thú cưng trái
                phép...) do lỗi của khách sẽ tự động khấu trừ trực tiếp vào Tiền cọc bảo đảm tài sản của khách.
              </p>
            </div>

            {err && (
              <p className="field-error" role="alert" style={{ marginTop: 10 }}>
                {err}
              </p>
            )}
            <div className={styles.wizardNav} style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary" onClick={next1}>
                Tiếp tục: Khoá cửa & Tài sản
              </button>
            </div>
          </>
        )}

        {/* ====================================================================
            BƯỚC 2: KHOÁ CỬA, TÀI SẢN & THÔNG TIN THANH TOÁN
            ==================================================================== */}
        {step === 1 && (
          <>
            <div>
              <span className="label">Hình thức khoá cửa căn hộ</span>
              <div className={styles.radios} style={{ marginTop: 8 }}>
                <label className={`${styles.radio} ${f.locks.includes("smart") ? styles.radioOn : ""}`}>
                  <input
                    type="checkbox"
                    checked={f.locks.includes("smart")}
                    onChange={() => handleLockToggle("smart")}
                  />
                  <span>
                    <b>Khoá điện tử thông minh (Vân tay / Mã số)</b>
                    <span className="muted small" style={{ display: "block" }}>
                      Mã cửa được mã hoá AES-256 trong Vault bảo mật, chỉ cấp cho Host đúng lúc đứng trước cửa và tự hủy sau ca xem.
                    </span>
                  </span>
                </label>

                <label className={`${styles.radio} ${f.locks.includes("physical") ? styles.radioOn : ""}`}>
                  <input
                    type="checkbox"
                    checked={f.locks.includes("physical")}
                    onChange={() => handleLockToggle("physical")}
                  />
                  <span>
                    <b>Khoá cơ truyền thống (Chìa khoá)</b>
                    <span className="muted small" style={{ display: "block" }}>
                      Gửi chìa khoá tại quầy nhân sự phân khu hoặc lễ tân toà nhà. (VinStay TUYỆT ĐỐI không dùng Lockbox treo cửa vi phạm quy chế BQL).
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {f.locks.includes("smart") && (
              <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--surface-2)", borderRadius: "var(--r)" }}>
                <b style={{ fontSize: 13, color: "var(--ink)" }}>Mã mở khoá điện tử</b>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                    <input
                      type="radio"
                      name="smartLockOption"
                      checked={f.smartLockOption === "provide_now"}
                      onChange={() => set("smartLockOption", "provide_now")}
                    />
                    <span>Cung cấp mã khóa ngay (Mã hóa AES-256 an toàn trong Vault)</span>
                  </label>

                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                    <input
                      type="radio"
                      name="smartLockOption"
                      checked={f.smartLockOption === "at_inspection"}
                      onChange={() => set("smartLockOption", "at_inspection")}
                    />
                    <span>Cài đặt mã số tạm / Cung cấp mã cho Field Host khi tới thẩm định tại sảnh</span>
                  </label>
                </div>

                {f.smartLockOption === "provide_now" && (
                  <label className="field" style={{ marginTop: 10 }}>
                    <span className="label">Nhập mã số mở cửa (4–8 số)</span>
                    <input
                      className="input"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ví dụ: 123456"
                      value={f.doorCode}
                      onChange={(e) => set("doorCode", e.target.value.replace(/\D/g, "").slice(0, 8))}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Tình trạng nội thất & Checklist 10 hạng mục Điều 5 */}
            <div style={{ marginTop: 14 }}>
              <span className="label">Tình trạng nội thất bàn giao</span>
              <div className={styles.chips} style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={`${styles.chip} ${f.furnished ? styles.chipOn : ""}`}
                  aria-pressed={f.furnished}
                  onClick={() => set("furnished", true)}
                >
                  Có nội thất
                </button>
                <button
                  type="button"
                  className={`${styles.chip} ${!f.furnished ? styles.chipOn : ""}`}
                  aria-pressed={!f.furnished}
                  onClick={() => set("furnished", false)}
                >
                  Không nội thất (Nhà thô / Nguyên bản CĐT)
                </button>
              </div>

              {f.furnished && (
                <div style={{ marginTop: 10 }}>
                  <span className="muted xs">
                    Tick chọn nhanh các trang thiết bị hiện có tại căn (Field Host sẽ tới chụp ảnh kiểm định và lập Hộ chiếu bàn giao số 10 hạng mục):
                  </span>
                  <div className={styles.preInventoryGrid}>
                    {PRE_INVENTORY_ITEMS.map((item) => {
                      const active = f.preInventory.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.preInventoryItem} ${active ? styles.preInventoryItemActive : ""}`}
                          onClick={() => toggleInventoryItem(item.key)}
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                          <span style={{ marginLeft: "auto", fontSize: 12 }}>{active ? "✓" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Thông tin tài khoản nhận tiền thuê */}
            <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--surface-2)", borderRadius: "var(--r)" }}>
              <b style={{ fontSize: 13.5, color: "var(--ink)" }}>Tài khoản nhận tiền thuê hàng tháng (VietQR Napas247)</b>
              <p className="xs muted" style={{ margin: "4px 0 8px" }}>
                Khách thuê chuyển khoản tiền thuê hàng tháng, hệ thống tự động gạch nợ và chuyển thẳng vào tài khoản của bạn.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label className="field">
                  <span className="label">Ngân hàng</span>
                  <select
                    className="select"
                    value={f.bankName}
                    onChange={(e) => set("bankName", e.target.value)}
                  >
                    {POPULAR_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="label">Số tài khoản</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Số tài khoản ngân hàng"
                    value={f.bankAccount}
                    onChange={(e) => set("bankAccount", e.target.value.replace(/\D/g, ""))}
                  />
                </label>

                <label className="field">
                  <span className="label">Tên chủ tài khoản</span>
                  <input
                    className="input"
                    placeholder="NGUYEN VAN A"
                    value={f.bankAccountHolder}
                    onChange={(e) => set("bankAccountHolder", e.target.value.toUpperCase())}
                  />
                </label>
              </div>
            </div>

            {/* Ảnh căn hộ tham khảo */}
            <div style={{ marginTop: 14 }}>
              <span className="label">Ảnh căn hộ tham khảo (Không bắt buộc)</span>
              <p className="small muted" style={{ margin: "6px 0 8px" }}>
                Field Host phân khu sẽ tới chụp ảnh thực tế đạt chuẩn Verified (có dấu thời gian và watermark bảo vệ) — bạn không
                cần tự thuê thợ chụp. Nếu đã có sẵn ảnh, bạn có thể tải lên để Host và Admin tham khảo trước.
              </p>
              <PhotoPicker files={photoFiles} onChange={setPhotoFiles} uploadedCount={uploadedCount} />
            </div>

            {err && (
              <p className="field-error" role="alert" style={{ marginTop: 10 }}>
                {err}
              </p>
            )}
            <div className={styles.wizardNav}>
              <button type="button" className="btn btn-quiet" onClick={() => setStep(0)}>
                Quay lại: Thông tin căn
              </button>
              <button type="button" className="btn btn-primary" onClick={next2}>
                Tiếp tục: Ký ủy quyền độc quyền
              </button>
            </div>
          </>
        )}

        {/* ====================================================================
            BƯỚC 3: KÝ ỦY QUYỀN ĐỘC QUYỀN (ZALO OTP)
            ==================================================================== */}
        {step === 2 && (
          <>
            <dl className={styles.summary}>
              <div>
                <dt>Căn hộ định danh</dt>
                <dd>
                  {projectDisplay} · {zoneDisplay} · Toà {f.building} · Tầng {f.floor} · Căn {f.door.padStart(2, "0")} (Mã:{" "}
                  <b>
                    VHOP-{f.building}-{f.door.padStart(2, "0")}
                  </b>
                  )
                </dd>
              </div>
              <div>
                <dt>Loại căn & Diện tích</dt>
                <dd>
                  {LAYOUT_LABEL[f.layout]} · {area} m² tim tường
                </dd>
              </div>
              <div>
                <dt>Giá chào thuê</dt>
                <dd>
                  <b>{vnd(rent)}đ/tháng</b>
                  {isDeal && (
                    <span className={styles.dealBadge} style={{ marginLeft: 6, fontSize: 11 }}>
                      🔥 Căn hời
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Dòng tiền thực nhận của bạn</dt>
                <dd style={{ color: "#059669", fontWeight: 800 }}>
                  {vnd(netIncome)}đ/tháng <span className="xs muted">(đã trừ 5% phí nền tảng)</span>
                </dd>
              </div>
              <div>
                <dt>Tiền cọc bảo đảm (Deposit)</dt>
                <dd>{vnd(deposit || rent)}đ (Giữ suốt kỳ thuê, hoàn lại khi thanh lý)</dd>
              </div>
              <div>
                <dt>Thời gian thuê mong muốn</dt>
                <dd>{LEASE_TERM_LABEL[f.leaseTerm]}</dd>
              </div>
              <div>
                <dt>Tình trạng nội thất</dt>
                <dd>{f.furnished ? `Có nội thất (${f.preInventory.length} món kê khai)` : "Không nội thất"}</dd>
              </div>
              <div>
                <dt>Hình thức khoá cửa</dt>
                <dd>
                  {f.locks.includes("smart")
                    ? f.smartLockOption === "provide_now"
                      ? "Khoá điện tử (Đã lưu mã bảo mật)"
                      : "Khoá điện tử (Bàn giao mã khi thẩm định)"
                    : "Khoá cơ tại quầy phân khu"}
                </dd>
              </div>
            </dl>

            {/* Lộ trình 4 bước thẩm định & vận hành */}
            <div style={{ margin: "14px 0" }}>
              <b style={{ fontSize: 13.5, color: "var(--ink)" }}>Lộ trình thẩm định & niêm yết căn hộ:</b>
              <div className={styles.roadmapContainer}>
                <div className={styles.roadmapStep}>
                  <div className={styles.roadmapStepNumber}>1</div>
                  <div className={styles.roadmapStepTitle}>Ký ủy quyền (0đ)</div>
                  <div className={styles.roadmapStepDesc}>Xác thực Zalo OTP, ký số điện tử bảo mật AES-256.</div>
                </div>

                <div className={styles.roadmapStep}>
                  <div className={styles.roadmapStepNumber}>2</div>
                  <div className={styles.roadmapStepTitle}>Thẩm định 48h</div>
                  <div className={styles.roadmapStepDesc}>Field Host nội khu có thẻ cư dân liên hệ, chụp ảnh verified 10 hạng mục (chi phí 0đ).</div>
                </div>

                <div className={styles.roadmapStep}>
                  <div className={styles.roadmapStepNumber}>3</div>
                  <div className={styles.roadmapStepTitle}>Duyệt & Niêm yết</div>
                  <div className={styles.roadmapStepDesc}>Admin duyệt, đóng watermark số chống môi giới ngoài ăn cắp tin.</div>
                </div>

                <div className={styles.roadmapStep}>
                  <div className={styles.roadmapStepNumber}>4</div>
                  <div className={styles.roadmapStepTitle}>Khớp khách & Dẫn xem</div>
                  <div className={styles.roadmapStepDesc}>AI khớp khách All-in, Host dẫn xem mở cửa sảnh. Khách cọc 2tr khóa căn ngay.</div>
                </div>
              </div>
            </div>

            {/* 3 Cam kết Vàng bảo vệ Chủ nhà */}
            <ul className={styles.terms}>
              <li>
                <ShieldCheck size={16} /> <b>Thoát linh hoạt 15 ngày:</b> Chủ nhà có quyền dừng ủy quyền bất kỳ lúc nào, chỉ cần
                báo trước tối thiểu 15 ngày khi căn hộ đang trống và không trong thời gian giữ chỗ.
              </li>
              <li>
                <ShieldCheck size={16} /> <b>First-to-Pay Wins & Giữ trọn tiền cọc:</b> Khóa căn độc quyền dựa trên tiền cọc thực
                tế 2.000.000đ qua VietQR động. Khoản cọc này chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản, tuyệt đối không trừ
                vào tiền thuê tháng đầu.
              </li>
              <li>
                <ShieldCheck size={16} /> <b>Vận hành Asset-Light:</b> VinStay và Field Host tuyệt đối không ôm thầu sửa chữa cồng
                kềnh; khi có sự cố phát sinh, Host giới thiệu danh bạ thợ kỹ thuật uy tín tại Ocean Park, khách và thợ tự thỏa
                thuận chi phí.
              </li>
            </ul>

            {/* Hộp cam kết thẩm định */}
            <div
              className="card"
              style={{
                background: "var(--surface-2)",
                padding: "14px 16px",
                margin: "12px 0",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <UserCheck size={22} style={{ color: "var(--lagoon)", flex: "none", marginTop: 2 }} />
              <div>
                <b style={{ color: "var(--ink-950)", fontSize: 14 }}>Chuyên viên Field Host nội khu sẽ liên hệ hỗ trợ bạn</b>
                <p className="small muted" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
                  Sau khi ký, Field Host phụ trách phân khu <b>{zoneDisplay}</b> sẽ liên hệ hẹn giờ, tới căn kiểm định hiện trạng
                  và lập Hộ chiếu bàn giao số 10 hạng mục trong vòng <b>48 giờ</b>. Bạn ở nhà 100%, không tốn thời gian di chuyển.
                </p>
              </div>
            </div>

            {/* Checkbox cam đoan Điều 2 */}
            <label
              className="small"
              style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "12px 0", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={warranted}
                onChange={(e) => {
                  setWarranted(e.target.checked);
                  setErr("");
                }}
                style={{ marginTop: 3, flex: "none" }}
              />
              <span>
                <b>Tôi cam đoan:</b> Tôi là chủ sở hữu hợp pháp (hoặc người được uỷ quyền hợp pháp duy nhất) đối với căn hộ theo{" "}
                <b>Điều 2 Hợp đồng Ký gửi Độc quyền</b>; căn hộ không có tranh chấp và đủ điều kiện đưa vào vận hành cho thuê.
              </span>
            </label>

            <div style={{ margin: "14px 0 6px" }}>
              <ConsignOtpSign
                warranted={warranted}
                needPhone={!phoneVerified}
                ensureDraft={ensureDraft}
                onSigned={signed}
                onError={setErr}
              />
              <p className="muted xs" style={{ textAlign: "center", marginTop: 8 }}>
                Nhập mã OTP Zalo đồng nghĩa với việc bạn ký Hợp đồng ủy quyền quản lý căn hộ độc quyền 12 tháng (tự gia hạn), có
                giá trị pháp lý theo Luật Giao dịch điện tử 2023.
              </p>
            </div>

            {err && (
              <p className="field-error" role="alert" style={{ marginTop: 12 }}>
                {err}
              </p>
            )}
            {!draft && (
              <div className={styles.wizardNav}>
                <button type="button" className="btn btn-quiet" onClick={() => setStep(1)}>
                  Quay lại: Khoá cửa & Tài sản
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
