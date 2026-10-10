import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  if (endpoint === "profile") {
    return NextResponse.json({
      success: true,
      data: {
        id: "c4408e21-5c78-4eef-8a44-b3a18904b308",
        fullName: "Chủ nhà Demo",
        email: "chunha.oceanpark@vinstay.vn",
        isPhoneVerified: true,
        createdAt: "2026-01-01T00:00:00Z",
        payoutAccount: {
          bankName: "Techcombank",
          bankAccount: "19036888888888",
          bankAccountHolder: "CHU NHA DEMO",
          isVerified: true,
          verifiedAt: "2026-01-02T10:00:00Z",
        },
      },
    });
  }

  return NextResponse.json({ success: true, data: {} });
}
