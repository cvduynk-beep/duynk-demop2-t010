import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MOCK_FINANCE = {
  serviceFeePercent: 10,
  feeSource: "config",
  thisMonth: { gross: 22000000, fee: 2200000, net: 19800000 },
  totalNet6Months: 118800000,
  escrowTotal: 44000000,
  history: [
    { month: "2026-05", label: "T5", gross: 20000000, fee: 2000000, net: 18000000 },
    { month: "2026-06", label: "T6", gross: 20000000, fee: 2000000, net: 18000000 },
    { month: "2026-07", label: "T7", gross: 22000000, fee: 2200000, net: 19800000 },
    { month: "2026-08", label: "T8", gross: 22000000, fee: 2200000, net: 19800000 },
    { month: "2026-09", label: "T9", gross: 22000000, fee: 2200000, net: 19800000 },
    { month: "2026-10", label: "T10", gross: 22000000, fee: 2200000, net: 19800000 },
  ],
  perUnit: [
    {
      unitId: "u-s212-1608",
      unitCode: "S2.12-1608",
      building: "S2.12",
      status: "rented",
      rent: 11000000,
      fee: 1100000,
      net: 9900000,
      escrow: 22000000,
    },
    {
      unitId: "u-s108-1205",
      unitCode: "S1.08-1205",
      building: "S1.08",
      status: "holding",
      rent: 11000000,
      fee: 1100000,
      net: 9900000,
      escrow: 22000000,
    },
  ],
};

const MOCK_UNITS = [
  {
    id: "u-s212-1608",
    unitCode: "S2.12-1608",
    building: "S2.12",
    zone: "The Sapphire 2",
    floor: 16,
    layout: "2PN + 1",
    layoutKind: "2PN",
    carpetAreaM2: 64.5,
    baseRentPrice: 11000000,
    rent: 11000000,
    status: "rented",
    isVerified: true,
    lock: "smart",
    thumbnailUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800",
    holdExpiresAt: null,
    totalViewings: 8,
    mandate: {
      id: "mandate-01",
      status: "active",
      signedAt: "2026-01-15T08:00:00Z",
      exitRequestedAt: null,
      exitEffectiveAt: null,
    },
  },
  {
    id: "u-s108-1205",
    unitCode: "S1.08-1205",
    building: "S1.08",
    zone: "The Sapphire 1",
    floor: 12,
    layout: "1PN + 1",
    layoutKind: "1PN",
    carpetAreaM2: 48.0,
    baseRentPrice: 8500000,
    rent: 8500000,
    status: "holding",
    isVerified: true,
    lock: "smart",
    thumbnailUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
    holdExpiresAt: "2026-10-12T10:00:00Z",
    totalViewings: 5,
    mandate: {
      id: "mandate-02",
      status: "active",
      signedAt: "2026-03-20T08:00:00Z",
      exitRequestedAt: null,
      exitEffectiveAt: null,
    },
  },
];

const MOCK_CONSIGNMENTS: any[] = [];

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  if (endpoint === "finance") {
    return NextResponse.json({
      success: true,
      data: MOCK_FINANCE,
    });
  }

  if (endpoint === "units") {
    return NextResponse.json({
      success: true,
      data: MOCK_UNITS,
    });
  }

  if (endpoint === "consignments") {
    return NextResponse.json({
      success: true,
      data: MOCK_CONSIGNMENTS,
    });
  }

  return NextResponse.json({ success: true, data: {} });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  const body = await req.json().catch(() => ({}));

  if (endpoint === "consignments") {
    const newConsignment = {
      id: `cs-${Date.now()}`,
      status: "reviewing",
      building: body.building || "S2.12",
      floor: body.floor || 16,
      door: body.door || "08",
      layout: body.layout || "2PN",
      areaM2: body.areaM2 || 65,
      askRent: body.askRent || 10000000,
      createdAt: new Date().toISOString(),
    };
    MOCK_CONSIGNMENTS.unshift(newConsignment);
    return NextResponse.json({ success: true, data: newConsignment });
  }

  return NextResponse.json({ success: true, data: body });
}
