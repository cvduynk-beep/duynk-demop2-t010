"use client";

import { useState } from "react";
import { FileSignature, FileText, BookOpen, ShieldCheck, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { PAYMENT_CYCLES, type PaymentCycle } from "@/lib/pricing/cost";
import { fmtDate, vnd } from "@/lib/format";
import { HOUSE_RULES } from "@/lib/legal/house-rules";
import type { UnitWithExtras } from "@/lib/tenant/adapters";
import { errorText, tenantApi } from "@/lib/tenant/api";
import { billingStart, moveInWindow } from "@/lib/tenant/moveIn";
import type { TenantBooking } from "@/lib/tenant/types";
import { zoneById } from "@/lib/units";
import styles from "./Deal.module.css";

interface LeaseFormProps {
  booking: TenantBooking;
  unit: UnitWithExtras;
  now: number;
  onSigned?: (booking: TenantBooking) => void;
}

/** Giới hạn do backend kiểm (`LeaseSigningService`): thời hạn minMonths..36, ngày dọn vào theo Smart Move-in (T0+2 … T0+30). */
const MAX_LEASE_MONTHS = 36;

/**
 * Ký Hợp đồng thuê chính thức: gửi `POST /contracts/lease/sign` (bản ghi Contract/SignedDocument thật, PDF + SHA-256
 * thật). Chỉ nghi thức ký (OTP ký số, dấu thời gian TSA) là mô phỏng ở backend.
 * Tài khoản nhận hoàn cọc và người cùng cư trú chưa có chỗ lưu trong DB (chờ migration) nên không thu ở đây.
 */
export function LeaseForm({ booking, unit, now, onSigned }: LeaseFormProps) {
  const minMonths = Math.max(1, unit.minMonths || 1);
  const monthOptions = [...new Set([minMonths, 6, 12, 24, MAX_LEASE_MONTHS])].filter((m) => m >= minMonths && m <= MAX_LEASE_MONTHS).sort((a, b) => a - b);

  const deposit = booking.deposit;
  const fastClose = deposit?.fastClose;
  // T0 = ngày cọc về; chưa có (không nên xảy ra ở bước ký) ⇒ lấy hôm nay, backend vẫn kiểm lại.
  const moveIn = moveInWindow(deposit?.paidAt ? Date.parse(deposit.paidAt) : now);
  const [moveInDate, setMoveInDate] = useState(moveIn.earliest);
  const [months, setMonths] = useState(() => (monthOptions.includes(12) ? 12 : monthOptions[0]));
  // Chốt nhanh ⇒ kỳ thanh toán đã cam kết, không đổi được (backend trả 422 nếu lệch).
  const [paymentCycle, setPaymentCycle] = useState<PaymentCycle>(fastClose?.cycle ?? 1);
  const [signature, setSignature] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [consentElectronicSign, setConsentElectronicSign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantName = booking.contact.name;
  const zoneName = unit.zoneName || zoneById(unit.zoneId)?.name || "Ocean Park";

  const billingDate = billingStart(moveIn, moveInDate);
  const lateMoveIn = billingDate !== moveInDate;

  // Dự toán tài chính (số liệu thật của căn; backend tính lại khi lập hợp đồng)
  const monthlyRent = fastClose?.monthlyRent ?? unit.rent;
  const depositPaid = deposit?.amount ?? unit.holdingDeposit;
  // Cọc v2: khoản đã chuyển CHÍNH LÀ Tiền cọc bảo đảm (không thu bù). Cọc giữ chỗ cũ (điều khoản HOLD-*) ⇒ bù phần chênh.
  const legacyHold = !!deposit?.termsVersion?.startsWith("HOLD-");
  const securityDeposit = legacyHold ? Math.max(unit.securityDeposit, depositPaid) : depositPaid;
  const rentAmount = monthlyRent * paymentCycle;
  const topUpDeposit = Math.max(0, securityDeposit - depositPaid);
  const totalFirstPayment = rentAmount + topUpDeposit;

  const handleSubmit = async () => {
    setError(null);
    if (!hasInk || !signature) {
      setError("Vui lòng ký tay vào ô chữ ký trước khi xác nhận.");
      return;
    }
    setBusy(true);
    const res = await tenantApi.signLease({ bookingRef: booking.ref, startDate: moveInDate, months, paymentCycle, signatureSvg: signature });
    setBusy(false);
    if (!res.ok) {
      setError(errorText(res, "Ký hợp đồng thuê thất bại."));
      return;
    }
    onSigned?.(res.data.booking);
  };

  return (
    <div className="card" style={{ padding: "20px 16px" }}>
      <header style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <FileSignature size={20} style={{ color: "var(--lagoon)" }} />
          Hợp đồng thuê căn hộ (Ký số)
        </h3>
        <p className="muted small" style={{ margin: 0 }}>
          Kiểm tra thông tin thuê, đọc điều khoản và ký hợp đồng điện tử.
        </p>
      </header>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      {/* 1. Khối Thời hạn */}
      <div className={styles.leaseGrid}>
        <label className="field">
          <span className="label">Ngày dọn vào</span>
          <input
            className="input"
            type="date"
            min={moveIn.earliest}
            max={moveIn.latest}
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
          />
          <span className="muted xs">
            Từ {fmtDate(moveIn.earliest)} đến {fmtDate(moveIn.latest)}. Miễn phí chờ tới {fmtDate(moveIn.freeUntil)}
            {lateMoveIn ? <b> — dọn vào muộn hơn nên tiền thuê tính từ {fmtDate(billingDate)}.</b> : "."}
          </span>
        </label>

        <label className="field">
          <span className="label">Thời hạn hợp đồng</span>
          <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m} tháng
              </option>
            ))}
          </select>
          <span className="muted xs">Căn này thuê tối thiểu {minMonths} tháng.</span>
        </label>
      </div>

      {/* 2. Khối Kỳ thanh toán */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Kỳ thanh toán tiền thuê</div>
        {fastClose && (
          <p className="muted xs" style={{ margin: "0 0 6px" }}>
            Bạn đã chốt nhanh {fastClose.cycle} tháng/kỳ với giá {vnd(fastClose.monthlyRent)}đ/tháng — kỳ thanh toán giữ đúng cam kết.
          </p>
        )}
        <div className={styles.radioRow}>
          {PAYMENT_CYCLES.map((cycle) => (
            <label key={cycle} className="radio" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input
                type="radio"
                name="paymentCycle"
                value={cycle}
                checked={paymentCycle === cycle}
                disabled={!!fastClose && fastClose.cycle !== cycle}
                onChange={() => setPaymentCycle(cycle)}
              />
              <span>Thanh toán {cycle} tháng/lần (Điều 3.2 HĐ thuê)</span>
            </label>
          ))}
        </div>
      </div>

{/* 5. Khối Dự toán tài chính đợt đầu */}
      <div className={styles.depositBreakdown}>
        <div style={{ fontWeight: 600, color: "var(--ink-950)", marginBottom: 8 }}>
          Dự toán tài chính nhận bàn giao căn hộ {unit.code} ({zoneName}):
        </div>

        <div className={styles.breakdownRow}>
          <span className="muted">
            Tiền thuê kỳ 1 ({paymentCycle} tháng × {vnd(monthlyRent)}đ, tính từ {fmtDate(billingDate)}):
          </span>
          <b>{vnd(rentAmount)}đ</b>
        </div>

        <div className={styles.breakdownRow}>
          <span className="muted">Tiền cọc bảo đảm tài sản &amp; nội thất:</span>
          <b>{vnd(securityDeposit)}đ</b>
        </div>

        <div className={styles.breakdownRow} style={{ color: "var(--ok)", fontSize: 12.5 }}>
          <span>
            ↳ Đã chuyển khi chốt cọc ({vnd(depositPaid)}đ chuyển 100% vào cọc bảo đảm, <b>không khấu trừ vào tiền thuê tháng đầu</b>):
          </span>
          <b>-{vnd(depositPaid)}đ</b>
        </div>

        {topUpDeposit > 0 && (
          <div className={styles.breakdownRow}>
            <span className="muted">Phần cọc bảo đảm còn thiếu:</span>
            <b>{vnd(topUpDeposit)}đ</b>
          </div>
        )}

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

      {/* 7. Định danh & ký tay */}
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
          <div>
            Bên thuê: <b>{tenantName}</b>
          </div>
          <div>
            CCCD: <b>{booking.kyc ? "Đã xác minh eKYC" : "Chưa xác minh"}</b>
          </div>
          <div>
            Số điện thoại xác thực OTP: <b>{booking.contact.phoneMasked}</b>
          </div>
          <div className="muted xs" style={{ marginTop: 4 }}>
            Hợp đồng được ký điện tử theo Luật Giao dịch điện tử 2023. Dữ liệu CCCD được mã hóa AES-256 theo Nghị định 13/2023/NĐ-CP.
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <SignaturePad onChange={setHasInk} onCapture={setSignature} label="Ký tên của bạn vào đây" />
        </div>
      </div>

      <label className="check" style={{ fontSize: 13, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <input type="checkbox" checked={consentElectronicSign} onChange={(e) => setConsentElectronicSign(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          Tôi xác nhận thông tin định danh eKYC là chính xác và đồng ý ký kết <b>Hợp đồng thuê căn hộ</b> với các điều khoản đã thỏa thuận.
        </span>
      </label>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        disabled={!consentElectronicSign || !hasInk || busy || !booking.kyc}
        onClick={handleSubmit}
      >
        {busy ? <Loader2 size={18} className={styles.spin} /> : null} Xác nhận ký kết hợp đồng thuê căn hộ
      </button>

{/* MODAL CHI TIẾT ĐIỀU KHOẢN HỢP ĐỒNG */}
      <Modal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        variant="wide"
        title="Chi tiết điều khoản hợp đồng thuê căn hộ"
        description={`Căn hộ ${unit.code} (${zoneName}) · Vinhomes Ocean Park`}
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
              Tiền thuê cố định <b>{vnd(monthlyRent)}đ/tháng</b> trong suốt kỳ hạn {months} tháng. Thanh toán {paymentCycle} tháng/lần qua VietQR với cú pháp gạch nợ tự động <code>VSA {unit.code} THANH TOAN TIEN THUE KY [kỳ]</code>.
            </p>
          </div>

          <div style={{ background: "var(--paper-2)", padding: "12px 14px", borderRadius: "var(--r)", border: "1px solid var(--line)" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>2. Tiền cọc bảo đảm tài sản (Security Deposit)</h4>
            <p className="muted small" style={{ margin: 0 }}>
              Tiền cọc bảo đảm là <b>{vnd(securityDeposit)}đ</b> (đã bao gồm {vnd(depositPaid)}đ chuyển khi chốt cọc, chuyển đổi 100%). Khoản cọc được giữ nguyên suốt kỳ thuê để bảo vệ nội thất và dự phòng nợ cước; <b>tuyệt đối không khấu trừ vào tiền thuê tháng đầu tiên</b> và được hoàn lại khi thanh lý hợp đồng.
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
