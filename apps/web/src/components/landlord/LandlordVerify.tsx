"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2, CircleDashed, MessageCircleMore, ScanText, ShieldCheck } from "lucide-react";
import { EkycCapture } from "@/components/kyc/EkycCapture";
import { OtpInput } from "@/components/ui/OtpInput";
import { ZaloMockOtp } from "@/components/ui/ZaloMockOtp";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import { fmtDate, isValidVnPhone, normalizePhone } from "@/lib/format";
import { errorText, landlordApi } from "@/lib/landlord/api";
import { retryAfterSeconds, type OtpSent } from "@/lib/tenant/api";
import { POPULAR_BANKS } from "@/lib/landlord/banks";
import { queries } from "@/lib/landlord/queries";
import type { LandlordVerification, VerificationStep } from "@/lib/landlord/types";
import { invalidateLandlordData, useLandlordQuery } from "@/lib/landlord/useLandlordQuery";
import { QueryView } from "./QueryView";
import styles from "./Landlord.module.css";

const STEPS: { key: VerificationStep; title: string; hint: string; icon: typeof ShieldCheck }[] = [
  { key: "phone", title: "Số điện thoại", hint: "Nhận mã OTP qua Zalo để ký ủy quyền và nhận thông báo khách xem phòng.", icon: MessageCircleMore },
  { key: "identity", title: "Căn cước công dân (eKYC)", hint: "Chụp CCCD 2 mặt + chân dung; AI lấy họ tên, địa chỉ thường trú làm bên ký hợp đồng.", icon: ScanText },
  { key: "payout", title: "Tài khoản nhận tiền", hint: "Tài khoản chính chủ (trùng họ tên CCCD) để nhận tiền thuê và bồi thường trống phòng.", icon: Building2 },
];

/**
 * Xác thực chủ nhà 3 bước trước khi được ký gửi: SĐT (OTP Zalo) → CCCD (eKYC mô phỏng) → ngân hàng (đối chiếu tên chủ TK
 * với họ tên CCCD, mô phỏng Napas247). Mỗi bước phải xong bước trước; bước đã xong thu gọn, có thể làm lại.
 */
export function LandlordVerify() {
  const query = useLandlordQuery(queries.verification);
  return (
    <div className={styles.page} style={{ maxWidth: 820 }}>
      <PageHeader
        title="Xác thực tài khoản"
        description="Hoàn tất 3 bước một lần duy nhất để ký gửi căn hộ. Dữ liệu cá nhân được mã hoá AES-256 theo Nghị định 13/2023/NĐ-CP."
        back={{ href: "/landlord/account", label: "Tài khoản" }}
      />
      <QueryView query={query} skeleton="form">
        {(v) => <Steps v={v} />}
      </QueryView>
    </div>
  );
}

function Steps({ v }: { v: LandlordVerification }) {
  const firstMissing = v.missing[0] ?? null;
  // Bước đang mở: mặc định là bước đầu tiên còn thiếu; người dùng có thể mở lại bước đã xong để đổi.
  // Lựa chọn của người dùng chỉ có hiệu lực khi bước còn thiếu chưa đổi; xong một bước ⇒ tự mở bước kế tiếp.
  const [choice, setChoice] = useState<{ base: VerificationStep | null; step: VerificationStep | null } | null>(null);
  const open = choice && choice.base === firstMissing ? choice.step : firstMissing;
  const setOpen = (step: VerificationStep | null) => setChoice({ base: firstMissing, step });
  const done = (k: VerificationStep) => !v.missing.includes(k);
  const doneCount = STEPS.filter((s) => done(s.key)).length;
  const refresh = () => invalidateLandlordData();

  return (
    <>
      <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>
          {v.ready ? "Tài khoản đã xác thực đầy đủ" : `Đã xong ${doneCount}/3 bước`}
        </b>
        <div style={{ flex: 1, minWidth: 160, height: 8, borderRadius: 99, background: "var(--line, #e5e7eb)", overflow: "hidden" }}>
          <div style={{ width: `${(doneCount / 3) * 100}%`, height: "100%", background: "var(--kelp, #2f7d5b)", transition: "width .3s" }} />
        </div>
        {v.ready && (
          <Link href="/landlord/consign" className="btn btn-primary btn-sm">
            Ký gửi căn hộ
          </Link>
        )}
      </div>

      {STEPS.map((s, i) => {
        const isDone = done(s.key);
        const locked = !isDone && s.key !== firstMissing;
        const isOpen = open === s.key && !locked;
        const Icon = s.icon;
        return (
          <section key={s.key} className="card" style={{ padding: "16px 18px", opacity: locked ? 0.6 : 1 }} aria-label={s.title}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ color: isDone ? "var(--kelp, #2f7d5b)" : "var(--ink-3, #9ca3af)", marginTop: 2 }}>
                {isDone ? <CheckCircle2 size={22} /> : <CircleDashed size={22} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Icon size={16} />
                  <b>
                    Bước {i + 1}. {s.title}
                  </b>
                  {isDone && <span className="badge badge-ok" style={{ fontSize: 11 }}>Đã xác thực</span>}
                  {locked && <span className="muted xs">Hoàn tất bước trước để mở</span>}
                </div>
                <p className="muted small" style={{ margin: "4px 0 0" }}>
                  {isDone ? <DoneSummary step={s.key} v={v} /> : s.hint}
                </p>
              </div>
              {isDone && !isOpen && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(s.key)}>
                  {s.key === "payout" ? "Đổi tài khoản" : "Làm lại"}
                </button>
              )}
            </div>
            {isOpen && (
              <div style={{ marginTop: 14 }}>
                {s.key === "phone" && <PhoneStep onDone={refresh} />}
                {s.key === "identity" && <IdentityStep onDone={refresh} />}
                {s.key === "payout" && <PayoutStep v={v} onDone={refresh} />}
                {isDone && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setOpen(null)}>
                    Đóng
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function DoneSummary({ step, v }: { step: VerificationStep; v: LandlordVerification }) {
  if (step === "phone") return <span className="tnum">{v.phone.maskedPhone}</span>;
  if (step === "identity")
    return (
      <>
        <b>{v.identity.fullName}</b> · CCCD {v.identity.idNumberMasked} · {v.identity.address}
        {v.identity.verifiedAt && <> · xác thực {fmtDate(v.identity.verifiedAt)}</>}
      </>
    );
  const a = v.payout.account;
  return a ? (
    <>
      {a.bankName} · <span className="tnum">{a.bankAccountMasked}</span> · {a.bankAccountHolder}
    </>
  ) : null;
}

function PhoneStep({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setErr("");
    setBusy(true);
    const res = await landlordApi.sendPhoneOtp(normalizePhone(phone));
    setBusy(false);
    if (!res.ok) {
      const wait = retryAfterSeconds(res);
      if (res.code === "otp_cooldown" && wait) setCooldown(wait);
      return setErr(errorText(res, "Không gửi được mã OTP."));
    }
    // Gửi lại ⇒ mã mới (và `devOtp` nếu Zalo giả lập) thay mã cũ. Thời gian chờ lấy từ server.
    setSent(res.data);
    setCode("");
    setCooldown(res.data.resendInSeconds);
  };

  const verify = async (otp: string) => {
    setErr("");
    setBusy(true);
    const res = await landlordApi.verifyPhone(normalizePhone(phone), otp);
    setBusy(false);
    if (!res.ok) {
      setCode("");
      return setErr(errorText(res, "Mã chưa đúng, nhập lại theo tin Zalo."));
    }
    toast("Đã xác thực số điện thoại", "success");
    onDone();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
      <label className="field">
        <span className="label">Số điện thoại</span>
        <input className="input" inputMode="tel" autoComplete="tel" placeholder="0901 234 567" value={phone} disabled={!!sent} onChange={(e) => setPhone(e.target.value)} />
      </label>
      {sent && (
        <>
          <p className="muted small" style={{ margin: 0 }}>Nhập mã 4 số vừa gửi qua Zalo.</p>
          <OtpInput value={code} autoFocus disabled={busy} error={!!err} onChange={(c) => { setCode(c); setErr(""); if (c.length === 4) void verify(c); }} />
          <ZaloMockOtp code={sent.devOtp} disabled={busy} onFill={(c) => { setCode(c); setErr(""); void verify(c); }} />
        </>
      )}
      {err && <p className="field-error" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className={sent ? "btn btn-quiet btn-sm" : "btn btn-primary"} disabled={busy || !isValidVnPhone(phone) || cooldown > 0} onClick={() => void send()}>
          <MessageCircleMore size={16} /> {sent ? (cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : "Gửi lại mã") : "Gửi mã OTP qua Zalo"}
        </button>
        {sent && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setSent(null); setCode(""); setErr(""); }}>
            Đổi số khác
          </button>
        )}
      </div>
    </div>
  );
}

function IdentityStep({ onDone }: { onDone: () => void }) {
  return (
    <EkycCapture
      title="Xác minh CCCD & Khuôn mặt"
      description="AI bóc tách họ tên, số CCCD, địa chỉ thường trú để làm thông tin Bên ủy quyền trên Hợp đồng ký gửi độc quyền."
      consentText="Tôi đồng ý cho VinStay AI xử lý hình ảnh CCCD để định danh chủ sở hữu căn hộ, bảo mật AES-256 theo Nghị định 13/2023/NĐ-CP."
      scan={landlordApi.scanEkyc}
      submit={landlordApi.submitEkyc}
      onDone={() => {
        toast("Đã xác thực CCCD", "success");
        onDone();
      }}
    />
  );
}

function PayoutStep({ v, onDone }: { v: LandlordVerification; onDone: () => void }) {
  // Tên chủ TK cố định = họ tên CCCD: tài khoản phải chính chủ, không cho nhập tên khác.
  const holder = v.identity.fullName ?? "";
  const [bankName, setBankName] = useState(v.payout.account?.bankName ?? POPULAR_BANKS[0]);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = /^\d{6,20}$/.test(account);

  const save = async () => {
    setErr("");
    setBusy(true);
    const res = await landlordApi.updatePayoutAccount({ bankName, bankAccount: account, bankAccountHolder: holder });
    setBusy(false);
    if (!res.ok) return setErr(errorText(res, "Không xác thực được tài khoản."));
    toast("Đã xác thực tài khoản nhận tiền", "success");
    setAccount("");
    onDone();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label className="field">
          <span className="label">Ngân hàng</span>
          <select className="select" value={bankName} onChange={(e) => setBankName(e.target.value)}>
            {POPULAR_BANKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Số tài khoản</span>
          <input className="input tnum" inputMode="numeric" placeholder="6–20 chữ số" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="field">
          <span className="label">Chủ tài khoản (theo CCCD)</span>
          <input className="input" value={holder} readOnly aria-readonly />
        </label>
      </div>
      <p className="muted xs" style={{ margin: 0 }}>
        Hệ thống tra cứu tên chủ tài khoản qua Napas247 và đối chiếu với họ tên CCCD (môi trường thử nghiệm: mô phỏng). Đổi tài khoản chỉ áp dụng cho
        căn ký gửi sau; căn đã ký giữ tài khoản ghi trong hồ sơ căn.
      </p>
      {err && <p className="field-error" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div>
        <button type="button" className="btn btn-primary" disabled={busy || !valid || !holder} onClick={() => void save()}>
          <ShieldCheck size={16} /> Xác thực tài khoản
        </button>
      </div>
    </div>
  );
}
