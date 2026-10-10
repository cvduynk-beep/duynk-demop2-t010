import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MOCK_BI_FUNNEL = {
  funnel: {
    stages: [
      { stage: "Lượt truy cập web", count: 1250, dropRate: "0%" },
      { stage: "Chat AI Matchmaker", count: 480, dropRate: "61.6%" },
      { stage: "Đặt lịch xem (đã OTP)", count: 124, dropRate: "74.2%" },
      { stage: "Check-in sảnh", count: 96, dropRate: "22.6%" },
      { stage: "Quét VietQR cọc", count: 42, dropRate: "56.3%" },
      { stage: "Ký thỏa thuận số", count: 38, dropRate: "9.5%" },
    ],
    noShowRate: "3.2%",
    avgDecisionTimeMinutes: 48,
  },
  occupancyHeatmap: [
    { buildingCode: "S2.12", zone: "The Sapphire 2", total: 45, rented: 38, occupancyRate: "84.4%", alert: "normal" },
    { buildingCode: "S1.08", zone: "The Sapphire 1", total: 52, rented: 42, occupancyRate: "80.8%", alert: "normal" },
    { buildingCode: "S1.02", zone: "The Sapphire 1", total: 36, rented: 25, occupancyRate: "69.4%", alert: "low_occupancy" },
  ],
  portfolioStatus: {
    totalUnits: 133,
    rentedUnits: 105,
    holdingUnits: 8,
    availableUnits: 20,
  },
};

const MOCK_COMMISSION_ENGINE = {
  configs: [
    { configKey: "viewing_base_fee", paramValue: 50000, paramUnit: "VNĐ/lượt", updatedAt: new Date().toISOString() },
    { configKey: "deal_commission_percent", paramValue: 50, paramUnit: "% tháng đầu", updatedAt: new Date().toISOString() },
    { configKey: "hot_bonus_speed_60m", paramValue: 200000, paramUnit: "VNĐ/deal", updatedAt: new Date().toISOString() },
    { configKey: "super_host_rating_bonus", paramValue: 500000, paramUnit: "VNĐ/tháng", updatedAt: new Date().toISOString() },
  ],
};

const MOCK_HOLD_POLICY = {
  defaultHours: 48,
  byUnit: {},
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  if (endpoint === "bi-funnel") {
    return NextResponse.json({ success: true, data: MOCK_BI_FUNNEL });
  }

  if (endpoint === "dispatch-sla") {
    return NextResponse.json({ success: true, data: [] });
  }

  if (endpoint === "commission-engine") {
    return NextResponse.json({ success: true, data: MOCK_COMMISSION_ENGINE });
  }

  if (endpoint === "settings/hold-policy") {
    return NextResponse.json({ success: true, data: MOCK_HOLD_POLICY });
  }

  if (endpoint === "contracts") {
    return NextResponse.json({ success: true, data: [] });
  }

  if (endpoint === "hosts") {
    return NextResponse.json({ success: true, data: [] });
  }

  return NextResponse.json({ success: true, data: {} });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ success: true, data: body });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ success: true, data: body });
}
