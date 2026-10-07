import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal localStorage mock for Node environment
const mem = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  addEventListener: () => {},
});

import * as actions from "@/lib/mock/actions";
import { HOLD_HOURS_DEFAULT, HOUR_MS } from "@/lib/mock/cost";
import { getMockState, resetMockState } from "@/lib/mock/store";
import {
  bookingById,
  isHoldForfeited,
  unitStatus,
} from "@/lib/mock/selectors";
import { tenantLatestRefundAccount } from "@/lib/mock/selectors-tenant";
import { viewingLog } from "@/lib/mock/selectors-viewing";

beforeEach(() => {
  mem.clear();
  resetMockState();
});

describe("Deal Flow - SPEC-P01 §7 / deal.test.ts", () => {
  it("(1) hostStartDeposit rồi confirmDepositPaid khi chưa consent => vẫn closing", () => {
    // Lấy booking confirmed từ seed hoặc tạo mới
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);

    const afterStart = bookingById(getMockState(), b.id)!;
    expect(afterStart.status).toBe("closing");
    expect(afterStart.depositConsentAt).toBeUndefined();

    // Giả lập webhook ngân hàng báo có khi khách chưa tick consent
    actions.confirmDepositPaid(b.id, "webhook");

    const afterPaidAttempt = bookingById(getMockState(), b.id)!;
    expect(afterPaidAttempt.status).toBe("closing");
  });

  it("(2) consent -> paid => holding, expiresAt - paidAt === HOLD_HOURS_DEFAULT giờ", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);

    // Khách đồng ý điều khoản cọc
    const consentRes = actions.tenantAcceptDepositTerms(b.id);
    expect(consentRes.ok).toBe(true);

    const consented = bookingById(getMockState(), b.id)!;
    expect(consented.depositConsentAt).toBeDefined();

    // Giả lập ngân hàng báo có
    actions.confirmDepositPaid(b.id, "webhook");
    const held = bookingById(getMockState(), b.id)!;
    expect(held.status).toBe("holding");
    expect(held.deposit?.paidAt).toBeDefined();
    expect(held.deposit?.expiresAt).toBeDefined();

    const paidAt = Date.parse(held.deposit!.paidAt!);
    const expiresAt = Date.parse(held.deposit!.expiresAt!);
    expect(expiresAt - paidAt).toBe(HOLD_HOURS_DEFAULT * HOUR_MS);
    expect(held.deposit?.holdHours).toBe(HOLD_HOURS_DEFAULT);
  });

  it("(3) saveKyc khi viewing => bad_status, khi closing => ok", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);

    // Khi còn ở viewing: saveKyc không được phép
    const resViewing = actions.saveKyc(b.id, {
      fullName: "Trần Văn Nam",
      idNumber: "001095012345",
      dob: "1995-01-01",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "123 Cầu Giấy, Hà Nội",
      issuedDate: "2021-01-01",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.95,
    });
    expect(resViewing.ok).toBe(false);
    if (!resViewing.ok) {
      expect(resViewing.code).toBe("bad_status");
    }

    // Khi chuyển sang closing (bước chuyển cọc): saveKyc thành công
    actions.hostStartDeposit(b.id);
    const resClosing = actions.saveKyc(b.id, {
      fullName: "Trần Văn Nam",
      idNumber: "001095012345",
      dob: "1995-01-01",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "123 Cầu Giấy, Hà Nội",
      issuedDate: "2021-01-01",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.95,
    });
    expect(resClosing.ok).toBe(true);
    const updated = bookingById(getMockState(), b.id)!;
    expect(updated.kyc).toBeDefined();
    expect(updated.kyc?.idNumber).toBe("001095012345");
  });

  it("(4) luồng hoàn chỉnh: closing -> consent -> paid -> holding -> saveKyc -> signLease -> leased", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "trần văn   nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);
    actions.tenantAcceptDepositTerms(b.id);
    actions.confirmDepositPaid(b.id, "webhook");

    const held = bookingById(getMockState(), b.id)!;
    expect(held.status).toBe("holding");

    const kycRes = actions.saveKyc(b.id, {
      fullName: "Trần Văn Nam",
      idNumber: "001095012345",
      dob: "1995-01-01",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "Tòa S2.02 Vinhomes Ocean Park, Gia Lâm, Hà Nội",
      issuedDate: "2021-01-01",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.95,
    });
    expect(kycRes.ok).toBe(true);

    const leaseRes = actions.signLease(b.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [{ fullName: "Trần Văn Nam", idOrDob: "001095012345" }],
      refundAccount: { bankName: "VCB", accountNo: "1234567890", holderName: "Trần Văn Nam" },
      paymentCycle: 1,
    });
    expect(leaseRes.ok).toBe(true);

    const leasedBooking = bookingById(getMockState(), b.id)!;
    expect(leasedBooking.status).toBe("leased");
    expect(leasedBooking.lease).toBeDefined();
  });

  it("(5) signLease chưa kyc => no_kyc", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);
    actions.tenantAcceptDepositTerms(b.id);
    actions.confirmDepositPaid(b.id, "webhook");

    const res = actions.signLease(b.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [{ fullName: "Trần Văn Nam", idOrDob: "001095012345" }],
      refundAccount: { bankName: "VCB", accountNo: "1234567890", holderName: "Trần Văn Nam" },
      paymentCycle: 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("no_kyc");
    }
  });

  it("(6) saveKyc sai tên so với đặt lịch => mismatch = ['fullName']", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);
    actions.tenantAcceptDepositTerms(b.id);
    actions.confirmDepositPaid(b.id, "webhook");

    const res = actions.saveKyc(b.id, {
      fullName: "Nguyễn Văn Nam", // Khác tên lúc đặt lịch
      idNumber: "001095012345",
      dob: "1995-01-01",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "123 Cầu Giấy, Hà Nội",
      issuedDate: "2021-01-01",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.95,
    });
    expect(res.ok).toBe(true);

    const afterKyc = bookingById(getMockState(), b.id)!;
    expect(afterKyc.kyc?.mismatch).toEqual(["fullName"]);
  });

  it("(7) demoExpireHold => isHoldForfeited true, unitStatus = available, và signLease => expired", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);
    actions.tenantAcceptDepositTerms(b.id);
    actions.confirmDepositPaid(b.id, "webhook");

    // Tua hết hạn giữ căn
    const expireRes = actions.demoExpireHold(b.id);
    expect(expireRes.ok).toBe(true);

    const held = bookingById(getMockState(), b.id)!;
    const now = Date.now();
    expect(isHoldForfeited(held, now)).toBe(true);
    expect(unitStatus(getMockState(), "s2-02-1004")).toBe("available");

    // Thử ký hợp đồng sau khi đã hết hạn giữ căn
    const signRes = actions.signLease(b.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [{ fullName: "Trần Văn Nam", idOrDob: "001095012345" }],
      refundAccount: { bankName: "VCB", accountNo: "1234567890", holderName: "Trần Văn Nam" },
      paymentCycle: 1,
    });
    expect(signRes.ok).toBe(false);
    if (!signRes.ok) {
      expect(signRes.code).toBe("expired");
    }
  });

  it("(8) cancelBooking khi còn 1h59 => too_late, khi còn 2h01 => ok", () => {
    const now = Date.now();
    // Tạo 2 slot: một slot 1h59m tới và một slot 2h05m tới
    // Dùng slot ISO hoặc timestamp
    const slotSoon = new Date(now + 119 * 60_000).toISOString();
    const slotLater = new Date(now + 125 * 60_000).toISOString();

    const bSoon = actions.createBooking({
      unitId: "s2-02-1004",
      slot: slotSoon,
      name: "Khách Đặt Sớm",
      phone: "0912345678",
      persons: 1,
    });
    actions.hostAccept(bSoon.id);

    const bLater = actions.createBooking({
      unitId: "s2-12-1608",
      slot: slotLater,
      name: "Khách Đặt Muộn",
      phone: "0912345678",
      persons: 1,
    });
    actions.hostAccept(bLater.id);

    const resSoon = actions.cancelBooking(bSoon.id, "Bận việc đột xuất", "tenant");
    expect(resSoon.ok).toBe(false);
    if (!resSoon.ok) {
      expect(resSoon.code).toBe("too_late");
    }

    const resLater = actions.cancelBooking(bLater.id, "Bận việc", "tenant");
    expect(resLater.ok).toBe(true);
  });

  it("(9) viewEndedAt được set bởi hostStartDeposit và hostNotInterested", () => {
    const b1 = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Khách Cọc",
      phone: "0912345678",
      persons: 1,
    });
    actions.hostAccept(b1.id);
    actions.hostStartReceiving(b1.id);
    actions.hostConfirmViewing(b1.id);
    actions.hostStartDeposit(b1.id);

    const afterDep = bookingById(getMockState(), b1.id)!;
    expect(afterDep.viewEndedAt).toBeDefined();

    const b2 = actions.createBooking({
      unitId: "s2-19-1907",
      slot: "10:00 - 10:45 30/10/2026",
      name: "Khách Không Ưng",
      phone: "0987654321",
      persons: 1,
    });
    actions.hostAccept(b2.id);
    actions.hostStartReceiving(b2.id);
    actions.hostConfirmViewing(b2.id);
    actions.hostNotInterested(b2.id, "Chưa ưng hướng ban công");

    const afterNot = bookingById(getMockState(), b2.id)!;
    expect(afterNot.viewEndedAt).toBeDefined();

    // Kiểm tra thông báo cho Host và Waitlist F2
    const s = getMockState();
    const hostNotice = s.notices.find((n) => n.audience === "host" && n.title.includes("thù lao"));
    expect(hostNotice).toBeDefined();
    const waitlistNotice = s.notices.find((n) => n.audience === "tenant" && n.title.includes("mở lại lịch xem"));
    expect(waitlistNotice).toBeDefined();

    // Test ca xem nối tiếp tại chỗ (Cross-sell)
    const nextBk = actions.hostImmediateViewing(b2.id, "s2-12-1608");
    expect(nextBk.unitId).toBe("s2-12-1608");
    expect(nextBk.tenant.phone).toBe("0987654321");
    expect(nextBk.status).toBe("receiving");
  });

  it("(10) viewingLog: outcome và durationMin đúng cho 3 booking seed", () => {
    const logs = viewingLog(getMockState(), {});
    expect(logs.length).toBeGreaterThanOrEqual(1);

    // Kiểm tra các trường cơ bản
    for (const log of logs) {
      expect(log.bookingId).toBeDefined();
      expect(log.tenantPhoneMasked).toBeDefined();
      expect(log.startedAt).toBeDefined();
      expect(["in_progress", "deposit", "not_decided", "no_show", "cancelled"]).toContain(log.outcome);
      if (log.endedAt) {
        expect(log.durationMin).toBeDefined();
        expect(log.durationMin).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("(11) updateBookingOccupants: lưu người ở cùng sau thanh toán/dọn vào và validate đầy đủ", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0912345678",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);
    actions.tenantAcceptDepositTerms(b.id);
    actions.confirmDepositPaid(b.id, "webhook");
    actions.saveKyc(b.id, {
      fullName: "Trần Văn Nam",
      idNumber: "001095012345",
      dob: "1995-01-01",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "Hà Nội",
      issuedDate: "2021-01-01",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.95,
    });

    // Ký hợp đồng tinh gọn không cần nhập người ở cùng (occupants: [])
    const leaseRes = actions.signLease(b.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [],
      refundAccount: { bankName: "VCB", accountNo: "1234567890", holderName: "Trần Văn Nam" },
      paymentCycle: 1,
    });
    expect(leaseRes.ok).toBe(true);

    let current = bookingById(getMockState(), b.id)!;
    expect(current.status).toBe("leased");
    expect(current.lease?.occupants).toEqual([]);

    // Thanh toán đợt đầu
    const payRes = actions.confirmFirstPayment(b.id);
    expect(payRes.ok).toBe(true);

    // Cập nhật người ở cùng sau thanh toán / sau khi dọn vào
    const updateRes = actions.updateBookingOccupants(b.id, [
      { fullName: "Lê Thị Bạn", idOrDob: "001096054321", phone: "0987654321" },
    ]);
    expect(updateRes.ok).toBe(true);

    current = bookingById(getMockState(), b.id)!;
    expect(current.lease?.occupants.length).toBe(1);
    expect(current.lease?.occupants[0].fullName).toBe("Lê Thị Bạn");

    // Validate: thiếu idOrDob => lỗi
    const badRes = actions.updateBookingOccupants(b.id, [{ fullName: "Nguyễn Văn A", idOrDob: "" }]);
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) {
      expect(badRes.code).toBe("invalid_input");
    }

    // Validate: số điện thoại sai định dạng => lỗi
    const badPhoneRes = actions.updateBookingOccupants(b.id, [
      { fullName: "Nguyễn Văn A", idOrDob: "001122334455", phone: "12345" },
    ]);
    expect(badPhoneRes.ok).toBe(false);
    if (!badPhoneRes.ok) {
      expect(badPhoneRes.code).toBe("invalid_input");
    }
  });

  it("(12) luồng cọc mới: eKYC bắt buộc ngay bước closing -> consent -> paid -> holding -> ký số eKYC không cần ký nháp", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Hoàng Văn Bách",
      phone: "0931222333",
      persons: 2,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);

    // Xác thực eKYC ngay bước closing
    const kycRes = actions.saveKyc(b.id, {
      fullName: "HOÀNG VĂN BÁCH",
      idNumber: "001093122333",
      dob: "15/05/1996",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "Tòa S2.02 Vinhomes Ocean Park, Gia Lâm, Hà Nội",
      issuedDate: "20/05/2021",
      frontUrl: "mock-front",
      backUrl: "mock-back",
      selfieUrl: "mock-face",
      confidence: 0.98,
    });
    expect(kycRes.ok).toBe(true);

    const afterKyc = bookingById(getMockState(), b.id)!;
    expect(afterKyc.kyc?.fullName).toBe("HOÀNG VĂN BÁCH");
    expect(afterKyc.kyc?.idNumber).toBe("001093122333");

    // Khách chấp thuận điều khoản & chuyển cọc
    const consentRes = actions.tenantAcceptDepositTerms(b.id);
    expect(consentRes.ok).toBe(true);
    actions.confirmDepositPaid(b.id, "webhook");

    const held = bookingById(getMockState(), b.id)!;
    expect(held.status).toBe("holding");

    // Ký kết hợp đồng số bằng danh tính eKYC (không cần vẽ chữ ký nháp)
    const signRes = actions.signLease(b.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [],
      refundAccount: {
        bankName: "Techcombank",
        accountNo: "190345678901",
        holderName: "HOÀNG VĂN BÁCH",
      },
      paymentCycle: 1,
      signature: "EKYC_VERIFIED",
    });
    expect(signRes.ok).toBe(true);

    const leased = bookingById(getMockState(), b.id)!;
    expect(leased.status).toBe("leased");
    expect(leased.lease?.refundAccount.holderName).toBe("HOÀNG VĂN BÁCH");
  });

  it("(13) tài khoản nhận hoàn cọc chỉ cần nhập 1 lần: lưu tự động vào profile và tự động kế thừa khi thuê thêm căn khác", () => {
    const phone = "0988665544";
    const bankName = "Vietcombank";
    const accountNo = "998877665544";
    const holderName = "NGUYỄN VĂN AN";

    // 1. Khách thuê căn đầu tiên (b1)
    const b1 = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Nguyễn Văn An",
      phone,
      persons: 1,
    });
    actions.hostAccept(b1.id);
    actions.hostStartReceiving(b1.id);
    actions.hostConfirmViewing(b1.id);
    actions.hostStartDeposit(b1.id);

    actions.saveKyc(b1.id, {
      fullName: holderName,
      idNumber: "001099887766",
      dob: "01/01/1990",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "Hà Nội",
      issuedDate: "01/01/2020",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.99,
    });
    actions.tenantAcceptDepositTerms(b1.id);
    actions.confirmDepositPaid(b1.id, "webhook");

    // Khách nhập tài khoản ngân hàng lần đầu và ký hợp đồng căn 1
    const signRes1 = actions.signLease(b1.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [],
      refundAccount: {
        bankName,
        accountNo,
        holderName,
      },
      paymentCycle: 1,
      signature: "EKYC_VERIFIED",
    });
    expect(signRes1.ok).toBe(true);

    // Kiểm tra tài khoản đã được lưu vào hệ thống
    const saved = tenantLatestRefundAccount(getMockState(), phone);
    expect(saved).toBeDefined();
    expect(saved?.bankName).toBe(bankName);
    expect(saved?.accountNo).toBe(accountNo);
    expect(saved?.holderName).toBe(holderName);

    // 2. Khách tiến hành thuê thêm căn thứ hai (b2) cùng số điện thoại
    const b2 = actions.createBooking({
      unitId: "s1-01-0806",
      slot: "14:00 - 14:45 31/10/2026",
      name: "Nguyễn Văn An",
      phone,
      persons: 2,
    });
    actions.hostAccept(b2.id);
    actions.hostStartReceiving(b2.id);
    actions.hostConfirmViewing(b2.id);
    actions.hostStartDeposit(b2.id);
    actions.tenantAcceptDepositTerms(b2.id);
    actions.confirmDepositPaid(b2.id, "webhook");

    // Khi ký hợp đồng căn 2: Selector tự động tìm thấy tài khoản đã lưu từ lần 1
    const autoFilledAccount = tenantLatestRefundAccount(getMockState(), b2.tenant.phone);
    expect(autoFilledAccount).toBeDefined();
    expect(autoFilledAccount?.accountNo).toBe(accountNo);
    expect(autoFilledAccount?.bankName).toBe(bankName);
    expect(autoFilledAccount?.holderName).toBe(holderName);

    // Ký căn 2 với tài khoản kế thừa tự động thành công
    const signRes2 = actions.signLease(b2.id, {
      startDate: "2026-11-15",
      months: 12,
      occupants: [],
      refundAccount: autoFilledAccount!,
      paymentCycle: 1,
      signature: "EKYC_VERIFIED",
    });
    expect(signRes2.ok).toBe(true);
    const b2Final = bookingById(getMockState(), b2.id)!;
    expect(b2Final.status).toBe("leased");
    expect(b2Final.lease?.refundAccount.accountNo).toBe(accountNo);
  });

  it("(14) xác thực Napas 247: chặn ngay khi tên chủ tài khoản ngân hàng lệch với họ tên trên CCCD", () => {
    const b = actions.createBooking({
      unitId: "s2-02-1004",
      slot: "09:00 - 09:45 30/10/2026",
      name: "Trần Văn Nam",
      phone: "0911223344",
      persons: 1,
    });
    actions.hostAccept(b.id);
    actions.hostStartReceiving(b.id);
    actions.hostConfirmViewing(b.id);
    actions.hostStartDeposit(b.id);

    actions.saveKyc(b.id, {
      fullName: "TRẦN VĂN NAM",
      idNumber: "001095012345",
      dob: "01/01/1995",
      gender: "Nam",
      homeTown: "Hà Nội",
      address: "Hà Nội",
      issuedDate: "01/01/2021",
      frontUrl: "mock",
      backUrl: "mock",
      selfieUrl: "mock",
      confidence: 0.99,
    });
    actions.tenantAcceptDepositTerms(b.id);
    actions.confirmDepositPaid(b.id, "webhook");

    // Khách nhập tài khoản ngân hàng của người khác (lệch tên CCCD)
    const signRes = actions.signLease(b.id, {
      startDate: "2026-11-01",
      months: 12,
      occupants: [],
      refundAccount: {
        bankName: "Vietcombank",
        accountNo: "9876543210888",
        holderName: "NGUYỄN THỊ BÍCH", // Lệch với TRẦN VĂN NAM
      },
      paymentCycle: 1,
      signature: "EKYC_VERIFIED",
    });

    expect(signRes.ok).toBe(false);
    if (!signRes.ok) {
      expect(signRes.code).toBe("holder_mismatch");
      expect(signRes.reason).toBe("Tên chủ tài khoản phải trùng họ tên trên CCCD");
    }
  });

  it("(15) xoá tài khoản hoàn cọc đã lưu: sau khi xoá, không tự động khôi phục lại khi thuê tiếp", () => {
    const phone = "0988776655";
    const refundAccount = {
      bankName: "MBBank",
      accountNo: "888899990000",
      holderName: "LÊ HOÀI AN",
    };

    // Lưu tài khoản
    actions.saveTenantRefundAccount(phone, refundAccount);
    expect(tenantLatestRefundAccount(getMockState(), phone)?.accountNo).toBe("888899990000");

    // Xoá tài khoản đã lưu
    actions.deleteTenantRefundAccount(phone);

    // Kiểm tra không còn tài khoản tự động điền
    expect(tenantLatestRefundAccount(getMockState(), phone)).toBeUndefined();
  });
});


