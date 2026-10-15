"use client";

import { useEffect, useState } from "react";
import { MessageCircleMore } from "lucide-react";
import { OtpInput } from "@/components/ui/OtpInput";
import { ZaloMockOtp } from "@/components/ui/ZaloMockOtp";
import { fmtPhone, isValidVnPhone, normalizePhone } from "@/lib/format";
import { errorText, landlordApi } from "@/lib/landlord/api";
import type { SignOtpInfo } from "@/lib/landlord/types";

interface ConsignOtpSignProps {
  /** Đã tick cam đoan quyền sở hữu (Điều 2) — chưa tick thì khóa nút gửi mã. */
  warranted: boolean;
  /** Hồ sơ chủ nhà chưa có SĐT xác thực: phải nhập SĐT, OTP đúng sẽ gắn số này vào hồ sơ. */
  needPhone: boolean;
  /** SĐT đã xác thực của chính chủ (khi `needPhone` = false) — chỉ để hiển thị. */
  verifiedPhone?: string | null;
  /**
   * Tạo hồ sơ ký gửi kèm chữ ký (không có bản nháp). `otp` bỏ trống khi ký bằng số đã xác thực.
   * Trả true khi đã ký xong; false khi lỗi (cha tự đặt thông báo qua `onError`).
   */
  onSign: (sig: { otp?: string; phone?: string }) => Promise<boolean>;
  onError: (message: string) => void;
}

/**
 * Ký ủy quyền. SĐT tài khoản đã xác thực Zalo ⇒ ký thẳng 1 bước (backend tin số đã xác thực, `otpSkipped`), KHÔNG gửi OTP.
 * Chưa có số xác thực ⇒ nhập SĐT → gửi mã → nhập 4 số là tạo hồ sơ + ký.
 */
export function ConsignOtpSign({ warranted, needPhone, verifiedPhone, onSign, onError }: ConsignOtpSignProps) {
  const [phone, setPhone] = useState("");
  const [info, setInfo] = useState<SignOtpInfo | null>(null);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phoneOk = !needPhone || isValidVnPhone(phone);

  const send = async () => {
    setBusy(true);
    onError("");
    const res = await landlordApi.sendSignOtp(needPhone ? normalizePhone(phone) : undefined);
    setBusy(false);
    if (!res.ok) {
      onError(errorText(res, "Không gửi được mã OTP."));
      return;
    }
    // Gửi lại ⇒ `info` (kèm `devOtp` nếu Zalo giả lập) thay hẳn mã cũ. Thời gian chờ lấy từ server.
    setInfo(res.data);
    setCode("");
    setWrong(false);
    setCooldown(res.data.resendInSeconds ?? 0);
  };

  const sign = async (otp?: string) => {
    setBusy(true);
    onError("");
    const ok = await onSign({ ...(otp ? { otp } : {}), ...(needPhone ? { phone: normalizePhone(phone) } : {}) });
    setBusy(false);
    if (!ok) {
      setWrong(Boolean(otp));
      setCode("");
    }
  };

  if (!needPhone) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="muted small">
          Bạn ký bằng số Zalo đã xác thực{verifiedPhone ? <> <b className="tnum">{fmtPhone(verifiedPhone)}</b></> : null}, không cần nhập mã OTP.
        </p>
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!warranted || busy} onClick={() => void sign()}>
          {busy ? "Đang ký..." : "Ký ủy quyền độc quyền"}
        </button>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {needPhone && (
          <label className="field">
            <span className="label">Số điện thoại nhận mã OTP</span>
            <input className="input" inputMode="tel" autoComplete="tel" placeholder="0901 234 567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <span className="muted xs" style={{ marginTop: 4 }}>
              Số này sẽ được xác thực và gắn vào hồ sơ chủ nhà của bạn (mã hoá AES-256).
            </span>
          </label>
        )}
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!warranted || !phoneOk || busy} onClick={send}>
          <MessageCircleMore size={18} /> Gửi mã OTP để ký ủy quyền
        </button>
      </div>
    );
  }

  if (!info.otpRequired) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="muted small">
          Bạn ký bằng số Zalo đã xác thực <b className="tnum">{info.maskedPhone}</b>, không cần nhập mã OTP.
        </p>
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void sign()}>
          Ký ủy quyền độc quyền
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="muted small">
        Mã 4 số đã gửi qua Zalo tới <b className="tnum">{info.maskedPhone ?? fmtPhone(normalizePhone(phone))}</b>. Nhập mã để ký ủy quyền.
      </p>
      <OtpInput value={code} error={wrong} autoFocus disabled={busy} onChange={(v) => { setCode(v); setWrong(false); if (v.length === 4) void sign(v); }} />
      <ZaloMockOtp code={info.devOtp} disabled={busy} onFill={(c) => { setCode(c); setWrong(false); void sign(c); }} />
      <button type="button" className="btn btn-quiet btn-sm" style={{ alignSelf: "flex-start" }} disabled={cooldown > 0 || busy} onClick={send}>
        {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : "Gửi lại mã"}
      </button>
    </div>
  );
}
