"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarSearch, ChevronRight } from "lucide-react";
import { STATUS_META } from "./status";
import { dayLabel, fmtTime } from "@/lib/format";
import { primeApiData, useApiQuery } from "@/lib/query/useApiQuery";
import { errorText, tenantApi } from "@/lib/tenant/api";
import { tenantQueries } from "@/lib/tenant/queries";
import { unitAddress } from "@/lib/units";
import { useNow } from "@/lib/useNow";
import styles from "./Booking.module.css";

/** Mã lịch do server cấp: `VS-` + 5 ký tự (bảng ký tự không có I, O, 0, 1). */
const REF_RE = /^VS-[A-HJ-NP-Z2-9]{5}$/;

/**
 * `/booking`: lịch xem của tài khoản (`GET /me/bookings`) + mở nhanh theo mã (`GET /bookings/:ref`). Dữ liệu hoàn toàn từ
 * server — không đọc localStorage. Lịch của người khác / mã không tồn tại đều nhận 404 (server không để lộ mã có tồn tại).
 */
export function BookingLookup() {
  const router = useRouter();
  const now = useNow(60_000);
  const mine = useApiQuery(tenantQueries.bookings());
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanRef = ref.trim().toUpperCase();
    if (!REF_RE.test(cleanRef)) {
      setError("Mã lịch hẹn có dạng VS-XXXXX (5 ký tự sau dấu gạch).");
      return;
    }
    setBusy(true);
    const res = await tenantApi.bookingByRef(cleanRef);
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 404 ? "Không tìm thấy lịch hẹn này trong tài khoản của bạn." : errorText(res, "Chưa mở được lịch hẹn, vui lòng thử lại."));
      return;
    }
    primeApiData(tenantQueries.booking(res.data.ref).key, res.data);
    router.push(`/booking/${encodeURIComponent(res.data.ref)}`);
  };

  return (
    <div className={`wrap ${styles.lookup}`}>
      <div className={styles.lookupMain}>
        <span className={styles.lookupIcon}>
          <CalendarSearch size={26} />
        </span>
        <h1 className={styles.h1}>Kiểm tra lịch xem phòng</h1>
        <p className="muted">Xem danh sách lịch hẹn của bạn hoặc mở nhanh bằng mã lịch hẹn.</p>

        <form className={`card ${styles.form}`} onSubmit={submit} noValidate>
          <label className="field">
            <span className="label">Mã lịch hẹn</span>
            <input
              className="input"
              placeholder="VS-XXXXX"
              value={ref}
              maxLength={8}
              onChange={(e) => {
                setRef(e.target.value.toUpperCase());
                if (error) setError("");
              }}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? "Đang mở…" : "Mở lịch hẹn"}
          </button>
        </form>
      </div>

      <section className={styles.mine} aria-label="Lịch xem của tôi">
        <h2>Lịch xem của tôi</h2>
        {mine.state.status === "loading" ? (
          <p className="muted" aria-busy="true">
            Đang tải lịch hẹn…
          </p>
        ) : mine.state.status === "error" ? (
          <div role="alert">
            <p className="muted">{mine.state.message}</p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={mine.reload}>
              Thử lại
            </button>
          </div>
        ) : mine.state.data.length === 0 ? (
          <p className="muted">
            Bạn chưa có lịch xem nào trong tài khoản.{" "}
            <Link href="/units" className="link">
              Tìm căn để xem
            </Link>
          </p>
        ) : (
          <ul className={styles.list}>
            {mine.state.data.map((b) => {
              const meta = STATUS_META[b.status];
              return (
                <li key={b.ref}>
                  <Link href={`/booking/${b.ref}`} className={styles.row}>
                    <div>
                      <b>{unitAddress(b.unit)}</b>
                      <p className="muted small">
                        {b.ref} · {fmtTime(b.slot)} {now ? dayLabel(b.slot, now).toLowerCase() : ""}
                      </p>
                    </div>
                    <span className={`badge ${meta.badge}`}>{meta.label}</span>
                    <ChevronRight size={18} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
