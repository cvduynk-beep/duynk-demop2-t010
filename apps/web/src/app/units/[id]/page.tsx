import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/nav/SiteNav";
import { UnitDetail } from "@/components/unit/UnitDetail";
import { MockDataBanner } from "@/components/ui/MockDataBanner";
import { unitAddress, zoneById } from "@/lib/units";
import { toUnit } from "@/lib/tenant/adapters";
import { UnitNotFoundError } from "@/lib/units/source";
import { getUnitServer } from "@/lib/units/source.server";

/**
 * Chi tiết căn — dữ liệu qua data-source server duy nhất (`lib/units/source.ts`), `cache()` dùng chung cho metadata và
 * page (1 lần gọi backend / request). 404 ⇒ `notFound()`; backend lỗi ⇒ ném sang `./error.tsx` (có nút thử lại) —
 * không bao giờ âm thầm rơi về dữ liệu mẫu. Không cache trang: trạng thái giữ chỗ / ca xem đổi theo phút.
 */
export const dynamic = "force-dynamic";

async function load(id: string) {
  try {
    return await getUnitServer(id);
  } catch (err) {
    if (err instanceof UnitNotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data, source } = await load(id);
  const unit = toUnit(data);
  const zone = unit.zoneName || zoneById(unit.zoneId)?.name || "Ocean Park";
  const photo = unit.photos[0];
  return {
    title: `Căn ${unitAddress(unit)} · ${zone}`,
    description: `Căn ${unit.layoutLabel} ${unit.areaM2}m² tại ${zone}, Vinhomes Ocean Park: ảnh đã kiểm định, chi phí All-in rõ ràng, có Field Host đón tại sảnh.`,
    // Dữ liệu mẫu (fallback dev) không bao giờ được index.
    robots: source === "mock" ? { index: false, follow: false } : undefined,
    openGraph: photo ? { images: [{ url: photo }] } : undefined,
  };
}

export default async function UnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ book?: string; fastdeposit?: string }>;
}) {
  const { id } = await params;
  const { book, fastdeposit } = await searchParams;
  const { data, source } = await load(id);

  // Vào bằng UUID hoặc mã viết thường ⇒ chuyển về URL chuẩn theo mã căn.
  if (data.code !== id) {
    const qs = book === "1" ? "?book=1" : fastdeposit === "1" ? "?fastdeposit=1" : "";
    redirect(`/units/${encodeURIComponent(data.code)}${qs}`);
  }

  return (
    <>
      <SiteNav />
      <main>
        {source === "mock" && (
          <div className="wrap">
            <MockDataBanner detail="Backend không phản hồi nên đây là căn mẫu, không phải căn thật trong hệ thống." />
          </div>
        )}
        <UnitDetail
          unit={toUnit(data)}
          autoOpenBooking={book === "1" && source === "api"}
          autoOpenFastDeposit={fastdeposit === "1" && source === "api"}
        />
      </main>
    </>
  );
}
