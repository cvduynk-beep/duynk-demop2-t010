import { NextResponse } from "next/server";
import { UnitsUpstreamError } from "@/lib/units/source";
import { listUnitsServer } from "@/lib/units/source.server";

export const dynamic = "force-dynamic";

/**
 * `GET /api/catalog/units` — danh mục căn công khai cho trình duyệt, đi qua data-source server duy nhất
 * (`lib/units/source.ts`) để cờ `ALLOW_MOCK_FALLBACK` chỉ được đọc ở server.
 * 200 `{ success, data: { units, source } }` · 502 `{ success:false, code:"units_upstream" }` khi backend lỗi và fallback tắt.
 * Không cache: trạng thái giữ chỗ / ca xem đổi theo phút (backend đã tự cache 20s).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const maxRent = Number(sp.get("maxRent"));
  try {
    const { data, source } = await listUnitsServer({
      zone: sp.get("zone") ?? undefined,
      layout: sp.get("layout") ?? undefined,
      maxRent: Number.isFinite(maxRent) && maxRent > 0 ? maxRent : undefined,
      q: sp.get("q") ?? undefined,
    });
    return NextResponse.json(
      { success: true, data: { units: data, source } },
      { headers: { "Cache-Control": "no-store", "X-Data-Source": source } },
    );
  } catch (err) {
    if (err instanceof UnitsUpstreamError) {
      console.error(`[catalog] ${err.message}`);
      return NextResponse.json(
        { success: false, code: "units_upstream", message: "Không tải được danh sách căn từ máy chủ." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw err;
  }
}
