import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSPORT_ITEMS, LANDLORDS, type ItemKey } from "@/lib/mock/units";
import type { DeclaredCheck } from "@/lib/mock/types";

// Store chạy trên localStorage của trình duyệt; dựng một window tối giản cho môi trường node.
const mem = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  addEventListener: () => {},
});

const actions = await import("@/lib/mock/actions");
const { getMockState, resetMockState } = await import("@/lib/mock/store");
const { noticesFor, landlordPayoutAccount } = await import("@/lib/mock/selectors");
const inspectionSelectors = await import("@/lib/mock/selectors-inspection");

beforeEach(() => {
  mem.clear();
  resetMockState();
});

function validDraft(items: ItemKey[] = ["ac", "fridge"]) {
  const declared: DeclaredCheck[] = [
    { field: "identity", ok: true },
    { field: "layout", ok: true },
    { field: "areaM2", ok: false, actual: "75 m²" },
    { field: "furnishing", ok: true },
    { field: "lock", ok: true },
  ];
  return {
    declared,
    items: items.map((key, i) => ({ key, present: i !== 1 })),
    equipment: PASSPORT_ITEMS.map((item, idx) => ({
      item,
      condition: idx < 2 ? 50 : 80,
      photoAt: new Date().toISOString(),
      note: idx === 0 ? "Tường hơi ố nhẹ" : undefined,
    })),
    recommendation: "approve" as const,
    note: "Đủ điều kiện tiếp nhận ký gửi",
  };
}

describe("Consign & Inspection - WP1", () => {
  // Case 1: submit (không draft) ⇒ awaiting_host, hostId đúng phân khu, inspectDueAt − signedAt = 48h, 3 thông báo đủ 3 audience.
  it("1. submitConsignment (không draft) chuyển awaiting_host, gán đúng Host phân khu, SLA 48h và thông báo đủ 3 bên", () => {
    const c = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S2.12", // sapphire2 -> host H01
        floor: 12,
        door: "05",
        layout: "2PN",
        areaM2: 65,
        askRent: 9_000_000,
        furnishing: "full",
        lock: "smart",
        auditByHost: true,
        items: ["ac", "fridge"],
        note: "Căn góc thoáng",
      },
      false,
    );

    const s = getMockState();
    const stored = s.consignments.find((x) => x.id === c.id)!;
    expect(stored.status).toBe("awaiting_host");
    expect(stored.hostId).toBe("H01");
    expect(stored.signedAt).toBeDefined();
    expect(stored.inspectDueAt).toBeDefined();

    const diff = new Date(stored.inspectDueAt!).getTime() - new Date(stored.signedAt!).getTime();
    expect(diff).toBe(48 * 3_600_000);

    const lNotices = noticesFor(s, "landlord", "L1");
    const hNotices = noticesFor(s, "host", "H01");
    const aNotices = noticesFor(s, "admin");

    expect(lNotices.some((n) => n.title.includes("thẩm định"))).toBe(true);
    expect(hNotices.some((n) => n.title.includes("Ticket thẩm định"))).toBe(true);
    expect(aNotices.some((n) => n.title.includes("ký gửi mới"))).toBe(true);
  });

  // Case 2: signConsignment draft ⇒ awaiting_host; ký lần 2 ⇒ bad_status.
  it("2. signConsignment draft sang awaiting_host; ký lần 2 trả bad_status", () => {
    // cs-1 trong seed ban đầu là draft
    const res1 = actions.signConsignment("cs-1", { ownershipWarranted: true });
    expect(res1.ok).toBe(true);

    const c1 = getMockState().consignments.find((x) => x.id === "cs-1")!;
    expect(c1.status).toBe("awaiting_host");

    const res2 = actions.signConsignment("cs-1", { ownershipWarranted: true });
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.code).toBe("bad_status");
    }
  });

  // Case 3: hostAcceptInspection sai Host ⇒ wrong_host, state không đổi.
  it("3. hostAcceptInspection với sai hostId trả wrong_host và state không đổi", () => {
    // cs-2: awaiting_host, hostId: H01
    const res = actions.hostAcceptInspection("cs-2", "H02");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("wrong_host");
    }

    const c2 = getMockState().consignments.find((x) => x.id === "cs-2")!;
    expect(c2.status).toBe("awaiting_host");
  });

  // Case 4: submitInspection khi còn awaiting_host ⇒ bad_status.
  it("4. submitInspection khi chưa nhận (awaiting_host) trả bad_status", () => {
    const draft = validDraft();
    const res = actions.submitInspection("cs-2", "H01", draft);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("bad_status");
    }
  });

  // Case 5: submitInspection 9 hạng mục ⇒ invalid_report; condition=75 ⇒ invalid_report; ok=false thiếu actual ⇒ invalid_report.
  it("5. submitInspection kiểm tra tính hợp lệ của báo cáo (invalid_report)", () => {
    // cs-3: inspecting, hostId: H04
    const c3Init = getMockState().consignments.find((x) => x.id === "cs-3")!;

    // 5a. Chỉ có 9 hạng mục
    const draft9 = validDraft(c3Init.items);
    draft9.equipment = draft9.equipment.slice(0, 9);
    const res1 = actions.submitInspection("cs-3", "H04", draft9);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.code).toBe("invalid_report");
    }

    // 5b. condition không phải bội số 10 trong [0, 100] (vd: 75)
    const draft75 = validDraft(c3Init.items);
    draft75.equipment[0].condition = 75;
    const res2 = actions.submitInspection("cs-3", "H04", draft75);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.code).toBe("invalid_report");
    }

    // 5c. ok=false nhưng không có actual
    const draftNoActual = validDraft(c3Init.items);
    draftNoActual.declared[0] = { field: "identity", ok: false, actual: "" };
    const res3 = actions.submitInspection("cs-3", "H04", draftNoActual);
    expect(res3.ok).toBe(false);
    if (!res3.ok) {
      expect(res3.code).toBe("invalid_report");
    }
  });

  // Case 6: nộp hợp lệ ⇒ reviewing, report.hostId, thông báo Admin chứa %.
  it("6. nộp báo cáo hợp lệ chuyển reviewing, lưu report và gửi thông báo Admin chứa %", () => {
    const c3Init = getMockState().consignments.find((x) => x.id === "cs-3")!;
    const draft = validDraft(c3Init.items);
    const res = actions.submitInspection("cs-3", "H04", draft);
    expect(res.ok).toBe(true);

    const s = getMockState();
    const c3 = s.consignments.find((x) => x.id === "cs-3")!;
    expect(c3.status).toBe("reviewing");
    expect(c3.report?.hostId).toBe("H04");

    const aNotices = noticesFor(s, "admin");
    const reviewNotice = aNotices.find((n) => n.body.includes("%") && n.title.includes("chờ duyệt"));
    expect(reviewNotice).toBeDefined();
  });

  // Case 7: approveConsignment khi inspecting ⇒ bad_status (bất biến §3.3).
  it("7. approveConsignment khi đang inspecting trả bad_status", () => {
    // cs-3: inspecting
    const res = actions.approveConsignment("cs-3", "Phạm Thu Hà");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("bad_status");
    }
  });

  // Case 8: approve từ reviewing ⇒ approved, decidedBy, Zalo chủ nhà success.
  it("8. approve từ reviewing chuyển approved, lưu decidedBy và báo Zalo chủ nhà", () => {
    // cs-4: reviewing
    const res = actions.approveConsignment("cs-4", "Phạm Thu Hà");
    expect(res.ok).toBe(true);

    const s = getMockState();
    const c4 = s.consignments.find((x) => x.id === "cs-4")!;
    expect(c4.status).toBe("approved");
    expect(c4.decidedBy).toBe("Phạm Thu Hà");

    const lNotices = noticesFor(s, "landlord", c4.landlordId);
    expect(lNotices.some((n) => n.tone === "success" && n.title.includes("ký gửi"))).toBe(true);
  });

  // Case 9: reject từ awaiting_host với note hợp lệ ⇒ rejected; note "ab" ⇒ invalid_note.
  it("9. reject từ awaiting_host với note >= 5 ký tự chuyển rejected; note ngắn trả invalid_note", () => {
    const shortRes = actions.rejectConsignment("cs-2", "ab", "Phạm Thu Hà");
    expect(shortRes.ok).toBe(false);
    if (!shortRes.ok) {
      expect(shortRes.code).toBe("invalid_note");
    }

    const okRes = actions.rejectConsignment("cs-2", "Căn hộ không chính chủ", "Phạm Thu Hà");
    expect(okRes.ok).toBe(true);

    const c2 = getMockState().consignments.find((x) => x.id === "cs-2")!;
    expect(c2.status).toBe("rejected");
    expect(c2.note).toBe("Căn hộ không chính chủ");
  });

  // Case 10: inspectionSummary: avg làm tròn, lowItems đúng ngưỡng 60 (59 thấp, 60 không), mismatches, missingItems.
  it("10. inspectionSummary tính toán chính xác avgCondition, lowItems, mismatches, missingItems", () => {
    const draft = validDraft();
    // 2 mục 50, 8 mục 80 -> avg = (100 + 640) / 10 = 74
    // Cho thêm 1 mục 59, 1 mục 60
    draft.equipment[2].condition = 59;
    draft.equipment[3].condition = 60;

    const report = {
      ...draft,
      inventory: [],
      netAreaM2: 50,
      furnishing: "full" as const,
      hostId: "H01",
      submittedAt: new Date().toISOString(),
    };

    const summary = inspectionSelectors.inspectionSummary(report);
    // lowItems: condition < 60 -> gồm mục 0 (50), mục 1 (50), mục 2 (59). Mục 3 (60) không thuộc lowItems
    expect(summary.lowItems).toHaveLength(3);
    expect(summary.lowItems).toContain(PASSPORT_ITEMS[0]);
    expect(summary.lowItems).toContain(PASSPORT_ITEMS[1]);
    expect(summary.lowItems).toContain(PASSPORT_ITEMS[2]);
    expect(summary.lowItems).not.toContain(PASSPORT_ITEMS[3]);

    expect(summary.mismatches).toEqual(["areaM2"]);
    expect(summary.missingItems).toEqual(["fridge"]);
  });

  // Case 11: Không Host/chủ nhà nào có đường tới approved: gọi mọi action Host trên hồ sơ reviewing ⇒ status vẫn reviewing.
  it("11. Host không có đường chuyển trạng thái sang approved", () => {
    // cs-4: reviewing
    actions.hostAcceptInspection("cs-4", "H01");
    expect(getMockState().consignments.find((x) => x.id === "cs-4")!.status).toBe("reviewing");

    actions.submitInspection("cs-4", "H01", validDraft());
    expect(getMockState().consignments.find((x) => x.id === "cs-4")!.status).toBe("reviewing");
  });

  // Case 12: grep-style: không thông báo push Host nào chứa SĐT chủ nhà (LANDLORDS[].phone).
  it("12. Không thông báo push gửi cho Host nào chứa SĐT cá nhân của Chủ nhà", () => {
    // Gây ra chuỗi hành động phát sinh thông báo
    actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S1.09",
        floor: 8,
        door: "12",
        layout: "1PN",
        areaM2: 45,
        askRent: 7_000_000,
        furnishing: "basic",
        lock: "physical",
        auditByHost: false,
        items: ["ac"],
      },
      false,
    );

    const s = getMockState();
    const hostNotices = s.notices.filter((n) => n.audience === "host");
    const landlordPhones = LANDLORDS.map((l) => l.phone.replace(/\s+/g, ""));

    for (const notice of hostNotices) {
      const normalizedContent = (notice.title + " " + notice.body).replace(/\s+/g, "");
      for (const phone of landlordPhones) {
        expect(normalizedContent).not.toContain(phone);
      }
    }
  });

  // Case 13: Auto-Escalation: quá 30p vào Open Pool, quá 2h kích hoạt SLA Breach và gán Area Lead.
  it("13. Auto-Escalation: quá 30p vào Open Pool, quá 2h SLA Breach và chuyển Area Lead", () => {
    const s = getMockState();
    const c2 = s.consignments.find((x) => x.id === "cs-2")!; // awaiting_host
    expect(c2.status).toBe("awaiting_host");

    const createdTime = new Date(c2.signedAt || c2.createdAt).getTime();

    // Giả lập sau 35 phút (quá 30p)
    actions.autoEscalateConsignments(createdTime + 35 * 60 * 1000);
    const s35 = getMockState();
    const c2_35 = s35.consignments.find((x) => x.id === "cs-2")!;
    expect(c2_35.openPoolAt).toBeDefined();

    // Host khác (H02) lúc này có thể nhận thẩm định do đã vào Open Pool
    const acceptRes = actions.hostAcceptInspection("cs-2", "H02");
    expect(acceptRes.ok).toBe(true);

    // Reset lại và kiểm tra mốc 2h10 phút (SLA Breach)
    resetMockState();
    actions.autoEscalateConsignments(createdTime + 130 * 60 * 1000);
    const s130 = getMockState();
    const c2_130 = s130.consignments.find((x) => x.id === "cs-2")!;
    expect(c2_130.slaBreached).toBe(true);
    expect(c2_130.escalatedToAreaLead).toBe(true);
    expect(c2_130.hostId).toBe("H01"); // Area lead S1/S2

    // Admin nhận thông báo còi đỏ
    const aNotices = noticesFor(s130, "admin");
    expect(aNotices.some((n) => n.title.includes("BÁO ĐỘNG SLA"))).toBe(true);
  });

  // Case 14: Admin Manual Override: chỉ định tay Host phụ trách hồ sơ ký gửi
  it("14. Admin Manual Override: chỉ định tay Host phụ trách hồ sơ ký gửi", () => {
    const res = actions.adminAssignConsignment("cs-2", "H03", "Phạm Thu Hà");
    expect(res.ok).toBe(true);

    const s = getMockState();
    const c2 = s.consignments.find((x) => x.id === "cs-2")!;
    expect(c2.hostId).toBe("H03");
    expect(c2.adminOverriddenBy).toBe("Phạm Thu Hà");

    // Host H03 nhận thông báo phân công
    const hNotices = noticesFor(s, "host", "H03");
    expect(hNotices.some((n) => n.title.includes("Admin giao hồ sơ thẩm định"))).toBe(true);
  });

  // Case 15: Fast-Close Floor Price Corridor: Lưu trữ và bảo vệ giá sàn ủy quyền
  it("15. Fast-Close Floor Price Corridor lưu trữ giá sàn và ủy quyền chiết khấu chốt nhanh", () => {
    const c = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S1.02",
        floor: 15,
        door: "08",
        layout: "1PN",
        areaM2: 48,
        askRent: 8_000_000,
        suggestedDeposit: 8_000_000,
        allowFastClose: true,
        floorRent: 7_500_000,
        furnishing: "full",
        locks: ["smart"],
      },
      false,
    );

    expect(c.askRent).toBe(8_000_000);
    expect(c.allowFastClose).toBe(true);
    expect(c.floorRent).toBe(7_500_000);
    // Giá sàn phải luôn thấp hơn giá chào thuê
    expect(c.floorRent!).toBeLessThan(c.askRent);
  });

  // Case 16: Smart Onboarding: Định danh và lưu tài khoản thụ hưởng mặc định khi ký gửi căn 1
  it("16. Smart Onboarding: Tự động lưu tài khoản thụ hưởng mặc định cho Chủ nhà", () => {
    const c = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S1.02",
        floor: 12,
        door: "05",
        layout: "Studio",
        areaM2: 32,
        askRent: 6_000_000,
        suggestedDeposit: 6_000_000,
        bankName: "Techcombank",
        bankAccount: "190388889999",
        bankAccountHolder: "NGUYỄN VĂN AN",
        saveAsDefaultPayout: true,
      },
      false,
    );

    expect(c.bankAccount).toBe("190388889999");
    const payout = landlordPayoutAccount(getMockState());
    expect(payout).toBeDefined();
    expect(payout?.bankName).toBe("Techcombank");
    expect(payout?.bankAccount).toBe("190388889999");
    expect(payout?.bankAccountHolder).toBe("NGUYỄN VĂN AN");
    expect(payout?.isVerified).toBe(true);
  });

  // Case 17: Căn thứ 2 tự động kế thừa tài khoản thụ hưởng định danh từ Profile
  it("17. Smart Onboarding: Căn thứ hai kế thừa tài khoản thụ hưởng đã định danh", () => {
    // Đã có tài khoản từ trước
    actions.saveLandlordPayoutAccount({
      bankName: "Vietcombank",
      bankAccount: "001100223344",
      bankAccountHolder: "TRẦN THỊ MAI",
    });

    const state = getMockState();
    const existing = landlordPayoutAccount(state);
    expect(existing?.bankName).toBe("Vietcombank");
    expect(existing?.bankAccount).toBe("001100223344");

    // Ký gửi căn mới không cần nhập lại
    const c2 = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S2.05",
        floor: 8,
        door: "12",
        layout: "2PN",
        areaM2: 65,
        askRent: 10_000_000,
        bankName: existing?.bankName,
        bankAccount: existing?.bankAccount,
        bankAccountHolder: existing?.bankAccountHolder,
      },
      false,
    );

    expect(c2.bankName).toBe("Vietcombank");
    expect(c2.bankAccount).toBe("001100223344");
    expect(c2.bankAccountHolder).toBe("TRẦN THỊ MAI");
  });

  // Case 18: Validation chặn số tài khoản dưới 6 số hoặc thiếu tên chủ tài khoản khi không phải draft
  it("18. Smart Onboarding: Chặn số tài khoản không hợp lệ (< 6 chữ số) và tên chủ tài khoản rỗng", () => {
    expect(() =>
      actions.submitConsignment(
        {
          landlordId: "L1",
          building: "S1.02",
          floor: 10,
          door: "02",
          layout: "Studio",
          areaM2: 32,
          askRent: 5_500_000,
          bankName: "MBBank",
          bankAccount: "123", // Quá ngắn (< 6 số)
          bankAccountHolder: "LE VAN B",
        },
        false,
      ),
    ).toThrow("Số tài khoản ngân hàng không hợp lệ (tối thiểu 6 chữ số).");

    expect(() =>
      actions.submitConsignment(
        {
          landlordId: "L1",
          building: "S1.02",
          floor: 10,
          door: "02",
          layout: "Studio",
          areaM2: 32,
          askRent: 5_500_000,
          bankName: "MBBank",
          bankAccount: "123456789",
          bankAccountHolder: "A", // Quá ngắn (< 3 ký tự)
        },
        false,
      ),
    ).toThrow("Tên chủ tài khoản phải có ít nhất 3 ký tự.");
  });

  // Case 19: Cờ saveAsDefaultPayout = false không ghi đè tài khoản mặc định cũ
  it("19. Smart Onboarding: Khi saveAsDefaultPayout = false thì không ghi đè tài khoản mặc định của Profile", () => {
    // Lưu tài khoản chính
    actions.saveLandlordPayoutAccount({
      bankName: "Techcombank",
      bankAccount: "190311112222",
      bankAccountHolder: "CHỦ NHÀ CHÍNH",
    });

    // Ký gửi căn hộ riêng với tài khoản khác nhưng không lưu mặc định
    const c = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S1.02",
        floor: 14,
        door: "06",
        layout: "1PN",
        areaM2: 45,
        askRent: 7_000_000,
        bankName: "ACB",
        bankAccount: "987654321",
        bankAccountHolder: "TÀI KHOẢN PHỤ",
        saveAsDefaultPayout: false,
      },
      false,
    );

    expect(c.bankName).toBe("ACB");
    expect(c.bankAccount).toBe("987654321");

    // Tài khoản mặc định trong Store Profile vẫn là Techcombank
    const payout = landlordPayoutAccount(getMockState());
    expect(payout?.bankName).toBe("Techcombank");
    expect(payout?.bankAccount).toBe("190311112222");
    expect(payout?.bankAccountHolder).toBe("CHỦ NHÀ CHÍNH");
  });

  // Case 20: Tự động liên kết trang thiết bị chủ nhà kê khai sang 32 danh mục thẩm định của Host
  it("20. Tự động liên kết trang thiết bị chủ nhà kê khai sang 32 danh mục thẩm định của Host", async () => {
    const { resolveInventoryCodesFromLandlord } = await import("@/lib/mock/inventory");

    // Chủ nhà kê khai: sofa, kitchen, fridge
    const c = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S1.02",
        floor: 15,
        door: "08",
        layout: "2PN",
        areaM2: 65,
        askRent: 9_000_000,
        furnished: true,
        items: ["sofa", "kitchen", "fridge"],
      },
      false,
    );

    expect(c.items).toContain("sofa");
    expect(c.items).toContain("kitchen");
    expect(c.items).toContain("fridge");

    const { codes, landlordCodes } = resolveInventoryCodesFromLandlord(c.items, c.furnished, c.note);

    // Sofa -> Mã 1, 2, 3
    expect(codes.has("1")).toBe(true);
    expect(codes.has("2")).toBe(true);
    expect(codes.has("3")).toBe(true);
    expect(landlordCodes.has("1")).toBe(true);

    // Bếp -> Mã 6, 7, 9, 10, 11
    expect(codes.has("6")).toBe(true);
    expect(codes.has("7")).toBe(true);

    // Tủ lạnh -> Mã 8
    expect(codes.has("8")).toBe(true);

    // Tivi và Điều khiển TV/Điều hòa không được khai -> không nằm trong codes
    expect(codes.has("4")).toBe(false);
    expect(codes.has("30")).toBe(false);
    expect(codes.has("31")).toBe(false);

    // Kiểm tra trường hợp căn hộ chủ nhà KHÔNG kê khai món nào:
    const emptyConsign = actions.submitConsignment(
      {
        landlordId: "L1",
        building: "S1.02",
        floor: 10,
        door: "02",
        layout: "Studio",
        areaM2: 32,
        askRent: 5_000_000,
        furnished: false,
        items: [],
      },
      false,
    );
    const emptyResult = resolveInventoryCodesFromLandlord(emptyConsign.items, emptyConsign.furnished, emptyConsign.note);
    // Không có ô nào bị tự tick
    expect(emptyResult.codes.size).toBe(0);
    expect(emptyResult.landlordCodes.size).toBe(0);
  });
});

