"use client";

import { useState, useEffect, useRef } from "react";
import { FileSignature, Users, FileText, BookOpen, ShieldCheck, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { signLease, saveTenantRefundAccount } from "@/lib/mock/actions";
import { useMock } from "@/lib/mock/store";
import { tenantLatestRefundAccount } from "@/lib/mock/selectors-tenant";
import { RATES, type PaymentCycle } from "@/lib/mock/cost";
import { vnd } from "@/lib/mock/format";
import { HOUSE_RULES } from "@/lib/mock/house-rules";
import type { Booking } from "@/lib/mock/types";
import { zoneById, type Unit } from "@/lib/mock/units";
import styles from "./Deal.module.css";

interface LeaseFormProps {
  booking: Booking;
  unit: Unit;
  now: number;
  onSigned?: () => void;
}

const iso = (ms: number) => new Date(ms).toISOString();

const POPULAR_BANKS = [
  "Vietcombank",
  "VietinBank",
  "BIDV",
  "Agribank",
  "Techcombank",
  "MB Bank",
  "ACB",
  "VPBank",
];

export function LeaseForm({ booking, unit, now, onSigned }: LeaseFormProps) {
  const state = useMock();
  const savedAccount = booking.lease?.refundAccount || tenantLatestRefundAccount(state, booking.tenant.phone);

  const minStart = new Date(now);
  const [startDate, setStartDate] = useState(() => iso(now + 2 * 86_400_000).slice(0, 10));
  const [months, setMonths] = useState(Math.max(12, unit.minMonths));
  const [paymentCycle, setPaymentCycle] = useState<PaymentCycle>(1);

  // Tài khoản hoàn cọc
  const initialHolderName = String(savedAccount?.holderName || booking.kyc?.fullName || booking.tenant?.name || "").toUpperCase();
  const initialBank = savedAccount?.bankName
    ? POPULAR_BANKS.includes(savedAccount.bankName)
      ? savedAccount.bankName
      : "Khác"
    : POPULAR_BANKS[0];
  const initialCustomBank = savedAccount?.bankName && !POPULAR_BANKS.includes(savedAccount.bankName)
    ? savedAccount.bankName
    : "";

  const [selectedBank, setSelectedBank] = useState(initialBank);
  const [customBank, setCustomBank] = useState(initialCustomBank);
  const [accountNo, setAccountNo] = useState(savedAccount?.accountNo || "");
  const [holderName, setHolderName] = useState(initialHolderName);

  // Tra cứu tự động Napas 247
  type NapasStatus = "idle" | "looking_up" | "verified" | "mismatch" | "not_found";
  const [napasStatus, setNapasStatus] = useState<NapasStatus>(() => (savedAccount?.accountNo ? "verified" : "idle"));
  const [napasOwner, setNapasOwner] = useState<string>(() => (savedAccount?.holderName || initialHolderName));
  const [allowManualEdit, setAllowManualEdit] = useState(false);

  // Chỉ khởi tạo 1 lần từ tài khoản đã lưu (không tự động đè lại khi người dùng chủ động xoá)
  const hasInitializedFromSaved = useRef(Boolean(savedAccount?.accountNo));
  useEffect(() => {
    if (!hasInitializedFromSaved.current && savedAccount?.accountNo) {
      hasInitializedFromSaved.current = true;
      if (POPULAR_BANKS.includes(savedAccount.bankName)) {
        setSelectedBank(savedAccount.bankName);
      } else {
        setSelectedBank("Khác");
        setCustomBank(savedAccount.bankName);
      }
      setAccountNo(savedAccount.accountNo);
      setHolderName(savedAccount.holderName || initialHolderName);
      setNapasStatus("verified");
      setNapasOwner(savedAccount.holderName || initialHolderName);
    }
  }, [savedAccount, initialHolderName]);

  // Tra cứu danh bạ Napas 247 khi nhập số tài khoản
  useEffect(() => {
    const clean = accountNo.trim();
    if (!clean) {
      setNapasStatus("idle");
      return;
    }
    if (!/^\d{6,19}$/.test(clean)) {
      setNapasStatus("idle");
      return;
    }

    setNapasStatus("looking_up");
    const timer = setTimeout(() => {
      // Giả lập tra cứu Napas 247:
      // Test case: nếu kết thúc bằng 888 => mô phỏng lệch tên người khác
      if (clean.endsWith("888")) {
        const otherName = "NGUYỄN THỊ BÍCH";
        setNapasStatus("mismatch");
        setNapasOwner(otherName);
        setHolderName(otherName);
      } else if (clean.endsWith("000000")) {
        // Test case: số tài khoản không tồn tại
        setNapasStatus("not_found");
      } else {
        // Hợp lệ chính chủ
        const verifiedName = String(booking.kyc?.fullName || booking.tenant?.name || "").toUpperCase();
        setNapasStatus("verified");
        setNapasOwner(verifiedName);
        setHolderName(verifiedName);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [accountNo, selectedBank, customBank, booking.kyc?.fullName, booking.tenant.name]);

  // Modal xem chi tiết điều khoản hợp đồng
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Đồng thuận ký điện tử
  const [consentElectronicSign, setConsentElectronicSign] = useState(false);

  // Lỗi form
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const tenantName = booking.kyc?.fullName || booking.tenant.name;
  const idNumber = booking.kyc?.idNumber || "—";
  const zone = zoneById(unit.zoneId);

  // Dự toán tài chính
  const securityDeposit = unit.rent;
  const rentAmount = unit.rent * paymentCycle;
  const holdingPaid = booking.deposit?.amount ?? RATES.holdingDeposit;
  const topUpDeposit = Math.max(0, securityDeposit - holdingPaid);
  const totalFirstPayment = rentAmount + topUpDeposit;

  const handleSubmit = () => {
    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    const bankName = selectedBank === "Khác" ? customBank.trim() : selectedBank;
    if (!bankName) {
      errors.bankName = "Vui lòng chọn hoặc nhập tên ngân hàng.";
    }
    if (!/^\d{6,19}$/.test(accountNo.trim())) {
      errors.accountNo = "Số tài khoản nhận hoàn cọc phải gồm 6-19 chữ số.";
    }
    if (!holderName.trim()) {
      errors.holderName = "Vui lòng nhập tên chủ tài khoản.";
    }

    if (napasStatus === "looking_up") {
      setError("Hệ thống đang kết nối tra cứu Napas 247, vui lòng đợi trong giây lát.");
      return;
    }
    if (napasStatus === "not_found") {
      errors.accountNo = "Số tài khoản không tồn tại tại ngân hàng đã chọn.";
    }
    if (napasStatus === "mismatch") {
      errors.holderName = "Tên chủ tài khoản không trùng họ tên trên CCCD.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Vui lòng kiểm tra lại các thông tin chưa hợp lệ.");
      return;
    }

    const refundAccount = {
      bankName,
      accountNo: accountNo.trim(),
      holderName: holderName.trim(),
    };

    // Tự động lưu tài khoản vào hồ sơ để lần thuê tiếp theo không cần nhập lại
    saveTenantRefundAccount(booking.tenant.phone, refundAccount);

    const res = signLease(booking.id, {
      startDate,
      months,
      paymentCycle,
      occupants: booking.lease?.occupants ?? [],
      refundAccount,
      signature: "EKYC_VERIFIED",
    });

    if (res.ok) {
      onSigned?.();
    } else {
      if (res.code === "holder_mismatch") {
        setFieldErrors({ holderName: "Tên chủ tài khoản phải trùng họ tên trên CCCD." });
      }
      setError(res.reason || "Ký hợp đồng thuê thất bại.");
    }
  };

  return (
    <div className="card" style={{ padding: "20px 16px" }}>
      <header style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <FileSignature size={20} style={{ color: "var(--lagoon)" }} />
          Hợp đồng thuê căn hộ (Ký số)
        </h3>
        <p className="muted small" style={{ margin: 0 }}>
          Kiểm tra thông tin thuê, thiết lập tài khoản hoàn cọc và ký hợp đồng điện tử.
        </p>
      </header>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      {/* 1. Khối Thời hạn */}
      <div className={styles.leaseGrid}>
        <label className="field">
          <span className="label">Ngày bắt đầu thuê</span>
          <input
            className="input"
            type="date"
            min={minStart.toISOString().slice(0, 10)}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="label">Thời hạn hợp đồng</span>
          <select
            className="input"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            <option value={6}>6 tháng (Trung hạn)</option>
            <option value={12}>12 tháng (Dài hạn tiêu chuẩn)</option>
            <option value={24}>24 tháng (Cam kết 2 năm)</option>
          </select>
        </label>
      </div>

      {/* 2. Khối Kỳ thanh toán */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Kỳ thanh toán tiền thuê</div>
        <div className={styles.radioRow}>
          {[1, 3, 6].map((cycle) => (
            <label key={cycle} className="radio" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input
                type="radio"
                name="paymentCycle"
                value={cycle}
                checked={paymentCycle === cycle}
                onChange={() => setPaymentCycle(cycle as PaymentCycle)}
              />
              <span>Thanh toán {cycle} tháng/lần (Điều 3.2 HĐ thuê)</span>
            </label>
          ))}
        </div>
      </div>

      {/* 3. Tinh gọn: Thông báo khai báo người cùng cư trú sau thanh toán / dọn vào */}
      <div
        style={{
          margin: "16px 0",
          padding: "12px 14px",
          background: "var(--paper-2)",
          border: "1px dashed var(--line-strong)",
          borderRadius: "var(--r)",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <Users size={20} style={{ color: "var(--primary, #0f4c81)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>
            Khai báo người cùng cư trú (Tối đa 5 người)
          </div>
          <p className="muted xs" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
            Để tinh gọn bước thanh toán, bạn có thể bổ sung thông tin người ở cùng bất cứ lúc nào trong mục <b>Hồ sơ của bạn</b> sau khi hoàn tất thanh toán hoặc sau khi dọn vào nhà để đăng ký tạm trú và cấp thẻ cư dân.
          </p>
        </div>
      </div>

      {/* 4. Khối Tài khoản nhận hoàn cọc */}
      <div className={styles.formSection}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <div className={styles.formSectionTitle} style={{ margin: 0 }}>
            Tài khoản ngân hàng nhận hoàn cọc
          </div>
          {savedAccount && accountNo === savedAccount.accountNo && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: "var(--kelp)",
                background: "var(--paper-2)",
                padding: "3px 8px",
                borderRadius: "var(--r)",
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={13} /> Đã điền từ tài khoản đã lưu
            </span>
          )}
        </div>
        <p className="muted small" style={{ marginBottom: 10 }}>
          Phải trùng 100% họ tên trên CCCD để hoàn cọc tự động khi thanh lý hợp đồng. Tài khoản chỉ cần nhập 1 lần và sẽ tự động lưu cho mọi lần thuê tiếp theo.
        </p>

        <div className={styles.leaseGrid}>
          <label className="field">
            <span className="label">Ngân hàng</span>
            <select
              className="input"
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
            >
              {POPULAR_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="Khác">Ngân hàng khác...</option>
            </select>
          </label>

          {selectedBank === "Khác" && (
            <label className="field">
              <span className="label">Tên ngân hàng</span>
              <input
                className="input"
                placeholder="Nhập tên ngân hàng"
                value={customBank}
                onChange={(e) => setCustomBank(e.target.value)}
              />
              {fieldErrors.bankName && (
                <span className="small" style={{ color: "var(--danger)" }}>{fieldErrors.bankName}</span>
              )}
            </label>
          )}

          <label className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="label">Số tài khoản</span>
              <span className="muted xs" style={{ fontWeight: 500, color: "var(--lagoon)" }}>
                ⚡ Tự động xác thực Napas 247
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                placeholder="Nhập 6–19 chữ số"
                value={accountNo}
                style={{ paddingRight: napasStatus === "looking_up" ? 85 : 12 }}
                onChange={(e) => {
                  const val = e.target.value;
                  setAccountNo(val);
                  setFieldErrors((prev) => ({ ...prev, accountNo: "" }));
                  if (!val.trim()) {
                    setNapasStatus("idle");
                    setHolderName("");
                    setAllowManualEdit(true);
                  }
                }}
              />
              {napasStatus === "looking_up" && (
                <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--lagoon)" }}>
                  <Loader2 size={15} className={styles.spin} />
                  <span className="xs">Napas...</span>
                </div>
              )}
            </div>
            {fieldErrors.accountNo && (
              <span className="small" style={{ color: "var(--danger)" }}>{fieldErrors.accountNo}</span>
            )}
            {napasStatus === "not_found" && (
              <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertCircle size={14} /> Số tài khoản không tồn tại tại ngân hàng đã chọn.
              </div>
            )}
            {napasStatus === "mismatch" && (
              <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.4 }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>Cảnh báo lệch tên:</b> Tài khoản ngân hàng thuộc về <b>{napasOwner}</b> (không khớp với CCCD <b>{String(tenantName || "").toUpperCase()}</b>). Vui lòng sử dụng tài khoản chính chủ.
                </span>
              </div>
            )}
            {napasStatus === "verified" && (
              <div style={{ color: "var(--kelp)", fontSize: 12.5, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} />
                <span>
                  <b>Napas 247:</b> Đã xác thực chủ tài khoản <b>{holderName}</b> (Khớp 100% CCCD)
                </span>
              </div>
            )}
          </label>

          <label className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="label">Tên chủ tài khoản (in hoa)</span>
              {napasStatus === "verified" && !allowManualEdit && Boolean(accountNo) && (
                <button
                  type="button"
                  onClick={() => setAllowManualEdit(true)}
                  style={{ background: "none", border: "none", color: "var(--primary, #0f4c81)", fontSize: 11.5, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  Sửa thủ công
                </button>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                value={holderName}
                readOnly={napasStatus === "verified" && !allowManualEdit && Boolean(accountNo)}
                style={napasStatus === "verified" && !allowManualEdit && Boolean(accountNo) ? { background: "var(--surface-2)", cursor: "not-allowed" } : undefined}
                onChange={(e) => setHolderName(e.target.value.toUpperCase())}
              />
              {napasStatus === "verified" && !allowManualEdit && Boolean(accountNo) && (
                <span title="Tên được khóa tự động theo kết quả tra cứu Napas 247" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--kelp)" }}>
                  <ShieldCheck size={16} />
                </span>
              )}
            </div>
            {fieldErrors.holderName && (
              <span className="small" style={{ color: "var(--danger)" }}>{fieldErrors.holderName}</span>
            )}
            <span className="muted xs" style={{ marginTop: 2, display: "block" }}>
              Tên được tự động tra cứu từ ngân hàng qua cổng Napas 247 để đảm bảo hoàn cọc tự động chính xác 100%.
            </span>
          </label>
        </div>
      </div>

      {/* 5. Khối Dự toán tài chính đợt đầu */}
      <div className={styles.depositBreakdown}>
        <div style={{ fontWeight: 600, color: "var(--ink-950)", marginBottom: 8 }}>
          Dự toán tài chính nhận bàn giao căn hộ {unit.code} ({zone.name}):
        </div>

        <div className={styles.breakdownRow}>
          <span className="muted">Tiền thuê kỳ 1 ({paymentCycle} tháng):</span>
          <b>{vnd(rentAmount)}đ</b>
        </div>

        <div className={styles.breakdownRow}>
          <span className="muted">Tiền cọc bảo đảm tài sản &amp; nội thất:</span>
          <b>{vnd(securityDeposit)}đ</b>
        </div>

        <div className={styles.breakdownRow} style={{ color: "var(--ok)", fontSize: 12.5 }}>
          <span>
            ↳ Đã cọc giữ chỗ ({vnd(holdingPaid)}đ chuyển 100% vào cọc bảo đảm, <b>không khấu trừ vào tiền thuê tháng đầu</b>):
          </span>
          <b>-{vnd(holdingPaid)}đ</b>
        </div>

        <div className={styles.breakdownRow}>
          <span className="muted">Phần cọc bảo đảm còn thiếu:</span>
          <b>{vnd(topUpDeposit)}đ</b>
        </div>

        <div className={styles.breakdownTotal}>
          <span>Tổng thanh toán kỳ đầu trước khi nhận nhà:</span>
          <span style={{ color: "var(--lagoon-700)" }}>{vnd(totalFirstPayment)}đ</span>
        </div>
      </div>

      {/* 6. Khối Điều khoản hợp đồng thuê (Tinh gọn) */}
      <div
        style={{
          marginTop: 16,
          marginBottom: 14,
          padding: "14px 16px",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={20} style={{ color: "var(--primary, #0f4c81)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-950)" }}>
              Điều khoản hợp đồng thuê căn hộ
            </div>
            <div className="muted xs" style={{ marginTop: 2 }}>
              Quy định cọc bảo đảm, thanh toán &amp; 6 nội quy BQL Vinhomes Ocean Park
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-outline"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
          onClick={() => setShowTermsModal(true)}
        >
          <BookOpen size={14} /> Xem chi tiết điều khoản hợp đồng
        </button>
      </div>

      {/* 7. Chứng thực eKYC & Ký số điện tử */}
      <div
        style={{
          background: "var(--paper-2)",
          border: "1px solid var(--line-strong)",
          padding: "14px 16px",
          borderRadius: "var(--r)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--kelp)" }}>
          <ShieldCheck size={20} />
          <b style={{ fontSize: 14 }}>Chứng thực danh tính eKYC &amp; Ký số điện tử</b>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", display: "flex", flexDirection: "column", gap: 4 }}>
          <div>Bên thuê (Chính chủ): <b>{tenantName}</b></div>
          <div>Số CCCD gắn chip: <b>{idNumber}</b></div>
          <div>Số điện thoại xác thực OTP: <b>{booking.tenant.phone}</b></div>
          <div className="muted xs" style={{ marginTop: 4 }}>
            Hợp đồng được ký số điện tử hợp pháp theo Luật Giao dịch điện tử 2023, có giá trị pháp lý tương đương ký tay. Dữ liệu CCCD được mã hóa AES-256 theo Nghị định 13/2023/NĐ-CP.
          </div>
        </div>
      </div>

      <label className="check" style={{ fontSize: 13, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <input
          type="checkbox"
          checked={consentElectronicSign}
          onChange={(e) => setConsentElectronicSign(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          Tôi xác nhận thông tin định danh eKYC trên là chính xác và hoàn toàn đồng ý ký kết <b>Hợp đồng thuê căn hộ</b> với các điều khoản đã thỏa thuận.
        </span>
      </label>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        disabled={!consentElectronicSign}
        onClick={handleSubmit}
      >
        Xác nhận ký kết hợp đồng thuê căn hộ
      </button>

      {/* MODAL CHI TIẾT ĐIỀU KHOẢN HỢP ĐỒNG */}
      <Modal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        variant="wide"
        title="Chi tiết điều khoản hợp đồng thuê căn hộ"
        description={`Căn hộ ${unit.code} (${zone.name}) · Vinhomes Ocean Park`}
        footer={
          <button type="button" className="btn btn-primary btn-block" onClick={() => setShowTermsModal(false)}>
            Tôi đã đọc và hiểu rõ điều khoản
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13.5, lineHeight: 1.6 }}>
          <div style={{ background: "var(--paper-2)", padding: "12px 14px", borderRadius: "var(--r)", border: "1px solid var(--line)" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>1. Giá thuê &amp; Kỳ hạn thanh toán</h4>
            <p className="muted small" style={{ margin: 0 }}>
              Tiền thuê cố định <b>{vnd(unit.rent)}đ/tháng</b> trong suốt kỳ hạn {months} tháng. Thanh toán {paymentCycle} tháng/lần qua VietQR với cú pháp gạch nợ tự động <code>VSA {unit.code} THANH TOAN TIEN THUE KY [kỳ]</code>.
            </p>
          </div>

          <div style={{ background: "var(--paper-2)", padding: "12px 14px", borderRadius: "var(--r)", border: "1px solid var(--line)" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>2. Tiền cọc bảo đảm tài sản (Security Deposit)</h4>
            <p className="muted small" style={{ margin: 0 }}>
              Tiền cọc bảo đảm là <b>{vnd(securityDeposit)}đ</b> (đã bao gồm 2.000.000đ cọc giữ chỗ chuyển đổi 100%). Khoản cọc được giữ nguyên suốt kỳ thuê để bảo vệ nội thất và dự phòng nợ cước; <b>tuyệt đối không khấu trừ vào tiền thuê tháng đầu tiên</b> và được hoàn lại khi thanh lý hợp đồng.
            </p>
          </div>

          <div style={{ background: "var(--paper-2)", padding: "12px 14px", borderRadius: "var(--r)", border: "1px solid var(--line)" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>3. Quy định chậm thanh toán &amp; Tạm dừng mã cửa</h4>
            <p className="muted small" style={{ margin: 0 }}>
              Ân hạn và lãi chậm trả theo mức quy định hợp đồng. Quá thời gian ân hạn không thanh toán, hệ thống có quyền tạm dừng cấp mã mở cửa điện tử và tiến hành thanh lý hợp đồng đơn phương theo Điều 3.4.
            </p>
          </div>

          <div style={{ background: "var(--paper-2)", padding: "12px 14px", borderRadius: "var(--r)", border: "1px solid var(--line)" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>4. Bồi thường hư hại &amp; Trách nhiệm dân sự</h4>
            <p className="muted small" style={{ margin: 0 }}>
              Hiện trạng tài sản được bảo chứng qua Hộ chiếu bàn giao số (10 hạng mục lúc nhận nhà). Hành vi cố ý phá hoại tài sản, lãng phí tiện ích hoặc tự ý bỏ trốn: bồi hoàn phần thiệt hại vượt cọc trong 05 ngày làm việc (lãi quá hạn 0,05%/ngày) và có thể bị tố giác theo Điều 178 Bộ luật Hình sự.
            </p>
          </div>

          <div style={{ background: "var(--surface)", padding: "14px", borderRadius: "var(--r)", border: "1px solid var(--line-strong)" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
              <BookOpen size={16} style={{ color: "var(--primary, #0f4c81)" }} /> 5. 6 Nội quy bắt buộc tuân thủ (BQL Vinhomes)
            </h4>
            <ol style={{ paddingLeft: 18, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {HOUSE_RULES.map((rule) => (
                <li key={rule.id} className="small" style={{ lineHeight: 1.5 }}>
                  <b>{rule.title}:</b> {rule.body}{" "}
                  <span className="muted" style={{ fontSize: 11, color: "var(--kelp)", fontWeight: 500 }}>
                    ({rule.source})
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Modal>
    </div>
  );
}
