import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsignOtpSign } from "@/components/landlord/ConsignOtpSign";
import { LEASE_TERM_LABEL } from "@/lib/landlord/labels";

const render = (props: { needPhone: boolean; verifiedPhone?: string | null; warranted?: boolean }) =>
  renderToStaticMarkup(
    createElement(ConsignOtpSign, { warranted: true, onSign: async () => true, onError: () => undefined, ...props }),
  );

describe("Ký ủy quyền ký gửi — SĐT đã xác thực thì ký 1 bước, không OTP", () => {
  it("đã xác thực ⇒ nút ký ngay, không có nút gửi mã OTP", () => {
    const html = render({ needPhone: false, verifiedPhone: "0912345478" });
    expect(html).toContain("Ký ủy quyền độc quyền");
    expect(html).toContain("không cần nhập mã OTP");
    expect(html).not.toContain("Gửi mã OTP");
  });

  it("chưa xác thực ⇒ nhập SĐT + gửi mã OTP", () => {
    const html = render({ needPhone: true });
    expect(html).toContain("Số điện thoại nhận mã OTP");
    expect(html).toContain("Gửi mã OTP để ký ủy quyền");
  });

  it("chưa tick cam đoan ⇒ nút ký bị khoá", () => {
    expect(render({ needPhone: false, warranted: false })).toMatch(/<button[^>]*disabled/);
  });
});

describe("Ký gửi — thời gian thuê gửi đúng giá trị backend nhận (mid | long | fixed)", () => {
  const wizard = readFileSync(path.resolve(__dirname, "../components/landlord/ConsignWizard.tsx"), "utf8");
  it("không còn giá trị 'flexible' (backend trả 400 leaseTerm must be one of mid, long, fixed)", () => {
    expect(wizard).not.toMatch(/["']flexible["']/);
    expect(Object.keys(LEASE_TERM_LABEL).sort()).toEqual(["fixed", "long", "mid"]);
  });
  it("không quảng cáo phụ phí thuê ngắn hạn (AGENTS: không áp phụ phí thuê ngắn hạn)", () => {
    expect(wizard).not.toMatch(/\+15%|\+8%|\+4%/);
  });
});

describe("Ký gửi — phân khu & toà Ocean Park 1 lấy từ DB (backend chỉ nhận toà có trong bảng buildings)", () => {
  it("gom toà theo phân khu, sắp mã toà theo số", async () => {
    const { zonesFromBuildings } = await import("@/components/landlord/ConsignWizard");
    const b = (buildingCode: string, zoneName: string) => ({ id: buildingCode, buildingCode, zoneName, totalFloors: 30 });
    expect(zonesFromBuildings([b("S1.10", "The Sapphire 1"), b("R1.02", "The Zenpark"), b("S1.02", "The Sapphire 1")])).toEqual([
      { name: "The Sapphire 1", buildings: ["S1.02", "S1.10"] },
      { name: "The Zenpark", buildings: ["R1.02"] },
    ]);
  });
  it("không còn danh sách toà ghi cứng cho Ocean Park 1 (vd. S2.19 không có trong DB ⇒ 400)", () => {
    const wizard = readFileSync(path.resolve(__dirname, "../components/landlord/ConsignWizard.tsx"), "utf8");
    expect(wizard).not.toContain('"S2.19"');
  });
});
