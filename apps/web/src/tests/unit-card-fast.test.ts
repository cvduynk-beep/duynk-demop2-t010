import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/" }));
import { UnitCard } from "@/components/unit/UnitCard";
import { toUnit } from "@/lib/tenant/adapters";
import { FIXTURE_UNITS } from "@/lib/units/fixtures";

/** Hồ sơ 20 — thẻ căn trong danh sách / khung preview cạnh chat. */
const cost = { rent: 9_200_000, mgmt: 0, parking: 0, utility: 0, total: 9_200_000 };
const render = (patch: Record<string, unknown> = {}, onOpen?: () => void) =>
  renderToStaticMarkup(createElement(UnitCard, { unit: toUnit({ ...FIXTURE_UNITS[1], rent: 9_200_000, ...patch }), cost, onOpen }));

describe("UnitCard — Chốt cọc nhanh", () => {
  it("căn có cọc nhanh: nhãn + dòng ghi rõ giảm TIỀN CỌC; giá thuê giữ nguyên", () => {
    const html = render({ fastDeposit: { depositDiscount: 450_000 } });
    expect(html).toContain("Cọc nhanh");
    expect(html.replace(/<!-- -->/g, "")).toContain("tiền cọc giảm 450.000đ");
    expect(html).toContain("9.200.000");
    expect(html).not.toMatch(/8\.750\.000|line-through/); // không gạch / trừ vào giá thuê
  });

  it("căn không có cọc nhanh ⇒ không có nhãn", () => {
    expect(render({ fastDeposit: null })).not.toContain("Cọc nhanh");
    expect(render()).not.toContain("Cọc nhanh");
  });
});

describe("UnitCard — mở chi tiết tại chỗ (khung preview cạnh chat)", () => {
  it("có onOpen ⇒ Xem chi tiết / Đặt lịch xem là nút, không link sang /units", () => {
    const html = render({}, () => undefined);
    expect(html).not.toContain('href="/units/');
    expect(html).toMatch(/<button[^>]*>Xem chi tiết<\/button>/);
    expect(html).toMatch(/<button[^>]*>Đặt lịch xem<\/button>/);
  });

  it("không có onOpen ⇒ giữ link trang chi tiết như cũ", () => {
    expect(render()).toContain('href="/units/');
  });
});

describe("UnitDetail — chế độ nhúng trong khung preview cạnh chat", () => {
  const renderDetail = async (embedded: boolean) => {
    const { UnitDetail } = await import("@/components/unit/UnitDetail");
    return renderToStaticMarkup(createElement(UnitDetail, { unit: toUnit(FIXTURE_UNITS[1]), autoOpenBooking: false, embedded }));
  };
  it("nhúng ⇒ không breadcrumb, không thanh đặt lịch cố định, gallery gọn", async () => {
    const html = await renderDetail(true);
    expect(html).not.toContain("Trang chủ");
    expect(html).not.toMatch(/class="[^"]*_bar_[^"]*no-print/); // thanh đặt lịch cố định dưới màn hình
    expect(html).toMatch(/class="[^"]*compact/);
  });
  it("trang thường ⇒ giữ breadcrumb + thanh đặt lịch dưới màn hình", async () => {
    const html = await renderDetail(false);
    expect(html).toContain("Trang chủ");
    expect(html).toMatch(/class="[^"]*_bar_[^"]*no-print/);
  });
});
