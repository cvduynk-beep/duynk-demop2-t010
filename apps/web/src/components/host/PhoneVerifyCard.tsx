"use client";

import { useEffect, useState } from "react";
import { ZaloMockOtp } from "@/components/ui/ZaloMockOtp";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { refreshSession } from "@/lib/auth/client";
import { hostApi, invalidateHostMe, type HostMe } from "@/lib/host/api";
import { errorText, retryAfterSeconds, type OtpSent } from "@/lib/tenant/api";
import styles from "./Host.module.css";

/**
 * Field Host / Chủ nhà tự xác thực SĐT bằng OTP Zalo (Admin không nhập SĐT hộ). Dùng API có sẵn:
 * `POST /auth/phone/send-otp` (báo trùng số ngay, chưa gửi mã) → `POST /auth/phone/verify`.
 */
export function PhoneVerifyCard({
  me,
  onVerified,
  description = "Dùng để nhận nhắc hẹn T-10 phút, thông báo ca xem và OTP Zalo. Cần xác thực để nhận ca.",
}: {
  me: Pick<HostMe, "isPhoneVerified" | "phone">;
  onVerified: () => void;
  description?: string;
}) {
  const [editing, setEditing] = useState(!me.isPhoneVerified);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  /** Response gửi mã gần nhất (kèm `devOtp` khi Zalo giả lập); null = chưa gửi. Gửi lại thì thay hẳn. */
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await hostApi.sendPhoneOtp(phone.trim());
    setBusy(false);
    if (!res.ok) {
      const wait = retryAfterSeconds(res);
      if (res.code === "otp_cooldown" && wait) setCooldown(wait);
      return setError(errorText(res));
    }
    setSent(res.data);
    setCode("");
    setCooldown(res.data.resendInSeconds);
  }

  async function verify(otp = code.trim()) {
    setBusy(true);
    setError(null);
    const res = await hostApi.verifyPhone(phone.trim(), otp);
    setBusy(false);
    if (!res.ok) return setError(errorText(res));
    toast("Đã xác thực số điện thoại", "success");
    setSent(null);
    setCode("");
    setPhone("");
    setEditing(false);
    invalidateHostMe();
    await refreshSession();
    onVerified();
  }

  const verified = me.isPhoneVerified && Boolean(me.phone);
  const showForm = !verified || editing;

  return (
    <Section
      title="Số điện thoại"
      description={description}
      actions={<StatusBadge tone={verified ? "ok" : "warn"}>{verified ? "Đã xác thực" : "Chưa xác thực"}</StatusBadge>}
    >
      {verified && !editing ? (
        <p>
          Số đang dùng: <b className="tnum">{me.phone}</b>{" "}
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(true)}>
            Đổi số
          </button>
        </p>
      ) : (
        showForm && (
          <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
            <ol className={styles.phoneSteps}>
              <li className={!sent ? styles.phoneStepOn : ""}>1. Nhập số Zalo</li>
              <li className={sent ? styles.phoneStepOn : ""}>2. Nhập mã 4 số</li>
            </ol>
            <label className="field">
              Số điện thoại Zalo
              <input
                className="input"
                inputMode="tel"
                placeholder="09xx xxx xxx"
                value={phone}
                disabled={busy || sent !== null}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            {!sent ? (
              <button type="button" className="btn btn-primary" disabled={busy || phone.trim().length < 9} onClick={send}>
                Gửi mã xác thực
              </button>
            ) : (
              <>
                <p className="muted small">
                  Đã gửi mã 4 số tới Zalo <b className="tnum">{phone.trim()}</b>.{" "}
                  <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => { setSent(null); setCode(""); setError(null); }}>
                    Đổi số
                  </button>
                </p>
                <ZaloMockOtp code={sent.devOtp} disabled={busy} onFill={(c) => { setCode(c); void verify(c); }} />
                <label className="field">
                  Mã 4 số
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={4}
                    value={code}
                    disabled={busy}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <button type="button" className="btn btn-primary" disabled={busy || code.length !== 4} onClick={() => void verify()}>
                  Xác thực
                </button>
                <button type="button" className="btn btn-quiet btn-sm" disabled={busy || cooldown > 0} onClick={() => void send()}>
                  {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : "Gửi lại mã"}
                </button>
              </>
            )}
            {verified && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setEditing(false); setSent(null); setCode(""); setPhone(""); }}>
                Huỷ
              </button>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )
      )}
    </Section>
  );
}
