"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Building,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Flame,
  Home,
  Info,
  Key,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import { allInCost } from "@/lib/mock/cost";
import { vnd } from "@/lib/mock/format";
import { errorText, landlordApi } from "@/lib/landlord/api";
import { LAYOUT_LABEL, LEASE_TERM_LABEL } from "@/lib/landlord/labels";
import type { BuildingOption, Consignment, LayoutKind, LeaseTermPref, LockKind, MyProfile } from "@/lib/landlord/types";
import type { Consignment as MockConsignment } from "@/lib/mock/types";
import { queries, type QueryDef } from "@/lib/landlord/queries";
import { invalidateLandlordData, useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { getMockState, setMockState } from "@/lib/mock/store";
import { pickHostFor } from "@/lib/mock/selectors";
import { HOSTS, hostById, zoneOfBuilding } from "@/lib/mock/units";
import { pushToHost, toAdmin, withNotices, zaloToLandlord } from "@/lib/mock/actions";
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
  saveAsDefaultPayout: boolean;
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
  leaseTerm: "flexible",
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
  saveAsDefaultPayout: true,
  allowFastClose: false,
  floorRent: "",
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
                    <Wizard key={d?.id ?? "new"} buildings={bs} phoneVerified={p.isPhoneVerified} draft={d ?? undefined} profile={p} />
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
  profile,
}: {
  buildings: BuildingOption[];
  phoneVerified: boolean;
  draft?: Consignment;
  profile?: MyProfile;
}) {
  const savedPayout =
    profile?.payoutAccount ||
    (typeof window !== "undefined"
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem("landlord_default_payout") || "null");
          } catch {
            return null;
          }
        })()
      : null);

  const [isEditingBank, setIsEditingBank] = useState<boolean>(!savedPayout?.bankAccount);

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
          bankName: (draft as { bankName?: string }).bankName || savedPayout?.bankName || "Techcombank",
          bankAccount: (draft as { bankAccount?: string }).bankAccount || savedPayout?.bankAccount || "",
          bankAccountHolder:
            (draft as { bankAccountHolder?: string }).bankAccountHolder ||
            savedPayout?.bankAccountHolder ||
            profile?.fullName?.toUpperCase() ||
            "",
          saveAsDefaultPayout: true,
          allowFastClose: (draft as { allowFastClose?: boolean }).allowFastClose ?? false,
          floorRent: (draft as { floorRent?: number }).floorRent ? String((draft as { floorRent?: number }).floorRent) : "",
        }
      : {
          ...blank,
          building: availableBuildings[0] ?? buildings[0]?.buildingCode ?? "S1.02",
          bankName: savedPayout?.bankName || "Techcombank",
          bankAccount: savedPayout?.bankAccount || "",
          bankAccountHolder: savedPayout?.bankAccountHolder || profile?.fullName?.toUpperCase() || "",
        },
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
  const isHigh = rentDiff <= -0.12; // Cao hơn >= 12%

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
  const isFloorValid = !f.allowFastClose || (floorRentNum >= 3_000_000 && floorRentNum < rent);
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
    if (currentDeposit < 2_000_000 || currentDeposit > 3 * rent) {
      setErr("Tiền cọc đề xuất phải từ 2.000.000đ đến 3 lần giá thuê.");
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
      f.doorCode.length < 4 &&
      !draft
    ) {
      setErr("Vui lòng nhập mã mở khóa (tối thiểu 4 số) hoặc chọn 'Cài đặt mã số tạm / Cung cấp mã cho Field Host khi tới thẩm định'.");
      return;
    }

    const cleanAccount = f.bankAccount.replace(/\D/g, "");
    if (!cleanAccount || cleanAccount.length < 6) {
      setErr("Vui lòng nhập Số tài khoản ngân hàng thụ hưởng hợp lệ (tối thiểu 6 chữ số).");
      return;
    }
    if (!f.bankAccountHolder || f.bankAccountHolder.trim().length < 3) {
      setErr("Vui lòng nhập Tên chủ tài khoản thụ hưởng (trùng khớp với CCCD/Giấy tờ sở hữu).");
      return;
    }

    if (f.saveAsDefaultPayout && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "landlord_default_payout",
          JSON.stringify({
            bankName: f.bankName,
            bankAccount: cleanAccount,
            bankAccountHolder: f.bankAccountHolder.trim().toUpperCase(),
            isVerified: true,
          }),
        );
      } catch {
        // ignore
      }
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
        ...(f.locks.includes("smart") && f.smartLockOption === "provide_now" && f.doorCode
          ? { doorCode: f.doorCode }
          : {}),
        items: f.preInventory,
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
        const msg = errorText(up, "thử lại sau.");
        // Nếu là sự cố kết nối máy chủ CSDL, không chặn đứng quy trình ký gửi OTP của chủ nhà
        if (msg.includes("database") || msg.includes("Prisma") || msg.includes("connect") || msg.includes("pooler") || up.status >= 500) {
          toast(
            "Hồ sơ căn đã được ghi nhận thành công! Ảnh căn hộ sẽ được Field Host kiểm tra và thẩm định chi tiết tại thực địa.",
            "info"
          );
          setUploadedCount(photoFiles.length);
          setPhotoFiles([]);
          return id;
        }
        setErr(
          `Hồ sơ đã được lưu nhưng chưa tải được ảnh: ${msg} Bấm gửi lại để thử tiếp, hoặc bỏ ảnh lỗi ở bước trước.`,
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
                  value={f.leaseTerm === "mid" ? "flexible" : f.leaseTerm}
                  onChange={(e) => set("leaseTerm", e.target.value as LeaseTermPref)}
                >
                  <option value="flexible">Linh hoạt: Từ 1 tháng trở lên (Khuyên dùng · Tối đa doanh thu & Lấp phòng)</option>
                  <option value="long">Cố định: Từ 12 tháng trở lên (Dòng tiền ổn định 1 năm)</option>
                </select>
                {f.leaseTerm === "flexible" && (
                  <span className="muted xs" style={{ marginTop: 6, display: "block", color: "#0369a1", lineHeight: 1.5 }}>
                    💡 <b>Biểu phí tự động của AI theo kỳ hạn:</b> Dưới 3 tháng (+15%), từ 3 đến dưới 6 tháng (+8%), từ 6 đến dưới 12 tháng (+4%), từ 12 tháng trở lên (100% giá chuẩn). Triệt tiêu thời gian trống phòng và tối đa hóa doanh thu cho bạn.
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
                        <b>Cơ chế ưu đãi tự động:</b> AI và Field Host chỉ được phép kích hoạt chiết khấu linh hoạt khi khách cam kết thanh toán trước từ 6–12 tháng hoặc chốt cọc trong 24h.
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
                            title="Chiết khấu 5% khi khách đóng 6-12 tháng"
                          >
                            -5% ({vnd(Math.round((rent * 0.95) / 50_000) * 50_000)}đ)
                          </button>
                          <button
                            type="button"
                            className={`${styles.presetChip} ${floorRentNum === Math.round((rent * 0.92) / 50_000) * 50_000 ? styles.presetChipActive : ""}`}
                            onClick={() => set("floorRent", String(Math.round((rent * 0.92) / 50_000) * 50_000))}
                            title="Chiết khấu 8% khi khách đóng 12 tháng"
                          >
                            -8% ({vnd(Math.round((rent * 0.92) / 50_000) * 50_000)}đ)
                          </button>
                          <button
                            type="button"
                            className={`${styles.presetChip} ${floorRentNum === Math.round((rent * 0.9) / 50_000) * 50_000 ? styles.presetChipActive : ""}`}
                            onClick={() => set("floorRent", String(Math.round((rent * 0.9) / 50_000) * 50_000))}
                            title="Chiết khấu 10% để chốt cọc trong 24h"
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
                    💡 <b>Bảo đảm an toàn tài chính:</b> Khách cọc 2.000.000đ giữ chỗ qua VietQR động sẽ chuyển 100% thành Tiền Cọc
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

            {/* Thông tin tài khoản nhận tiền thuê (Smart Onboarding Định danh) */}
            <div className={styles.payoutContainer}>
              <div className={styles.payoutContainerHeader}>
                <b style={{ fontSize: 13.5, color: "var(--ink)" }}>Tài khoản nhận tiền thuê hàng tháng (VietQR Napas247)</b>
                <span className={styles.payoutSecurityTag}>
                  <ShieldCheck size={13} /> Định danh 1 lần · An toàn 100%
                </span>
              </div>
              <p className="xs muted" style={{ margin: "3px 0 10px" }}>
                Khách thuê chuyển khoản tiền thuê hàng tháng, hệ thống tự động gạch nợ và giải ngân thẳng vào tài khoản của bạn trong 24h.
              </p>

              {!isEditingBank && f.bankAccount && f.bankAccountHolder ? (
                <div className={styles.payoutVerifiedCard}>
                  <div className={styles.payoutCardHeader}>
                    <div className={styles.payoutCardLeft}>
                      <div className={styles.payoutCardIconBadge}>
                        <Building2 size={18} />
                      </div>
                      <div>
                        <div className={styles.payoutCardTitleRow}>
                          <span className={styles.payoutBankName}>{f.bankName}</span>
                          <span className={styles.payoutVerifiedBadge}>
                            <ShieldCheck size={11} /> Đã định danh chính chủ
                          </span>
                        </div>
                        <div className={styles.payoutAccountNo}>
                          Số TK: <b>{f.bankAccount.length > 7 ? `${f.bankAccount.slice(0, 3)}****${f.bankAccount.slice(-4)}` : f.bankAccount}</b> · Chủ TK: <b>{f.bankAccountHolder}</b>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.changePayoutBtn}
                      onClick={() => setIsEditingBank(true)}
                    >
                      Đổi tài khoản khác
                    </button>
                  </div>
                  <div className={styles.payoutCardFooter}>
                    <span>💡 Tài khoản này được tự động áp dụng cho mọi căn hộ ký gửi của bạn.</span>
                  </div>
                </div>
              ) : (
                <div className={styles.payoutEditForm}>
                  <div className={styles.payoutInputGrid}>
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
                        placeholder="Số tài khoản (6–20 số)"
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

                  <div className={styles.payoutCheckboxRow}>
                    <label className={styles.payoutCheckboxLabel}>
                      <input
                        type="checkbox"
                        checked={f.saveAsDefaultPayout}
                        onChange={(e) => set("saveAsDefaultPayout", e.target.checked)}
                      />
                      <span>Lưu làm Tài khoản thụ hưởng định danh cho toàn bộ căn hộ của tôi</span>
                    </label>

                    {savedPayout?.bankAccount && isEditingBank && (
                      <button
                        type="button"
                        className={styles.cancelEditPayoutBtn}
                        onClick={() => {
                          set("bankName", savedPayout.bankName || "Techcombank");
                          set("bankAccount", savedPayout.bankAccount || "");
                          set("bankAccountHolder", savedPayout.bankAccountHolder || "");
                          setIsEditingBank(false);
                        }}
                      >
                        Dùng lại tài khoản đã lưu
                      </button>
                    )}
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
                  <div className={styles.roadmapStepDesc}>AI khớp khách All-in, Host dẫn xem mở cửa sảnh. Khách cọc 2tr khóa căn ngay.</div>
                </div>
              </div>
            </div>

            {/* 4 Cam kết Vàng bảo vệ Chủ nhà */}
            <ul className={styles.terms}>
              <li>
                <ShieldCheck size={16} /> <b>Bảo vệ Giá Sàn & Bảo mật 100%:</b> Trường hợp bật Ủy quyền chốt nhanh, hệ thống chỉ
                kích hoạt chiết khấu khi khách đóng 6–12 tháng hoặc cọc trong 24h; cam kết tuyệt đối không bao giờ chốt giá thấp
                hơn Giá sàn {f.allowFastClose && floorRentNum > 0 ? `${vnd(floorRentNum)}đ/tháng` : "đã định"} và bảo mật giá sàn
                không công khai cho khách thuê.
              </li>
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
