"use client";

import { useState, type CSSProperties } from "react";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { tenantQueries, invalidateTenantTerms } from "@/lib/tenant/queries";
import { tenantApi, errorText } from "@/lib/tenant/api";
import type { TenantBooking } from "@/lib/tenant/types";
import { vnd } from "@/lib/format";
import { toast } from "@/components/ui/Toast";

interface DepositTermsBoxProps {
  refCode: string;
  unitCode: string;
  /** Đang đổi lựa chọn trên khoản cọc chưa có tiền về: khoản hiện tại có phải chốt nhanh không. */
  currentFast?: boolean;
  onSuccess: (booking: TenantBooking) => void;
  onCancel?: () => void;
}

/**
 * Bước chốt cọc (cọc v2): khách chuyển thẳng Tiền cọc bảo đảm của căn. Nếu chủ nhà ủy quyền chốt nhanh, khách chọn được
 * "Chốt nhanh": tiền cọc giảm ~5% (backend tính, không lộ giá sàn), chỉ giữ nếu tiền về trong `quoteHours` giờ. Chu kỳ
 * 1/3/6 tháng (giảm giá thuê) chọn ở bước ký HĐ — ở đây chỉ xem trước. Tick điều khoản ngay trước khi quét VietQR.
 */
export function DepositTermsBox({ refCode, unitCode, currentFast, onSuccess, onCancel }: DepositTermsBoxProps) {
  const { state: termsState, reload: refetch } = useApiQuery(tenantQueries.depositTerms(unitCode));
  const { state: fastState } = useApiQuery(tenantQueries.fastClose(refCode));

  const [fastChosen, setFastChosen] = useState(currentFast ?? false);
  const [consent, setConsent] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (termsState.status === "loading") {
    return <div className="card skeleton" style={{ height: 260, padding: 18 }} />;
  }

  if (termsState.status !== "ready") {
    return (
      <div className="card" style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--danger)" }}>
        <p style={{ color: "var(--danger)", margin: "0 0 10px" }}>
          {termsState.status === "error" ? termsState.message : "Không thể tải điều khoản cọc."}
        </p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => refetch()}>
          Thử lại
        </button>
      </div>
    );
  }

  const terms = termsState.data;
  const items = terms.items || [];
  const houseRules = terms.houseRules || [];
  // Báo giá chốt nhanh lỗi/không đủ điều kiện ⇒ chỉ còn cọc thường (không chặn khách đặt cọc).
  const fast = fastState.status === "ready" && fastState.data.eligible && fastState.data.stage === "deposit" ? fastState.data : null;
  const useFast = !!fast && fastChosen;
  const amount = useFast ? fast.depositAfter : terms.amount;

  const handleAccept = async () => {
    if (!consent || submitting) return;
    setSubmitting(true);
    const res = await tenantApi.acceptDeposit(refCode, terms.version, useFast);
    setSubmitting(false);

    if (res.ok && res.data) {
      toast("Đã đồng ý điều khoản cọc, vui lòng quét VietQR để chuyển tiền cọc.", "success");
      onSuccess(res.data);
      return;
    }
    if (res.code === "terms_version_stale") {
      invalidateTenantTerms(unitCode);
      setConsent(false);
      await refetch();
    }
    if (res.code === "fast_close_unavailable") setFastChosen(false);
    toast(errorText(res, "Không thể tạo thanh toán VietQR. Vui lòng thử lại sau."));
  };

  const optionStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: "var(--r)",
    border: `1px solid ${active ? "var(--lagoon)" : "var(--line)"}`,
    background: active ? "var(--paper-2)" : "var(--surface)",
    cursor: "pointer",
    fontSize: 13.5,
    lineHeight: 1.45,
  });

  return (
    <div
      className="card"
      style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: "var(--r)", marginTop: 10 }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <ShieldCheck size={22} style={{ color: "var(--kelp)" }} />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Đặt cọc chốt căn ({terms.holdHours} giờ giữ căn)</h3>
      </div>

      {fast && (
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <legend className="small" style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={15} style={{ color: "var(--amber, #d97706)" }} /> Chủ nhà mở ưu đãi chốt nhanh cho căn này
          </legend>
          <label style={optionStyle(!fastChosen)}>
            <input type="radio" name="fastClose" checked={!fastChosen} onChange={() => setFastChosen(false)} style={{ marginTop: 3 }} />
            <span>
              <b>Cọc thường</b>: cọc {vnd(fast.deposit)}đ, giá thuê {vnd(fast.rent)}đ/tháng, chọn kỳ thanh toán khi ký hợp đồng.
            </span>
          </label>
          <label style={optionStyle(fastChosen)}>
            <input type="radio" name="fastClose" checked={fastChosen} onChange={() => setFastChosen(true)} style={{ marginTop: 3 }} />
            <span>
              <b>Chốt nhanh</b>: cọc <b>{vnd(fast.depositAfter)}đ</b>
              {fast.depositDiscount > 0 && <span className="muted"> (giảm {vnd(fast.depositDiscount)}đ)</span>}. Khi ký hợp đồng, chọn trả{" "}
              {fast.quotes.map((q, i) => (
                <span key={q.cycle}>
                  {i > 0 && (i === fast.quotes.length - 1 ? " hoặc " : ", ")}
                  {q.cycle} tháng/lần còn <b>{vnd(q.rent)}đ</b>
                </span>
              ))}
              /tháng.
            </span>
          </label>
          <p className="muted xs" style={{ margin: 0 }}>
            Giảm cọc chỉ giữ khi tiền cọc về trong {fast.quoteHours} giờ kể từ lúc bấm đồng ý; về muộn hơn sẽ được hoàn lại và căn không bị khoá.
            Kỳ thanh toán bạn chọn khi ký hợp đồng được giữ suốt hợp đồng.
          </p>
        </fieldset>
      )}

      <ul style={{ paddingLeft: 20, margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink)" }}>
        {items.map((it) => (
          <li key={it.id}>
            {it.text} {it.source && <span className="muted xs">({it.source})</span>}
          </li>
        ))}
      </ul>

      {houseRules.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setShowRules((prev) => !prev)}
            style={{ padding: "4px 8px", fontSize: 13 }}
          >
            {showRules ? "Ẩn nội quy căn hộ" : `Xem ${houseRules.length} nội quy căn hộ`}
          </button>
          {showRules && (
            <div style={{ marginTop: 10, padding: 12, background: "var(--paper-2)", borderRadius: "var(--r)", fontSize: 13, lineHeight: 1.5 }}>
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                {houseRules.map((rule) => (
                  <li key={rule.id} style={{ marginBottom: 8 }}>
                    <b>{rule.title}:</b> {rule.body} {rule.source && <span className="muted xs">({rule.source})</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

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
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
        <span>{terms.consentLabel}</span>
      </label>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        // Nhãn có số tiền ⇒ cho xuống dòng ở màn hẹp thay vì bị cắt chữ.
        style={{ whiteSpace: "normal", height: "auto", minHeight: 48, lineHeight: 1.3 }}
        disabled={!consent || submitting}
        onClick={handleAccept}
      >
        <Check size={18} /> {submitting ? "Đang xử lý..." : `Đồng ý và lấy mã VietQR (${vnd(amount)}đ)`}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-quiet btn-sm btn-block" style={{ marginTop: 8 }} onClick={onCancel} disabled={submitting}>
          Giữ lựa chọn hiện tại
        </button>
      )}
    </div>
  );
}
