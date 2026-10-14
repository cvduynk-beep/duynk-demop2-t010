"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  FileText,
  MessageCircleMore,
  Pencil,
  Phone,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { OtpInput } from "@/components/ui/OtpInput";
import { ZaloMockOtp } from "@/components/ui/ZaloMockOtp";
import { toast } from "@/components/ui/Toast";
import { accountApi } from "@/lib/apiClient";
import { fmtDateTime, fmtPhone, fmtTime, isValidVnPhone, normalizePhone } from "@/lib/format";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { errorText, otpErrorText, retryAfterSeconds, tenantApi } from "@/lib/tenant/api";
import { invalidateTenantBookings, invalidateTenantUnit, tenantQueries } from "@/lib/tenant/queries";
import { unitAddress, type Unit } from "@/lib/units";
import { useRole, useSession } from "@/lib/auth/client";
import { useNow } from "@/lib/useNow";
import { SlotPicker } from "./SlotPicker";
import styles from "./BookingSheet.module.css";

type Step = "slot" | "info" | "otp";

const STEPS = [
  { key: "slot", label: "Chọn giờ" },
  { key: "info", label: "Thông tin" },
  { key: "otp", label: "Xác thực Zalo" },
] as const;

interface BookingSheetProps {
  unit: Unit;
  open: boolean;
  onClose: () => void;
}

export function BookingSheet({ unit, open, onClose }: BookingSheetProps) {
  return (
    <Modal open={open} onClose={onClose} variant="sheet" title={`Đặt lịch xem căn ${unitAddress(unit)}`} hideClose={false}>
      {open && <Flow unit={unit} />}
    </Modal>
  );
}

function Flow({ unit }: { unit: Unit }) {
  const { user } = useSession();
  const role = useRole();
  const isTenant = role === "tenant";
  const now = useNow(30_000);
  // Khung giờ đã có người đặt (API A3) — SlotPicker khoá các ô này.
  const busy = useApiQuery(tenantQueries.busySlots(unit.code));
  const busySlots = busy.state.status === "ready" ? busy.state.data.slots : [];
  // Hồ sơ của chính khách (SĐT đã xác thực Zalo ⇒ được bỏ qua bước OTP; backend kiểm lại lần nữa).
  const profileQuery = useApiQuery(
    { key: "tenant:me:profile", fetch: accountApi.getProfile, errorText: (res) => errorText(res, "Không tải được hồ sơ.") },
    isTenant,
  );
  const profile = profileQuery.state.status === "ready" ? profileQuery.state.data : null;

  const [step, setStep] = useState<Step>("slot");
  const [slot, setSlot] = useState<string | null>(null);
  const defaultName = profile?.fullName || user?.fullName || "";
  const defaultPhone = profile?.phone || "";
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const name = nameInput ?? defaultName;
  const phone = phoneInput ?? defaultPhone;
  const [persons, setPersons] = useState(1);
  const [note, setNote] = useState("");
  const [editingTenant, setEditingTenant] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [otpTtl, setOtpTtl] = useState<number | null>(null);
  /** Zalo giả lập: mã backend trả trong `devOtp`, gắn với SĐT đã xin mã (đổi số ⇒ không hiện mã cũ). */
  const [mockOtp, setMockOtp] = useState<{ phone: string; code: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const canSkip = Boolean(profile?.isPhoneVerified && profile.phone && normalizePhone(phone) === normalizePhone(profile.phone));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const chosen = slot ? new Date(slot) : null;
  const p = normalizePhone(phone);

  /**
   * Gửi OTP (`POST /auth/otp/send`). Kênh thật không trả mã; backend `OTP_PROVIDER=mock` trả `devOtp` để hiện khối Zalo giả lập.
   * Thời gian chờ gửi lại / thời hạn mã lấy từ server (không ghi cứng).
   */
  const requestCode = async () => {
    setSubmitting(true);
    setOtpError(false);
    setOtpErrorMsg(null);
    try {
      const res = await tenantApi.sendOtp(p, "TENANT_VIEWING");
      if (!res.ok) {
        const wait = retryAfterSeconds(res);
        // Mã trước còn hiệu lực (đang chờ gửi lại) ⇒ vẫn cho nhập mã, chỉ khoá nút gửi lại đúng số giây server báo.
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
      setOtpTtl(res.data.expiresInSeconds);
      setCooldown(res.data.resendInSeconds);
      setMockOtp(res.data.devOtp ? { phone: p, code: res.data.devOtp } : null);
      return true;
    } finally {
      setSubmitting(false);
    }
  };

  /** Tạo lịch (`POST /bookings`); không có action token ⇒ backend chỉ nhận khi SĐT tài khoản đã xác thực. */
  const book = async (actionToken?: string) => {
    if (!slot) return false;
    const res = await tenantApi.createBooking({
      unitCode: unit.code,
      slot,
      contactName: name.trim(),
      phone: p,
      partySize: persons,
      note: note.trim() || undefined,
      actionToken,
    });
    if (!res.ok) {
      if (res.code === "otp_required" && !actionToken) {
        if (await requestCode()) setStep("otp");
        return false;
      }
      const msg = errorText(res);
      setOtpErrorMsg(msg);
      toast(msg);
      return false;
    }
    invalidateTenantBookings();
    invalidateTenantUnit(unit.code);
    toast(`Đã đặt lịch ${res.data.ref}`, "success");
    // Mã lịch do SERVER cấp; trang trạng thái đọc lại từ `GET /bookings/:ref` (không phụ thuộc state/localStorage).
    router.push(`/booking/${encodeURIComponent(res.data.ref)}`);
    return true;
  };

  const validate = () => {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Vui lòng nhập họ và tên để Field Host biết xưng hô khi đón bạn.";
    if (!isValidVnPhone(phone)) next.phone = "Số điện thoại chưa hợp lệ. Ví dụ đúng: 0912 345 678.";
    setErrors(next);
    return Object.keys(next).length === 0 && Boolean(slot);
  };

  const sendOtp = async () => {
    if (!validate()) return;
    if (await requestCode()) setStep("otp");
  };

  const confirmWithoutOtp = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await book();
    } finally {
      setSubmitting(false);
    }
  };

  const onCode = async (v: string) => {
    setCode(v);
    setOtpError(false);
    setOtpErrorMsg(null);
    if (v.length !== 4 || submitting) return;
    setSubmitting(true);
    try {
      const verified = await tenantApi.verifyOtp(p, v, "TENANT_VIEWING");
      if (!verified.ok) {
        setOtpError(true);
        setOtpErrorMsg(otpErrorText(verified));
        return;
      }
      if (!(await book(verified.data.actionToken))) setOtpError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = step === "slot" ? 0 : step === "info" ? 1 : 2;

  return (
    <div className={styles.flow}>
      <ol className={styles.progress} aria-label="Các bước đặt lịch">
        {(canSkip ? [{ key: "slot", label: "Chọn giờ" }, { key: "info", label: "Thông tin" }] : STEPS).map((s, i) => {
          const statusClass = i === stepIndex ? styles.active : i < stepIndex ? styles.completed : "";
          return (
            <li key={s.key} className={`${styles.stepItem} ${statusClass}`} aria-current={i === stepIndex ? "step" : undefined}>
              <div className={styles.stepBar} />
              <div className={styles.stepLabel}>
                <span className={styles.stepNumber}>
                  {i < stepIndex ? <Check size={10} /> : i + 1}
                </span>
                <span>{s.label}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {step === "slot" && (
        <>
          <div className={styles.hostRow}>
            <span className={styles.hostAvatar}>
              <Sparkles size={18} />
            </span>
            <div className={styles.hostInfo}>
              <div className={styles.hostInfoTitle}>
                <span>Field Host nội khu đón bạn tại sảnh toà {unit.building}</span>
              </div>
              <div className={styles.hostSub}>
                Field Host nội khu có thẻ thang máy sẽ được giao ngay sau khi bạn đặt.
              </div>
            </div>
          </div>

          {now > 0 && (
            <>
              <h4 style={{ margin: "14px 0 6px", fontSize: 15, fontWeight: 700 }}>Chọn ngày bạn muốn xem</h4>
              <SlotPicker now={now} value={slot} onChange={setSlot} busySlots={busySlots} />
            </>
          )}

          {isTenant ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!slot} onClick={() => setStep("info")}>
              {chosen ? `Tiếp tục với ${fmtTime(chosen)}` : "Chọn một khung giờ"}
            </button>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <Link href={`/login?next=${encodeURIComponent(`/units/${unit.code}?book=1`)}`} className="btn btn-primary btn-lg btn-block">
                Đăng nhập để đặt lịch
              </Link>
              <p className="xs muted" style={{ textAlign: "center", margin: 0 }}>
                Lịch xem gắn với tài khoản Khách thuê để bạn theo dõi, đổi giờ và giữ căn an toàn (NĐ 13/2023).
              </p>
            </div>
          )}
        </>
      )}

      {step === "info" && (
        <>
          <div className={styles.slotRecapCard}>
            <div className={styles.slotRecapLeft}>
              <div className={styles.slotRecapIcon}>
                <Calendar size={18} />
              </div>
              <div className={styles.slotRecapMeta}>
                <div className={styles.slotRecapTime}>
                  {chosen ? fmtDateTime(chosen) : "Chưa chọn giờ"}
                </div>
                <div className={styles.slotRecapLocation}>
                  Sảnh toà {unit.building} · Field Host nội khu đón
                </div>
              </div>
            </div>
            <button
              type="button"
              className={styles.changeSlotBtn}
              onClick={() => setStep("slot")}
              title="Đổi khung giờ xem nhà"
            >
              <Pencil size={13} />
              <span>Đổi giờ</span>
            </button>
          </div>

          <h4 style={{ margin: "10px 0 2px", fontSize: 15, fontWeight: 700 }}>Thông tin người đặt lịch</h4>

          {isTenant && !editingTenant ? (
            <div style={{ background: "var(--surface-hover, #f8fafc)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)", margin: "10px 0 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <b style={{ fontSize: 15 }}>{name}</b>
                  <span className="muted" style={{ margin: "0 6px" }}>·</span>
                  <span className="tnum" style={{ fontSize: 14 }}>{fmtPhone(phone)}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setEditingTenant(true)}
                  style={{ gap: 4 }}
                >
                  <Pencil size={12} /> Sửa
                </button>
              </div>
              {canSkip && (
                <span className="badge badge-success xs" style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Check size={11} /> SĐT đã xác thực qua Zalo
                </span>
              )}
            </div>
          ) : (
            <div className={styles.formBody}>
              {isTenant && editingTenant && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditingTenant(false)}>
                    Xong
                  </button>
                </div>
              )}
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="booking-name">
                  <User size={15} className={styles.labelIcon} />
                  <span>Họ tên khách đặt</span>
                  <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  id="booking-name"
                  className={`input ${styles.formInput} ${errors.name ? styles.inputError : ""}`}
                  autoComplete="name"
                  autoFocus
                  placeholder="Ví dụ: Nguyễn Văn An"
                  value={name}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>

              <div className={styles.formGroup}>
                <div className={styles.labelRow}>
                  <label className={styles.formLabel} htmlFor="booking-phone">
                    <Phone size={15} className={styles.labelIcon} />
                    <span>Số điện thoại (nhận Zalo OTP)</span>
                    <span className={styles.requiredStar}>*</span>
                  </label>
                  <span className={styles.zaloBadge}>Xác thực Zalo</span>
                </div>
                <input
                  id="booking-phone"
                  className={`input ${styles.formInput} ${errors.phone ? styles.inputError : ""}`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0912 345 678"
                  value={phone}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  aria-invalid={!!errors.phone}
                />
                {errors.phone ? (
                  <span className="field-error">{errors.phone}</span>
                ) : (
                  <span className={styles.fieldHint}>
                    Field Host sẽ liên hệ qua Zalo trước 10 phút để đón bạn tại sảnh.
                  </span>
                )}
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <Users size={15} className={styles.labelIcon} />
              <span>Số người đi xem cùng</span>
            </label>
            <div className={styles.segmentedGroup} role="radiogroup" aria-label="Số người đi xem">
              {[1, 2, 3, 4].map((n) => {
                const label = n === 4 ? "4+ người" : `${n} người`;
                const isSelected = persons === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`${styles.segmentedBtn} ${isSelected ? styles.segmentedBtnActive : ""}`}
                    onClick={() => setPersons(n)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.formGroup}>
            <div className={styles.labelRow}>
              <label className={styles.formLabel} htmlFor="booking-note">
                <FileText size={15} className={styles.labelIcon} />
                <span>Ghi chú cho Host</span>
              </label>
              <span className={styles.optionalBadge}>Không bắt buộc</span>
            </div>
            <textarea
              id="booking-note"
              className={`textarea ${styles.formTextarea}`}
              rows={2}
              placeholder="Ví dụ: muốn xem kỹ ban công, hướng nắng, mang theo thú cưng..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>


          {canSkip ? (
            <button
              type="button"
              className={`btn btn-primary btn-lg btn-block ${styles.submitBtn}`}
              onClick={() => {
                void confirmWithoutOtp();
              }}
              disabled={submitting}
            >
              <CheckCircle2 size={18} />
              <span>Xác nhận đặt lịch</span>
            </button>
          ) : (
            <button type="button" className={`btn btn-primary btn-lg btn-block ${styles.submitBtn}`} onClick={() => void sendOtp()} disabled={submitting}>
              <MessageCircleMore size={18} />
              <span>Tiếp tục xác thực Zalo OTP</span>
            </button>
          )}
        </>
      )}

      {step === "otp" && (
        <>
          <button type="button" className={styles.backBtn} onClick={() => setStep("info")}>
            <ChevronLeft size={16} /> Quay lại sửa thông tin
          </button>

          <div className={styles.otpHeader}>
            <div className={styles.otpBadge}>
              <MessageCircleMore size={14} />
              <span>Zalo OTP</span>
            </div>
            <h3 className={styles.otpTitle}>Nhập mã xác thực 4 số</h3>
            <p className={styles.otpSub}>
              VinStay AI vừa nhắn mã xác thực qua Zalo tới <b className="tnum">{fmtPhone(p)}</b>.
              {otpTtl ? ` Mã có hiệu lực trong ${Math.round(otpTtl / 60)} phút.` : ""}
            </p>
          </div>

          <div className={styles.otpInputWrap}>
            <OtpInput value={code} onChange={(v) => void onCode(v)} error={otpError} autoFocus />
            {otpError && <p className="field-error">{otpErrorMsg ?? "Mã chưa đúng. Kiểm tra lại tin nhắn Zalo rồi nhập lại."}</p>}
            <ZaloMockOtp code={mockOtp?.phone === p ? mockOtp.code : null} disabled={submitting} onFill={(c) => void onCode(c)} />
            <button
              type="button"
              className={`btn btn-quiet btn-sm ${styles.resendBtn}`}
              disabled={cooldown > 0 || submitting}
              onClick={() => void requestCode()}
            >
              {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : "Gửi lại mã OTP qua Zalo"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
