"use client";

import { useRef, useState } from "react";
import { Camera, Check, ImagePlus, ScanFace, ScanText, ShieldCheck, TriangleAlert } from "lucide-react";
import { errorText, tenantApi } from "@/lib/tenant/api";
import { EKYC_CONSENT_VERSION, type EkycScanResult, type TenantBooking } from "@/lib/tenant/types";
import styles from "./Deal.module.css";

type Slot = "front" | "back" | "face";
type Photos = Record<Slot, string | null>;
type Fields = EkycScanResult["fields"];

const SLOT_LABEL: Record<Slot, string> = {
  front: "Mặt trước CCCD",
  back: "Mặt sau CCCD",
  face: "Ảnh chân dung",
};

const LOW = 0.85;

function sampleImage(slot: Slot, name: string): string {
  const svg =
    slot === "front"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" rx="14" fill="#efe6d2"/><rect x="0" y="0" width="320" height="34" rx="14" fill="#c9502f" opacity=".9"/><text x="160" y="22" font-size="13" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">CĂN CƯỚC CÔNG DÂN</text><rect x="16" y="52" width="82" height="106" rx="6" fill="#b9c7c4"/><circle cx="57" cy="88" r="20" fill="#8aa09c"/><rect x="30" y="112" width="54" height="34" rx="14" fill="#8aa09c"/><text x="112" y="70" font-size="9" font-family="sans-serif" fill="#555">Họ và tên / Full name</text><text x="112" y="86" font-size="13" font-family="sans-serif" font-weight="700" fill="#222">${name}</text><rect x="112" y="102" width="150" height="6" rx="3" fill="#cdbfa2"/><rect x="112" y="118" width="120" height="6" rx="3" fill="#cdbfa2"/><rect x="112" y="134" width="170" height="6" rx="3" fill="#cdbfa2"/></svg>`
      : slot === "back"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" rx="14" fill="#e8dfca"/><rect x="18" y="20" width="44" height="34" rx="6" fill="#d7b64f"/><rect x="18" y="74" width="284" height="6" rx="3" fill="#c7b995"/><rect x="18" y="92" width="240" height="6" rx="3" fill="#c7b995"/><rect x="18" y="110" width="260" height="6" rx="3" fill="#c7b995"/><rect x="220" y="128" width="64" height="52" fill="#222"/><rect x="18" y="150" width="180" height="10" rx="3" fill="#8a7f66"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#cfe0e2"/><circle cx="120" cy="96" r="42" fill="#8aa9ad"/><path d="M36 240c0-52 38-84 84-84s84 32 84 84z" fill="#8aa9ad"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface CaptureProps {
  slot: Slot;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
  name: string;
}

function CaptureSlot({ slot, value, onChange, disabled, name }: CaptureProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.captureCard}>
      <div className={`${styles.shotPreview} ${slot === "face" ? styles.shotFace : ""}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={SLOT_LABEL[slot]} />
        ) : (
          <span className="muted small">
            {slot === "face" ? <ScanFace size={24} /> : <Camera size={24} />}
            <br />
            {SLOT_LABEL[slot]}
          </span>
        )}
      </div>
      <div className={styles.captureBtns}>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture={slot === "face" ? "user" : "environment"}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(URL.createObjectURL(f));
          }}
        />
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Camera size={14} /> Chụp
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          onClick={() => onChange(sampleImage(slot, name))}
        >
          <ImagePlus size={14} /> Mẫu
        </button>
      </div>
    </div>
  );
}

interface KycCaptureProps {
  booking: TenantBooking;
  onDone: (booking: TenantBooking) => void;
}

const norm = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Xác minh CCCD (eKYC) của khách thuê khi lập Hợp đồng thuê (lịch đang giữ chỗ).
 * MÔ PHỎNG: bước bóc tách do backend giả lập OCR (`POST /bookings/:ref/ekyc/scan`, chưa tích hợp FPT.AI) — ảnh chụp
 * chỉ hiển thị trên máy, không gửi đi. Thông tin khách xác nhận được backend kiểm tra và lưu mã hoá AES-256 (thật).
 */
export function KycCapture({ booking, onDone }: KycCaptureProps) {
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState<Photos>({ front: null, back: null, face: null });
  const [phase, setPhase] = useState<"capture" | "scanning" | "review">("capture");
  const [scan, setScan] = useState<EkycScanResult | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [touched, setTouched] = useState<Set<keyof Fields>>(new Set());
  const [checkedLow, setCheckedLow] = useState(false);
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const readyToScan = consent && photos.front && photos.back && photos.face;
  const conf = (scan?.confidence ?? {}) as Record<keyof Fields, number>;
  const lowKeys = (scan?.lowConfidenceKeys ?? []).filter((k) => !touched.has(k as keyof Fields));
  const isNameMismatch = Boolean(fields && norm(fields.fullName) !== norm(booking.contact.name));
  const hasMismatch = isNameMismatch;

  const handleEdit = (k: keyof Fields, v: string) => {
    setFields((prev) => (prev ? { ...prev, [k]: v } : prev));
    setTouched((prev) => new Set(prev).add(k));
  };

  const startScan = async () => {
    setError(null);
    setPhase("scanning");
    const res = await tenantApi.scanEkyc(booking.ref, EKYC_CONSENT_VERSION);
    if (!res.ok) {
      setPhase("capture");
      setError(errorText(res, "Không quét được CCCD. Vui lòng thử lại."));
      return;
    }
    setScan(res.data);
    setFields(res.data.fields);
    setTouched(new Set());
    setPhase("review");
  };

  const handleConfirm = async () => {
    if (!scan || !fields || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await tenantApi.submitEkyc(booking.ref, {
        scanId: scan.scanId,
        consentVersion: EKYC_CONSENT_VERSION,
        fields,
        confirmedLowConfidence: (scan.lowConfidenceKeys.length === 0 || checkedLow || lowKeys.length === 0),
        confirmedNameMismatch: hasMismatch ? mismatchConfirmed : undefined,
      });
      if (!res.ok) {
        if (res.code === "scan_expired") setPhase("capture");
        setError(errorText(res, "Lưu xác minh CCCD thất bại."));
        return;
      }
      onDone(res.data.booking);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: "20px 16px" }}>
      <header style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 18, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <ScanText size={20} style={{ color: "var(--lagoon)" }} />
          Xác minh CCCD &amp; Khuôn mặt (eKYC)
        </h3>
        <p className="muted small" style={{ margin: 0 }}>
          Hệ thống AI bóc tách thông tin tự động trong 3 giây và đối chiếu với thông tin đặt lịch để chuẩn bị ký Hợp đồng thuê.
        </p>
      </header>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      {phase === "capture" && (
        <>
          <label className="check" style={{ fontSize: 13, marginBottom: 12, display: "flex" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Tôi đồng ý cho VinStay AI xử lý hình ảnh CCCD để làm thủ tục hợp đồng thuê và đăng ký tạm trú, bảo mật AES-256 theo Nghị định 13/2023/NĐ-CP.
            </span>
          </label>

          <div className={styles.captureGrid}>
            {(["front", "back", "face"] as Slot[]).map((s) => (
              <CaptureSlot
                key={s}
                slot={s}
                value={photos[s]}
                disabled={!consent}
                name={booking.contact.name.toUpperCase()}
                onChange={(v) => setPhotos((prev) => ({ ...prev, [s]: v }))}
              />
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={!readyToScan}
            onClick={() => void startScan()}
          >
            <ScanText size={18} /> Bóc tách thông tin bằng AI
          </button>
          {!consent && <p className="muted xs" style={{ marginTop: 6 }}>Vui lòng tích đồng ý xử lý dữ liệu trước khi chụp ảnh.</p>}
        </>
      )}

      {phase === "scanning" && (
        <div className={styles.scanningBox} role="status">
          <div className={styles.scanLine} />
          <p style={{ margin: 0 }}>
            <b>AI đang xử lý hình ảnh CCCD…</b>
            <br />
            <span className="muted small">
              Nhận diện chip, bóc tách họ tên, số định danh cá nhân và so khớp sinh trắc học khuôn mặt.
            </span>
          </p>
        </div>
      )}

      {phase === "review" && scan && fields && (
        <>
          <div className={styles.faceOk}>
            <ShieldCheck size={18} /> Khuôn mặt khớp ảnh trên CCCD:{" "}
            <b className="num">{Math.round(scan.faceMatch * 100)}%</b>
            {scan.simulated && <span className="muted xs"> · kết quả OCR mô phỏng (môi trường thử nghiệm)</span>}
          </div>

          {/* Cảnh báo mismatch nếu có lệch thông tin với lúc đặt lịch */}
          {hasMismatch && (
            <div className={styles.mismatchCard}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                <TriangleAlert size={18} style={{ color: "var(--danger)", flex: "none", marginTop: 2 }} />
                <div>
                  <b style={{ color: "var(--danger)" }}>Họ tên trên CCCD khác họ tên lúc đặt lịch</b>
                  <p className="small" style={{ margin: "2px 0 0" }}>
                    Thông tin họ tên trên thẻ CCCD vừa quét khác với thông tin bạn đã cung cấp khi đặt lịch hẹn.
                  </p>
                </div>
              </div>

              <table className={styles.mismatchTable}>
                <thead>
                  <tr>
                    <th>Trường dữ liệu</th>
                    <th>Lúc đặt lịch</th>
                    <th>CCCD vừa bóc tách</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Họ và tên</td>
                    <td><b>{booking.contact.name}</b></td>
                    <td style={{ color: isNameMismatch ? "var(--danger)" : "inherit" }}>
                      <b>{fields.fullName}</b>
                    </td>
                  </tr>
                </tbody>
              </table>

              <label className="check" style={{ fontSize: 13, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={mismatchConfirmed}
                  onChange={(e) => setMismatchConfirmed(e.target.checked)}
                />
                <span>Tôi xác nhận thông tin CCCD là đúng và chấp nhận đối soát bổ sung.</span>
              </label>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 0" }}>
            {(
              [
                ["fullName", "Họ và tên"],
                ["idNumber", "Số CCCD"],
                ["dob", "Ngày sinh"],
                ["issuedDate", "Ngày cấp"],
                ["address", "Nơi thường trú"],
              ] as [keyof Fields, string][]
            ).map(([k, label]) => {
              const c = conf[k];
              const isLow = c !== undefined && c < LOW && !touched.has(k);
              return (
                <label key={k} className="field">
                  <span className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{label}</span>
                    {c !== undefined && (
                      <span className={`badge ${isLow ? "badge-danger" : "badge-ok"}`} style={{ fontSize: 11 }}>
                        {Math.round(c * 100)}%
                      </span>
                    )}
                  </span>
                  <input
                    className="input"
                    value={fields[k]}
                    onChange={(e) => handleEdit(k, e.target.value)}
                    style={isLow ? { borderColor: "var(--danger)", background: "var(--danger-050)" } : undefined}
                  />
                  {isLow && (
                    <span className="field-error">Độ tin cậy thấp: vui lòng đối chiếu và sửa lại nếu cần.</span>
                  )}
                </label>
              );
            })}
          </div>

          {lowKeys.length > 0 && (
            <div className="alert alert-warning" style={{ fontSize: 13, marginBottom: 12 }}>
              <label className="check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={checkedLow}
                  onChange={(e) => setCheckedLow(e.target.checked)}
                />
                <span>Tôi đã kiểm tra các trường có độ tin cậy dưới 85% khớp với thẻ CCCD gốc.</span>
              </label>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              disabled={submitting || (lowKeys.length > 0 && !checkedLow) || (hasMismatch && !mismatchConfirmed)}
              onClick={() => void handleConfirm()}
            >
              <Check size={18} /> Xác nhận thông tin (mã hóa AES-256)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
