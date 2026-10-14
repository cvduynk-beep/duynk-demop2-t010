import type { Metadata } from "next";
import { SiteNav } from "@/components/nav/SiteNav";
import { UnitsBrowser } from "@/components/unit/UnitsBrowser";

export const metadata: Metadata = {
  title: "Tất cả căn đang mở tại Ocean Park 1",
  description: "Danh mục căn hộ đã kiểm định tại Vinhomes Ocean Park: ảnh thật có mốc thời gian, chi phí All-in rõ ràng.",
};

/** `/units`: danh mục riêng (dữ liệu tải ở client qua `/api/catalog/units` + AI Matchmaker). */
export default function UnitsPage() {
  return (
    <>
      <SiteNav />
      <main>
        <UnitsBrowser />
      </main>
    </>
  );
}
