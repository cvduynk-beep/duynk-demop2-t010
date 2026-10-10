"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSignature,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import { Columns } from "@/components/charts/Columns";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { CONSIGN_STATUS_META } from "@/components/consign/status";
import { DEMO_USERS } from "@/lib/mock/actors";
import { fmtTime, relTime, vnd, vndShort } from "@/lib/mock/format";
import {
  holdMsLeft,
  isOpenBooking,
  monthlyRent,
  noticesFor,
  occupancy,
  unitDisplayStatus,
} from "@/lib/mock/selectors";
import {
  landlordConsignments,
  landlordUnitRows,
  type LandlordUnitRow,
} from "@/lib/mock/selectors-landlord";
import { PASSPORT_ITEMS } from "@/lib/landlord/labels";
import { LANDLORD_HISTORY, SERVICE_FEE_RATE } from "@/lib/mock/stats";
import { useMock } from "@/lib/mock/store";
import { unitAddress, type Unit } from "@/lib/mock/units";
import { useNow } from "@/lib/useNow";
import styles from "./Landlord.module.css";

const LID = DEMO_USERS.landlord.refId!;

const monthLabels = (now: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (n - 1 - i), 1);
    return `T${d.getMonth() + 1}`;
  });

export function LandlordDashboard() {
  const state = useMock();
  const now = useNow(60_000);

  // Trạng thái mở Hộ chiếu bàn giao số
  const [showPassportModal, setShowPassportModal] = useState(false);
  const [selectedPassportUnit, setSelectedPassportUnit] = useState<Unit | null>(null);

  // Trạng thái gợi ý AI Dynamic Pricing
  const [aiPriceApplied, setAiPriceApplied] = useState(false);
  const [dismissAiInsight, setDismissAiInsight] = useState(false);

  if (!state.ready || !now) return <div className="skeleton" style={{ height: 480 }} />;

  const rows = landlordUnitRows(state, LID);
  const occ = occupancy(state, rows.map((r) => r.unit));
  const rent = monthlyRent(state, LID);
  const mine = landlordConsignments(state, LID);
  const inProgress = mine.filter((c) => c.status !== "approved");
  const feed = noticesFor(state, "landlord", LID).slice(0, 8);
  const history = LANDLORD_HISTORY[LID];
  const series = [...history, rent].map((v, i, arr) => ({
    label: monthLabels(now, arr.length)[i],
    value: Math.round(v * (1 - SERVICE_FEE_RATE)),
  }));

  const handleOpenPassport = (unit?: Unit) => {
    if (unit) {
      setSelectedPassportUnit(unit);
    } else {
      const rentedRow = rows.find((r) => unitDisplayStatus(state, r.unit) === "rented");
      setSelectedPassportUnit(rentedRow ? rentedRow.unit : rows[0]?.unit ?? null);
    }
    setShowPassportModal(true);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tổng quan"
        description="Bạn ở nhà 100%: Field Host đón khách, mở cửa và báo bạn từng bước qua Zalo."
        actions={
          <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleOpenPassport()}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ShieldCheck size={16} style={{ color: "var(--kelp)" }} />
              Hộ chiếu bàn giao số
            </button>
            <Link href="/landlord/units" className="btn btn-quiet btn-sm">
              Tất cả căn ({rows.length})
            </Link>
          </div>
        }
      />

      {inProgress.length > 0 && (
        <ul className={styles.alerts}>
          {inProgress.map((c) => {
            const meta = CONSIGN_STATUS_META[c.status];
            return (
              <li key={c.id}>
                <FileSignature size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
                    <b>
                      Căn {c.building} · Tầng {c.floor} · Căn {c.door}
                    </b>
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  </div>
                  <p className="small muted" style={{ margin: "var(--s-1) 0 0" }}>
                    {meta.landlordHint}
                  </p>
                </div>
                {c.status === "draft" ? (
                  <Link href={`/landlord/consign?draft=${c.id}`} className="btn btn-amber btn-sm">
                    Ký ngay <ArrowRight size={14} />
                  </Link>
                ) : (
                  <Link href={`/landlord/consignments/${c.id}`} className="btn btn-secondary btn-sm">
                    Chi tiết <ArrowRight size={14} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.kpis}>
        <StatTile
          hero
          label="Thu tiền thuê tháng này"
          value={vndShort(Math.round(rent * (1 - SERVICE_FEE_RATE)))}
          delta={{ text: "sau phí dịch vụ ký gửi", tone: "flat" }}
          spark={series.slice(-6).map((s) => s.value)}
        />
        <StatTile
          label="Đang cho thuê"
          value={String(occ.rented)}
          unit={`/ ${rows.length}`}
          delta={{ text: "1 căn có Hộ chiếu số", tone: "good", dir: "up" }}
        />
        <StatTile
          label="Đang giữ căn"
          value={String(occ.holding)}
          delta={{ text: "khách đã chuyển cọc, chờ ký hợp đồng", tone: "flat" }}
        />
        <StatTile
          label="Còn trống, đang mở khách"
          value={String(occ.available)}
          delta={{ text: "Host đón khách thay bạn", tone: "good", dir: "up" }}
        />
      </div>

      {/* Gợi ý thông minh từ AI (Dynamic Pricing / Feedback Insight) */}
      {!dismissAiInsight && (
        <section className={styles.aiCard} aria-label="Gợi ý tối ưu giá từ VinStay AI">
          <div className={styles.aiHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className={styles.aiBadge}>
                <Sparkles size={13} /> AI Matchmaker · Dynamic Deal Engine
              </span>
              <span className="muted xs">Cập nhật theo phản hồi khách xem thực địa</span>
            </div>
            <button
              type="button"
              onClick={() => setDismissAiInsight(true)}
              className="icon-btn"
              title="Tạm ẩn gợi ý"
              style={{ width: 24, height: 24, padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>

          <div className={styles.aiGrid}>
            <div>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
                Phát hiện căn VHOP-S1.02-1007 có khách quan tâm nhưng chưa chốt cọc vì giá
              </h3>
              <p className="small" style={{ margin: "0 0 8px", color: "var(--ink-700, #475569)", lineHeight: 1.5 }}>
                Buổi xem lúc 10:30 vừa qua ghi nhận: <b>Khách rất ưng nội thất &amp; vị trí nhưng do dự vì giá chào 7.5tr/tháng</b> (cao hơn ~400k so với mặt bằng layout 1PN+ cùng phân khu Sapphire 1).
              </p>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--coral, #dc2626)" }}>
                  <TrendingDown size={15} />
                  <span>Rủi ro trống phòng: <b>Mất trắng ~7.5tr/tháng</b> + phí BQL nếu kéo dài 15–30 ngày</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--kelp, #059669)" }}>
                  <Clock size={15} />
                  <span>Nếu chỉnh sang <b>7.100.000đ</b>: Kích hoạt nhãn <b>&quot;Căn hời phân khu&quot;</b>, tỷ lệ chốt cọc đạt <b>88% trong 5 ngày</b> (có 2 khách trong Waitlist F2)</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 210, alignSelf: "center" }}>
              {aiPriceApplied ? (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "var(--r)",
                    color: "var(--kelp)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <CheckCircle2 size={16} /> Đã áp dụng 7.1tr &amp; bật nhãn Căn hời
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAiPriceApplied(true);
                      toast("Đã áp dụng mức giá 7.100.000đ/tháng và kích hoạt nhãn Căn hời phân khu!", "success");
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600 }}
                  >
                    <Sparkles size={14} /> Áp dụng giá 7.1tr
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissAiInsight(true)}
                    className="btn btn-quiet btn-xs"
                    style={{ fontSize: 12, color: "var(--ink-4, #64748b)" }}
                  >
                    Giữ nguyên giá 7.5tr
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <div className={styles.two}>
        <Columns
          title="Tiền thuê thu về mỗi tháng"
          subtitle="Sau khi trừ phí dịch vụ ký gửi; tháng hiện tại được nhấn"
          data={series}
          axisFormat={(v) => (v === 0 ? "0" : `${v / 1_000_000}tr`)}
          valueFormat={(v) => `${vnd(v)}đ`}
          seriesName="Thu về"
        />
        <Section title="Thông báo tức thì">
          <ul className={styles.feed}>
            {feed.map((n) => (
              <li key={n.id} className={n.tone ? styles[`t-${n.tone}`] : ""}>
                <div>
                  <b>{n.title}</b>
                  <p className="small muted">{n.body}</p>
                </div>
                <span className="xs muted">
                  {fmtTime(n.at)} · {relTime(n.at, now)}
                </span>
              </li>
            ))}
            {feed.length === 0 && (
              <li className="muted small">Chưa có thông báo. Khi Host mở cửa hoặc khách cọc, Zalo báo bạn ở đây.</li>
            )}
          </ul>
        </Section>
      </div>

      <Section
        title="Căn của bạn"
        description={rows.length > 5 ? `5 trên tổng ${rows.length} căn đã ký gửi` : undefined}
        actions={
          <Link href="/landlord/units" className="btn btn-quiet btn-sm">
            Xem tất cả <ArrowRight size={14} />
          </Link>
        }
        flush
      >
        <DataTable
          columns={[
            { key: "unit", header: "Căn", render: (r: LandlordUnitRow) => unitAddress(r.unit) },
            { key: "building", header: "Toà", render: (r: LandlordUnitRow) => r.unit.building },
            { key: "layout", header: "Loại căn", render: (r: LandlordUnitRow) => r.unit.layoutLabel },
            {
              key: "rent",
              header: "Giá thuê",
              align: "right",
              render: (r: LandlordUnitRow) => <span className="tnum">{vnd(r.rent)}đ</span>,
            },
            {
              key: "status",
              header: "Trạng thái",
              render: (r: LandlordUnitRow) => {
                const ds = unitDisplayStatus(state, r.unit);
                if (ds === "viewing") {
                  const openCount = state.bookings.filter((b) => b.unitId === r.unit.id && isOpenBooking(b)).length;
                  return (
                    <span className="badge badge-amber-soft">
                      Có khách xem · {openCount} lịch
                    </span>
                  );
                }
                if (ds === "holding") {
                  const holdingBooking = state.bookings.find(
                    (b) => b.unitId === r.unit.id && (b.status === "holding" || b.deposit?.paidAt)
                  );
                  const hours = holdingBooking ? Math.max(0, Math.ceil(holdMsLeft(holdingBooking, now) / 3_600_000)) : 48;
                  return <StatusBadge tone="warn">{`Đang giữ căn · còn ${hours} giờ`}</StatusBadge>;
                }
                if (ds === "rented") {
                  return <StatusBadge tone="ok">Đang cho thuê</StatusBadge>;
                }
                return <StatusBadge tone="neutral">Đang trống</StatusBadge>;
              },
            },
            {
              key: "passport",
              header: "Hộ chiếu số",
              render: (r: LandlordUnitRow) => {
                const isRented = unitDisplayStatus(state, r.unit) === "rented";
                return isRented ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleOpenPassport(r.unit);
                    }}
                    className="btn btn-quiet btn-xs"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--kelp)",
                      fontWeight: 600,
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      borderRadius: "var(--r)",
                      padding: "3px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <ShieldCheck size={13} /> Xem 10 mục
                  </button>
                ) : (
                  <span className="muted xs">—</span>
                );
              },
            },
          ]}
          rows={rows.slice(0, 5)}
          rowHref={(r) => `/landlord/units/${r.unit.id}`}
          empty="Bạn chưa ký gửi căn nào."
        />
      </Section>

      {/* Modal Lối tắt nhanh: Hộ chiếu bàn giao số (Digital Handover Passport) */}
      <Modal
        open={showPassportModal}
        onClose={() => {
          setShowPassportModal(false);
          setSelectedPassportUnit(null);
        }}
        title="Hộ chiếu bàn giao số (Digital Handover Passport)"
        description={
          selectedPassportUnit
            ? `Căn ${unitAddress(selectedPassportUnit)} · Vinhomes Ocean Park`
            : "Niêm phong hiện trạng 10 hạng mục nội thất nhúng Timestamp + Geofence GPS"
        }
        variant="wide"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 8 }}>
            <span className="muted xs" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <ShieldCheck size={14} style={{ color: "var(--kelp)" }} /> Mã hoá AES-256 · Có giá trị đối soát pháp lý
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowPassportModal(false);
                setSelectedPassportUnit(null);
              }}
            >
              Đóng
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "12px 14px",
              background: "var(--surface-2, #f8fafc)",
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "var(--r, 8px)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              fontSize: 12.5,
            }}
          >
            <div>
              <span className="muted" style={{ display: "block" }}>Căn hộ kiểm định</span>
              <b>{selectedPassportUnit ? unitAddress(selectedPassportUnit) : "VHOP-S1.03-1512"}</b>
            </div>
            <div>
              <span className="muted" style={{ display: "block" }}>Thời điểm lập hộ chiếu</span>
              <b>15/09/2026 14:30 (Timestamp chuẩn)</b>
            </div>
            <div>
              <span className="muted" style={{ display: "block" }}>Địa điểm Geofence GPS</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={12} style={{ color: "var(--lagoon)" }} /> Phân khu Sapphire, VHOP
              </span>
            </div>
            <div>
              <span className="muted" style={{ display: "block" }}>Field Host thực địa</span>
              <b>Lê Quốc Bảo (Thẻ cư dân H01)</b>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Hiện trạng 10 hạng mục nội thất trọng yếu:</span>
              <span className="badge badge-kelp" style={{ fontSize: 11 }}>10/10 Đạt chuẩn bàn giao</span>
            </div>
            <div className={styles.passportGrid}>
              {PASSPORT_ITEMS.map((item, idx) => (
                <div key={item} className={styles.passportItem}>
                  <CheckCircle2 size={16} style={{ color: "var(--kelp)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{idx + 1}. {item}</div>
                    <span className="muted xs">Đã chụp ảnh kiểm định · Nguyên vẹn khi bàn giao</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              background: "rgba(16, 185, 129, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "var(--r, 8px)",
              display: "flex",
              gap: 10,
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <Info size={18} style={{ color: "var(--kelp)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <b style={{ color: "var(--kelp)" }}>Bảo vệ tài sản chủ nhà (Quy chuẩn Điều 328 BLDS):</b>
              <p style={{ margin: "2px 0 0", color: "var(--ink-700, #334155)" }}>
                Ảnh chụp 10 hạng mục kèm timestamp là căn cứ pháp lý duy nhất khi đối soát trả phòng. Hư hỏng do bất cẩn (rách sofa, trầy sâu sàn gỗ, hỏng điều hoà...) sẽ tự động khấu trừ vào <b>Tiền Cọc Bảo Đảm Tài Sản</b> của khách. Hao mòn tự nhiên do chủ nhà chịu.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
