"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, MessageCircleMore, Phone, ShieldCheck, User, Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { OtpInput } from "@/components/ui/OtpInput";
import { ZaloMockOtp } from "@/components/ui/ZaloMockOtp";
import { toast } from "@/components/ui/Toast";
import { accountApi } from "@/lib/apiClient";
import { fmtPhone, isValidVnPhone, normalizePhone, vnd } from "@/lib/format";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { useRole, useSession } from "@/lib/auth/client";
import { errorText, otpErrorText, retryAfterSeconds, tenantApi } from "@/lib/tenant/api";
import { invalidateTenantBookings, invalidateTenantTerms, invalidateTenantUnit, tenantQueries } from "@/lib/tenant/queries";
import type { PublicFastDeposit } from "@/lib/tenant/types";
import { unitAddress, type Unit } from "@/lib/units";
import sheet from "@/components/booking/BookingSheet.module.css";
import styles from "./FastCloseModal.module.css";

interface FastCloseModalProps {
  unit: Unit;
  quote: PublicFastDeposit;
  open: boolean;
  onClose: () => void;
}

/**
 * Chốt cọc nhanh trên trang căn (hồ sơ 20): không cần lịch xem. Số tiền hiển thị lấy từ `GET /units/:code/fast-deposit`,
 * backend tính lại khi tạo cọc (CẤM gửi số tiền). Chu kỳ 1/3/6 (giảm giá thuê) chọn ở bước ký HĐ.
 */
export function FastCloseModal({ unit, quote, open, onClose }: FastCloseModalProps) {
  return (
    <Modal open={open} onClose={onClose} variant="sheet" title={`Chốt cọc nhanh căn ${unitAddress(unit)}`} hideClose={false}>
      {open && <Flow unit={unit} quote={quote} />}
    </Modal>
  );
}

function Flow({ unit, quote }: { unit: Unit; quote: PublicFastDeposit }) {
  const router = useRouter();
  const { user } = useSession();
  const isTenant = useRole() === "tenant";
  const terms = useApiQuery(tenantQueries.depositTerms(unit.code));
  const profileQuery = useApiQuery(
    { key: "tenant:me:profile", fetch: accountApi.getProfile, errorText: (res) => errorText(res, "Không tải được hồ sơ.") },
    isTenant,
  );
  const profile = profileQuery.state.status === "ready" ? profileQuery.state.data : null;

  const [step, setStep] = useState<"info" | "otp">("info");
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const name = nameInput ?? (profile?.fullName || user?.fullName || "");
  const phone = phoneInput ?? (profile?.phone || "");
  const p = normalizePhone(phone);
  const [consent, setConsent] = useState(false);
  const [ackNoViewing, setAckNoViewing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [mockOtp, setMockOtp] = useState<{ phone: string; code: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSkipOtp = Boolean(profile?.isPhoneVerified && profile.phone && normalizePhone(phone) === normalizePhone(profile.phone));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!isTenant) {
    return (
      <div className={sheet.flow}>
        <Breakdown quote={quote} />
        <Link href={`/login?next=${encodeURIComponent(`/units/${unit.code}?fastdeposit=1`)}`} className="btn btn-primary btn-lg btn-block">
          Đăng nhập để chốt cọc
        </Link>
        <p className="xs muted" style={{ textAlign: "center", margin: 0 }}>
          Khoản cọc gắn với tài khoản Khách thuê để bạn theo dõi, ký hợp đồng và nhận hoàn cọc an toàn (NĐ 13/2023).
        </p>
      </div>
    );
  }

  const termsDoc = terms.state.status === "ready" ? terms.state.data : null;

  const requestCode = async () => {
    setOtpError(null);
    const res = await tenantApi.sendOtp(p, "TENANT_VIEWING");
    if (!res.ok) {
      const wait = retryAfterSeconds(res);
      if (res.code === "otp_cooldown" && wait) {
        setCooldown(wait);
        return true;
      }
      const msg = otpErrorText(res);
      setErrors((prev) => ({ ...prev, phone: msg }));
      toast(msg);
      return false;
    }
    setCode("");
    setCooldown(res.data.resendInSeconds);
    setMockOtp(res.data.devOtp ? { phone: p, code: res.data.devOtp } : null);
    return true;
  };

  /** `POST /bookings/fast-deposit` — chỉ gửi lựa chọn, KHÔNG gửi số tiền. Thành công ⇒ trang lịch hiện VietQR. */
  const submit = async (actionToken?: string) => {
    if (!termsDoc) return false;
    const res = await tenantApi.createFastDeposit({
      unitCode: unit.code,
      contactName: name.trim(),
      phone: p,
      actionToken,
      acceptTerms: true,
      acknowledgeNoViewing: true,
      termsVersion: termsDoc.version,
    });
    if (!res.ok) {
      if (res.code === "otp_required" && !actionToken) {
        if (await requestCode()) setStep("otp");
        return false;
      }
      if (res.code === "terms_version_stale") {
        invalidateTenantTerms(unit.code);
        setConsent(false);
        terms.reload();
      }
      if (res.code === "fast_close_unavailable" || res.code === "unit_not_available" || res.code === "unit_already_held") {
        invalidateTenantUnit(unit.code);
      }
      const msg = errorText(res, "Chưa tạo được mã VietQR. Vui lòng thử lại.");
      setOtpError(msg);
      toast(msg);
      return false;
    }
    invalidateTenantBookings();
    invalidateTenantUnit(unit.code);
    toast(`Đã giữ ưu đãi chốt cọc nhanh (${res.data.ref}). Quét VietQR để khoá căn.`, "success");
    router.push(`/booking/${encodeURIComponent(res.data.ref)}`);
    return true;
  };

  const validate = () => {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Vui lòng nhập họ và tên người đặt cọc.";
    if (!isValidVnPhone(phone)) next.phone = "Số điện thoại chưa hợp lệ. Ví dụ đúng: 0912 345 678.";
    setErrors(next);
    return Object.keys(next).length === 0 && consent && ackNoViewing && !!termsDoc;
  };

  const onConfirm = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      if (canSkipOtp) await submit();
      else if (await requestCode()) setStep("otp");
    } finally {
      setSubmitting(false);
    }
  };

  const onCode = async (v: string) => {
    setCode(v);
    setOtpError(null);
    if (v.length !== 4 || submitting) return;
    setSubmitting(true);
    try {
      const verified = await tenantApi.verifyOtp(p, v, "TENANT_VIEWING");
      if (!verified.ok) {
        setOtpError(otpErrorText(verified));
        return;
      }
      await submit(verified.data.actionToken);
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "otp") {
    return (
      <div className={sheet.flow}>
        <button type="button" className={sheet.backBtn} onClick={() => setStep("info")}>
          <ChevronLeft size={16} /> Quay lại
        </button>
        <div className={sheet.otpHeader}>
          <div className={sheet.otpBadge}>
            <MessageCircleMore size={14} />
            <span>Zalo OTP</span>
          </div>
          <h3 className={sheet.otpTitle}>Nhập mã xác thực 4 số</h3>
          <p className={sheet.otpSub}>
            VinStay AI vừa nhắn mã qua Zalo tới <b className="tnum">{fmtPhone(p)}</b>. Mã cọc và hợp đồng sẽ gửi về số này.
          </p>
        </div>
        <div className={sheet.otpInputWrap}>
          <OtpInput value={code} onChange={(v) => void onCode(v)} error={!!otpError} autoFocus />
          {otpError && <p className="field-error">{otpError}</p>}
          <ZaloMockOtp code={mockOtp?.phone === p ? mockOtp.code : null} disabled={submitting} onFill={(c) => void onCode(c)} />
          <button type="button" className={`btn btn-quiet btn-sm ${sheet.resendBtn}`} disabled={cooldown > 0 || submitting} onClick={() => void requestCode()}>
            {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : "Gửi lại mã OTP qua Zalo"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={sheet.flow}>
      <Breakdown quote={quote} />

      <div className={sheet.formBody}>
        <div className={sheet.formGroup}>
          <label className={sheet.formLabel} htmlFor="fast-name">
            <User size={15} className={sheet.labelIcon} />
            <span>Họ tên người đặt cọc</span>
            <span className={sheet.requiredStar}>*</span>
          </label>
          <input
            id="fast-name"
            className={`input ${sheet.formInput} ${errors.name ? sheet.inputError : ""}`}
            autoComplete="name"
            placeholder="Ví dụ: Nguyễn Văn An"
            value={name}
            onChange={(e) => setNameInput(e.target.value)}
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>
        <div className={sheet.formGroup}>
          <div className={sheet.labelRow}>
            <label className={sheet.formLabel} htmlFor="fast-phone">
              <Phone size={15} className={sheet.labelIcon} />
              <span>Số điện thoại Zalo nhận mã cọc</span>
              <span className={sheet.requiredStar}>*</span>
            </label>
            <span className={sheet.zaloBadge}>{canSkipOtp ? "Đã xác thực" : "Xác thực Zalo"}</span>
          </div>
          <input
            id="fast-phone"
            className={`input ${sheet.formInput} ${errors.phone ? sheet.inputError : ""}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0912 345 678"
            value={phone}
            onChange={(e) => setPhoneInput(e.target.value)}
            aria-invalid={!!errors.phone}
          />
          {errors.phone ? (
            <span className="field-error">{errors.phone}</span>
          ) : (
            <span className={sheet.fieldHint}>Người thân có thể chuyển khoản thay bạn (Điều 283 BLDS 2015); bạn vẫn là người đặt cọc.</span>
          )}
        </div>
      </div>

      {termsDoc && (
        <div className={styles.terms}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowTerms((v) => !v)}>
            {showTerms ? "Ẩn điều khoản cọc" : `Xem ${termsDoc.items.length} điều khoản cọc`}
          </button>
          {showTerms && (
            <ul>
              {termsDoc.items.map((it) => (
                <li key={it.id}>{it.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className={styles.check}>
        <input type="checkbox" checked={ackNoViewing} onChange={(e) => setAckNoViewing(e.target.checked)} />
        <span>
          Tôi đồng ý chốt cọc <b>không cần xem trực tiếp</b>: đã xem ảnh thực tế có dấu thời gian và thông tin căn đã xác minh. Nếu không ký hợp
          đồng vì lý do cá nhân, khoản cọc xử lý theo Điều 328 BLDS 2015.
        </span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!termsDoc} />
        <span>{termsDoc?.consentLabel ?? "Đang tải điều khoản cọc..."}</span>
      </label>

      <button
        type="button"
        className={`btn btn-primary btn-lg btn-block ${sheet.submitBtn}`}
        style={{ whiteSpace: "normal", height: "auto", minHeight: 48, lineHeight: 1.3 }}
        disabled={!consent || !ackNoViewing || !termsDoc || submitting}
        onClick={() => void onConfirm()}
      >
        {canSkipOtp ? <Zap size={18} /> : <MessageCircleMore size={18} />}
        <span>
          {submitting ? "Đang xử lý..." : canSkipOtp ? `Đồng ý và lấy mã VietQR (${vnd(quote.amount)}đ)` : "Tiếp tục xác thực Zalo OTP"}
        </span>
      </button>
    </div>
  );
}

/** Bảng đối soát: cọc niêm yết → giảm cọc nhanh → thực chuyển VietQR (số do server tính). */
function Breakdown({ quote }: { quote: PublicFastDeposit }) {
  return (
    <div className={styles.breakdown}>
      <dl>
        <div>
          <dt>Tiền cọc bảo đảm niêm yết</dt>
          <dd>{vnd(quote.deposit)}đ</dd>
        </div>
        <div className={styles.discount}>
          <dt>
            <Zap size={14} /> Giảm cọc nhanh
          </dt>
          <dd>−{vnd(quote.depositDiscount)}đ</dd>
        </div>
        <div className={styles.total}>
          <dt>Thực chuyển qua VietQR</dt>
          <dd>{vnd(quote.amount)}đ</dd>
        </div>
      </dl>
      <ul className={styles.notes}>
        <li>
          <ShieldCheck size={14} /> Căn khoá riêng cho bạn {quote.holdHours} giờ ngay khi tiền về (ai chuyển trước giữ căn trước).
        </li>
        <li>
          <ShieldCheck size={14} /> Giảm cọc chỉ giữ nếu tiền về trong {quote.quoteHours} giờ; quá hạn được hoàn tiền, căn không bị khoá.
        </li>
        <li>
          <ShieldCheck size={14} /> Khoản này là 100% Tiền cọc bảo đảm, không nộp bù, không trừ vào tiền thuê tháng đầu. Khi ký hợp đồng, chọn trả 1/3/6
          tháng/lần để giảm thêm giá thuê.
        </li>
      </ul>
    </div>
  );
}
