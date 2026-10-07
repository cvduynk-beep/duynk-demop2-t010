"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check, Phone, Radio, Sparkles } from "lucide-react";
import { STATUS_META } from "@/components/booking/status";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { toast } from "@/components/ui/Toast";
import { VerifiedPhoto } from "@/components/unit/VerifiedPhoto";
import { hostAccept } from "@/lib/mock/actions";
import { dayLabel, fmtPhone, fmtTime, normalizePhone } from "@/lib/mock/format";
import { bookingById, noticesFor } from "@/lib/mock/selectors";
import { useMock } from "@/lib/mock/store";
import type { Booking, Notice } from "@/lib/mock/types";
import { unitAddress, unitById, zoneById } from "@/lib/mock/units";
import { useNow } from "@/lib/useNow";
import {
  AwaitDepositStep,
  AwaitLeaseStep,
  ClosedStep,
  DoneStep,
  GreetStep,
  ViewStep,
} from "./WorkflowSteps";
import styles from "./Workflow.module.css";

const RAIL = ["Đón khách", "Xem phòng", "Chờ cọc", "Hợp đồng"] as const;

function railIndex(b: Booking): number {
  switch (b.status) {
    case "confirmed":
    case "lobby":
      return 0;
    case "receiving":
    case "viewing":
      return 1;
    case "closing":
      return 2;
    case "holding":
      return 3;
    case "leased":
      return 4;
    default:
      return -1;
  }
}

const AUDIENCE: Record<Notice["audience"], string> = {
  tenant: "Zalo → Khách",
  landlord: "Zalo → Chủ nhà",
  admin: "Admin",
  host: "Push → Bạn",
};

export function ViewingWorkflow({ id }: { id: string }) {
  const state = useMock();
  const now = useNow(1000);

  // Hook phải đứng TRƯỚC mọi `return` sớm (rules-of-hooks).
  const readyBooking = state.ready ? bookingById(state, id) : undefined;
  const latestNotice = readyBooking ? noticesFor(state, "host", readyBooking.hostId)[0] : undefined;
  // null = chưa ghi nhận lần đầu (không toast các thông báo đã có sẵn khi mở trang).
  const lastNotifiedId = useRef<string | undefined | null>(null);

  useEffect(() => {
    if (!readyBooking) return;
    if (lastNotifiedId.current === null) {
      lastNotifiedId.current = latestNotice?.id;
      return;
    }
    if (!latestNotice || latestNotice.id === lastNotifiedId.current) return;
    lastNotifiedId.current = latestNotice.id;
    toast(`${latestNotice.title}: ${latestNotice.body}`, latestNotice.tone === "success" ? "success" : "info");
  }, [readyBooking, latestNotice]);

  if (!state.ready || !now) return <div className="skeleton" style={{ height: 300 }} />;
  const booking = readyBooking;
  if (!booking) {
    return (
      <div className={styles.page}>
        <PageHeader
          title="Không tìm thấy lịch"
          back={{ href: "/host/dispatch", label: "Lịch & yêu cầu" }}
          actions={
            <Link href="/host/dispatch" className="btn btn-primary">
              Về danh sách lịch
            </Link>
          }
        />
      </div>
    );
  }

  const unit = unitById(booking.unitId)!;
  const meta = STATUS_META[booking.status];
  const idx = railIndex(booking);
  const props = { booking, unit, now };
  const log = state.notices
    .filter((n) => n.bookingId === booking.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  // Kiểm tra xem khách đã bấm chọn xem tiếp căn nào chưa
  const chainNext = state.bookings.find(
    (b) =>
      (b.chainedFromBookingId === booking.id || (b.tenant.phone === booking.tenant.phone && b.id !== booking.id)) &&
      ["receiving", "viewing", "confirmed"].includes(b.status) &&
      new Date(b.createdAt).getTime() >= new Date(booking.createdAt).getTime()
  );
  const nextUnit = chainNext ? unitById(chainNext.unitId) : undefined;

  return (
    <div className={styles.page}>
      <PageHeader
        title={booking.tenant.name}
        description={`${unitAddress(unit)} · ${zoneById(unit.zoneId).short} · ${fmtTime(booking.slot)} ${dayLabel(booking.slot, now)} · mã ${booking.ref}`}
        back={{ href: "/host/dispatch", label: "Lịch & yêu cầu" }}
        actions={
          <div className={styles.headActions}>
            <span className={`badge ${meta.badge}`}>{meta.label}</span>
            <a className="btn btn-quiet btn-sm" href={`tel:${normalizePhone(booking.tenant.phone)}`}>
              <Phone size={15} /> {fmtPhone(booking.tenant.phone)}
            </a>
          </div>
        }
      />

      {chainNext && nextUnit && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "14px 18px",
            background: "linear-gradient(135deg, #065f46 0%, #047857 100%)",
            borderRadius: "var(--r)",
            color: "#fff",
            boxShadow: "0 4px 14px rgba(4, 120, 87, 0.28)",
            border: "1px solid #10b981",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Sparkles size={24} style={{ color: "#34d399", flexShrink: 0 }} />
            <div>
              <b style={{ fontSize: 15, display: "block" }}>
                Khách {booking.tenant.name} vừa bấm xem ngay căn {unitAddress(nextUnit)}!
              </b>
              <span style={{ fontSize: 13, color: "#d1fae5" }}>
                Hệ thống đã tự động tạo ca nối tiếp cho bạn. Bấm để chuyển sang ca dẫn căn mới ngay lập tức.
              </span>
            </div>
          </div>
          <Link
            href={`/host/viewing/${chainNext.id}`}
            className="btn btn-sm"
            style={{ background: "#fff", color: "#065f46", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            Mở ca dẫn căn mới →
          </Link>
        </div>
      )}

      {idx >= 0 && (
        <ol className={styles.rail} aria-label="Quy trình xem phòng">
          {RAIL.map((label, i) => (
            <li
              key={label}
              className={`${i < idx ? styles.railDone : ""} ${i === idx ? styles.railNow : ""}`}
              aria-current={i === idx ? "step" : undefined}
            >
              <span>{i < idx ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {booking.status === "pending" && (
            <section className={`card ${styles.step}`}>
              <div className={styles.stepHead}>
                <div className={styles.stepIcon}>
                  <Radio size={22} />
                </div>
                <div>
                  <h2>Bạn chưa nhận ca này</h2>
                  <p className="muted">Nhận ca để gửi Zalo xác nhận cho khách và kích hoạt quy trình đón tiếp tại sảnh.</p>
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-success btn-lg"
                  onClick={() => {
                    hostAccept(booking.id);
                    toast(`Đã nhận ca, Zalo gửi cho ${booking.tenant.name}`, "success");
                  }}
                >
                  <Check size={19} /> Nhận ca đón tiếp
                </button>
              </div>
            </section>
          )}
          {(booking.status === "confirmed" || booking.status === "lobby") && <GreetStep {...props} />}
          {(booking.status === "receiving" || booking.status === "viewing") && <ViewStep {...props} />}
          {booking.status === "closing" && <AwaitDepositStep {...props} />}
          {booking.status === "holding" && <AwaitLeaseStep {...props} />}
          {booking.status === "leased" && <DoneStep {...props} />}
          {["completed", "no_show", "cancelled", "rejected"].includes(booking.status) && <ClosedStep {...props} />}
        </div>

        <div className={styles.sideCol}>
          <Section title="Căn hộ">
            <VerifiedPhoto unit={unit} sizes="340px" stamp="none" className={styles.sidePhoto} />
            <KeyValue
              items={[
                { label: "Căn hộ", value: unitAddress(unit) },
                { label: "Phân khu", value: zoneById(unit.zoneId).name },
                {
                  label: "Loại khoá",
                  value: unit.lock === "smart" ? "Khoá điện tử" : "Chìa cơ · quầy phân khu",
                },
              ]}
            />
          </Section>

          {log.length > 0 && (
            <Section title="Thông báo đã gửi" flush>
              <ul className={styles.log}>
                {log.map((n) => (
                  <li key={n.id}>
                    <span className="badge badge-plain">{AUDIENCE[n.audience]}</span>
                    <div>
                      <b>{n.title}</b>
                      <span className="xs muted"> · {fmtTime(n.at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
