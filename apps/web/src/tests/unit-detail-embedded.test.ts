import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/" }));

import { UnitDetail } from "@/components/unit/UnitDetail";
import { toUnit } from "@/lib/tenant/adapters";
import { FIXTURE_UNITS } from "@/lib/units/fixtures";

/** Khung chi tiết căn nhúng cạnh chat: mục thu gọn được, thanh hành động đáy, không có nút Vinny nổi / căn tương tự / breadcrumb. */
const unit = toUnit({ ...FIXTURE_UNITS[1], fastDeposit: { depositDiscount: 450_000 } });
const render = (embedded: boolean, patch: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(UnitDetail, { unit: { ...unit, ...patch }, autoOpenBooking: false, embedded }));
const text = (html: string) => html.replace(/<!-- -->/g, "");

describe("UnitDetail embedded", () => {
  it("các mục dài là thẻ <details> thu gọn được; chi phí / nội thất mở sẵn, điều khoản / nội quy đóng", () => {
    const html = render(true);
    const details = html.match(/<details[^>]*>/g) ?? [];
    expect(details.length).toBe(7);
    expect(details.filter((d) => /\sopen(=|>|\s)/.test(d)).length).toBe(3); // trải nghiệm sống, chi phí, nội thất
    expect(html).toContain("Điều khoản thuê");
    expect(html).toContain("Nội quy căn hộ");
  });

  it("có thanh hành động đáy; không có Vinny nổi, căn tương tự, breadcrumb", () => {
    const html = text(render(true));
    expect(html).toMatch(/Đặt lịch xem<\/button>/);
    expect(html).not.toContain("Hỏi Quản gia Vinny");
    expect(html).not.toContain("Căn tương tự");
    expect(html).not.toContain("Trang chủ");
  });

  it("trang đầy đủ giữ nguyên: <section> có <h2>, không có <details>", () => {
    const html = render(false);
    expect(html).not.toContain("<details");
    expect(html).toContain("Minh bạch chi phí sinh hoạt (Xác thực thực địa)");
    expect(html).toContain("Trang chủ");
  });

  it("căn đã giữ chỗ: thanh đáy báo trạng thái, không có nút đặt lịch", () => {
    const html = text(render(true, { baseStatus: "holding" }));
    expect(html).toContain("Căn đang được giữ chỗ");
    expect(html).not.toMatch(/Đặt lịch xem<\/button>/); // nút (tiêu đề hộp thoại đặt lịch vẫn có trong DOM)
  });
});
