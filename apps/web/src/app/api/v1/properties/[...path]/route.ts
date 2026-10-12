import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MOCK_BUILDINGS = [
  { id: "b-s101", buildingCode: "S1.01", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s102", buildingCode: "S1.02", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s103", buildingCode: "S1.03", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s105", buildingCode: "S1.05", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s106", buildingCode: "S1.06", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s107", buildingCode: "S1.07", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s108", buildingCode: "S1.08", zoneName: "The Sapphire 1", totalFloors: 28 },
  { id: "b-s201", buildingCode: "S2.01", zoneName: "The Sapphire 2", totalFloors: 26 },
  { id: "b-s202", buildingCode: "S2.02", zoneName: "The Sapphire 2", totalFloors: 26 },
  { id: "b-s203", buildingCode: "S2.03", zoneName: "The Sapphire 2", totalFloors: 26 },
  { id: "b-s205", buildingCode: "S2.05", zoneName: "The Sapphire 2", totalFloors: 26 },
  { id: "b-s208", buildingCode: "S2.08", zoneName: "The Sapphire 2", totalFloors: 26 },
  { id: "b-s209", buildingCode: "S2.09", zoneName: "The Sapphire 2", totalFloors: 26 },
  { id: "b-s212", buildingCode: "S2.12", zoneName: "The Sapphire 2", totalFloors: 26 },
];

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  if (endpoint === "buildings") {
    return NextResponse.json({
      success: true,
      data: MOCK_BUILDINGS,
    });
  }

  return NextResponse.json({ success: true, data: [] });
}
