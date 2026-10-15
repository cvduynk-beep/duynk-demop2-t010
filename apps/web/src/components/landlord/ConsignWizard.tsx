"use client";

import { LANDLORD_ITEMS, landlordItemsToCodes } from "@/lib/inspection/landlordItems";
import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ChevronUp,
  Flame,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import { allInCost } from "@/lib/pricing/cost";
import { vnd } from "@/lib/format";
import { errorText, landlordApi } from "@/lib/landlord/api";
import { LAYOUT_LABEL, LEASE_TERM_LABEL } from "@/lib/landlord/labels";
import type {
  BankPayoutAccount,
  BuildingOption,
  Consignment,
  LandlordVerification,
  LayoutKind,
  LeaseTermPref,
  LockKind,
  VerificationStep,
} from "@/lib/landlord/types";
import type { Consignment as MockConsignment } from "@/lib/mock/types";
import { queries } from "@/lib/landlord/queries";
import { invalidateLandlordData, useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { getMockState, setMockState } from "@/lib/mock/store";
import { pickHostFor } from "@/lib/mock/selectors";
import { HOSTS, hostById, zoneOfBuilding } from "@/lib/mock/units";
import { pushToHost, toAdmin, withNotices } from "@/lib/mock/actions";
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

/** Gom toà trong DB theo phân khu (giữ thứ tự xuất hiện của phân khu, toà sắp theo mã). */
export function zonesFromBuildings(buildings: readonly BuildingOption[]): UrbanProject["zones"] {
  const byZone = new Map<string, string[]>();
  for (const b of buildings) byZone.set(b.zoneName, [...(byZone.get(b.zoneName) ?? []), b.buildingCode]);
  return [...byZone].map(([name, codes]) => ({ name, buildings: codes.sort((a, b) => a.localeCompare(b, "vi", { numeric: true })) }));
}

export const URBAN_PROJECTS: UrbanProject[] = [
  {
    id: "vhop1",
    name: "Vinhomes Ocean Park 1",
    location: "Gia Lâm, Hà Nội (Đang trực chiến)",
    // Phân khu + toà của Ocean Park 1 lấy từ DB (`GET /landlord/buildings`) — backend chỉ nhận toà có trong bảng
    // `buildings` (400 "Tòa nhà không thuộc phân khu hỗ trợ"). CẤM ghi cứng danh sách toà ở đây.
    zones: [],
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

/** Ngưỡng trần tối đa cho phép theo layout tại Vinhomes Ocean Park (Chốt chặn Lớp 1: Anti-Abuse & Data Poisoning Guardrail) */
export const LAYOUT_PRICE_CEILING: Record<LayoutKind, number> = {
  Studio: 18_000_000,
  "1PN": 25_000_000,
  "2PN": 35_000_000,
  "3PN": 50_000_000,
};
export const ABSOLUTE_PRICE_CEILING = 80_000_000;

function getBenchmark(zoneName: string, layout: LayoutKind) {
  const table = MARKET_BENCHMARK[zoneName] || MARKET_BENCHMARK.default;
  return table[layout] || MARKET_BENCHMARK.default[layout];
}

/** Món tick nhanh ở "Tình trạng nội thất bàn giao" — map sang mã bảng kê thẩm định (gửi `inventoryCodes`). */
const PRE_INVENTORY_ITEMS = LANDLORD_ITEMS;



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
  allowFastClose: boolean;
  floorRent: string;
}

const blank: Form = {
  building: "",
  floor: "",
  door: "",
  layout: "1PN",
  areaM2: "",
  askRent: "",
  suggestedDeposit: "",
  leaseTerm: "mid",
  maxOccupants: 2,
  petPolicy: "no",
  furnished: true,
  preInventory: ["ac", "fridge", "washer", "kitchen", "heater", "bed", "wardrobe"],
  locks: ["smart"],
  smartLockOption: "provide_now",
  doorCode: "",
  allowFastClose: false,
  floorRent: "",
};

export function ConsignWizard() {
  const buildings = useLandlordQuery(queries.buildings);
  const profile = useLandlordQuery(queries.profile);
  const verification = useLandlordQuery(queries.verification);
  return (
    <QueryView query={verification} skeleton="form">
      {(v) =>
        !v.ready ? (
          <VerifyGate v={v} />
        ) : (
          <QueryView query={buildings} skeleton="form">
            {(bs) => (
              <QueryView query={profile} skeleton="form">
                {(p) => <Wizard buildings={bs} phoneVerified={p.isPhoneVerified} verifiedPhone={p.phone ?? null} payout={v.payout.account} />}
              </QueryView>
            )}
          </QueryView>
        )
      }
    </QueryView>
  );
}

const STEP_LABEL: Record<VerificationStep, string> = {
  phone: "Xác thực số điện thoại (OTP)",
  identity: "Xác thực CCCD (eKYC) — lấy họ tên, địa chỉ thường trú",
  payout: "Xác thực tài khoản ngân hàng chính chủ",
};

/** Chưa xác thực đủ 3 bước ⇒ chưa cho vào form ký gửi; liệt kê bước còn thiếu và dẫn sang trang xác thực. */
function VerifyGate({ v }: { v: LandlordVerification }) {
  const all: VerificationStep[] = ["phone", "identity", "payout"];
  return (
    <div className={`${styles.page} ${styles.wizard}`}>
      <PageHeader title="Ký gửi căn hộ mới" description="Xác thực tài khoản một lần trước khi ký gửi căn đầu tiên." />
      <section className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={20} /> Hoàn tất xác thực để ký gửi
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          Hợp đồng ký gửi độc quyền cần định danh chính chủ: số điện thoại để ký OTP, CCCD làm Bên ủy quyền, và tài khoản đứng tên bạn để
          nhận tiền thuê.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {all.map((k) => {
            const done = !v.missing.includes(k);
            return (
              <li key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {done ? <CheckCircle2 size={18} color="var(--kelp, #2f7d5b)" /> : <CircleDashed size={18} color="var(--ink-3, #9ca3af)" />}
                <span style={done ? { color: "var(--ink-2)" } : { fontWeight: 600 }}>{STEP_LABEL[k]}</span>
              </li>
            );
          })}
        </ul>
        <div>
          <Link href="/landlord/verify" className="btn btn-primary">
            Xác thực ngay ({3 - v.missing.length}/3) <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Wizard({
  buildings,
  phoneVerified,
  verifiedPhone,
  payout,
}: {
  buildings: BuildingOption[];
  phoneVerified: boolean;
  verifiedPhone: string | null;
  /** Tài khoản thụ hưởng ĐÃ XÁC THỰC (dạng che) — căn ký gửi sẽ nhận tiền về đây. */
  payout: BankPayoutAccount | null;
}) {

  const dbZones = zonesFromBuildings(buildings);
  const zonesOf = (projId: string) => (projId === "vhop1" ? dbZones : URBAN_PROJECTS.find((p) => p.id === projId)?.zones ?? []);

  const [projectId, setProjectId] = useState<string>("vhop1");
  const [zoneNameSelected, setZoneNameSelected] = useState<string>(dbZones[0]?.name ?? "");

  const activeProject = URBAN_PROJECTS.find((p) => p.id === projectId);
  const activeZones = zonesOf(projectId);
  const activeZone = activeZones.find((z) => z.name === zoneNameSelected);
  const availableBuildings = activeZone?.buildings || [];

  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({
    ...blank,
    building: availableBuildings[0] ?? buildings[0]?.buildingCode ?? "",
  });

  const handleProjectChange = (newProjId: string) => {
    setProjectId(newProjId);
    const zones = zonesOf(newProjId);
    if (zones.length > 0) {
      const firstZone = zones[0];
      setZoneNameSelected(firstZone.name);
      if (firstZone.buildings.length > 0) {
        set("building", firstZone.buildings[0]);
      }
    }
  };

  const handleZoneChange = (newZoneName: string) => {
    setZoneNameSelected(newZoneName);
    const zoneObj = zonesOf(projectId).find((z) => z.name === newZoneName);
    if (zoneObj && zoneObj.buildings.length > 0) {
      set("building", zoneObj.buildings[0]);
    }
  };

  const projectDisplay = activeProject?.name || "Vinhomes Ocean Park 1";
  const zoneDisplay = zoneNameSelected;

  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [warranted, setWarranted] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [showFastCloseDetails, setShowFastCloseDetails] = useState(false);
  const [showScenarioDetails, setShowScenarioDetails] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const rent = Number(f.askRent) || 0;
  const deposit = Number(f.suggestedDeposit) || 0;
  const area = Number(f.areaM2) || 0;
  const maxFloor = buildings.find((b) => b.buildingCode === f.building)?.totalFloors ?? 60;

  // Định giá benchmark & 3 Khung giá tham chiếu (AI Price Tiers)
  const benchmark = getBenchmark(zoneDisplay, f.layout);
  const competitiveRent = Math.round((benchmark.avg * 0.9) / 100_000) * 100_000;
  const marketRent = benchmark.avg;
  const highRent = Math.round((benchmark.avg * 1.15) / 100_000) * 100_000;

  const rentDiff = benchmark.avg > 0 && rent > 0 ? (benchmark.avg - rent) / benchmark.avg : 0;
  const isDeal = rentDiff >= 0.1; // Tiết kiệm >= 10%

  // Phân loại mức giá hiện tại theo 3 khung
  const isCompetitiveTier = rent > 0 && rent <= competitiveRent;
  const isMarketTier = rent > competitiveRent && rent <= Math.round(marketRent * 1.1);
  const isHighTier = rent > Math.round(marketRent * 1.1);

  // Bảng tính Thiệt hại Trống phòng (Vacancy Bleed Calculator)
  const priceDeltaPerMonth = rent > marketRent ? rent - marketRent : 0;
  const vacancyMonthsEstimated = 1.0; // Trống thêm trung bình 30 ngày (1 tháng)
  const lostRent = Math.round(rent * vacancyMonthsEstimated);
  const effectiveArea = area > 0 ? area : (f.layout === "Studio" ? 33 : f.layout === "1PN" ? 48 : f.layout === "2PN" ? 64 : 85);
  const mgmtFeeLost = Math.round(effectiveArea * 11_000 * vacancyMonthsEstimated);
  const totalVacancyLoss = lostRent + mgmtFeeLost;
  const breakEvenMonths = priceDeltaPerMonth > 0 ? Math.ceil(totalVacancyLoss / priceDeltaPerMonth) : 0;

  // Bảng tính Dòng tiền thực nhận của Chủ nhà (5% phí dịch vụ)
  const serviceFee = Math.round(rent * 0.05);
  const netIncome = Math.max(0, rent - serviceFee);

  // All-in cost preview cho khách
  const preview = rent && area ? allInCost({ rent, areaM2: area }) : null;

  // Cơ chế Biên độ Giá Sàn Ủy Quyền (Fast-Close Floor Price Corridor)
  const floorRentNum = Number(f.floorRent) || 0;
  const fastCloseDiscount6m =
    f.allowFastClose && floorRentNum > 0 && floorRentNum < rent
      ? Math.round((rent - (rent - floorRentNum) * 0.5) / 50_000) * 50_000
      : rent;

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

  const handleSelectTier = (tierRent: number) => {
    const raw = String(tierRent);
    setF((prev) => {
      const prevRentNum = Number(prev.askRent) || 0;
      const prevDepNum = Number(prev.suggestedDeposit) || 0;
      const shouldSyncDeposit = !prev.suggestedDeposit || prevDepNum === prevRentNum;
      return {
        ...prev,
        askRent: raw,
        suggestedDeposit: shouldSyncDeposit ? raw : prev.suggestedDeposit,
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
    const ceiling = LAYOUT_PRICE_CEILING[f.layout] || ABSOLUTE_PRICE_CEILING;
    if (rent > ceiling) {
      setErr(
        `Mức giá ${rent.toLocaleString("vi-VN")}đ vượt quá ngưỡng trần cho phép đối với căn ${
          LAYOUT_LABEL[f.layout]
        } tại Vinhomes Ocean Park (tối đa ${ceiling.toLocaleString("vi-VN")}đ/tháng). Vui lòng kiểm tra lại số tiền.`,
      );
      return;
    }
    const currentDeposit = deposit || rent;
    // Cọc v2: khách chuyển thẳng khoản này khi chốt căn ⇒ từ nửa tháng đến 3 tháng thuê (cùng biên kiểm định của backend).
    if (currentDeposit < Math.ceil(rent / 2) || currentDeposit > 3 * rent) {
      setErr("Tiền cọc đề xuất phải từ nửa tháng đến 3 tháng tiền thuê.");
      return;
    }

    if (f.allowFastClose) {
      if (floorRentNum < 3_000_000) {
        setErr("Khi bật Ủy quyền chốt nhanh, mức giá sàn tối thiểu phải từ 3.000.000đ/tháng.");
        return;
      }
      if (floorRentNum >= rent) {
        setErr(
          `Mức giá sàn (${floorRentNum.toLocaleString("vi-VN")}đ) phải thấp hơn Giá chào thuê (${rent.toLocaleString(
            "vi-VN",
          )}đ) để tạo biên độ ưu đãi.`,
        );
        return;
      }
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
      f.doorCode.length < 4
    ) {
      setErr("Vui lòng nhập mã mở khóa (tối thiểu 4 số) hoặc chọn 'Cài đặt mã số tạm / Cung cấp mã cho Field Host khi tới thẩm định'.");
      return;
    }

    setErr("");
    setStep(2);
  };

  /**
   * Tạo hồ sơ = ký ủy quyền (không có bản nháp): cam kết + OTP đi cùng form trong một request.
   * Trả true khi hồ sơ đã được tạo và ký; lỗi thì set `err` (qua `onError`) và trả false.
   */
  const submitSigned = async (sig: { otp?: string; phone?: string }): Promise<boolean> => {
    // Đóng gói ghi chú: quy chế, tài sản kê khai & tài khoản nhận tiền
    const noteParts: string[] = [];
    noteParts.push(
      `Quy chế: Tối đa ${f.maxOccupants} người · ${
        f.petPolicy === "no"
          ? "Không thú cưng"
          : f.petPolicy === "small"
          ? "Chó mèo nhỏ"
          : "Nuôi thú cưng tự do"
      }`,
    );
    if (f.allowFastClose && floorRentNum > 0) {
      noteParts.push(`Chốt nhanh: Sàn ${vnd(floorRentNum)}đ`);
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
      allowFastClose: f.allowFastClose,
      floorRent: f.allowFastClose && floorRentNum > 0 ? floorRentNum : undefined,
      ...(f.locks.includes("smart") && f.smartLockOption === "provide_now" && f.doorCode ? { doorCode: f.doorCode } : {}),
      // Món nội thất đi riêng qua `inventoryCodes` (mã bảng kê) ⇒ màn thẩm định tick sẵn đúng các món chủ nhà khai.
      ...(f.furnished ? { inventoryCodes: landlordItemsToCodes(f.preInventory) } : {}),
      note: combinedNote,
      ownershipWarranted: warranted,
      ...(sig.otp ? { otp: sig.otp } : {}),
      ...(sig.phone ? { phone: sig.phone } : {}),
    });
    if (!res.ok) {
      setErr(errorText(res, "Không ký gửi được, thử lại sau."));
      return false;
    }
    // Ảnh tham khảo là tuỳ chọn: hồ sơ đã ký rồi nên lỗi tải ảnh không được chặn/ký lại.
    if (photoFiles.length) {
      const up = await landlordApi.uploadPhotos(res.data.id, photoFiles);
      if (up.ok) {
        setUploadedCount(up.data.length);
        setPhotoFiles([]);
      } else {
        toast(`Hồ sơ đã ký nhưng chưa tải được ảnh tham khảo (${errorText(up, "thử lại sau")}). Field Host sẽ chụp ảnh khi thẩm định.`, "info");
      }
    }
    signed(res.data);
    return true;
  };

  const signed = (c: Consignment) => {
    setCreatedId(c.id);
    setDone(true);
    invalidateLandlordData();

    // Đồng bộ hồ sơ vào MockState cho màn hình Field Host & Admin
    try {
      const nowMs = Date.now();
      const zone = zoneOfBuilding(f.building);
      const state = getMockState();
      const picked = zone ? pickHostFor(state, zone.id, "inspector") : { hostId: "H01", fallback: false };
      const assignedHostId = (c.hostId && HOSTS.some((h) => h.id === c.hostId)) ? c.hostId : picked.hostId;
      const hostName = hostById(assignedHostId)?.name ?? assignedHostId;
      const can = `${f.building} · Tầng ${f.floor} · Căn ${f.door.padStart(2, "0")}`;

      const mockConsign: MockConsignment = {
        id: c?.id || `cs-${nowMs}`,
        landlordId: (c as { landlordId?: string })?.landlordId || "L1",
        building: f.building,
        floor: Number(f.floor),
        door: f.door.padStart(2, "0"),
        layout: f.layout,
        areaM2: area,
        askRent: rent,
        suggestedDeposit: deposit || rent,
        allowFastClose: f.allowFastClose,
        floorRent: f.allowFastClose && floorRentNum > 0 ? floorRentNum : undefined,
        leaseTerm: f.leaseTerm,
        furnished: Boolean(f.furnished),
        locks: f.locks,
        auditByHost: true,
        status: "awaiting_host",
        createdAt: c.createdAt || new Date(nowMs).toISOString(),
        signedAt: c.signedAt || new Date(nowMs).toISOString(),
        hostId: assignedHostId,
        inspectDueAt: c.inspectDueAt || new Date(nowMs + 48 * 3_600_000).toISOString(),
        furnishing: f.furnished ? "full" : "empty",
        lock: (f.locks[0] as "smart" | "physical") || "smart",
        items: [],
      };

      setMockState((s) => {
        const exists = s.consignments.some((item) => item.id === c.id);
        const updatedList: MockConsignment[] = exists
          ? s.consignments.map((item) => (item.id === c.id ? { ...item, ...mockConsign } : item))
          : [mockConsign, ...s.consignments];

        return withNotices(
          { ...s, consignments: updatedList },
          pushToHost(assignedHostId, {
            tone: "info",
            title: "Ticket thẩm định ký gửi mới",
            body: `${can} (${f.layout}, ${area} m²), hạn 48h.`,
          }),
          toAdmin({
            tone: "info",
            title: "Yêu cầu ký gửi mới",
            body: `${can} giao chuyên viên thẩm định ${hostName}.`,
          }),
        );
      });
    } catch {
      // bỏ qua nếu lỗi đồng bộ mock
    }
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
        title="Ký gửi căn hộ mới"
        description="Cho thuê thần tốc — Khách chuyển Tiền cọc bảo đảm qua VietQR để khoá căn ngay — Chủ nhà ở nhà 100%, không đi lại 20–30km mở cửa."
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
                  {activeZones.map((z) => (
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
                  value={f.leaseTerm === "fixed" ? "long" : f.leaseTerm}
                  onChange={(e) => set("leaseTerm", e.target.value as LeaseTermPref)}
                >
                  <option value="mid">{LEASE_TERM_LABEL.mid}</option>
                  <option value="long">{LEASE_TERM_LABEL.long}</option>
                </select>
                {f.leaseTerm === "mid" && (
                  <span className="muted xs" style={{ marginTop: 6, display: "block", color: "#0369a1", lineHeight: 1.5 }}>
                    💡 Khách thuê tối thiểu 6 tháng, cùng một mức giá chuẩn (không phụ phí thuê ngắn hạn). Khách trả trước 1/3/6 tháng/lần chỉ được giảm giá
                    khi bạn bật Ủy quyền chốt nhanh, và không bao giờ thấp hơn Giá sàn.
                  </span>
                )}
                {f.leaseTerm === "long" && (
                  <span className="muted xs" style={{ marginTop: 6, display: "block", color: "var(--ink-2, #64748b)", lineHeight: 1.5 }}>
                    Chủ nhà ký hợp đồng ổn định nguyên năm với 100% giá chuẩn, không lo thay khách và không tốn công chuyển giao bàn giao nhiều lần.
                  </span>
                )}
              </label>
            </div>

            {/* 3 Khung Giá Tham Chiếu & Khuyến Nghị AI */}
            <div className={styles.priceTiersContainer}>
              <div className={styles.priceTiersHeader}>
                <div className={styles.priceTiersHeaderTitle}>
                  <Sparkles size={16} className={styles.aiSparkleIcon} />
                  <span>Khung giá tham chiếu AI</span>
                  <span className={styles.priceTiersBadgeLayout}>
                    {LAYOUT_LABEL[f.layout]} · {zoneDisplay}
                  </span>
                </div>
                <span className={styles.priceTiersSubtitle}>
                  Bấm chọn gói tối ưu hoặc tự điền giá bên dưới
                </span>
              </div>

              <div className={styles.priceTiersGrid}>
                {/* Khung 1: Cạnh tranh */}
                <button
                  type="button"
                  className={`${styles.priceTierCard} ${styles.priceTierDeal} ${isCompetitiveTier ? styles.priceTierCardActive : ""}`}
                  onClick={() => handleSelectTier(competitiveRent)}
                >
                  <div className={styles.priceTierCardTop}>
                    <div className={styles.priceTierLabelGroup}>
                      <span className={styles.priceTierLabel}>Giá Cạnh Tranh</span>
                      <span className={`${styles.priceTierBadge} ${styles.priceTierBadgeDeal}`}>
                        <Flame size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                        Căn hời
                      </span>
                    </div>
                    <div className={`${styles.tierRadioIndicator} ${isCompetitiveTier ? styles.tierRadioActiveDeal : ""}`}>
                      {isCompetitiveTier ? <CheckCircle2 size={15} /> : null}
                    </div>
                  </div>

                  <div className={styles.priceTierAmountWrapper}>
                    <span className={styles.priceTierAmount}>{vnd(competitiveRent)}</span>
                    <span className={styles.priceTierUnit}>đ/tháng</span>
                  </div>

                  <div className={`${styles.priceTierTimingTag} ${styles.timingFast}`}>
                    <Zap size={11} /> Dự kiến chốt: <b>&lt; 5 ngày</b>
                  </div>

                  <div className={styles.priceTierDesc}>
                    AI gắn nhãn <b>Căn hời Top 1</b>, tiếp cận gấp 3 lần khách
                  </div>
                </button>

                {/* Khung 2: Thị trường */}
                <button
                  type="button"
                  className={`${styles.priceTierCard} ${styles.priceTierMarket} ${isMarketTier ? styles.priceTierCardActive : ""}`}
                  onClick={() => handleSelectTier(marketRent)}
                >
                  <div className={styles.priceTierCardTop}>
                    <div className={styles.priceTierLabelGroup}>
                      <span className={styles.priceTierLabel}>Giá Thị Trường</span>
                      <span className={`${styles.priceTierBadge} ${styles.priceTierBadgeMarket}`}>
                        Cân bằng
                      </span>
                    </div>
                    <div className={`${styles.tierRadioIndicator} ${isMarketTier ? styles.tierRadioActiveMarket : ""}`}>
                      {isMarketTier ? <CheckCircle2 size={15} /> : null}
                    </div>
                  </div>

                  <div className={styles.priceTierAmountWrapper}>
                    <span className={styles.priceTierAmount}>{vnd(marketRent)}</span>
                    <span className={styles.priceTierUnit}>đ/tháng</span>
                  </div>

                  <div className={`${styles.priceTierTimingTag} ${styles.timingNormal}`}>
                    <TrendingDown size={11} /> Dự kiến chốt: <b>7 – 14 ngày</b>
                  </div>

                  <div className={styles.priceTierDesc}>
                    Mức giá phổ biến, thanh khoản và dòng tiền ổn định
                  </div>
                </button>

                {/* Khung 3: Cao hơn thị trường */}
                <button
                  type="button"
                  className={`${styles.priceTierCard} ${styles.priceTierHigh} ${isHighTier ? styles.priceTierCardActive : ""}`}
                  onClick={() => handleSelectTier(highRent)}
                >
                  <div className={styles.priceTierCardTop}>
                    <div className={styles.priceTierLabelGroup}>
                      <span className={styles.priceTierLabel}>Giá Kỳ Vọng Cao</span>
                      <span className={`${styles.priceTierBadge} ${styles.priceTierBadgeWarn}`}>
                        <AlertTriangle size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                        Khó chốt
                      </span>
                    </div>
                    <div className={`${styles.tierRadioIndicator} ${isHighTier ? styles.tierRadioActiveHigh : ""}`}>
                      {isHighTier ? <CheckCircle2 size={15} /> : null}
                    </div>
                  </div>

                  <div className={styles.priceTierAmountWrapper}>
                    <span className={styles.priceTierAmount}>≥ {vnd(highRent)}</span>
                    <span className={styles.priceTierUnit}>đ/tháng</span>
                  </div>

                  <div className={`${styles.priceTierTimingTag} ${styles.timingSlow}`}>
                    <AlertTriangle size={11} /> Nguy cơ trống: <b>&gt; 30–45 ngày</b>
                  </div>

                  <div className={styles.priceTierDesc}>
                    Vượt trần All-in của 90% khách, rủi ro ngâm phòng
                  </div>
                </button>
              </div>
            </div>

            {/* Phân tách tinh tế & Nhập tùy chỉnh */}
            <div className={styles.customPriceDivider}>
              <span>Hoặc tự nhập mức giá & tiền cọc theo ý muốn</span>
            </div>

            <div>
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
                  {rent > (LAYOUT_PRICE_CEILING[f.layout] || ABSOLUTE_PRICE_CEILING) && (
                    <span style={{ color: "#dc2626", fontSize: "11.5px", marginTop: "4px", fontWeight: 600 }}>
                      ⛔ Vượt ngưỡng trần tối đa ({vnd(LAYOUT_PRICE_CEILING[f.layout] || ABSOLUTE_PRICE_CEILING)}đ đối với {LAYOUT_LABEL[f.layout]}). Vui lòng điều chỉnh lại.
                    </span>
                  )}
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

              {/* Smart Toggle: Cơ chế Biên độ Giá Sàn & Ủy quyền Chốt Nhanh */}
              <div className={`${styles.fastCloseCard} ${f.allowFastClose ? styles.fastCloseCardActive : ""}`}>
                <div className={styles.fastCloseHeader}>
                  <div className={styles.fastCloseHeaderLeft}>
                    <div className={styles.fastCloseIconBadge}>
                      <Zap size={15} />
                    </div>
                    <div className={styles.fastCloseTitleCol}>
                      <div className={styles.fastCloseTitleGroup}>
                        <span className={styles.fastCloseTitle}>Ủy quyền AI chốt deal nhanh (Fast-Close Floor Price)</span>
                        <span className={styles.fastClosePill}>Khuyên dùng</span>
                      </div>
                      <div className={styles.fastCloseSummaryRow}>
                        <span className={styles.fastCloseSummaryText}>
                          Tự động ưu đãi trong biên độ an toàn để chốt khách cọc nhanh / đóng dài hạn.
                        </span>
                        <button
                          type="button"
                          className={styles.expandExplainBtn}
                          onClick={() => setShowFastCloseDetails((prev) => !prev)}
                          title={showFastCloseDetails ? "Thu gọn lý giải cơ chế" : "Xem chi tiết lý giải & cam kết"}
                        >
                          <span>{showFastCloseDetails ? "Thu gọn lý giải" : "Lý giải cơ chế & bảo mật"}</span>
                          {showFastCloseDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <label className={styles.switchLabel} title="Bật/Tắt ủy quyền chốt nhanh">
                    <input
                      type="checkbox"
                      checked={f.allowFastClose}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setF((prev) => {
                          const currentRent = Number(prev.askRent) || 0;
                          const suggestedFloor =
                            !prev.floorRent && currentRent >= 3_000_000
                              ? String(Math.max(3_000_000, Math.round((currentRent * 0.94) / 100_000) * 100_000))
                              : prev.floorRent;
                          return {
                            ...prev,
                            allowFastClose: checked,
                            floorRent: checked ? suggestedFloor : prev.floorRent,
                          };
                        });
                      }}
                      className={styles.switchInput}
                    />
                    <span className={styles.switchSlider} />
                  </label>
                </div>

                {/* Khối lý giải cơ chế & bảo mật mở rộng/thu gọn */}
                {showFastCloseDetails && (
                  <div className={styles.fastCloseDetailBox}>
                    <div className={styles.detailBoxItem}>
                      <Zap size={14} className={styles.detailBoxIcon} />
                      <div>
                        <b>Cơ chế ưu đãi tự động:</b> Khách chuyển cọc trong 24h được giảm ~5% tiền cọc (tối thiểu 200.000đ, tối đa 8%) và được chốt cọc ngay trên app mà không cần đi xem. Khi ký hợp đồng, khách trả trước 1/3/6 tháng/lần được giảm giá thuê 3,5%/5,5%/10%, không bao giờ thấp hơn Giá sàn của bạn.
                      </div>
                    </div>
                    <div className={styles.detailBoxItem}>
                      <ShieldCheck size={14} className={styles.detailBoxIconSuccess} />
                      <div>
                        <b>Bảo mật 100% & Cam kết đền bù:</b> Giá sàn hoàn toàn ẩn với khách thuê trên website (khách chỉ thấy giá niêm yết). Cam kết bồi thường 100% phần chênh lệch nếu vi phạm chốt hợp đồng dưới giá sàn.
                      </div>
                    </div>
                    <div className={styles.detailBoxItem}>
                      <Sparkles size={14} className={styles.detailBoxIconGold} />
                      <div>
                        <b>Dòng tiền & Lợi ích tài chính:</b> Đem về 30–70 triệu đồng tiền mặt trả trước ngay lập tức cho chủ nhà, triệt tiêu thời gian trống phòng kéo dài 15–30 ngày.
                      </div>
                    </div>
                  </div>
                )}

                {f.allowFastClose && (
                  <div className={styles.fastCloseBody}>
                    {/* Hàng 1: Label + Badge bảo mật */}
                    <div className={styles.floorInputHeader}>
                      <div className={styles.floorInputLabelGroup}>
                        <span className={styles.floorInputLabel}>Mức giá sàn tối thiểu chấp nhận chốt</span>
                        <span className={styles.floorSecurityBadge}>
                          <ShieldCheck size={13} />
                          Bảo mật 100% · Ẩn với khách thuê
                        </span>
                      </div>
                      <span className={styles.floorHint}>
                        Khách chỉ thấy giá niêm yết {rent > 0 ? `(${vnd(rent)}đ/tháng)` : ""} trên website
                      </span>
                    </div>

                    {/* Hàng 2: Input + Quick Presets 1-chạm */}
                    <div className={styles.floorControlRow}>
                      <div className={styles.floorInputWrapper}>
                        <input
                          className={`input ${styles.floorInput}`}
                          inputMode="numeric"
                          placeholder={
                            rent >= 3_000_000
                              ? `Gợi ý: ${vnd(Math.round((rent * 0.94) / 100_000) * 100_000)}đ`
                              : "Từ 3.000.000đ"
                          }
                          value={f.floorRent ? Number(f.floorRent).toLocaleString("vi-VN") : ""}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            set("floorRent", raw);
                          }}
                        />
                        <span className={styles.floorInputUnit}>đ/tháng</span>
                      </div>

                      {/* Nút bấm chọn nhanh gợi ý */}
                      {rent >= 3_000_000 && (
                        <div className={styles.floorPresets}>
                          <span className={styles.presetsLabel}>Chọn nhanh:</span>
                          <button
                            type="button"
                            className={`${styles.presetChip} ${floorRentNum === Math.round((rent * 0.95) / 50_000) * 50_000 ? styles.presetChipActive : ""}`}
                            onClick={() => set("floorRent", String(Math.round((rent * 0.95) / 50_000) * 50_000))}
                            title="Giá sàn thấp hơn giá chào 5%: kỳ 6 tháng (−10%) bị kẹp tại giá sàn"
                          >
                            -5% ({vnd(Math.round((rent * 0.95) / 50_000) * 50_000)}đ)
                          </button>
                          <button
                            type="button"
                            className={`${styles.presetChip} ${floorRentNum === Math.round((rent * 0.92) / 50_000) * 50_000 ? styles.presetChipActive : ""}`}
                            onClick={() => set("floorRent", String(Math.round((rent * 0.92) / 50_000) * 50_000))}
                            title="Giá sàn thấp hơn giá chào 8%: kỳ 6 tháng (−10%) bị kẹp tại giá sàn"
                          >
                            -8% ({vnd(Math.round((rent * 0.92) / 50_000) * 50_000)}đ)
                          </button>
                          <button
                            type="button"
                            className={`${styles.presetChip} ${floorRentNum === Math.round((rent * 0.9) / 50_000) * 50_000 ? styles.presetChipActive : ""}`}
                            onClick={() => set("floorRent", String(Math.round((rent * 0.9) / 50_000) * 50_000))}
                            title="Giá sàn thấp hơn giá chào 10%: đủ cho cả 3 mức giảm 3,5% / 5,5% / 10%"
                          >
                            -10% ({vnd(Math.round((rent * 0.9) / 50_000) * 50_000)}đ)
                          </button>
                        </div>
                      )}
                    </div>

                    {floorRentNum > 0 && floorRentNum >= rent && rent > 0 && (
                      <span style={{ color: "#dc2626", fontSize: "11.5px", marginTop: "2px", fontWeight: 600 }}>
                        ⚠️ Giá sàn tối thiểu phải thấp hơn Giá chào thuê ({vnd(rent)}đ/tháng) để tạo biên độ ưu đãi.
                      </span>
                    )}
                    {floorRentNum > 0 && floorRentNum < 3_000_000 && (
                      <span style={{ color: "#dc2626", fontSize: "11.5px", marginTop: "2px", fontWeight: 600 }}>
                        ⛔ Giá sàn không được thấp hơn 3.000.000đ/tháng theo quy chuẩn bảo vệ giá trị căn hộ.
                      </span>
                    )}

                    {floorRentNum > 0 && floorRentNum < rent && floorRentNum >= 3_000_000 && (
                      <div className={styles.corridorBar}>
                        <div className={styles.corridorBarHeader}>
                          <div className={styles.corridorBarTitleGroup}>
                            <span>💡 Kịch bản kích hoạt ưu đãi tự động của AI:</span>
                            <span className={styles.corridorBarDelta}>
                              Biên độ linh hoạt: <b>{vnd(rent - floorRentNum)}đ/tháng</b>
                            </span>
                          </div>
                          <button
                            type="button"
                            className={styles.toggleScenarioBtn}
                            onClick={() => setShowScenarioDetails((prev) => !prev)}
                            title={showScenarioDetails ? "Thu gọn kịch bản chi tiết" : "Mở rộng xem kịch bản 3 mốc chi tiết"}
                          >
                            <span>{showScenarioDetails ? "Thu gọn kịch bản" : "Xem kịch bản chi tiết (3 mốc)"}</span>
                            {showScenarioDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>

                        {showScenarioDetails && (
                          <div className={styles.corridorGrid}>
                            <div className={styles.corridorItem}>
                              <span className={styles.corridorTag}>Đóng 1–3 tháng</span>
                              <span className={styles.corridorRent}>{vnd(rent)}đ/tháng</span>
                              <span className={styles.corridorNote}>100% Giá niêm yết</span>
                            </div>
                            <div className={styles.corridorItem}>
                              <span className={`${styles.corridorTag} ${styles.corridorTag6m}`}>Đóng 6 tháng</span>
                              <span className={styles.corridorRent}>{vnd(fastCloseDiscount6m)}đ/tháng</span>
                              <span className={styles.corridorNote}>Thu trước 1 cục <b>{vnd(fastCloseDiscount6m * 6)}đ</b></span>
                            </div>
                            <div className={styles.corridorItem}>
                              <span className={`${styles.corridorTag} ${styles.corridorTag12m}`}>Đóng 12 tháng / Cọc 24h</span>
                              <span className={styles.corridorRent}>{vnd(floorRentNum)}đ/tháng</span>
                              <span className={styles.corridorNote}>Thu trước 1 cục <b>{vnd(floorRentNum * 12)}đ</b> (Mức sàn)</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bảng tính Thiệt hại Trống phòng (Vacancy Bleed Calculator) khi chọn mức giá Khung 3 */}
              {isHighTier && (
                <div className={styles.vacancyBleedCard}>
                  <div className={styles.vacancyBleedHeader}>
                    <AlertTriangle size={22} style={{ color: "#ea580c", flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div className={styles.vacancyBleedHeaderTitle}>
                        Cảnh báo mô phỏng: Thiệt hại tài chính kép do neo giá cao gây trống phòng
                      </div>
                      <div className={styles.vacancyBleedHeaderDesc}>
                        Mức giá bạn đang chào ({vnd(rent)}đ/tháng) cao hơn <b>{vnd(priceDeltaPerMonth)}đ/tháng (+{Math.abs(Math.round(rentDiff * 100))}%)</b> so với mặt bằng thực tế tại {zoneDisplay}.
                      </div>
                    </div>
                  </div>

                  <div className={styles.vacancyBleedGrid}>
                    <div className={styles.vacancyBleedItem}>
                      <span className={styles.vacancyBleedItemLabel}>Thời gian trống phòng dự kiến:</span>
                      <span className={styles.vacancyBleedItemValue}>⏳ 30 – 45 ngày</span>
                    </div>
                    <div className={styles.vacancyBleedItem}>
                      <span className={styles.vacancyBleedItemLabel}>Tiền thuê mất trắng khi phòng trống:</span>
                      <span className={`${styles.vacancyBleedItemValue} ${styles.vacancyBleedItemValueLoss}`}>-{vnd(lostRent)}đ</span>
                    </div>
                    <div className={styles.vacancyBleedItem}>
                      <span className={styles.vacancyBleedItemLabel}>Phí quản lý BQL Vinhomes phải gánh:</span>
                      <span className={`${styles.vacancyBleedItemValue} ${styles.vacancyBleedItemValueLoss}`}>-{vnd(mgmtFeeLost)}đ</span>
                    </div>
                    <div className={styles.vacancyBleedItem}>
                      <span className={styles.vacancyBleedItemLabel}>Tổng thiệt hại tài chính trống phòng:</span>
                      <span className={`${styles.vacancyBleedItemValue} ${styles.vacancyBleedItemValueLoss}`} style={{ fontSize: 16 }}>
                        -{vnd(totalVacancyLoss)}đ
                      </span>
                    </div>
                  </div>

                  <div className={styles.vacancyBleedConclusion}>
                    💡 <b>Bài toán toán học thực tế:</b> Để bù lại khoản thiệt hại trống phòng <b>{vnd(totalVacancyLoss)}đ</b> bằng số tiền chênh lệch {vnd(priceDeltaPerMonth)}đ/tháng, Bác phải cho thuê liên tục <b>hơn {breakEvenMonths} tháng</b> không được trống 1 ngày nào!
                    <br />
                    Khuyến nghị: Chọn <b>Giá Thị Trường ({vnd(marketRent)}đ)</b> hoặc <b>Giá Cạnh Tranh ({vnd(competitiveRent)}đ)</b> sẽ giúp Bác thu về dòng tiền ròng cả năm cao hơn từ <b>8.000.000 – 15.000.000 VNĐ</b> so với việc để căn trống thêm 1 tháng.
                  </div>
                </div>
              )}

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
                    💡 <b>Bảo đảm an toàn tài chính:</b> Khách chuyển ngay Tiền cọc bảo đảm qua VietQR động khi chốt căn; khoản này chuyển 100% thành Tiền Cọc
                    Bảo Đảm Tài Sản khi ký HĐ, <b>tuyệt đối không khấu trừ</b> vào tiền thuê tháng đầu tiên.
                  </p>
                  <p className="xs muted" style={{ margin: "4px 0 0", color: "#64748b" }}>
                    ⚖️ <b>Quy chuẩn giá NET:</b> Giá chào thuê là <b>Giá NET</b> (chưa bao gồm thuế TNCN/VAT nếu khách thuê doanh nghiệp yêu cầu xuất hóa đơn đỏ).
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

            {/* Tài khoản nhận tiền: lấy tài khoản ĐÃ XÁC THỰC ở trang Xác thực, không nhập lại ở đây. */}
            <div className={styles.payoutContainer}>
              <div className={styles.payoutContainerHeader}>
                <b style={{ fontSize: 13.5, color: "var(--ink)" }}>Tài khoản nhận tiền thuê hàng tháng (VietQR Napas247)</b>
                <span className={styles.payoutSecurityTag}>
                  <ShieldCheck size={13} /> Đã xác thực chính chủ
                </span>
              </div>
              {payout && (
                <div className={styles.payoutVerifiedCard}>
                  <div className={styles.payoutCardHeader}>
                    <div className={styles.payoutCardLeft}>
                      <div className={styles.payoutCardIconBadge}>
                        <Building2 size={18} />
                      </div>
                      <div>
                        <div className={styles.payoutCardTitleRow}>
                          <span className={styles.payoutBankName}>{payout.bankName}</span>
                        </div>
                        <div className={styles.payoutAccountNo}>
                          Số TK: <b className="tnum">{payout.bankAccountMasked}</b> · Chủ TK: <b>{payout.bankAccountHolder}</b>
                        </div>
                      </div>
                    </div>
                    <Link href="/landlord/verify" className={styles.changePayoutBtn}>
                      Đổi tài khoản
                    </Link>
                  </div>
                  <div className={styles.payoutCardFooter}>
                    <span>Tiền thuê của căn này sẽ chuyển về tài khoản trên. Đổi tài khoản sau chỉ áp dụng cho căn ký gửi mới.</span>
                  </div>
                </div>
              )}
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
              <div>
                <dt>Cơ chế Chốt Nhanh & Giá Sàn</dt>
                <dd>
                  {f.allowFastClose && floorRentNum > 0 ? (
                    <span style={{ color: "#0284c7", fontWeight: 700 }}>
                      ⚡ Đã ủy quyền chốt nhanh (Giá sàn tối thiểu: <b>{vnd(floorRentNum)}đ/tháng</b>)
                    </span>
                  ) : (
                    <span>Chốt cố định theo giá chào ({vnd(rent)}đ/tháng)</span>
                  )}
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
                  <div className={styles.roadmapStepDesc}>AI khớp khách All-in, Host dẫn xem mở cửa sảnh. Khách chuyển cọc bảo đảm khóa căn ngay.</div>
                </div>
              </div>
            </div>

            {/* 4 Cam kết Vàng bảo vệ Chủ nhà */}
            <ul className={styles.terms}>
              <li>
                <ShieldCheck size={16} /> <b>Bảo vệ Giá Sàn & Bảo mật 100%:</b> Trường hợp bật Ủy quyền chốt nhanh, hệ thống chỉ
                giảm ~5% tiền cọc khi khách cọc trong 24h và giảm giá thuê 3,5%/5,5%/10% khi khách trả trước 1/3/6 tháng/lần; cam kết tuyệt đối không bao giờ chốt giá thấp
                hơn Giá sàn {f.allowFastClose && floorRentNum > 0 ? `${vnd(floorRentNum)}đ/tháng` : "đã định"} và bảo mật giá sàn
                không công khai cho khách thuê.
              </li>
              <li>
                <ShieldCheck size={16} /> <b>Thoát linh hoạt 15 ngày:</b> Chủ nhà có quyền dừng ủy quyền bất kỳ lúc nào, chỉ cần
                báo trước tối thiểu 15 ngày khi căn hộ đang trống và không trong thời gian giữ chỗ.
              </li>
              <li>
                <ShieldCheck size={16} /> <b>First-to-Pay Wins & Giữ trọn tiền cọc:</b> Khóa căn độc quyền dựa trên tiền cọc thực
                tế (bằng Tiền cọc bảo đảm của căn) qua VietQR động. Khoản cọc này chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản, tuyệt đối không trừ
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
                verifiedPhone={verifiedPhone}
                onSign={submitSigned}
                onError={setErr}
              />
              <p className="muted xs" style={{ textAlign: "center", marginTop: 8 }}>
                {phoneVerified ? "Bấm ký bằng tài khoản có số Zalo đã xác thực" : "Nhập mã OTP Zalo"} đồng nghĩa với việc bạn ký Hợp đồng ủy quyền quản lý căn hộ độc quyền 12 tháng (tự gia hạn), có
                giá trị pháp lý theo Luật Giao dịch điện tử 2023.
              </p>
            </div>

            {err && (
              <p className="field-error" role="alert" style={{ marginTop: 12 }}>
                {err}
              </p>
            )}
            <div className={styles.wizardNav}>
              <button type="button" className="btn btn-quiet" onClick={() => setStep(1)}>
                Quay lại: Khoá cửa & Tài sản
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
