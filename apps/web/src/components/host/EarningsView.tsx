"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, CreditCard, Database, ShieldCheck, Wallet } from "lucide-react";
import { STATUS_META } from "@/components/booking/status";
import { StatTile } from "@/components/charts/StatTile";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { hostApi } from "@/lib/apiClient";
import { DEMO_USERS } from "@/lib/mock/actors";
import { fmtDate, fmtDateTime, vnd } from "@/lib/mock/format";
import { hostBookings, hostEarnings } from "@/lib/mock/selectors";
import { useMock } from "@/lib/mock/store";
import type { Booking } from "@/lib/mock/types";
import { hostById, unitAddress, unitById } from "@/lib/mock/units";
import styles from "./Host.module.css";

const host = hostById(DEMO_USERS.host.refId!)!;

interface HostPayout {
  id: string;
  amount: number;
  period: string;
  status: string;
  createdAt: string;
}

interface HostLiveEarnings {
  hostId: string;
  fullName: string;
  rating: number;
  walletBalance: number;
  currentPeriod: string;
  payouts: HostPayout[];
}

export function EarningsView() {
  const state = useMock();
  const [liveData, setLiveData] = useState<HostLiveEarnings | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  useEffect(() => {
    let active = true;
    hostApi.getEarnings(host.id).then((res) => {
      if (!active) return;
      if (res.ok && res.data) {
        setLiveData(res.data);
        setIsLiveConnected(true);
      }
    }).catch(() => {
      // Fallback seamlessly to local mock state
    });
    return () => { active = false; };
  }, []);

  if (!state.ready) return <div className="skeleton" style={{ height: 280 }} />;
  const { fees } = state;
  const e = hostEarnings(state, host, fees);
  const deals = hostBookings(state, host.id).filter((b) => ["holding", "leased"].includes(b.status));
  const perDeal = Math.round(fees.dealCommission * e.multiplier);

  // Danh sách payouts từ backend hoặc fallback
  const payoutsList: HostPayout[] = (liveData?.payouts && liveData.payouts.length > 0)
    ? liveData.payouts
    : [
        {
          id: "pay-prev",
          amount: 2500000,
          period: "Tuần 39 / 2026",
          status: "PAID",
          createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        },
      ];

  const payoutColumns: DataTableColumn<HostPayout>[] = [
    {
      key: "period",
      header: "Kỳ đối soát",
      render: (p) => <b style={{ whiteSpace: "nowrap" }}>{p.period}</b>,
    },
    {
      key: "amount",
      header: "Số tiền",
      align: "right",
      render: (p) => <b className="num" style={{ whiteSpace: "nowrap" }}>{vnd(p.amount)}đ</b>,
    },
    {
      key: "createdAt",
      header: "Ngày chuyển khoản",
      render: (p) => <span className="small muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(p.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (p) => (
        <span
          className={`badge ${p.status === "PAID" ? "badge-kelp" : "badge-amber-soft"}`}
          style={{ whiteSpace: "nowrap" }}
        >
          {p.status === "PAID" ? "Đã chuyển VietQR" : "Chờ đối soát"}
        </span>
      ),
    },
  ];

  const dealColumns: DataTableColumn<Booking>[] = [
    {
      key: "unit",
      header: "Căn hộ",
      render: (b) => {
        const u = unitById(b.unitId);
        return <b style={{ whiteSpace: "nowrap" }}>{u ? unitAddress(u) : b.unitId}</b>;
      },
    },
    {
      key: "tenant",
      header: "Khách",
      render: (b) => <span style={{ whiteSpace: "nowrap" }}>{b.tenant.name}</span>,
    },
    {
      key: "date",
      header: "Ngày cọc",
      render: (b) => <span className="small muted" style={{ whiteSpace: "nowrap" }}>{b.deposit?.paidAt ? fmtDate(b.deposit.paidAt) : "—"}</span>,
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (b) => <span className={`badge ${STATUS_META[b.status].badge}`} style={{ whiteSpace: "nowrap" }}>{STATUS_META[b.status].label}</span>,
    },
    {
      key: "commission",
      header: "Hoa hồng",
      align: "right",
      render: () => <b className="num" style={{ whiteSpace: "nowrap" }}>+{vnd(perDeal)}đ</b>,
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Thu nhập Field Host"
        description={`Kỳ hiện tại: ${liveData?.currentPeriod || "Tuần 40 / 2026"} · Đối soát và chuyển khoản tự động vào 23:59 Chủ nhật hàng tuần`}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className={`badge ${isLiveConnected ? "badge-kelp" : "badge-plain"}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 12 }}
              title={isLiveConnected ? "Đồng bộ số dư ví & đối soát từ Backend DB (/api/v1/host/earnings)" : "Chế độ dự phòng client-side"}
            >
              <Database size={13} />
              {isLiveConnected ? "Live Wallet Synced" : "Client Fallback"}
            </span>
          </div>
        }
      />

      <div className={styles.kpis}>
        <StatTile
          hero
          label="Ví thu nhập khả dụng"
          value={vnd(liveData?.walletBalance ?? (e.total + 2500000))}
          unit="đ"
          delta={{ text: "Sẵn sàng rút / Chuyển khoản CN", tone: "good" }}
        />
        <StatTile label="Tạm tính tuần này" value={vnd(e.total)} unit="đ" delta={{ text: liveData?.currentPeriod || "Tuần 40 / 2026", tone: "good" }} />
        <StatTile label="Lượt dẫn phòng" value={String(e.viewings)} delta={{ text: `${vnd(fees.baseViewingFee)}đ / lượt`, tone: "flat" }} />
        <StatTile label="Deal chốt cọc" value={String(e.deals)} delta={{ text: `${vnd(fees.dealCommission)}đ / deal`, tone: "flat" }} />
        <StatTile
          label="Đánh giá"
          value={`${String(host.rating).replace(".", ",")}★`}
          delta={
            host.rating >= 4.8
              ? { text: `hệ số ×${String(fees.ratingMultiplier).replace(".", ",")}`, tone: "good", dir: "up" }
              : { text: "Chuẩn dịch vụ", tone: "good" }
          }
        />
      </div>

      <div className={styles.earningsLayout}>
        <Section title="Cách tính thù lao">
          <dl className={styles.lines}>
            <div>
              <dt>
                Thù lao dẫn khách
                <span className="muted xs">
                  {e.viewings} lượt × {vnd(fees.baseViewingFee)}đ
                </span>
              </dt>
              <dd className="num">{vnd(e.viewingFee)}đ</dd>
            </div>
            <div>
              <dt>
                Hoa hồng chốt cọc
                <span className="muted xs">
                  {e.deals} deal × {vnd(fees.dealCommission)}đ
                  {e.multiplier > 1 ? ` × ${String(e.multiplier).replace(".", ",")}` : ""}
                </span>
              </dt>
              <dd className="num">{vnd(e.commission)}đ</dd>
            </div>
            <div>
              <dt>
                Thưởng nóng chiến dịch
                <span className="muted xs">{vnd(fees.campaignBonus)}đ / deal (tối đa 3 deal)</span>
              </dt>
              <dd className="num">{vnd(e.bonus)}đ</dd>
            </div>
          </dl>
          <p className="muted xs">
            Mức thù lao do Admin cấu hình và có hiệu lực ngay với ticket mới. Chuyển khoản VietQR 24/7 trực tiếp vào tài khoản ngân hàng của Host.
          </p>
        </Section>

        <Section title="Deal gần đây" flush>
          <DataTable<Booking>
            columns={dealColumns}
            rows={deals}
            rowHref={(b) => `/host/viewing/${b.id}`}
            empty={
              <div className={styles.empty}>
                <Wallet size={26} />
                <b>Chưa có deal trong phiên này</b>
                <p className="muted small">Chốt một căn từ tab Lịch để thấy hoa hồng cộng vào đây.</p>
              </div>
            }
          />
        </Section>
      </div>

      <div style={{ marginTop: 24 }}>
        <Section title="Lịch sử đối soát & Thanh toán chuyển khoản" flush>
          <DataTable<HostPayout>
            columns={payoutColumns}
            rows={payoutsList}
            empty={
              <div className={styles.empty}>
                <CreditCard size={26} />
                <b>Chưa có kỳ đối soát nào</b>
                <p className="muted small">Lịch sử thanh toán VietQR sẽ hiển thị sau kỳ đối soát Chủ nhật đầu tiên.</p>
              </div>
            }
          />
        </Section>
      </div>
    </div>
  );
}
