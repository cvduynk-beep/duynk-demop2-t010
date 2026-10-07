"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlarmClock, Check, ChevronRight, MessageSquareText, Sparkles, X } from "lucide-react";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { toast } from "@/components/ui/Toast";
import { STATUS_META } from "@/components/booking/status";
import { VerifiedPhoto } from "@/components/unit/VerifiedPhoto";
import { hostAccept, hostClaimBooking, hostReject, sendReminder } from "@/lib/mock/actions";
import { DEMO_USERS } from "@/lib/mock/actors";
import { dayLabel, fmtPhone, fmtTime, vnd } from "@/lib/mock/format";
import { allInCost, DEFAULT_HOUSEHOLD } from "@/lib/mock/cost";
import { hostBookings, isOpenBooking, noticesFor, openTicketsFor } from "@/lib/mock/selectors";
import { useMock } from "@/lib/mock/store";
import type { Booking } from "@/lib/mock/types";
import { hostById, unitAddress, unitById, zoneById } from "@/lib/mock/units";
import { useNow } from "@/lib/useNow";
import styles from "./Host.module.css";

const HOST_ID = DEMO_USERS.host.refId!;
const SLA_MS = 180_000;
const REJECT_REASONS = ["Trùng lịch với ca khác", "Ngoài ca trực của tôi", "Đang xử lý sự cố khẩn cấp", "Lý do khác"];

type Tab = "new" | "mine" | "history";

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function DispatchBoard() {
  const router = useRouter();
  const state = useMock();
  const now = useNow(1000);
  const [tab, setTab] = useState<Tab>("new");
  const [rejecting, setRejecting] = useState<Booking | null>(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const host = hostById(HOST_ID)!;

  // Push notification real-time toast cho Host khi có ca mới/yêu cầu nối tiếp
  const hostNotices = noticesFor(state, "host", HOST_ID);
  const latestNotice = hostNotices[0];
  const [lastNotifiedId, setLastNotifiedId] = useState(latestNotice?.id);

  useEffect(() => {
    if (!latestNotice || latestNotice.id === lastNotifiedId) return;
    setLastNotifiedId(latestNotice.id);
    toast(`${latestNotice.title}: ${latestNotice.body}`, latestNotice.tone === "success" ? "success" : "info");
  }, [latestNotice, lastNotifiedId]);

  // Nhắc hẹn kép T-10m: hệ thống tự gửi khi còn ≤ 10 phút tới giờ hẹn.
  const dueReminders = now
    ? hostBookings(state, HOST_ID)
        .filter((b) => b.status === "confirmed" && !b.reminderSentAt && new Date(b.slot).getTime() - now <= 10 * 60_000 && new Date(b.slot).getTime() - now > -30 * 60_000)
        .map((b) => b.id)
        .join(",")
    : "";
  useEffect(() => {
    if (!dueReminders) return;
    for (const id of dueReminders.split(",")) sendReminder(id);
  }, [dueReminders]);

  if (!state.ready || !now) {
    return (
      <div className={styles.page}>
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  const mineAll = hostBookings(state, HOST_ID);
  const openTickets = openTicketsFor(state, HOST_ID);
  const pending = mineAll.filter((b) => b.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = mineAll.filter((b) => (isOpenBooking(b) && b.status !== "pending") || b.status === "holding").sort((a, b) => a.slot.localeCompare(b.slot));
  const history = mineAll.filter((b) => ["leased", "completed", "no_show", "cancelled", "rejected"].includes(b.status)).sort((a, b) => b.slot.localeCompare(a.slot));
  const today = active.filter((b) => new Date(b.slot).toDateString() === new Date(now).toDateString());
  const lobbyNow = active.find((b) => b.status === "lobby");
  const liveNow = active.find((b) => b.status === "receiving" || b.status === "viewing");
  const activeLive = active.filter((b) => b.status === "receiving" || b.status === "viewing");

  const mineColumns: DataTableColumn<Booking>[] = [
    {
      key: "slot",
      header: "Giờ hẹn",
      render: (b) => {
        const slotMs = new Date(b.slot).getTime();
        const soon = b.status === "confirmed" && slotMs - now <= 10 * 60_000 && slotMs - now > -900_000;
        return (
          <div>
            <b className="tnum">{fmtTime(b.slot)}</b>
            <span className="muted xs" style={{ display: "block" }}>
              {dayLabel(b.slot, now)}
            </span>
            {soon && (
              <span className="badge badge-coral xs" style={{ marginTop: 4 }}>
                <AlarmClock size={12} /> T-10 · còn {Math.max(0, Math.ceil((slotMs - now) / 60_000))} phút
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "tenant",
      header: "Khách",
      render: (b) => (
        <div>
          <b>{b.tenant.name}</b>
          <span className="muted xs" style={{ display: "block" }}>
            {b.tenant.persons} người
          </span>
        </div>
      ),
    },
    {
      key: "unit",
      header: "Căn hộ",
      render: (b) => {
        const u = unitById(b.unitId);
        return (
          <div>
            <span>{u ? unitAddress(u) : b.unitId}</span>
            <span className="muted xs" style={{ display: "block" }}>
              {u ? zoneById(u.zoneId).short : "—"}
            </span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (b) => {
        const meta = STATUS_META[b.status];
        return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
      },
    },
    {
      key: "next",
      header: "Việc tiếp theo",
      render: (b) => {
        const slotMs = new Date(b.slot).getTime();
        const soon = b.status === "confirmed" && slotMs - now <= 10 * 60_000 && slotMs - now > -900_000;
        if (b.status === "receiving" || b.status === "viewing") {
          return (
            <span className="small" style={{ color: "var(--kelp-700, #047857)", fontWeight: 600 }}>
              {b.receivingAt ? `Đang dẫn · từ ${fmtTime(b.receivingAt)}` : "Đang dẫn khách"}
            </span>
          );
        }
        const cta: Record<string, string> = {
          confirmed: soon ? "Xuống sảnh đón khách" : "Xem chi tiết & chuẩn bị",
          lobby: "Đón khách ngay",
          closing: "Chờ khách cọc",
          holding: "Chờ khách làm HĐ",
        };
        return <span className="small">{cta[b.status] ?? ""}</span>;
      },
    },
    {
      key: "action",
      header: "Vận hành",
      align: "right",
      render: (b) => {
        const isLive = b.status === "receiving" || b.status === "viewing";
        const isLobby = b.status === "lobby";
        return (
          <Link
            href={`/host/viewing/${b.id}`}
            className={`btn btn-sm ${isLive || isLobby ? "btn-primary" : "btn-quiet"}`}
            style={{ whiteSpace: "nowrap" }}
          >
            {isLive ? "Vào dẫn phòng →" : isLobby ? "Đón khách ngay →" : "Vào ca xem →"}
          </Link>
        );
      },
    },
  ];

  const historyColumns: DataTableColumn<Booking>[] = [
    ...mineColumns.slice(0, 4),
    {
      key: "viewLog",
      header: "Nhật ký dẫn",
      render: (b) => {
        if (b.receivingAt && b.viewEndedAt) {
          return <span className="small muted">Đã dẫn {fmtTime(b.receivingAt)}–{fmtTime(b.viewEndedAt)}</span>;
        }
        if (b.receivingAt) {
          return <span className="small muted">Bắt đầu {fmtTime(b.receivingAt)}</span>;
        }
        return <span className="small muted">—</span>;
      },
    },
    {
      key: "action",
      header: "Chi tiết",
      align: "right",
      render: (b) => (
        <Link href={`/host/viewing/${b.id}`} className="btn btn-sm btn-quiet" style={{ whiteSpace: "nowrap" }}>
          Xem lại →
        </Link>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Lịch & yêu cầu"
        description={`Chào ${host.name.split(" ").slice(-1)[0]}, ca sáng 08:30–11:30 · ca chiều 14:00–18:00. Mỗi lịch cách nhau tối thiểu 45 phút.`}
      />

      {liveNow && (
        <Link
          href={`/host/viewing/${liveNow.id}`}
          className={styles.alert}
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #047857 100%)",
            border: "1px solid #10b981",
            color: "#fff",
            boxShadow: "0 4px 14px rgba(4, 120, 87, 0.28)",
            textDecoration: "none",
          }}
        >
          <Sparkles size={24} style={{ color: "#34d399", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <span>
                Ca dẫn phòng trực tiếp:{" "}
                {unitById(liveNow.unitId) ? unitAddress(unitById(liveNow.unitId)!) : liveNow.unitId}
              </span>
              {liveNow.chainedFromBookingId && (
                <span className="badge" style={{ background: "#ecfdf5", color: "#047857", fontSize: 11, fontWeight: 700 }}>
                  ⚡ Khách vừa chọn xem ngay
                </span>
              )}
            </b>
            <span style={{ fontSize: 13, opacity: 0.95, marginTop: 2 }}>
              Khách {liveNow.tenant.name} ({fmtPhone(liveNow.tenant.phone)}) ·{" "}
              {unitById(liveNow.unitId) ? zoneById(unitById(liveNow.unitId)!.zoneId).short : "—"} ·{" "}
              {liveNow.doorCode ? `Mã số khoá PIN: ${liveNow.doorCode}` : "Mở cửa bằng chìa cơ/thẻ Host"}
            </span>
          </div>
          <span
            className="btn btn-sm"
            style={{
              background: "#fff",
              color: "#065f46",
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            Vào ca dẫn ngay →
          </span>
          <ChevronRight size={20} />
        </Link>
      )}

      {lobbyNow && !liveNow && (
        <Link href={`/host/viewing/${lobbyNow.id}`} className={styles.alert}>
          <AlarmClock size={22} />
          <div style={{ flex: 1 }}>
            <b>{lobbyNow.tenant.name} đã có mặt tại sảnh</b>
            <span>Xuống đón ngay · sảnh toà {unitById(lobbyNow.unitId)?.building ?? "—"}</span>
          </div>
          <span
            className="btn btn-sm"
            style={{
              background: "#fff",
              color: "#c2410c",
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              pointerEvents: "none",
            }}
          >
            Vào ca đón khách ngay →
          </span>
          <ChevronRight size={20} />
        </Link>
      )}

      <div className={styles.kpis}>
        <StatTile
          label="Chờ nhận"
          value={String(pending.length + openTickets.length)}
          delta={pending.length + openTickets.length > 0 ? { text: "Cần nhận ca", tone: "bad" } : { text: "Đã xử lý hết", tone: "good" }}
        />
        <StatTile label="Lịch hôm nay" value={String(today.length)} delta={{ text: "Trong ca trực", tone: "flat" }} />
        <StatTile
          label="Nhận ca trung bình"
          value={`${Math.floor(host.avgAcceptSec / 60)}′${String(host.avgAcceptSec % 60).padStart(2, "0")}″`}
          delta={{ text: "SLA 3′00″", tone: host.avgAcceptSec <= 180 ? "good" : "bad" }}
        />
        <StatTile label="Đánh giá" value={`${String(host.rating).replace(".", ",")}★`} delta={{ text: "48 lượt đánh giá", tone: "good" }} />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Danh sách">
        <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => setTab("new")}>
          Yêu cầu mới {pending.length + openTickets.length > 0 && <i>{pending.length + openTickets.length}</i>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>
          Lịch của tôi {active.length > 0 && <i style={{ background: "var(--kelp-600, #059669)" }}>{active.length}</i>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>
          Lịch sử
        </button>
      </div>

      {tab === "new" && (
        <div className={styles.ticketGrid}>
          {openTickets.length > 0 && (
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="badge badge-coral">Ticket mở ({openTickets.length})</span>
                <span className="small muted">Ai nhận trước được giao</span>
              </div>
              <div className={styles.ticketGrid}>
                {openTickets.map((b) => {
                  const u = unitById(b.unitId)!;
                  const cost = allInCost(u, { ...DEFAULT_HOUSEHOLD, persons: b.tenant.persons });
                  const offeredCount = b.dispatch?.offeredTo.length ?? 0;
                  return (
                    <article key={b.id} className={styles.ticket} style={{ borderColor: "var(--coral-400, #fb923c)" }}>
                      <div className={styles.ticketHead}>
                        <div className={styles.ticketUnit}>
                          <VerifiedPhoto unit={u} sizes="56px" stamp="none" className={styles.thumb} />
                          <div className={styles.ticketUnitText}>
                            <b className={styles.unitAddress}>{unitAddress(u)}</b>
                            <p className="muted small">
                              {zoneById(u.zoneId).short} · All-in {vnd(cost.total)}đ
                            </p>
                          </div>
                        </div>
                        <span className="badge badge-coral">Mở cho {offeredCount} Sale</span>
                      </div>

                      <div className={styles.ticketBody}>
                        <dl className={styles.meta}>
                          <div>
                            <dt>Khách</dt>
                            <dd>
                              {b.tenant.name} · {b.tenant.persons} người
                            </dd>
                          </div>
                          <div>
                            <dt>Giờ hẹn</dt>
                            <dd>
                              {fmtTime(b.slot)} · {dayLabel(b.slot, now)}
                            </dd>
                          </div>
                        </dl>
                        {b.tenant.note && <p className={styles.note}>“{b.tenant.note}”</p>}
                        <p className={styles.otpStatus}>
                          <Check size={13} /> SĐT đã xác thực OTP Zalo · {fmtPhone(b.tenant.phone)}
                        </p>
                      </div>

                      <div className={styles.ticketActions} style={{ display: "flex", gap: "0.5rem" }}>
                        <Link
                          href={`/host/viewing/${b.id}`}
                          className="btn btn-quiet"
                          style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
                        >
                          Chi tiết ca
                        </Link>
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ flex: 2 }}
                          onClick={() => {
                            const res = hostClaimBooking(b.id, HOST_ID);
                            if (res.ok) {
                              toast(`Đã nhận ca! Đang chuyển vào màn hình vận hành...`, "success");
                              router.push(`/host/viewing/${b.id}`);
                            } else if (res.code === "taken") {
                              toast("Đã có Sale khác nhận trước");
                            } else {
                              toast(res.reason || "Không thể nhận ticket");
                            }
                          }}
                        >
                          <Check size={17} /> Nhận & Vào ca
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* CA ĐANG DẪN / XEM NỐI TIẾP TẠI CHỖ */}
          {activeLive.length > 0 && (
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="badge badge-kelp">
                  <Sparkles size={13} /> Ca đang dẫn / Xem nối tiếp ({activeLive.length})
                </span>
                <span className="small muted">Khách đang có mặt trực tiếp cùng bạn</span>
              </div>
              <div className={styles.ticketGrid}>
                {activeLive.map((b) => {
                  const u = unitById(b.unitId)!;
                  const cost = allInCost(u, { ...DEFAULT_HOUSEHOLD, persons: b.tenant.persons });
                  return (
                    <article
                      key={b.id}
                      className={styles.ticket}
                      style={{
                        borderColor: "var(--kelp-500, #10b981)",
                        background: "linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(255, 255, 255, 0) 100%)",
                        boxShadow: "0 2px 10px rgba(16, 185, 129, 0.12)",
                      }}
                    >
                      <div className={styles.ticketHead}>
                        <div className={styles.ticketUnit}>
                          <VerifiedPhoto unit={u} sizes="56px" stamp="none" className={styles.thumb} />
                          <div className={styles.ticketUnitText}>
                            <b className={styles.unitAddress}>{unitAddress(u)}</b>
                            <p className="muted small">
                              {zoneById(u.zoneId).short} · All-in {vnd(cost.total)}đ · {u.layoutLabel}
                            </p>
                          </div>
                        </div>
                        <span className="badge badge-kelp">
                          {b.chainedFromBookingId ? "⚡ Xem nối tiếp" : "Đang dẫn phòng"}
                        </span>
                      </div>

                      <div className={styles.ticketBody}>
                        <dl className={styles.meta}>
                          <div>
                            <dt>Khách</dt>
                            <dd>
                              {b.tenant.name} · {b.tenant.persons} người
                            </dd>
                          </div>
                          <div>
                            <dt>Quyền mở cửa</dt>
                            <dd style={{ color: "var(--kelp-700, #047857)", fontWeight: 600 }}>
                              {b.doorCode ? `Khoá PIN: ${b.doorCode}` : "Mở bằng thẻ cư dân Host"}
                            </dd>
                          </div>
                        </dl>
                        <p className={styles.otpStatus} style={{ color: "var(--kelp-700, #047857)" }}>
                          <Check size={13} /> Khách đã xác thực OTP · {fmtPhone(b.tenant.phone)}
                        </p>
                      </div>

                      <div className={styles.ticketActions}>
                        <Link
                          href={`/host/viewing/${b.id}`}
                          className="btn btn-success"
                          style={{ width: "100%", justifyContent: "center", textDecoration: "none", fontWeight: 700 }}
                        >
                          Vào dẫn căn này ngay →
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {pending.length === 0 && openTickets.length === 0 && activeLive.length === 0 && (
            <div className={styles.empty}>
              <MessageSquareText size={28} />
              <b>Chưa có yêu cầu mới</b>
              <p className="muted small">Khi khách đặt lịch, ticket hiện ở đây kèm đồng hồ 3 phút nhận việc. Thử đặt lịch bằng vai trò khách thuê, ticket sẽ xuất hiện ngay.</p>
            </div>
          )}
          {pending.map((b) => {
            const u = unitById(b.unitId)!;
            const left = SLA_MS - (now - new Date(b.createdAt).getTime());
            const over = left <= 0;
            const cost = allInCost(u, { ...DEFAULT_HOUSEHOLD, persons: b.tenant.persons });
            return (
              <article key={b.id} className={`${styles.ticket} ${over ? styles.over : ""}`}>
                <div className={styles.ticketHead}>
                  <div className={styles.ticketUnit}>
                    <VerifiedPhoto unit={u} sizes="56px" stamp="none" className={styles.thumb} />
                    <div className={styles.ticketUnitText}>
                      <b className={styles.unitAddress}>{unitAddress(u)}</b>
                      <p className="muted small">
                        {zoneById(u.zoneId).short} · All-in {vnd(cost.total)}đ
                      </p>
                    </div>
                  </div>
                  <div className={styles.ticketSla}>
                    {over ? (
                      <span className="badge badge-coral">Quá SLA 3′</span>
                    ) : (
                      <div className={styles.timerPill} title="Thời gian còn lại để nhận ca">
                        <span className={styles.ring} style={{ ["--p" as string]: `${Math.max(0, left / SLA_MS) * 100}%` }} aria-hidden />
                        <div className={styles.timerText}>
                          <span className={`num ${styles.count}`}>{mmss(left)}</span>
                          <span className={styles.timerLabel}>nhận ca</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.ticketBody}>
                  <dl className={styles.meta}>
                    <div>
                      <dt>Khách</dt>
                      <dd>
                        {b.tenant.name} · {b.tenant.persons} người
                      </dd>
                    </div>
                    <div>
                      <dt>Giờ hẹn</dt>
                      <dd>
                        {fmtTime(b.slot)} · {dayLabel(b.slot, now)}
                      </dd>
                    </div>
                  </dl>
                  {b.tenant.note && <p className={styles.note}>“{b.tenant.note}”</p>}
                  <p className={styles.otpStatus}>
                    <Check size={13} /> SĐT đã xác thực OTP Zalo · {fmtPhone(b.tenant.phone)}
                  </p>
                </div>

                <div className={styles.ticketActions} style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      setRejecting(b);
                      setReason(REJECT_REASONS[0]);
                    }}
                  >
                    <X size={16} /> Từ chối
                  </button>
                  <Link
                    href={`/host/viewing/${b.id}`}
                    className="btn btn-quiet"
                    style={{ textAlign: "center", textDecoration: "none" }}
                  >
                    Chi tiết
                  </Link>
                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ flex: 2 }}
                    onClick={() => {
                      hostAccept(b.id);
                      toast(`Đã nhận ca! Đang chuyển vào màn hình vận hành...`, "success");
                      router.push(`/host/viewing/${b.id}`);
                    }}
                  >
                    <Check size={17} /> Nhận & Vào ca
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab !== "new" && (
        <Section flush>
          <DataTable<Booking>
            columns={tab === "mine" ? mineColumns : historyColumns}
            rows={tab === "mine" ? active : history}
            rowHref={(b) => `/host/viewing/${b.id}`}
            empty={
              tab === "mine" ? (
                <div className={styles.empty}>
                  <b>Chưa có lịch nào đã nhận</b>
                  <p className="muted small">Nhận ca ở tab “Yêu cầu mới” để lịch xuất hiện ở đây.</p>
                </div>
              ) : (
                <div className={styles.empty}>
                  <b>Chưa có lịch sử</b>
                  <p className="muted small">Các ca đã xong hoặc huỷ sẽ nằm ở đây.</p>
                </div>
              )
            }
          />
        </Section>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        variant="center"
        title="Từ chối ticket"
        description="Khách sẽ nhận Zalo xin lỗi kèm gợi ý đổi giờ; ticket chuyển sang Open Pool."
        footer={
          <div className={styles.row2}>
            <button type="button" className="btn btn-quiet" onClick={() => setRejecting(null)}>
              Giữ ticket
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (!rejecting) return;
                hostReject(rejecting.id, reason);
                setRejecting(null);
                toast("Đã từ chối ticket và báo khách qua Zalo");
              }}
            >
              Từ chối
            </button>
          </div>
        }
      >
        <div className={styles.reasons}>
          {REJECT_REASONS.map((r) => (
            <label key={r} className="check">
              <input type="radio" name="reject" checked={reason === r} onChange={() => setReason(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
