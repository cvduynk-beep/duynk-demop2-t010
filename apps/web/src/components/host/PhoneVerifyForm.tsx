"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MessageCircleMore, PencilLine, ShieldCheck, Smartphone } from "lucide-react";
import { DevOtpHint } from "@/components/ui/DevOtpHint";
import { OtpInput } from "@/components/ui/OtpInput";
import { toast } from "@/components/ui/Toast";
import { refreshSession } from "@/lib/auth/client";
import { fmtPhone, isValidVnPhone, normalizePhone } from "@/lib/format";
import { hostApi, invalidateHostMe } from "@/lib/host/api";
import { otpErrorText, retryAfterSeconds } from "@/lib/tenant/api";
import styles from "./PhoneVerify.module.css";

/** Server không trả thời gian chờ gửi lại ⇒ mặc định 60 giây. */
const DEFAULT_RESEND_SECONDS = 60;

/**
 * Form xác thực SĐT 2 bước trong hộp thoại (OTP Zalo): nhập số → nhập mã 4 số (tự xác thực khi đủ 4 số). Dùng API có
 * sẵn `POST /auth/phone/send-otp` → `POST /auth/phone/verify`; thời gian chờ gửi lại và số lần thử lấy từ server.
 */
export function PhoneVerifyForm({ onVerified }: { onVerified: () => void }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  /** Mã OTP backend luôn trả kèm (Zalo mô phỏng, mọi môi trường). */
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phoneOk = isValidVnPhone(phone);
  const step = sentTo ? 2 : 1;

  async function send() {
    if (!phoneOk || busy) return;
    const target = normalizePhone(phone);
    setBusy(true);
    setError(null);
    const res = await hostApi.sendPhoneOtp(target);
    setBusy(false);
    if (!res.ok) {
      const wait = retryAfterSeconds(res);
      if (wait) setCooldown(Math.ceil(wait));
      return setError(otpErrorText(res));
    }
    setSentTo(target);
    setCode("");
    setDevCode(res.data.devCode ?? null);
    setCooldown(res.data.resendInSeconds || DEFAULT_RESEND_SECONDS);
  }

  async function verify(otp: string) {
    if (!sentTo || otp.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    const res = await hostApi.verifyPhone(sentTo, otp);
    if (!res.ok) {
      setBusy(false);
      setCode("");
      return setError(otpErrorText(res));
    }
    toast("Đã xác thực số điện thoại", "success");
    invalidateHostMe();
    await refreshSession();
    setBusy(false);
    onVerified();
  }

  function changeNumber() {
    setSentTo(null);
    setDevCode(null);
    setCode("");
    setError(null);
  }

  return (
    <div className={styles.wrap}>
      <ol className={styles.steps} aria-label="Các bước xác thực">
        <li className={step === 1 ? styles.stepOn : styles.stepDone} aria-current={step === 1 ? "step" : undefined}>
          <span className={styles.stepDot}>{step > 1 ? <Check size={13} strokeWidth={3} /> : 1}</span>
          Số Zalo
        </li>
        <li className={styles.stepLine} aria-hidden />
        <li className={step === 2 ? styles.stepOn : ""} aria-current={step === 2 ? "step" : undefined}>
          <span className={styles.stepDot}>2</span>
          Mã xác thực
        </li>
      </ol>

      {step === 1 ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className={styles.label} htmlFor="host-phone">
            Số điện thoại đăng ký Zalo
          </label>
          <div className={`${styles.phoneField} ${error ? styles.phoneFieldError : ""}`}>
            <span className={styles.prefix}>
              <Smartphone size={16} /> VN
            </span>
            <input
              id="host-phone"
              className={styles.phoneInput}
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="0901 234 567"
              value={phone}
              disabled={busy}
              aria-invalid={!!error}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
            />
          </div>
          <p className={styles.hint}>Mã 4 số sẽ được gửi qua tin nhắn Zalo tới số này.</p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={!phoneOk || busy || cooldown > 0}>
            {busy ? <Loader2 size={16} className={styles.spin} /> : <MessageCircleMore size={16} />}
            {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi mã qua Zalo"}
          </button>
        </form>
      ) : (
        <div className={styles.form}>
          <p className={styles.sentTo}>
            Nhập mã 4 số vừa gửi tới Zalo <b className="tnum">{fmtPhone(sentTo!)}</b>
            <button type="button" className={styles.linkBtn} disabled={busy} onClick={changeNumber}>
              <PencilLine size={13} /> Đổi số
            </button>
          </p>
          <div className={styles.otp}>
            <OtpInput
              value={code}
              autoFocus
              disabled={busy}
              error={!!error}
              onChange={(c) => {
                setCode(c);
                setError(null);
                if (c.length === 4) void verify(c);
              }}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {devCode ? (
            <div className={styles.devCode} role="note">
              <span>
                <span className={styles.devTag}>Bản thử nghiệm</span> Mã OTP Zalo mô phỏng: <b className="tnum">{devCode}</b>
              </span>
              <button
                type="button"
                className={styles.linkBtn}
                disabled={busy}
                onClick={() => {
                  setCode(devCode);
                  setError(null);
                  void verify(devCode);
                }}
              >
                Điền mã
              </button>
            </div>
          ) : (
            <DevOtpHint />
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || code.length !== 4}
            onClick={() => void verify(code)}
          >
            {busy && <Loader2 size={16} className={styles.spin} />}
            {busy ? "Đang xác thực…" : "Xác thực"}
          </button>
          <p className={styles.resend}>
            Chưa nhận được mã?{" "}
            {cooldown > 0 ? (
              <span className="tnum">Gửi lại sau {cooldown}s</span>
            ) : (
              <button type="button" className={styles.linkBtn} disabled={busy} onClick={() => void send()}>
                Gửi lại mã
              </button>
            )}
          </p>
        </div>
      )}

      <p className={styles.privacy}>
        <ShieldCheck size={14} />
        Số điện thoại được mã hoá và chỉ dùng để điều phối ca dẫn khách, ca thẩm định theo Nghị định 13/2023/NĐ-CP.
      </p>
    </div>
  );
}
