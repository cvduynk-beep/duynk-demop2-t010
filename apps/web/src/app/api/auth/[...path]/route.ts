import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DEMO_USERS: Record<string, any> = {
  tenant: {
    id: "290d0228-7480-4aa1-82ae-b8f9ba479f65",
    email: "khachthue.demo@vinstay.vn",
    fullName: "Khách thuê Demo",
    portal: "tenant",
    role: "tenant",
    isPhoneVerified: true,
    isHostVerified: false,
  },
  landlord: {
    id: "c4408e21-5c78-4eef-8a44-b3a18904b308",
    email: "chunha.oceanpark@vinstay.vn",
    fullName: "Chủ nhà Demo",
    portal: "landlord",
    role: "landlord",
    isPhoneVerified: true,
    isHostVerified: false,
  },
  host: {
    id: "4ee066da-6ebd-453f-bdb5-8648a0986f3f",
    email: "host.oceanpark@vinstay.vn",
    fullName: "Field Host Demo",
    portal: "host",
    role: "field_host",
    isPhoneVerified: true,
    isHostVerified: true,
    rfidCardNumber: "RFID-DEMO-0001",
  },
  admin: {
    id: "b151c2f1-aceb-452d-a1c0-7de52937fc88",
    email: "admin@vinstay.vn",
    fullName: "Admin Demo",
    portal: "admin",
    role: "ops_admin",
    isPhoneVerified: true,
    isHostVerified: false,
  },
};

function resolveDemoUser(email?: string, portal?: string) {
  if (portal && DEMO_USERS[portal]) return DEMO_USERS[portal];
  const e = (email || "").toLowerCase().trim();
  if (e.includes("chunha") || e.includes("landlord")) return DEMO_USERS.landlord;
  if (e.includes("host")) return DEMO_USERS.host;
  if (e.includes("admin")) return DEMO_USERS.admin;
  return DEMO_USERS.tenant;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  try {
    const body = await req.json().catch(() => ({}));
    const { email, portal } = body;

    if (endpoint === "login" || endpoint === "demo-login" || endpoint === "signup") {
      const user = resolveDemoUser(email, portal);
      const res = NextResponse.json({
        ok: true,
        data: {
          user,
          needsRfidVerification: false,
        },
      });

      const sessionData = Buffer.from(JSON.stringify(user)).toString("base64");
      // Set cookies cho cả client và proxy middleware
      res.cookies.set("vs_demo_session", sessionData, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 86400 * 7,
      });
      res.cookies.set("vs_access", `demo-token-${user.portal}`, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400 * 7,
      });

      return res;
    }

    if (endpoint === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete("vs_demo_session");
      res.cookies.delete("vs_access");
      return res;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");

  if (endpoint === "session") {
    const cookie = req.cookies.get("vs_demo_session")?.value;
    const requestedPortal = req.nextUrl.searchParams.get("portal");

    if (cookie) {
      try {
        const user = JSON.parse(Buffer.from(cookie, "base64").toString("utf8"));
        if (!requestedPortal || user.portal === requestedPortal) {
          return NextResponse.json({
            ok: true,
            data: { user },
          });
        }
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      data: { user: null },
    });
  }

  return NextResponse.json({ ok: true });
}
