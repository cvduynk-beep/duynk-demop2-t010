"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  MapPin,
  MapPinCheck,
  ShieldAlert,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { VietQR } from "@/components/payment/VietQR";
import { ZaloThread } from "@/components/zalo/ZaloThread";
import { UnitCard } from "@/components/unit/UnitCard";
import { VerifiedPhoto } from "@/components/unit/VerifiedPhoto";
import { DepositTermsBox } from "@/components/deal/DepositTermsBox";
import { KycCapture } from "@/components/deal/KycCapture";
import { LeaseForm } from "@/components/deal/LeaseForm";
import { DEFAULT_HOUSEHOLD, allInCost } from "@/lib/pricing/cost";
import { dayLabel, fmtDateTime, fmtTime, vnd, weekday } from "@/lib/format";
import type { ApiResponse } from "@/lib/apiClient";
import { primeApiData, useApiQuery } from "@/lib/query/useApiQuery";
import { bookingZaloThread } from "@/lib/simulated/zalo";
import { toUnit, type UnitWithExtras } from "@/lib/tenant/adapters";
import { errorText, tenantApi } from "@/lib/tenant/api";
import { chainViewingUnits, similarUnits, useCatalog } from "@/lib/tenant/catalog";
import { invalidateTenantBookings, invalidateTenantContracts, invalidateTenantUnit, tenantQueries } from "@/lib/tenant/queries";
import type { TenantBooking } from "@/lib/tenant/types";
import { unitAddress, zoneById } from "@/lib/units";
import { useNow } from "@/lib/useNow";
import { SlotPicker } from "./SlotPicker";
import { STATUS_META, TERMINAL, buildTimeline } from "./status";
import styles from "./Booking.module.css";

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

/** Trạng thái còn diễn biến (Host xác nhận, nhắc hẹn, báo có…) ⇒ tải lại định kỳ để thấy cập nhật từ Host/ngân hàng. */
const LIVE_STATUSES: TenantBooking["status"][] = ["pending", "confirmed", "lobby", "receiving", "viewing", "closing", "holding"];

export function BookingStatusView({ refCode }: { refCode: string }) {
  const now = useNow(1000);
  const [modal, setModal] = useState<"cancel" | "reschedule" | "leaseWizard" | null>(null);
  const bookingDef = tenantQueries.booking(refCode);
  const query = useApiQuery(bookingDef, true, { pollMs: (b) => (b && LIVE_STATUSES.includes(b.status) ? 10_000 : null) });
  const catalog = useCatalog();
  const booking = query.state.status === "ready" ? query.state.data : null;
  const contracts = useApiQuery(tenantQueries.contracts(), Boolean(booking?.contractId));
  const contract =
    booking?.contractId && contracts.state.status === "ready" ? contracts.state.data.find((c) => c.id === booking.contractId) : undefined;
  const [busy, setBusy] = useState(false);
  /** Đang đổi lựa chọn cọc (thường ↔ chốt nhanh) khi chưa có tiền về. */
  const [changingDeposit, setChangingDeposit] = useState(false);

  /** Gọi một hành động của khách; backend trả lịch đã cập nhật ⇒ ghi thẳng vào cache, không cần tải lại. */
  const act = async (fn: () => Promise<ApiResponse<TenantBooking>>, success: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast(errorText(res));
        return false;
      }
      primeApiData(bookingDef.key, res.data);
      invalidateTenantBookings();
      toast(success, "success");
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (query.state.status === "loading" || !now) {
    return (
      <div className={`wrap ${styles.page}`}>
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  if (query.state.status === "error" || !booking) {
    const missing = query.state.status === "error" && query.state.httpStatus === 404;
    return (
      <div className={`wrap ${styles.notFound}`}>
        <h1 className={styles.h1}>{missing ? "Không tìm thấy lịch hẹn" : "Không tải được lịch hẹn"}</h1>
        <p className="muted">
          {missing
            ? `Không có lịch hẹn mang mã ${refCode} trong tài khoản của bạn. Kiểm tra lại mã trong tin Zalo hoặc đăng nhập đúng tài khoản đã đặt.`
            : query.state.status === "error"
              ? query.state.message
              : "Đã có lỗi xảy ra."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {!missing && (
            <button type="button" className="btn btn-quiet" onClick={query.reload}>
              Thử lại
            </button>
          )}
          <Link href="/booking" className="btn btn-primary">
            Về lịch của tôi
          </Link>
        </div>
      </div>
    );
  }

  const unit = toUnit(booking.unit);
  const zoneName = unit.zoneName || zoneById(unit.zoneId)?.name || "Ocean Park 1";
  const host = booking.host;
  const meta = STATUS_META[booking.status];
  const steps = buildTimeline(booking);
  const terminal = TERMINAL.includes(booking.status);
  const current = terminal ? -1 : steps.findIndex((s) => !s.done);
  const slotMs = new Date(booking.slot).getTime();
  const slaLeft = 180_000 - (now - new Date(booking.createdAt).getTime());
  const notices = bookingZaloThread(booking);
  const editable = booking.canModify;
  const similar = terminal ? similarUnits(catalog.units, unit, 2) : [];
  const chainUnits = booking.status === "completed" ? chainViewingUnits(catalog.units, unit, 3) : [];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Sảnh toà ${unit.building} Vinhomes Ocean Park`)}`;
  const deposit = booking.deposit;
  const holdHours = deposit?.holdHours ?? unit.holdHours;
  const outcome = deposit?.outcome;
  const fastClose = deposit?.fastClose;
  // Chốt nhanh mà tiền về sau hạn báo giá ⇒ backend đã hoàn (không ghi paidAt vì căn chưa từng khoá), lịch vẫn closing;
  // khách chọn lại được. Hoàn vì lý do khác (thua First-to-Pay, Admin huỷ) thì lịch không còn closing.
  const quoteMissed = outcome === "refunded" && !!fastClose && booking.status === "closing";
  const awaitingHost = booking.status === "pending" && !host;

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
                {awaitingHost
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

            {/* 1. closing & chưa đồng ý điều khoản cọc: tick điều khoản ngay trước khi quét VietQR (không ký thỏa thuận riêng) */}
            {booking.status === "closing" && (!deposit || changingDeposit || quoteMissed) && (
              <DepositTermsBox
                refCode={booking.ref}
                unitCode={unit.code}
                currentFast={changingDeposit ? !!fastClose : false}
                onCancel={changingDeposit ? () => setChangingDeposit(false) : undefined}
                onSuccess={(next) => {
                  setChangingDeposit(false);
                  primeApiData(bookingDef.key, next);
                  invalidateTenantBookings();
                }}
              />
            )}

            {/* 2. closing & đã đồng ý điều khoản: VietQR động do backend phát */}
            {booking.status === "closing" && deposit && outcome === "awaiting_payment" && !changingDeposit && (
              <div className={styles.qr} style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }}>
                <VietQR
                  amount={deposit.amount}
                  content={deposit.transferContent}
                  qrRef={deposit.qrRef}
                  qrUrl={deposit.vietqr?.qrUrl}
                  accountNo={deposit.vietqr?.accountNo}
                  accountName={deposit.vietqr?.accountName}
                  bankName={deposit.vietqr?.bankName}
                />
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <b style={{ color: "var(--ink)" }}>Đang chờ thanh toán cọc...</b>
                  <p className="muted xs" style={{ maxWidth: 480, margin: "4px auto 0" }}>
                    Chuyển khoản {vnd(deposit.amount)}đ (Tiền cọc bảo đảm) vào tài khoản định danh nền tảng. Căn được giữ riêng cho bạn {holdHours} giờ
                    kể từ khi ngân hàng báo có; khi ký Hợp đồng thuê, khoản này chuyển 100% thành cọc bảo đảm, không trừ vào tiền thuê.
                  </p>
                  {fastClose && (
                    <p className="xs" style={{ maxWidth: 480, margin: "8px auto 0", color: "var(--amber-900, #78350f)" }}>
                      Chốt nhanh: cọc đã giảm {vnd(fastClose.depositDiscount)}đ (từ {vnd(fastClose.baseAmount)}đ).
                      {fastClose.quoteExpiresAt && (
                        <>
                          {" "}Chuyển trước <b>{fmtDateTime(fastClose.quoteExpiresAt)}</b>, quá hạn sẽ được hoàn tiền và căn không bị khoá.
                        </>
                      )}{" "}
                      Khi ký hợp đồng bạn chọn kỳ thanh toán 1/3/6 tháng để được giảm thêm giá thuê.
                    </p>
                  )}
                  {/* Cọc trực tiếp trên trang căn chỉ có chốt nhanh ⇒ không đổi sang cọc thường. */}
                  {!booking.direct && (
                    <button type="button" className="btn btn-quiet btn-sm" style={{ marginTop: 8 }} onClick={() => setChangingDeposit(true)}>
                      Đổi lựa chọn cọc
                    </button>
                  )}
                </div>
                {/* MÔ PHỎNG VietQR: backend chỉ nhận lệnh này khi DEMO_TOOLS=true và không phải production. */}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.demoBtn}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const res = await tenantApi.demoPayDeposit(booking.ref);
                      setBusy(false);
                      if (!res.ok) return toast(errorText(res));
                      invalidateTenantBookings();
                      invalidateTenantUnit(unit.code);
                      query.reload();
                      toast(`Ngân hàng báo có (giả lập): căn đã khoá ${holdHours} giờ`, "success");
                    }}
                  >
                    Thử nghiệm: Giả lập ngân hàng báo có
                  </button>
                </div>
              </div>
            )}

            {/* 4. holding & active: Countdown + Action làm HĐ */}
            {booking.status === "holding" && outcome === "active" && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <CountdownBanner expiresAt={deposit?.expiresAt} holdHours={holdHours} now={now} />
                <div className="card" style={{ padding: 16, background: "var(--surface)", marginTop: 12 }}>
                  <div style={{ marginBottom: 12 }}>
                    <b style={{ fontSize: 16 }}>Căn hộ đang được giữ riêng cho bạn ({holdHours} giờ)</b>
                    <p className="muted xs" style={{ margin: "4px 0 0" }}>
                      {booking.kyc
                        ? `Khoản cọc ${vnd(deposit?.amount ?? 0)}đ đã nhận. Danh tính eKYC đã xác thực chính chủ. Mời bạn ký Hợp đồng thuê căn hộ.`
                        : `Khoản cọc ${vnd(deposit?.amount ?? 0)}đ đã nhận. Bạn có thể tiến hành xác minh CCCD (eKYC) và ký Hợp đồng thuê căn hộ.`}
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
            {(outcome === "forfeited" || outcome === "expired") && deposit?.paidAt && (
              <div className="card" style={{ padding: 16, background: "var(--coral-50, #fff5f5)", border: "1px solid var(--coral-200, #fed7d7)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--coral-800, #9b2c2c)" }}>
                  <ShieldAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <b style={{ fontSize: 16 }}>Đã hết hạn giữ căn</b>
                    <p style={{ fontSize: 13.5, margin: "4px 0 10px" }}>
                      Hết thời hạn giữ căn {holdHours} giờ mà chưa ký Hợp đồng thuê. Khoản cọc {vnd(deposit.amount)}đ không được hoàn theo Điều 328 Bộ luật Dân sự
                      2015: {vnd(Math.floor(deposit.amount / 2))}đ bồi thường cho chủ nhà, {vnd(deposit.amount - Math.floor(deposit.amount / 2))}đ chi phí vận hành nền tảng.
                    </p>
                    <Link href="/?view=all" className="btn btn-amber btn-sm">
                      Tìm căn khác
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Refunded: Bất khả kháng */}
            {outcome === "refunded" && (
              <div className="card" style={{ padding: 16, background: "var(--amber-50, #fef8ee)", border: "1px solid var(--amber-200, #fce1b2)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--amber-900, #78350f)" }}>
                  <ShieldAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <b style={{ fontSize: 16 }}>Đã huỷ giữ căn và hoàn cọc</b>
                    <p style={{ fontSize: 13.5, margin: "4px 0 10px" }}>
                      {quoteMissed
                        ? `Tiền cọc về sau hạn ưu đãi chốt nhanh${fastClose.quoteExpiresAt ? ` (${fmtDateTime(fastClose.quoteExpiresAt)})` : ""} nên căn không bị khoá; VinStay hoàn ${vnd(deposit.amount)}đ trong 24 giờ làm việc. Bạn có thể chọn lại cách cọc ở trên.`
                        : "Khoản cọc đã được huỷ và hoàn lại (căn vừa được khách khác cọc trước, chủ nhà không giữ cam kết hoặc bất khả kháng). VinStay hoàn tiền theo Điều 328 BLDS trong 24 giờ làm việc; nếu lỗi do chủ nhà, bạn được nhận thêm khoản phạt bằng tiền cọc."}
                    </p>
                    <Link href="/?view=all" className="btn btn-primary btn-sm">
                      Tìm căn khác
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Thanh toán kỳ đầu khi đã ký HĐ (leased): số tiền lấy từ Hợp đồng thuê thật */}
            {booking.status === "leased" && contract && (
              <div className="card" style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--line-strong)", marginTop: 12 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700 }}>Thanh toán kỳ đầu trước khi nhận nhà</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <VietQR
                    amount={contract.firstPaymentDue.total}
                    content={contract.firstPaymentDue.transferContent}
                    qrRef={`${booking.ref}-FP`}
                    qrUrl={deposit?.vietqr ? null : undefined}
                  />
                  <div style={{ background: "var(--paper-2)", borderRadius: "var(--r)", padding: "12px 16px" }}>
                    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", fontSize: 13.5 }}>
                      <dt className="muted">Tiền thuê kỳ 1 ({contract.paymentCycle} tháng)</dt>
                      <dd style={{ textAlign: "right", fontWeight: 600 }}>{vnd(contract.firstPaymentDue.rent)}đ</dd>

                      {contract.firstPaymentDue.depositTopUp > 0 && (
                        <>
                          <dt className="muted">Phần cọc bảo đảm còn thiếu</dt>
                          <dd style={{ textAlign: "right", fontWeight: 600 }}>{vnd(contract.firstPaymentDue.depositTopUp)}đ</dd>
                        </>
                      )}

                      <dt style={{ borderTop: "1px solid var(--line)", paddingTop: 8, fontWeight: 700 }}>Tổng thanh toán đợt đầu</dt>
                      <dd style={{ borderTop: "1px solid var(--line)", paddingTop: 8, textAlign: "right", fontWeight: 700, color: "var(--primary, #0f4c81)" }}>
                        {vnd(contract.firstPaymentDue.total)}đ
                      </dd>
                    </dl>
                  </div>
                  <p className="xs muted" style={{ margin: 0, textAlign: "center" }}>
                    Khoản {vnd(contract.convertedHolding)}đ đã chuyển 100% vào cọc bảo đảm — không trừ vào tiền thuê. Field Host xác nhận khoản
                    thanh toán kỳ đầu khi hẹn bàn giao nhà.
                  </p>
                </div>
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
                      Căn hộ đã được mở lại đón khách khác. VinStay AI đã chọn sẵn các căn đang trống phù hợp nhất bên dưới — đặt lịch
                      ngay để Host <b>{host?.name ?? "nội khu"}</b> dẫn bạn xem tiếp:
                    </p>
                  </div>
                </div>

                {/* DANH SÁCH 3 CĂN GỢI Ý XEM NGAY TẠI CHỖ (HIỂN THỊ TRỰC TIẾP KÈM ẢNH) */}
                {chainUnits.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--kelp-800, #065f46)", display: "flex", alignItems: "center", gap: 6 }}>
                        <Sparkles size={16} style={{ color: "var(--kelp-600, #059669)" }} /> Căn tương đương đang trống lân cận
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {chainUnits.map((u) => {
                        const isSameBldg = u.building === unit.building;
                        const cost = allInCost(u, { ...DEFAULT_HOUSEHOLD, persons: booking.contact.persons });
                        return (
                          <div
                            key={u.code}
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
                                <Link
                                  href={`/units/${encodeURIComponent(u.code)}?book=1`}
                                  className="btn btn-success btn-sm"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                                >
                                  <Sparkles size={14} /> Đặt xem căn này <ArrowRight size={14} />
                                </Link>
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
              <Link href={`/units/${encodeURIComponent(unit.code)}`} className={styles.thumb} aria-label={`Xem căn ${unitAddress(unit)}`}>
                <VerifiedPhoto unit={unit} sizes="140px" stamp="none" className={styles.thumbFrame} />
              </Link>
              <dl className={styles.facts}>
                <div>
                  <dt>Căn hộ</dt>
                  <dd>{unitAddress(unit)}</dd>
                  <dd className="muted small">{zoneName}</dd>
                </div>
                <div>
                  <dt>{booking.direct ? "Chốt cọc lúc" : "Thời gian"}</dt>
                  <dd>
                    {fmtTime(booking.slot)} · {weekday(booking.slot)}, {fmtDateTime(booking.slot).split(" · ")[1]}
                  </dd>
                  <dd className="muted small">{booking.direct ? "Chốt cọc nhanh, không cần xem trực tiếp" : dayLabel(booking.slot, now)}</dd>
                </div>
                <div>
                  <dt>Field Host</dt>
                  {booking.direct ? (
                    <>
                      <dd className="muted">Field Host phân khu</dd>
                      <dd className="muted small">Hẹn bàn giao và lập Hộ chiếu bàn giao số khi bạn nhận nhà</dd>
                    </>
                  ) : !host ? (
                    <>
                      <dd className="muted">Đang phân bổ...</dd>
                      <dd className="muted small">Tự động chọn Host gần nhất</dd>
                    </>
                  ) : (
                    <>
                      <dd>{host.name}</dd>
                      {host.rating != null && (
                        <dd className="muted small">
                          <Star size={12} fill="currentColor" style={{ color: "var(--amber)", verticalAlign: "-1px" }} />{" "}
                          {String(host.rating).replace(".", ",")} · liên lạc qua Zalo VinStay
                        </dd>
                      )}
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
                  disabled={busy}
                  onClick={() => void act(() => tenantApi.lobbyCheckIn(booking.ref), "Đã báo Host — Host đang xuống sảnh đón bạn")}
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
                <Link href={`/units/${encodeURIComponent(unit.code)}?book=1`} className="btn btn-amber btn-sm">
                  Đặt lịch khác
                </Link>
              )}
            </div>

          </section>

          {/* HỒ SƠ CỦA BẠN (KHI ĐÃ KÝ HỢP ĐỒNG HOẶC eKYC) */}
          {(contract || booking.kyc) && (
            <section className={`card ${styles.block}`}>
              <h2>Hồ sơ của bạn</h2>
              <ul className={styles.docs}>
                {contract && (
                  <li>
                    <FileText size={18} />
                    <div>
                      <b>Hợp đồng thuê {contract.contractNumber}</b>
                      <p className="muted small">
                        {contract.months} tháng · {vnd(contract.monthlyRent)}đ/tháng · cọc bảo đảm {vnd(contract.securityDeposit)}đ (đã nhận{" "}
                        {vnd(contract.convertedHolding)}đ khi chốt cọc)
                      </p>
                    </div>
                    {contract.pdf.ready ? (
                      <a className="btn btn-quiet btn-sm" href={tenantApi.contractPdfUrl(contract.id)} target="_blank" rel="noreferrer">
                        Tải PDF
                      </a>
                    ) : (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => invalidateTenantContracts()}>
                        PDF đang tạo · thử lại
                      </button>
                    )}
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
          {booking.status === "leased" && (
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
                <h2>Đánh giá Field Host {host?.name ?? ""}</h2>
                <div className={styles.stars} role="radiogroup" aria-label="Chấm sao">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={false}
                      aria-label={`${n} sao`}
                      disabled={busy}
                      onClick={() => void act(() => tenantApi.rateBooking(booking.ref, n), "Cảm ơn bạn đã đánh giá")}
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
                {similar.map((u: UnitWithExtras) => (
                  <UnitCard key={u.code} unit={u} cost={allInCost(u, DEFAULT_HOUSEHOLD)} />
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
                    {booking.rating ? "Cảm ơn bạn đã đánh giá Host!" : `Đánh giá buổi hỗ trợ của Field Host ${host?.name ?? ""}`}
                  </h3>
                  <p className="muted xs" style={{ margin: "4px 0 0", maxWidth: 440 }}>
                    {booking.rating
                      ? `Bạn đã đánh giá ${booking.rating}★ cho Host ${host?.name ?? ""}. Phản hồi của bạn giúp VinStay nâng cao chuẩn phục vụ tại sảnh.`
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
                        disabled={busy}
                        onClick={() => void act(() => tenantApi.rateBooking(booking.ref, n), "Cảm ơn bạn đã đánh giá Host!")}
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
            <h2 className={styles.h2s}>Tin Zalo gửi tới {booking.contact.phoneMasked}</h2>
            <ZaloThread
              notices={notices}
              now={now}
              onAction={(_, a) =>
                void (a.id === "arrived"
                  ? act(() => tenantApi.lobbyCheckIn(booking.ref), "Đã báo Host — Host đang xuống sảnh đón bạn")
                  : act(() => tenantApi.requestLate(booking.ref), "Đã báo Host bạn đến trễ 10 phút"))
              }
              actionsDisabled={booking.status !== "confirmed" || busy}
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
        onConfirm={async (reason) => {
          if (await act(() => tenantApi.cancelBooking(booking.ref, reason), "Đã huỷ lịch xem")) setModal(null);
        }}
      />

      {/* MODAL ĐỔI GIỜ */}
      <RescheduleModal
        open={modal === "reschedule"}
        onClose={() => setModal(null)}
        now={now}
        unitCode={unit.code}
        onConfirm={async (slot) => {
          if (await act(() => tenantApi.rescheduleBooking(booking.ref, slot), "Đã đổi giờ, Host sẽ xác nhận lại")) setModal(null);
        }}
      />

      {/* MODAL LEASE WIZARD */}
      <Modal
        open={modal === "leaseWizard"}
        onClose={() => setModal(null)}
        variant="wide"
        title="Làm hợp đồng thuê căn hộ"
        description={`Ký hợp đồng thuê chính thức căn ${unitAddress(unit)}`}
      >
        <LeaseWizardFlow
          booking={booking}
          unit={unit}
          now={now}
          onChanged={(next) => {
            primeApiData(bookingDef.key, next);
            invalidateTenantBookings();
            invalidateTenantContracts();
          }}
          onDone={() => setModal(null)}
        />
      </Modal>

    </div>
  );
}

// ─── COMPONENT CON: COUNTDOWN BANNER ──────────────────────────────────────────────────────────

function CountdownBanner({ expiresAt, holdHours, now }: { expiresAt?: string; holdHours: number; now: number }) {
  const msLeft = expiresAt ? Math.max(0, Date.parse(expiresAt) - now) : 0;

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
  onChanged,
  onDone,
}: {
  booking: TenantBooking;
  unit: UnitWithExtras;
  now: number;
  onChanged: (booking: TenantBooking) => void;
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
          2. Thiết lập điều khoản & Ký hợp đồng {booking.contractId && <Check size={14} />}
        </button>
      </div>

      {step === "kyc" && (
        <KycCapture
          booking={booking}
          onDone={(next) => {
            onChanged(next);
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
          onSigned={(next) => {
            onChanged(next);
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
  unitCode,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  now: number;
  unitCode: string;
  onConfirm: (slot: string) => void;
}) {
  const [slot, setSlot] = useState<string | null>(null);
  const busy = useApiQuery(tenantQueries.busySlots(unitCode), open);
  const busySlots = busy.state.status === "ready" ? busy.state.data.slots : [];
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
      <SlotPicker now={now} value={slot} onChange={setSlot} busySlots={busySlots} />
    </Modal>
  );
}
