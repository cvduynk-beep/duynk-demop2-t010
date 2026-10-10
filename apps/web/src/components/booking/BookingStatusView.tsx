"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileCheck,
  FileText,
  MapPin,
  MapPinCheck,
  Phone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { VietQR } from "@/components/payment/VietQR";
import { ZaloThread } from "@/components/zalo/ZaloThread";
import { UnitCard } from "@/components/unit/UnitCard";
import { VerifiedPhoto } from "@/components/unit/VerifiedPhoto";
import { KycCapture } from "@/components/deal/KycCapture";
import { LeaseForm } from "@/components/deal/LeaseForm";
import {
  cancelBooking,
  confirmDepositPaid,
  confirmFirstPayment,
  demoExpireHold,
  hostImmediateViewing,
  rateHost,
  rescheduleBooking,
  saveKyc,
  sendReminder,
  tenantAcceptDepositTerms,
  tenantCheckIn,
  tenantRunningLate,
  updateBookingOccupants,
} from "@/lib/mock/actions";
import { DEFAULT_HOUSEHOLD, allInCost } from "@/lib/mock/cost";
import {
  dayLabel,
  fmtDateTime,
  fmtPhone,
  fmtTime,
  normalizePhone,
  vnd,
  weekday,
} from "@/lib/mock/format";
import {
  bookingByRef,
  canTenantModify,
  chainViewingUnits,
  holdHoursFor,
  holdMsLeft,
  holdOutcome,
  isOpenTicket,
  noticesFor,
  similarUnits,
} from "@/lib/mock/selectors";
import { HOUSE_RULES } from "@/lib/mock/house-rules";
import { accountPhone, ownsBooking, tenantLatestKyc } from "@/lib/mock/selectors-tenant";
import { setMockState, useMock } from "@/lib/mock/store";
import type { Booking, BookingStatus, Occupant } from "@/lib/mock/types";
import { hostById, unitAddress, unitById, zoneById, type Unit } from "@/lib/mock/units";
import { bookingApi } from "@/lib/apiClient";
import { useNow } from "@/lib/useNow";
import { SlotPicker } from "./SlotPicker";
import { STATUS_META, TERMINAL, buildTimeline } from "./status";
import styles from "./Booking.module.css";

function mapDbViewingStatus(status?: string): BookingStatus {
  switch (status?.toUpperCase()) {
    case "PENDING_CONFIRMATION":
      return "pending";
    case "CONFIRMED":
      return "confirmed";
    case "LOBBY_ARRIVED":
    case "CHECKED_IN":
      return "lobby";
    case "IN_PROGRESS":
      return "viewing";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "NO_SHOW":
      return "no_show";
    default:
      return "confirmed";
  }
}

function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} giờ ${m % 60} phút` : `${Math.floor(h / 24)} ngày ${h % 24} giờ`;
}

const HANDYMEN = [
  { trade: "Điện, nước", name: "Thợ điện nước khu Sapphire", note: "Phản hồi trong ngày" },
  { trade: "Điều hòa, tủ lạnh", name: "Điện lạnh Ocean Park", note: "Có bảo hành 3 tháng" },
  { trade: "Khoá cửa", name: "Khoá cửa 24h nội khu", note: "Mở khoá, thay ổ" },
];

export function BookingStatusView({ refCode }: { refCode: string }) {
  const router = useRouter();
  const state = useMock();
  const now = useNow(1000);
  const [modal, setModal] = useState<"cancel" | "reschedule" | "expireConfirm" | "leaseWizard" | "occupants" | null>(null);
  const [dbBooking, setDbBooking] = useState<Booking | null>(null);
  const existingBooking = state.ready ? bookingByRef(state, refCode) : undefined;
  const [loadingDb, setLoadingDb] = useState(() => !existingBooking);

  // Tự động tải từ backend DB nếu mã tham chiếu chưa có trong mock memory
  useEffect(() => {
    if (existingBooking) {
      setLoadingDb(false);
      return;
    }
    let unmounted = false;
    async function fetchBooking() {
      try {
        const res = await bookingApi.getByRef(refCode);
        if (res.ok && res.data && !unmounted) {
          const v = res.data;
          const uId = v.unitId || v.unit?.id || "u1";
          const mapped: Booking = {
            id: v.id,
            ref: v.bookingRefCode || refCode,
            unitId: uId,
            hostId: v.tickets?.[0]?.hostId || v.host?.id || "H01",
            tenant: {
              name: v.tenant?.fullName || "Khách thuê Ocean Park",
              phone: v.tenant?.phoneHash?.replace("hash_", "") || "0912345678",
              persons: 2,
            },
            slot: v.viewingSlot || new Date().toISOString(),
            status: mapDbViewingStatus(v.status),
            createdAt: v.createdAt || new Date().toISOString(),
            lobbyAt: v.lobbyCheckInAt || undefined,
          };
          setDbBooking(mapped);
          setMockState((s) => ({
            ...s,
            bookings: [mapped, ...s.bookings.filter((b) => b.ref !== mapped.ref)],
          }));
        }
      } catch {
        // ignore offline
      } finally {
        if (!unmounted) setLoadingDb(false);
      }
    }
    fetchBooking();
    return () => {
      unmounted = true;
    };
  }, [refCode, existingBooking]);

  const booking = existingBooking || dbBooking;

  // Tự động liên kết eKYC nếu tài khoản đã từng xác thực trước đó.
  // Hook phải đứng TRƯỚC mọi `return` sớm (rules-of-hooks).
  const kycBooking = booking;
  useEffect(() => {
    if (!kycBooking || (accountPhone(state) && !ownsBooking(state, kycBooking))) return;
    if (kycBooking.status !== "closing" || kycBooking.kyc) return;
    const existing = tenantLatestKyc(state, kycBooking.tenant.phone);
    if (!existing) return;
    saveKyc(kycBooking.id, {
      fullName: existing.fullName,
      idNumber: existing.idNumber,
      dob: existing.dob,
      issuedDate: existing.issuedDate,
      address: existing.address,
      confidence: existing.confidence,
      manuallyEdited: existing.manuallyEdited,
      faceMatch: existing.faceMatch,
    });
  }, [kycBooking, state]);

  if (!state.ready || !now || loadingDb) {
    return (
      <div className={`wrap ${styles.page}`}>
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className={`wrap ${styles.notFound}`}>
        <h1 className={styles.h1}>Không tìm thấy lịch hẹn</h1>
        <p className="muted">
          Không có lịch hẹn nào mang mã {refCode}. Kiểm tra lại mã trong tin Zalo của bạn.
        </p>
        <Link href="/booking" className="btn btn-primary">
          Kiểm tra lịch xem
        </Link>
      </div>
    );
  }

  if (accountPhone(state) && !ownsBooking(state, booking)) {
    return (
      <div className={`wrap ${styles.notFound}`}>
        <h1 className={styles.h1}>Lịch hẹn không thuộc tài khoản này</h1>
        <p className="muted">
          Vui lòng đăng nhập bằng số điện thoại đã dùng để đặt lịch, hoặc kiểm tra lại mã lịch hẹn.
        </p>
        <Link href="/booking" className="btn btn-primary">
          Về lịch của tôi
        </Link>
      </div>
    );
  }

  const unit = unitById(booking.unitId)!;
  const zone = zoneById(unit.zoneId);
  const host = hostById(booking.hostId)!;
  const meta = STATUS_META[booking.status];
  const steps = buildTimeline(booking);
  const terminal = TERMINAL.includes(booking.status);
  const current = terminal ? -1 : steps.findIndex((s) => !s.done);
  const slotMs = new Date(booking.slot).getTime();
  const slaLeft = 180_000 - (now - new Date(booking.createdAt).getTime());
  const notices = noticesFor(state, "tenant", booking.tenant.phone).filter((n) => !n.bookingId || n.bookingId === booking.id);
  const editable = canTenantModify(booking, now);
  const similar = terminal ? similarUnits(state, unit, 2) : [];
  const chainUnits = booking.status === "completed" ? chainViewingUnits(state, unit, 3) : [];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Sảnh toà ${unit.building} Vinhomes Ocean Park`)}`;
  const holdHours = holdHoursFor(state, unit.id);
  const outcome = holdOutcome(booking, now);

  return (
    <div className={`wrap ${styles.page}`}>
      <nav className="small muted" aria-label="Đường dẫn">
        <Link href="/booking" className="link">
          Lịch xem của tôi
        </Link>{" "}
        / {booking.ref}
      </nav>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={`card ${styles.hero} ${styles[`tone-${meta.tone}`]}`}>
            <div className={styles.heroTop}>
              <div>
                <p className="muted small">Mã lịch hẹn</p>
                <p className={`num ${styles.ref}`}>{booking.ref}</p>
              </div>
              <span className={`badge ${meta.badge}`}>{meta.label}</span>
            </div>
            <h1 className={styles.headline}>{meta.headline}</h1>
            <p className="muted">
              {booking.status === "rejected" && booking.closedReason
                ? `${meta.body} (${booking.closedReason})`
                : meta.body}
            </p>

            {booking.status === "pending" && (
              <p className={styles.clock}>
                <Clock size={16} />
                {isOpenTicket(booking)
                  ? `Đang tìm Field Host rảnh lúc ${fmtTime(booking.slot)}`
                  : slaLeft > 0
                    ? `Host sẽ xác nhận trong khoảng ${Math.ceil(slaLeft / 60_000)} phút nữa`
                    : "Đã quá 3 phút: yêu cầu đang được chuyển cho Host lân cận trong bán kính 500m"}
              </p>
            )}

            {booking.status === "confirmed" && (
              <p className={styles.clock}>
                <Clock size={16} />
                {slotMs > now ? `Còn ${duration(slotMs - now)} tới giờ hẹn` : "Đã tới giờ hẹn"}
              </p>
            )}

            {/* ─── KHỐI VIỆC CẦN LÀM (THEO SPEC-P05 §2.3 & 01-CONTRACTS §6) ─── */}

            {/* 1. closing & chưa có eKYC: Bắt buộc hoàn tất eKYC trước khi chuyển cọc */}
            {booking.status === "closing" && !booking.kyc && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    background: "var(--paper-2)",
                    border: "1px solid var(--line-strong)",
                    padding: "14px 16px",
                    borderRadius: "var(--r)",
                    marginBottom: 14,
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <ShieldCheck size={22} style={{ color: "var(--kelp)", flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <b style={{ fontSize: 15, color: "var(--ink)" }}>Xác thực CCCD gắn chip (eKYC) trước khi chuyển cọc</b>
                    <p className="muted small" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>
                      Theo quy định tại Điều 328 Bộ luật Dân sự 2015 và bảo đảm hoàn cọc chính chủ, quý khách vui lòng hoàn tất xác thực CCCD (eKYC) trước khi tiến hành chuyển tiền cọc 2.000.000đ.
                    </p>
                  </div>
                </div>
                <KycCapture
                  booking={booking}
                  onDone={() => {
                    toast("Xác thực eKYC thành công! Quý khách tiến hành xác nhận điều khoản để nhận mã VietQR chuyển cọc.", "success");
                  }}
                />
              </div>
            )}

            {/* 2. closing & đã có eKYC & chưa đồng ý điều khoản: DepositTerms */}
            {booking.status === "closing" && booking.kyc && !booking.depositConsentAt && (
              <DepositTermsBox bookingId={booking.id} unitId={unit.id} kyc={booking.kyc} />
            )}

            {/* 3. closing & đã có eKYC & đã đồng ý: VietQR */}
            {booking.status === "closing" && booking.kyc && booking.depositConsentAt && booking.deposit && (
              <div className={styles.qr} style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }}>
                <VietQR
                  amount={booking.deposit.amount}
                  content={booking.deposit.content}
                  qrRef={booking.deposit.qrRef}
                />
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <b style={{ color: "var(--ink)" }}>Đang chờ thanh toán cọc...</b>
                  <p className="muted xs" style={{ maxWidth: 480, margin: "4px auto 0" }}>
                    Chuyển khoản 2.000.000đ vào tài khoản định danh nền tảng. Căn được giữ riêng cho bạn {holdHours} giờ kể từ khi ngân hàng báo có.
                  </p>
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.demoBtn}
                    onClick={() => {
                      confirmDepositPaid(booking.id, "webhook");
                      toast(`Ngân hàng báo có: căn đã khoá ${holdHours} giờ`, "success");
                    }}
                  >
                    Demo: Giả lập ngân hàng báo có
                  </button>
                </div>
              </div>
            )}

            {/* 4. holding & active: Countdown + Action làm HĐ */}
            {booking.status === "holding" && outcome.kind === "active" && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <CountdownBanner
                  booking={booking}
                  holdHours={holdHours}
                  now={now}
                  onExpireDemo={() => setModal("expireConfirm")}
                />
                <div className="card" style={{ padding: 16, background: "var(--surface)", marginTop: 12 }}>
                  <div style={{ marginBottom: 12 }}>
                    <b style={{ fontSize: 16 }}>Căn hộ đang được giữ chỗ cho bạn ({holdHours} giờ)</b>
                    <p className="muted xs" style={{ margin: "4px 0 0" }}>
                      {booking.kyc
                        ? "Khoản cọc 2.000.000đ đã nhận. Danh tính eKYC đã xác thực chính chủ. Mời bạn ký Hợp đồng thuê căn hộ."
                        : "Khoản cọc 2.000.000đ đã nhận. Bạn có thể tiến hành xác minh CCCD (eKYC) và ký Hợp đồng thuê căn hộ."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg btn-block"
                    onClick={() => setModal("leaseWizard")}
                  >
                    <FileCheck size={18} /> Làm hợp đồng thuê căn hộ
                  </button>
                </div>
              </div>
            )}

            {/* 4. Forfeited: Hết hạn giữ căn */}
            {outcome.kind === "forfeited" && (
              <div className="card" style={{ padding: 16, background: "var(--coral-50, #fff5f5)", border: "1px solid var(--coral-200, #fed7d7)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--coral-800, #9b2c2c)" }}>
                  <ShieldAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <b style={{ fontSize: 16 }}>Đã hết hạn giữ căn</b>
                    <p style={{ fontSize: 13.5, margin: "4px 0 10px" }}>
                      Hết thời hạn giữ chỗ {holdHours} giờ. Khoản cọc 2.000.000đ không được hoàn theo Điều 328 Bộ luật Dân sự 2015: 1.000.000đ bồi thường cho chủ nhà, 1.000.000đ chi phí vận hành nền tảng.
                    </p>
                    <Link href={`/units/${unit.id}?book=1`} className="btn btn-amber btn-sm">
                      Đặt lịch căn khác
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Refunded double: Chủ nhà bẻ cọc */}
            {outcome.kind === "refunded_double" && (
              <div className="card" style={{ padding: 16, background: "var(--lagoon-50, #f0fdfa)", border: "1px solid var(--lagoon-200, #99f6e4)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--lagoon-900, #134e4a)" }}>
                  <ShieldAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <b style={{ fontSize: 16 }}>Đã huỷ cọc giữ chỗ (Bồi thường)</b>
                    <p style={{ fontSize: 13.5, margin: "4px 0 10px" }}>
                      Chủ nhà không giữ cam kết. VinStay hoàn bạn 4.000.000đ (2.000.000đ cọc + 2.000.000đ phạt cọc, Điều 328 BLDS) trong 24 giờ làm việc.
                    </p>
                    <Link href={`/units/${unit.id}?book=1`} className="btn btn-primary btn-sm">
                      Tìm căn khác
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Refunded: Bất khả kháng */}
            {outcome.kind === "refunded" && (
              <div className="card" style={{ padding: 16, background: "var(--amber-50, #fef8ee)", border: "1px solid var(--amber-200, #fce1b2)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--amber-900, #78350f)" }}>
                  <ShieldAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <b style={{ fontSize: 16 }}>Đã huỷ giữ căn</b>
                    <p style={{ fontSize: 13.5, margin: "4px 0 10px" }}>
                      Sự kiện bất khả kháng. VinStay hoàn 100% 2.000.000đ trong 24 giờ làm việc.
                    </p>
                    <Link href={`/units/${unit.id}?book=1`} className="btn btn-primary btn-sm">
                      Tìm căn khác
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Thanh toán kỳ đầu khi đã ký HĐ (leased) */}
            {booking.status === "leased" && booking.lease && (
              <div className="card" style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--line-strong)", marginTop: 12 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700 }}>Thanh toán kỳ đầu trước khi nhận nhà</h3>
                {booking.lease.firstPayment?.paidAt ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--kelp)", fontWeight: 600 }}>
                      <Check size={18} />
                      <span>Đã thanh toán kỳ đầu · {fmtDateTime(booking.lease.firstPayment.paidAt)}</span>
                    </div>

                    {/* Khai báo người cùng cư trú sau thanh toán / sau khi dọn vào */}
                    <div
                      style={{
                        padding: "14px 16px",
                        background: "var(--paper-2)",
                        border: "1px solid var(--line-strong)",
                        borderRadius: "var(--r)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: "1 1 280px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <Users size={18} style={{ color: "var(--primary, #0f4c81)" }} />
                          <b style={{ fontSize: 14.5 }}>
                            Khai báo người cùng cư trú ({booking.lease.occupants?.length ?? 0}/5 người)
                          </b>
                          <span className="badge badge-kelp" style={{ fontSize: 11 }}>
                            Thẻ cư dân &amp; Tạm trú
                          </span>
                        </div>
                        <p className="muted xs" style={{ margin: 0, lineHeight: 1.5 }}>
                          {booking.lease.occupants && booking.lease.occupants.length > 0
                            ? `Đã đăng ký: ${booking.lease.occupants.map((o) => o.fullName).join(", ")}. Bạn có thể cập nhật lại khi cần.`
                            : "Dùng để đăng ký tạm trú và cấp thẻ thang máy Vinhomes. Bạn có thể cập nhật ngay bây giờ hoặc lưu lại để làm sau khi dọn vào nhà."}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setModal("occupants")}
                      >
                        <Users size={14} />
                        {booking.lease.occupants?.length ? "Chỉnh sửa người ở cùng" : "Khai báo người ở cùng"}
                      </button>
                    </div>
                  </div>
                ) : booking.lease.firstPayment ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <VietQR
                      amount={booking.lease.firstPayment.total}
                      content={booking.lease.firstPayment.content}
                      qrRef={`${booking.ref}-FP`}
                    />
                    <div style={{ background: "var(--paper-2)", borderRadius: "var(--r)", padding: "12px 16px" }}>
                      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", fontSize: 13.5 }}>
                        <dt className="muted">Tiền thuê kỳ 1 ({booking.lease.paymentCycle} tháng)</dt>
                        <dd style={{ textAlign: "right", fontWeight: 600 }}>{vnd(booking.lease.firstPayment.rent)}đ</dd>

                        <dt className="muted">Phần cọc bảo đảm còn thiếu</dt>
                        <dd style={{ textAlign: "right", fontWeight: 600 }}>{vnd(booking.lease.firstPayment.depositTopUp)}đ</dd>

                        <dt style={{ borderTop: "1px solid var(--line)", paddingTop: 8, fontWeight: 700 }}>Tổng thanh toán đợt đầu</dt>
                        <dd style={{ borderTop: "1px solid var(--line)", paddingTop: 8, textAlign: "right", fontWeight: 700, color: "var(--primary, #0f4c81)" }}>
                          {vnd(booking.lease.firstPayment.total)}đ
                        </dd>
                      </dl>
                    </div>
                    <p className="xs muted" style={{ margin: 0, textAlign: "center" }}>
                      Khoản 2.000.000đ đã chuyển 100% vào cọc bảo đảm — không trừ vào tiền thuê.
                    </p>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <button
                        type="button"
                        className={styles.demoBtn}
                        onClick={() => {
                          const res = confirmFirstPayment(booking.id);
                          if (res.ok) {
                            toast("Đã thanh toán kỳ đầu thành công (demo)", "success");
                          } else {
                            toast(res.reason);
                          }
                        }}
                      >
                        Demo: Ngân hàng báo có kỳ đầu
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* 8. Buổi xem hoàn tất / Khách chưa chốt (completed) */}
            {booking.status === "completed" && (
              <div className="card" style={{ padding: 20, background: "var(--surface)", border: "1px solid var(--line-strong)", marginTop: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                  <CheckCircle2 size={24} style={{ color: "var(--kelp)", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 17 }}>Buổi xem phòng đã hoàn tất</b>
                    <p style={{ fontSize: 14, margin: "4px 0 0", color: "var(--slate)", lineHeight: 1.5 }}>
                      {booking.closedReason ? `Ghi nhận phản hồi của bạn: "${booking.closedReason}". ` : ""}
                      Căn hộ đã được mở lại đón khách khác. Host <b>{host?.name ?? "nội khu"}</b> đang ở sảnh cùng bạn — VinStay AI đã chọn sẵn 3 căn đang trống phù hợp nhất bên dưới để bạn cùng Host lên xem ngay:
                    </p>
                  </div>
                </div>

                {/* DANH SÁCH 3 CĂN GỢI Ý XEM NGAY TẠI CHỖ (HIỂN THỊ TRỰC TIẾP KÈM ẢNH) */}
                {chainUnits.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--kelp-800, #065f46)", display: "flex", alignItems: "center", gap: 6 }}>
                        <Sparkles size={16} style={{ color: "var(--kelp-600, #059669)" }} /> 3 căn tương đương trống lân cận (Xem ngay cùng Host)
                      </span>
                      <span className="badge badge-kelp" style={{ fontSize: 11 }}>
                        Không cần đặt lại lịch
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {chainUnits.map((u) => {
                        const isSameBldg = u.building === unit.building;
                        const cost = allInCost(u, { ...DEFAULT_HOUSEHOLD, persons: booking.tenant.persons });
                        return (
                          <div
                            key={u.id}
                            style={{
                              display: "flex",
                              gap: 14,
                              padding: "12px 14px",
                              borderRadius: "var(--r)",
                              border: "1.5px solid var(--line-strong)",
                              background: "var(--paper-2)",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ width: 110, height: 82, flexShrink: 0, borderRadius: "var(--r-sm)", overflow: "hidden" }}>
                              <VerifiedPhoto unit={u} sizes="110px" stamp="none" style={{ width: "100%", height: "100%" }} />
                            </div>
                            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div>
                                  <b style={{ fontSize: 15, display: "block" }}>{unitAddress(u)}</b>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                                    <span className={`badge ${isSameBldg ? "badge-kelp" : "badge-amber"}`} style={{ fontSize: 11 }}>
                                      {isSameBldg ? `Cùng toà ${unit.building}` : `Toà ${u.building}`}
                                    </span>
                                    <span className="badge badge-plain" style={{ fontSize: 11 }}>
                                      {u.lock === "smart" ? "Khoá PIN tức thì" : "Chìa cơ quầy"}
                                    </span>
                                    <span className="badge badge-plain" style={{ fontSize: 11 }}>
                                      {u.layoutLabel} · Tầng {u.floor}
                                    </span>
                                  </div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--primary, #0f4c81)" }}>
                                    {vnd(u.rent)}đ
                                  </span>
                                  <span className="xs muted" style={{ display: "block" }}>
                                    All-in ~{vnd(cost.total)}đ
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn-success btn-sm"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                                  onClick={() => {
                                    const newBk = hostImmediateViewing(booking.id, u.id);
                                    toast(`Đang cùng Host ${host?.name ?? ""} di chuyển sang căn ${unitAddress(u)}`, "success");
                                    router.push(`/booking/${newBk.ref}`);
                                  }}
                                >
                                  <Sparkles size={14} /> Xem ngay căn này cùng Host {host?.name ?? ""} <ArrowRight size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                      <Link href="/" className="btn btn-quiet btn-sm">
                        Xem danh sách tất cả căn
                      </Link>
                      <Link href="/" className="btn btn-quiet btn-sm">
                        Nhờ AI Matchmaker lọc lại
                      </Link>
                      <a href="#rating-section" className="btn btn-quiet btn-sm" style={{ color: "var(--slate)" }}>
                        Tôi không xem thêm hôm nay ↓
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* THÔNG TIN CĂN HỘ & HOST */}
            <div className={styles.unitRow}>
              <Link href={`/units/${unit.id}`} className={styles.thumb} aria-label={`Xem căn ${unitAddress(unit)}`}>
                <VerifiedPhoto unit={unit} sizes="140px" stamp="none" className={styles.thumbFrame} />
              </Link>
              <dl className={styles.facts}>
                <div>
                  <dt>Căn hộ</dt>
                  <dd>{unitAddress(unit)}</dd>
                  <dd className="muted small">{zone.name}</dd>
                </div>
                <div>
                  <dt>Thời gian</dt>
                  <dd>
                    {fmtTime(booking.slot)} · {weekday(booking.slot)}, {fmtDateTime(booking.slot).split(" · ")[1]}
                  </dd>
                  <dd className="muted small">{dayLabel(booking.slot, now)}</dd>
                </div>
                <div>
                  <dt>Field Host</dt>
                  {isOpenTicket(booking) ? (
                    <>
                      <dd className="muted">Đang phân bổ...</dd>
                      <dd className="muted small">Tự động chọn Host gần nhất</dd>
                    </>
                  ) : (
                    <>
                      <dd>{host.name}</dd>
                      <dd className="muted small">
                        <Star size={12} fill="currentColor" style={{ color: "var(--amber)", verticalAlign: "-1px" }} />{" "}
                        {String(host.rating).replace(".", ",")}
                        {booking.confirmedAt && ` · ${fmtPhone(host.phone)}`}
                      </dd>
                    </>
                  )}
                </div>
              </dl>
            </div>

            {/* CÁC NÚT HÀNH ĐỘNG DÀNH CHO KHÁCH */}
            <div className={styles.actions} style={{ alignItems: "center" }}>
              {/* Nút chính "Tôi đã tới sảnh" */}
              {booking.status === "confirmed" && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => {
                    tenantCheckIn(booking.id);
                    toast("Đã báo Host — Host đang xuống sảnh đón bạn", "success");
                  }}
                >
                  <MapPinCheck size={18} /> Tôi đã tới sảnh
                </button>
              )}

              {booking.status === "lobby" && (
                <span className="badge badge-kelp" style={{ padding: "8px 14px", fontSize: 13.5 }}>
                  <Check size={14} /> Đã báo có mặt lúc {fmtTime(booking.lobbyAt ?? booking.createdAt)}
                </span>
              )}

              <a className="btn btn-quiet btn-sm" href={mapsUrl} target="_blank" rel="noreferrer">
                <MapPin size={15} /> Chỉ đường tới sảnh {unit.building}
              </a>

              {booking.confirmedAt && (
                <a className="btn btn-quiet btn-sm" href={`tel:${normalizePhone(host.phone)}`}>
                  <Phone size={15} /> Gọi Host
                </a>
              )}

              {/* Đổi giờ & Huỷ lịch */}
              {(booking.status === "pending" || booking.status === "confirmed") && (
                <>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={!editable}
                    onClick={() => setModal("reschedule")}
                    title={!editable ? "Chỉ đổi/huỷ được trước giờ hẹn ít nhất 2 giờ" : undefined}
                  >
                    Đổi giờ
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={!editable}
                    onClick={() => setModal("cancel")}
                    title={!editable ? "Chỉ đổi/huỷ được trước giờ hẹn ít nhất 2 giờ" : undefined}
                  >
                    Huỷ lịch
                  </button>
                  {!editable && (
                    <span className="xs muted" style={{ display: "block", width: "100%" }}>
                      Chỉ đổi/huỷ được trước giờ hẹn ít nhất 2 giờ — gọi Host nếu cần.
                    </span>
                  )}
                </>
              )}

              {terminal && (
                <Link href={`/units/${unit.id}?book=1`} className="btn btn-amber btn-sm">
                  Đặt lịch khác
                </Link>
              )}
            </div>

            {/* Nút Demo thông báo Zalo */}
            {booking.status === "confirmed" && !booking.reminderSentAt && (
              <button
                type="button"
                className={styles.demoBtn}
                onClick={() => {
                  sendReminder(booking.id);
                  toast("Đã gửi tin nhắc hẹn Zalo", "success");
                }}
              >
                Demo: gửi tin nhắc hẹn Zalo
              </button>
            )}
          </section>

          {/* HỒ SƠ CỦA BẠN (KHI ĐÃ KÝ HỢP ĐỒNG HOẶC eKYC) */}
          {(booking.lease || booking.kyc) && (
            <section className={`card ${styles.block}`}>
              <h2>Hồ sơ của bạn</h2>
              <ul className={styles.docs}>
                {booking.lease && (
                  <li>
                    <FileText size={18} />
                    <div>
                      <b>Hợp đồng thuê {booking.lease.docId}</b>
                      <p className="muted small">
                        {booking.lease.months} tháng · {vnd(booking.lease.rent)}đ/tháng · cọc bảo đảm gồm 2.000.000đ
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => window.print()}
                    >
                      In Hợp đồng
                    </button>
                  </li>
                )}
                {booking.lease && (
                  <li>
                    <Users size={18} />
                    <div>
                      <b>Người cùng cư trú ({booking.lease.occupants?.length ?? 0}/5 người)</b>
                      <p className="muted small">
                        {booking.lease.occupants && booking.lease.occupants.length > 0
                          ? booking.lease.occupants.map((o) => `${o.fullName} (${o.idOrDob})`).join(", ")
                          : "Chưa khai báo (Khách ở một mình hoặc bổ sung sau khi dọn vào)"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => setModal("occupants")}
                    >
                      {booking.lease.occupants?.length ? "Chỉnh sửa" : "Bổ sung"}
                    </button>
                  </li>
                )}
                {booking.kyc && (
                  <li>
                    <Check size={18} />
                    <div>
                      <b>CCCD đã xác minh (eKYC)</b>
                      <p className="muted small">Mã hoá AES-256, đối soát khớp với thông tin đặt lịch</p>
                    </div>
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* DANH BẠ THỢ KỸ THUẬT */}
          {booking.lease && (
            <section className={`card ${styles.block}`}>
              <h2>Danh bạ thợ kỹ thuật ngoài</h2>
              <p className="muted small">
                VinStay và Field Host không nhận sửa chữa. Bạn và thợ tự thoả thuận giá và trách nhiệm.
              </p>
              <ul className={styles.docs}>
                {HANDYMEN.map((h) => (
                  <li key={h.trade}>
                    <Wrench size={18} />
                    <div>
                      <b>{h.trade}</b>
                      <p className="muted small">
                        {h.name} · {h.note}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ĐÁNH GIÁ FIELD HOST KHI ĐANG VẬN HÀNH */}
          {!booking.rating &&
            ["viewing", "closing", "holding", "leased"].includes(booking.status) && (
              <section className={`card ${styles.block}`}>
                <h2>Đánh giá Field Host {host.name}</h2>
                <div className={styles.stars} role="radiogroup" aria-label="Chấm sao">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={false}
                      aria-label={`${n} sao`}
                      onClick={() => {
                        rateHost(booking.id, n);
                        toast("Cảm ơn bạn đã đánh giá", "success");
                      }}
                    >
                      <Star size={30} />
                    </button>
                  ))}
                </div>
              </section>
            )}

          {/* CĂN TƯƠNG ĐƯƠNG (CHỈ HIỆN KHI KHÔNG PHẢI COMPLETED ĐÃ CÓ 3 CĂN GỢI Ý) */}
          {booking.status !== "completed" && similar.length > 0 && (
            <section>
              <h2 className={styles.h2}>Căn tương đương bạn có thể xem</h2>
              <div className={styles.similar}>
                {similar.map((u) => (
                  <UnitCard key={u.id} unit={u} cost={allInCost(u, DEFAULT_HOUSEHOLD)} />
                ))}
              </div>
            </section>
          )}

          {/* ĐÁNH GIÁ FIELD HOST NẾU KHÁCH KHÔNG XEM TIẾP NỮA (HIỆN CUỐI CÙNG TRANG) */}
          {booking.status === "completed" && (
            <section
              className={`card ${styles.block}`}
              id="rating-section"
              style={{
                marginTop: 20,
                border: "1px solid var(--line-strong)",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {booking.rating ? "Cảm ơn bạn đã đánh giá Host!" : `Đánh giá buổi hỗ trợ của Field Host ${host.name}`}
                  </h3>
                  <p className="muted xs" style={{ margin: "4px 0 0", maxWidth: 440 }}>
                    {booking.rating
                      ? `Bạn đã đánh giá ${booking.rating}★ cho Host ${host.name}. Phản hồi của bạn giúp VinStay nâng cao chuẩn phục vụ tại sảnh.`
                      : "Nếu bạn không xem thêm căn nào hôm nay, xin vui lòng dành 5 giây đánh giá chất lượng phục vụ của Field Host."}
                  </p>
                </div>
                {!booking.rating ? (
                  <div className={styles.stars} role="radiogroup" aria-label="Chấm sao">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={false}
                        aria-label={`${n} sao`}
                        onClick={() => {
                          rateHost(booking.id, n);
                          toast("Cảm ơn bạn đã đánh giá Host!", "success");
                        }}
                      >
                        <Star size={28} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 4, color: "var(--amber)" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={22} fill={n <= booking.rating! ? "currentColor" : "none"} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* CỘT PHỤ (TIMELINE & ZALO) */}
        <aside className={styles.side}>
          <section className={`card ${styles.block}`} aria-label="Tiến trình">
            <h2>Tiến trình</h2>
            <ol className={styles.timeline}>
              {steps.map((s, i) => (
                <li
                  key={s.key}
                  className={`${s.done ? styles.done : ""} ${i === current ? styles.current : ""}`}
                  aria-current={i === current ? "step" : undefined}
                >
                  <span className={styles.dot}>{s.done && <Check size={12} strokeWidth={3} />}</span>
                  <div>
                    <b>{s.label}</b>
                    <p className="muted xs">{s.at && s.done ? fmtDateTime(s.at) : s.hint}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-label="Tin nhắn Zalo">
            <h2 className={styles.h2s}>Tin Zalo gửi tới {fmtPhone(booking.tenant.phone)}</h2>
            <ZaloThread
              notices={notices}
              now={now}
              onAction={(_, a) => (a.id === "arrived" ? tenantCheckIn(booking.id) : tenantRunningLate(booking.id))}
              actionsDisabled={booking.status !== "confirmed"}
              empty="Chưa có tin nhắn nào."
              maxHeight={520}
            />
          </section>
        </aside>
      </div>

      {/* MODAL HUỶ LỊCH */}
      <CancelModal
        open={modal === "cancel"}
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          const res = cancelBooking(booking.id, reason);
          if (!res.ok) toast(res.reason);
          else {
            setModal(null);
            toast("Đã huỷ lịch xem", "success");
          }
        }}
      />

      {/* MODAL ĐỔI GIỜ */}
      <RescheduleModal
        open={modal === "reschedule"}
        onClose={() => setModal(null)}
        now={now}
        onConfirm={(slot) => {
          const res = rescheduleBooking(booking.id, slot);
          if (!res.ok) toast(res.reason);
          else {
            setModal(null);
            toast("Đã đổi giờ, Host sẽ xác nhận lại", "success");
          }
        }}
      />

      {/* MODAL XÁC NHẬN TUA HẾT HẠN GIỮ CĂN (DEMO) */}
      <Modal
        open={modal === "expireConfirm"}
        onClose={() => setModal(null)}
        title="Xác nhận tua hết hạn giữ căn"
        description="Thao tác demo: căn hộ sẽ chuyển sang trạng thái hết hạn, khách mất cọc 2.000.000đ và căn được mở lại."
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet" onClick={() => setModal(null)}>
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                demoExpireHold(booking.id);
                setModal(null);
                toast("Đã tua hết hạn giữ căn", "success");
              }}
            >
              Tua hết hạn ngay
            </button>
          </div>
        }
      >
        <p className="small muted">
          Sau khi hết hạn, bạn sẽ thấy thông báo forfeited theo đúng quy chuẩn Điều 328 Bộ luật Dân sự 2015.
        </p>
      </Modal>

      {/* MODAL LEASE WIZARD */}
      <Modal
        open={modal === "leaseWizard"}
        onClose={() => setModal(null)}
        variant="wide"
        title="Làm hợp đồng thuê căn hộ"
        description={`Ký hợp đồng thuê chính thức căn ${unitAddress(unit)}`}
      >
        <LeaseWizardFlow booking={booking} unit={unit} now={now} onDone={() => setModal(null)} />
      </Modal>

      {/* MODAL OCCUPANTS */}
      {modal === "occupants" && (
        <OccupantsModal
          booking={booking}
          unit={unit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── COMPONENT CON: ĐIỀU KHOẢN CỌC ────────────────────────────────────────────────────────────

function DepositTermsBox({
  bookingId,
  unitId,
  kyc,
}: {
  bookingId: string;
  unitId: string;
  kyc?: Booking["kyc"];
}) {
  const state = useMock();
  const [consent, setConsent] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const holdHours = holdHoursFor(state, unitId);

  return (
    <div
      className="card"
      style={{
        padding: 18,
        background: "var(--surface)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--r)",
        marginTop: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <ShieldCheck size={22} style={{ color: "var(--kelp)" }} />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Điều khoản đặt cọc giữ căn</h3>
      </div>

      {kyc && (
        <div
          style={{
            background: "var(--paper-2)",
            border: "1px solid var(--line)",
            padding: "10px 14px",
            borderRadius: "var(--r)",
            marginBottom: 14,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <CheckCircle2 size={18} style={{ color: "var(--kelp)", flexShrink: 0 }} />
          <div>
            <span>
              Người đặt cọc (Đã xác thực eKYC): <b>{kyc.fullName}</b> · Số CCCD: <b>{kyc.idNumber}</b>
            </span>
          </div>
        </div>
      )}

      <ul style={{ paddingLeft: 20, margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink)" }}>
        <li>Khoản tiền cọc <b>2.000.000 VNĐ</b> được nộp vào tài khoản định danh của nền tảng VinStay AI qua VietQR động.</li>
        <li>Căn hộ được khóa trạng thái giữ chỗ độc quyền trong vòng <b>{holdHours} giờ</b> kể từ khi nhận tiền.</li>
        <li>
          Quá thời hạn {holdHours} giờ mà khách thuê không tiến hành ký Hợp đồng thuê thì mất tiền cọc theo{" "}
          <b>Điều 328 Bộ luật Dân sự 2015</b> (trong đó 1.000.000đ bồi thường thời gian trống phòng cho chủ nhà, 1.000.000đ bù đắp chi phí vận hành nền tảng).
        </li>
        <li>
          Trường hợp Chủ nhà từ chối cho thuê khi căn hộ đã được giữ chỗ hợp lệ, Khách thuê được hoàn trả 100% tiền cọc và bồi thường thêm 100% (phạt cọc gấp đôi: nhận lại tổng cộng <b>4.000.000 VNĐ</b>) theo <b>Khoản 2 Điều 328 Bộ luật Dân sự 2015</b>.
        </li>
        <li>
          Khi ký Hợp đồng thuê chính thức, khoản tiền này được chuyển đổi 100% thành một phần của{" "}
          <b>Tiền cọc bảo đảm tài sản & nội thất</b> (Security Deposit) và giữ nguyên suốt kỳ hạn thuê; tuyệt đối không trừ vào tiền thuê tháng đầu tiên.
        </li>
      </ul>

      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => setShowRules((prev) => !prev)}
          style={{ padding: "4px 8px", fontSize: 13 }}
        >
          {showRules ? "Ẩn nội quy căn hộ" : "Xem 6 nội quy căn hộ"}
        </button>
        {showRules && (
          <div style={{ marginTop: 10, padding: 12, background: "var(--paper-2)", borderRadius: "var(--r)", fontSize: 13, lineHeight: 1.5 }}>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              {HOUSE_RULES.map((rule) => (
                <li key={rule.id} style={{ marginBottom: 8 }}>
                  <b>{rule.title}:</b> {rule.body}{" "}
                  <span className="muted xs" style={{ color: "var(--kelp)", fontWeight: 500 }}>
                    · {rule.source}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: "10px 12px",
          background: "var(--paper-2)",
          borderRadius: "var(--r)",
          cursor: "pointer",
          fontSize: 13,
          lineHeight: 1.45,
          marginBottom: 14,
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          Tôi đồng ý điều khoản cọc giữ chỗ và 6 nội quy căn hộ theo <b>Điều 328 Bộ luật Dân sự 2015</b> và cho phép VinStay AI xử lý dữ liệu cá nhân theo <b>Nghị định 13/2023/NĐ-CP</b>.
        </span>
      </label>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        disabled={!consent}
        onClick={() => {
          const res = tenantAcceptDepositTerms(bookingId);
          if (!res.ok) toast(res.reason);
          else toast("Đã đồng ý điều khoản, vui lòng quét VietQR để chuyển tiền cọc", "success");
        }}
      >
        <Check size={18} /> Chấp thuận điều khoản & lấy mã VietQR
      </button>
    </div>
  );
}

// ─── COMPONENT CON: COUNTDOWN BANNER ──────────────────────────────────────────────────────────

function CountdownBanner({
  booking,
  holdHours,
  now,
  onExpireDemo,
}: {
  booking: Booking;
  holdHours: number;
  now: number;
  onExpireDemo: () => void;
}) {
  const msLeft = holdMsLeft(booking, now);
  const expiresAt = booking.deposit?.expiresAt;

  if (msLeft <= 0) {
    return (
      <div className="card" style={{ padding: 12, background: "var(--coral-50)", color: "var(--coral-800)" }}>
        <b>Đã hết hạn giữ căn</b>
      </div>
    );
  }

  const h = Math.floor(msLeft / 3600_000);
  const m = Math.floor((msLeft % 3600_000) / 60_000);
  const s = Math.floor((msLeft % 60_000) / 1000);

  const timeLeftText = msLeft < 3600_000 ? `Còn ${m} phút ${s} giây` : `Còn ${h} giờ ${m} phút`;
  const totalMs = holdHours * 3600_000;
  const pct = Math.min(100, Math.max(0, ((totalMs - msLeft) / totalMs) * 100));

  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--amber-50, #fef8ee)",
        border: "1px solid var(--amber-200, #fce1b2)",
        borderRadius: "var(--r)",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Clock size={18} style={{ color: "var(--amber-700, #b45309)" }} />
          <b style={{ fontSize: 16, color: "var(--amber-900, #78350f)" }}>{timeLeftText}</b>
        </div>
        <button type="button" className={styles.demoBtn} onClick={onExpireDemo}>
          Demo: Tua hết hạn giữ căn
        </button>
      </div>

      <div style={{ height: 6, background: "var(--amber-200, #fce1b2)", borderRadius: 999, overflow: "hidden", margin: "8px 0" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--amber-600, #d97706)", transition: "width 0.3s ease" }} />
      </div>

      {expiresAt && (
        <p className="xs muted" style={{ margin: 0 }}>
          Giữ căn tới <b>{fmtDateTime(expiresAt)}</b>. Quá thời hạn này mà chưa hoàn tất ký Hợp đồng thuê thì căn hộ tự động mở lại.
        </p>
      )}
    </div>
  );
}

// ─── COMPONENT CON: LEASE WIZARD FLOW ─────────────────────────────────────────────────────────

function LeaseWizardFlow({
  booking,
  unit,
  now,
  onDone,
}: {
  booking: Booking;
  unit: Unit;
  now: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"kyc" | "lease">(booking.kyc ? "lease" : "kyc");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn btn-sm ${step === "kyc" ? "btn-primary" : "btn-quiet"}`}
          onClick={() => setStep("kyc")}
        >
          1. Xác minh CCCD {booking.kyc && <Check size={14} />}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${step === "lease" ? "btn-primary" : "btn-quiet"}`}
          disabled={!booking.kyc}
          onClick={() => setStep("lease")}
        >
          2. Thiết lập điều khoản & Ký hợp đồng {booking.lease && <Check size={14} />}
        </button>
      </div>

      {step === "kyc" && (
        <KycCapture
          booking={booking}
          onDone={() => {
            toast("Đã lưu kết quả eKYC", "success");
            setStep("lease");
          }}
        />
      )}

      {step === "lease" && (
        <LeaseForm
          booking={booking}
          unit={unit}
          now={now}
          onSigned={() => {
            toast("Ký hợp đồng thuê thành công!", "success");
            onDone();
          }}
        />
      )}
    </div>
  );
}

// ─── COMPONENT CON: MODAL CANCEL & RESCHEDULE ─────────────────────────────────────────────────

function CancelModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("Bận việc đột xuất");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Huỷ lịch xem phòng"
      description="Ca trực của Host sẽ được giải phóng ngay."
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Giữ lịch
          </button>
          <button type="button" className="btn btn-danger" onClick={() => onConfirm(reason)}>
            Huỷ lịch
          </button>
        </div>
      }
    >
      <label className="field">
        <span className="label">Lý do huỷ</span>
        <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Bận việc đột xuất</option>
          <option>Đã chọn được căn khác</option>
          <option>Thay đổi kế hoạch thuê</option>
          <option>Lý do khác</option>
        </select>
      </label>
    </Modal>
  );
}

function RescheduleModal({
  open,
  onClose,
  now,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  now: number;
  onConfirm: (slot: string) => void;
}) {
  const [slot, setSlot] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Đổi giờ xem phòng"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!slot}
          onClick={() => slot && onConfirm(slot)}
        >
          Xác nhận giờ mới
        </button>
      }
    >
      <SlotPicker
        now={now}
        value={slot}
        onChange={setSlot}
      />
    </Modal>
  );
}

function OccupantsModal({
  booking,
  unit,
  onClose,
}: {
  booking: Booking;
  unit: Unit;
  onClose: () => void;
}) {
  const [occupants, setOccupants] = useState<Occupant[]>(() => [
    ...(booking.lease?.occupants ?? []),
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleAdd = () => {
    if (occupants.length >= 5) return;
    setOccupants([...occupants, { fullName: "", idOrDob: "", phone: "" }]);
  };

  const handleRemove = (idx: number) => {
    setOccupants(occupants.filter((_, i) => i !== idx));
  };

  const handleChange = (idx: number, field: keyof Occupant, val: string) => {
    const next = [...occupants];
    next[idx] = { ...next[idx], [field]: val };
    setOccupants(next);
  };

  const handleSave = () => {
    setErrors({});
    setGeneralError(null);
    const newErrors: Record<string, string> = {};

    for (let i = 0; i < occupants.length; i++) {
      const o = occupants[i];
      if (!o.fullName.trim()) {
        newErrors[`name_${i}`] = "Vui lòng nhập họ và tên";
      }
      if (!o.idOrDob.trim()) {
        newErrors[`id_${i}`] = "Vui lòng nhập CCCD hoặc ngày sinh";
      }
      if (o.phone && !/^0\d{9}$/.test(o.phone.trim())) {
        newErrors[`phone_${i}`] = "SĐT phải gồm 10 chữ số";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setGeneralError("Vui lòng kiểm tra lại thông tin người cùng ở.");
      return;
    }

    const res = updateBookingOccupants(booking.id, occupants);
    if (res.ok) {
      toast("Đã lưu danh sách người cùng cư trú thành công!", "success");
      onClose();
    } else {
      setGeneralError(res.reason || "Có lỗi xảy ra khi lưu thông tin.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="wide"
      title="Người cùng cư trú & Thẻ cư dân"
      description={`Căn ${unitAddress(unit)} · Tối đa 5 người`}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Để sau khi dọn vào
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              <Check size={16} /> Lưu thông tin
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="muted small" style={{ margin: 0, lineHeight: 1.5 }}>
          Thông tin dùng để đăng ký tạm trú với Công an xã Đa Tốn/Gia Lâm và làm thủ tục cấp thẻ cư dân thang máy Vinhomes (Điều 3 Thỏa thuận cọc, Điều 11 HĐ thuê).
        </p>

        {generalError && <div className="alert alert-danger">{generalError}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b style={{ fontSize: 14 }}>Danh sách người ở cùng ({occupants.length}/5)</b>
          {occupants.length < 5 && (
            <button type="button" className="btn btn-sm btn-quiet" onClick={handleAdd}>
              <Plus size={15} /> Thêm người
            </button>
          )}
        </div>

        {occupants.length === 0 ? (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              background: "var(--paper-2)",
              borderRadius: "var(--r)",
              border: "1px dashed var(--line)",
            }}
          >
            <p className="muted small" style={{ margin: "0 0 10px" }}>
              Hiện chưa có người ở cùng (Khách thuê ở một mình).
            </p>
            <button type="button" className="btn btn-sm btn-outline" onClick={handleAdd}>
              <Plus size={14} /> Thêm người ở cùng (nếu có bạn cùng phòng/người thân)
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {occupants.map((occ, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px",
                  borderRadius: "var(--r)",
                  background: "var(--surface)",
                  border: "1px solid var(--line-strong)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge badge-plain" style={{ fontSize: 11 }}>
                    Người cùng ở #{idx + 1}
                  </span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    style={{ color: "var(--danger)", padding: 4 }}
                    onClick={() => handleRemove(idx)}
                    title="Xoá người này"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <input
                      className="input"
                      placeholder="Họ và tên người ở"
                      value={occ.fullName}
                      onChange={(e) => handleChange(idx, "fullName", e.target.value)}
                    />
                    {errors[`name_${idx}`] && (
                      <span className="xs" style={{ color: "var(--danger)" }}>{errors[`name_${idx}`]}</span>
                    )}
                  </div>
                  <div>
                    <input
                      className="input"
                      placeholder="Số CCCD hoặc Ngày sinh"
                      value={occ.idOrDob}
                      onChange={(e) => handleChange(idx, "idOrDob", e.target.value)}
                    />
                    {errors[`id_${idx}`] && (
                      <span className="xs" style={{ color: "var(--danger)" }}>{errors[`id_${idx}`]}</span>
                    )}
                  </div>
                </div>
                <div>
                  <input
                    className="input"
                    placeholder="Số điện thoại (tuỳ chọn)"
                    value={occ.phone || ""}
                    onChange={(e) => handleChange(idx, "phone", e.target.value)}
                  />
                  {errors[`phone_${idx}`] && (
                    <span className="xs" style={{ color: "var(--danger)" }}>{errors[`phone_${idx}`]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            padding: "10px 12px",
            background: "var(--paper-2)",
            borderRadius: "var(--r)",
            fontSize: 12.5,
            color: "var(--slate)",
            lineHeight: 1.5,
          }}
        >
          💡 <b>Lưu ý:</b> Bạn không bắt buộc phải khai báo ngay. Có thể bấm <i>&ldquo;Để sau khi dọn vào&rdquo;</i> và quay lại cập nhật bất cứ lúc nào trong mục <b>Hồ sơ của bạn</b>.
        </div>
      </div>
    </Modal>
  );
}
