"use client";

import Link from "next/link";
import { useMemo } from "react";
import { KeyValue } from "@/components/ui/KeyValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, vnd } from "@/lib/format";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { tenantApi } from "@/lib/tenant/api";
import { DEPOSIT_OUTCOME, depositRows, HANDOVER_ITEM_LABEL, type DepositRow } from "@/lib/tenant/contracts";
import { tenantQueries } from "@/lib/tenant/queries";
import type { TenantContract } from "@/lib/tenant/types";
import { unitAddress } from "@/lib/units";
import styles from "./AccountContracts.module.css";

/**
 * `/account/contracts`: cọc giữ chỗ (`/me/bookings`) + hợp đồng thuê (`/me/contracts`) + Hộ chiếu bàn giao
 * (`/handovers/contracts/:id`) — toàn bộ từ server. Danh bạ thợ và TK hoàn cọc chưa có nguồn dữ liệu thật ⇒ ẩn.
 * Hộ chiếu bàn giao chỉ hiện khi đã có biên bản thật (không vẽ hạng mục giả).
 */
export function AccountContracts() {
  const bookings = useApiQuery(tenantQueries.bookings());
  const contracts = useApiQuery(tenantQueries.contracts());
  const rows = useMemo(
    () => (bookings.state.status === "ready" && contracts.state.status === "ready" ? depositRows(bookings.state.data, contracts.state.data) : null),
    [bookings.state, contracts.state],
  );

  const header = <PageHeader title="Hợp đồng & tiền cọc" description="Theo dõi khoản cọc chốt căn, hợp đồng thuê và biên bản bàn giao của bạn." />;

  const failed = bookings.state.status === "error" ? bookings.state : contracts.state.status === "error" ? contracts.state : null;
  if (failed) {
    return (
      <div>
        {header}
        <Section>
          <div role="alert" style={{ textAlign: "center", padding: 24 }}>
            <p>{failed.message}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                bookings.reload();
                contracts.reload();
              }}
            >
              Thử lại
            </button>
          </div>
        </Section>
      </div>
    );
  }

  if (!rows) {
    return (
      <div>
        {header}
        <div className="skeleton" style={{ height: 320 }} aria-busy="true" />
      </div>
    );
  }

  return (
    <div>
      {header}
      {rows.length === 0 ? (
        <Section>
          <p className="muted">Chưa có khoản cọc hay hợp đồng nào. Khoản cọc chỉ phát sinh sau khi bạn xem căn cùng Field Host.</p>
          <Link href="/account/bookings" className="btn btn-quiet btn-sm">
            Xem lịch hẹn của tôi
          </Link>
        </Section>
      ) : (
        rows.map((row) => <DepositCard key={row.key} row={row} />)
      )}
    </div>
  );
}

function DepositCard({ row }: { row: DepositRow }) {
  const { booking, contract } = row;
  const unit = booking?.unit ?? contract?.unit;
  const deposit = booking?.deposit;
  const ref = booking?.ref ?? contract?.bookingRef;
  const outcome = deposit ? DEPOSIT_OUTCOME[deposit.outcome] : null;

  return (
    <Section title={unit ? unitAddress(unit) : "Căn hộ"} description={ref ? `Mã lịch hẹn ${ref}` : undefined}>
      <KeyValue
        items={[
          {
            label: "Cọc chốt căn",
            value: deposit ? (
              <>
                {vnd(deposit.amount)}đ · {outcome && <StatusBadge tone={outcome.tone}>{outcome.label}</StatusBadge>}
              </>
            ) : (
              "Chưa phát sinh"
            ),
          },
          ...(deposit?.paidAt ? [{ label: "Ngày nhận cọc", value: fmtDateTime(deposit.paidAt) }] : []),
          { label: "Điều khoản cọc", value: deposit?.termsAcceptedAt ? `Đã đồng ý ngày ${fmtDate(deposit.termsAcceptedAt)} (${deposit.termsVersion})` : "Chưa xác nhận" },
          {
            label: "Hợp đồng thuê",
            value: contract ? `${contract.contractNumber} · từ ${fmtDate(contract.startDate)} · ${contract.months} tháng · ${vnd(contract.monthlyRent)}đ/tháng` : "Chưa ký",
          },
          ...(contract
            ? [
                { label: "Tiền cọc bảo đảm", value: `${vnd(contract.securityDeposit)}đ` },
                { label: "Kỳ thanh toán đầu", value: `${vnd(contract.firstPaymentDue.total)}đ (tiền thuê ${vnd(contract.firstPaymentDue.rent)}đ + cọc còn thiếu ${vnd(contract.firstPaymentDue.depositTopUp)}đ)` },
              ]
            : []),
        ]}
      />

      {contract ? (
        <p className={`muted small ${styles.note}`}>
          Khoản cọc {vnd(contract.convertedHolding)}đ đã chuyển khi chốt căn được tính toàn bộ vào tiền cọc bảo đảm tài sản, không trừ vào tiền thuê tháng đầu.
        </p>
      ) : deposit ? (
        <p className={`muted small ${styles.note}`}>
          Khi ký hợp đồng thuê, {vnd(deposit.amount)}đ này chuyển toàn bộ thành tiền cọc bảo đảm tài sản, không trừ vào tiền thuê tháng đầu.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {ref && (
          <Link href={`/booking/${ref}`} className="btn btn-quiet btn-sm">
            Mở lịch hẹn
          </Link>
        )}
        {contract?.pdf.ready && (
          <a href={tenantApi.contractPdfUrl(contract.id)} className="btn btn-quiet btn-sm" target="_blank" rel="noreferrer">
            Tải PDF hợp đồng
          </a>
        )}
      </div>

      {contract && <HandoverPassport contract={contract} />}
    </Section>
  );
}

/** Chỉ hiện khi ĐÃ có biên bản thật; lỗi tải thì báo lỗi (không ẩn âm thầm). */
function HandoverPassport({ contract }: { contract: TenantContract }) {
  const query = useApiQuery(tenantQueries.handovers(contract.id));
  if (query.state.status === "loading") return null;
  if (query.state.status === "error") {
    return (
      <p className="small" role="alert">
        {query.state.message}{" "}
        <button type="button" className="btn btn-quiet btn-xs" onClick={query.reload}>
          Thử lại
        </button>
      </p>
    );
  }
  const handovers = query.state.data;
  if (handovers.length === 0) return null;

  return (
    <>
      {handovers.map((h) => (
        <div key={h.id}>
          <h3 className={styles.handoverTitle}>
            Hộ chiếu bàn giao · {h.handoverType === "CHECK_IN" ? "Nhận nhà" : "Trả nhà"} · {fmtDateTime(h.inspectedAt)}
          </h3>
          <ul className={styles.handoverList}>
            {h.items.map((item) => (
              <li key={item.id}>
                <span>
                  {HANDOVER_ITEM_LABEL[item.itemCategory] ?? item.itemCategory}
                  {item.conditionNote ? <span className="muted small"> · {item.conditionNote}</span> : null}
                  {item.photos.length > 0 && <span className="muted small"> · {item.photos.length} ảnh</span>}
                </span>
                <StatusBadge tone={item.isNormalWear ? "ok" : "warn"}>
                  {item.isNormalWear ? "Hao mòn tự nhiên" : `Hư hỏng · ${vnd(Number(item.deductionCost))}đ`}
                </StatusBadge>
              </li>
            ))}
            {h.utilityReadings.map((r) => (
              <li key={r.id}>
                <span>Công tơ {r.utilityType === "ELECTRICITY" ? "điện" : r.utilityType === "WATER" ? "nước" : r.utilityType}</span>
                <span className="num">{Number(r.meterIndex).toLocaleString("vi-VN")}</span>
              </li>
            ))}
          </ul>
          <p className="muted xs">{h.signedByTenantAt ? `Bạn đã ký xác nhận ngày ${fmtDate(h.signedByTenantAt)}.` : "Chưa ký xác nhận."}</p>
        </div>
      ))}
    </>
  );
}
