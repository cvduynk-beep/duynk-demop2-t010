"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Field";
import { KeyValue } from "@/components/ui/KeyValue";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/client";
import { fmtDateTime, vnd } from "@/lib/format";
import {
  REASON_MAX,
  changeLabel,
  invalidateHoldPolicy,
  isDirty,
  saveHoldPolicy,
  saveOutcome,
  scopeLabel,
  useHoldPolicy,
  validateHoldPolicy,
  type HoldPolicy,
  type HoldPolicyChange,
  type HoldPolicyField,
} from "@/lib/admin/settings";
import styles from "./Admin.module.css";

const ROLE_LABEL: Record<string, string> = { ops_admin: "Quản trị vận hành" };

/**
 * Còn thay đổi chưa lưu: hỏi trước khi tải lại / đóng tab (beforeunload) và trước khi bấm link nội bộ (Next `<Link>` điều
 * hướng phía client nên beforeunload không chạy) — chặn ở pha capture của document, trước handler của React.
 */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || a.pathname === window.location.pathname) return;
      if (!window.confirm("Thay đổi chính sách giữ chỗ chưa được lưu. Rời trang?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

function HoldPolicyForm({ policy }: { policy: HoldPolicy }) {
  const [hours, setHours] = useState(String(policy.defaultHours));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<HoldPolicyField, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Chặn bấm trùng ngay trong cùng một tick (trước khi state `submitting` kịp khoá nút). */
  const inFlight = useRef(false);

  const dirty = isDirty(hours, reason, policy.defaultHours);
  useUnsavedGuard(dirty);

  const next = Number(hours.trim());

  const review = (e: FormEvent) => {
    e.preventDefault();
    const v = validateHoldPolicy(hours, reason, policy.minHours, policy.maxHours);
    setErrors(v ?? {});
    if (v) return;
    if (next === policy.defaultHours) {
      setErrors({ defaultHours: `Đang là ${policy.defaultHours} giờ — nhập giá trị khác để thay đổi.` });
      return;
    }
    setNotice(null);
    setConfirming(true);
  };

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      const out = saveOutcome(await saveHoldPolicy({ defaultHours: next, reason: reason.trim(), version: policy.version }));
      if (out.kind === "ok") {
        toast(`Đã lưu: giữ chỗ mặc định ${out.policy.defaultHours} giờ cho cọc tạo từ bây giờ`, "success");
        setReason("");
        setHours(String(out.policy.defaultHours));
        setConfirming(false);
        invalidateHoldPolicy();
      } else if (out.kind === "conflict") {
        setConfirming(false);
        const l = out.latest;
        setNotice(
          l
            ? `${out.message} Hiện tại: ${l.defaultHours} giờ${l.updatedBy?.name ? ` · ${l.updatedBy.name}` : ""}${l.updatedAt ? ` · ${fmtDateTime(l.updatedAt)}` : ""}.`
            : out.message,
        );
        invalidateHoldPolicy(); // tải version mới; giữ nguyên số admin vừa nhập để lưu lại có chủ đích
      } else if (out.kind === "field") {
        setConfirming(false);
        setErrors(out.errors);
      } else {
        setConfirming(false);
        setNotice(out.message);
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={review} noValidate style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
        {notice && (
          <p className={`small ${styles.warnText}`} role="alert">
            <AlertTriangle size={14} /> {notice}
          </p>
        )}
        <Field label={`Thời gian giữ chỗ mặc định (${policy.minHours}–${policy.maxHours} giờ)`} error={errors.defaultHours}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              inputMode="numeric"
              min={policy.minHours}
              max={policy.maxHours}
              step={1}
              className="input"
              value={hours}
              aria-invalid={!!errors.defaultHours}
              onChange={(e) => {
                setHours(e.target.value);
                setErrors((p) => ({ ...p, defaultHours: undefined }));
              }}
              style={{ width: 140 }}
            />
            <span className="small muted">giờ</span>
          </div>
        </Field>
        <Field label="Lý do thay đổi (lưu vào nhật ký)" error={errors.reason} hint={`${reason.trim().length}/${REASON_MAX} ký tự`}>
          <textarea
            className="input"
            rows={2}
            maxLength={REASON_MAX + 50}
            value={reason}
            aria-invalid={!!errors.reason}
            placeholder="Ví dụ: Mùa cao điểm, rút ngắn để căn quay vòng nhanh"
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((p) => ({ ...p, reason: undefined }));
            }}
          />
        </Field>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || submitting}>
            Lưu cài đặt
          </button>
          {dirty && <span className="badge badge-amber-soft">Chưa lưu</span>}
        </div>
      </form>

      {confirming && (
        <Modal
          open
          onClose={submitting ? () => {} : () => setConfirming(false)}
          title="Xác nhận đổi thời gian giữ chỗ"
          description={`${policy.defaultHours} giờ → ${next} giờ (mặc định toàn sàn)`}
          footer={
            <>
              <button type="button" className="btn btn-quiet" disabled={submitting} onClick={() => setConfirming(false)}>
                Huỷ
              </button>
              <button type="button" className="btn btn-primary" disabled={submitting} aria-busy={submitting} onClick={() => void save()}>
                {submitting ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </>
          }
        >
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Chỉ áp dụng cho khoản cọc giữ chỗ tạo <b>sau</b> khi lưu, ở các căn không có thời gian riêng.</li>
            <li>Cọc đang chờ thanh toán và căn đang được giữ <b>giữ nguyên</b> số giờ đã chốt trong điều khoản khách đã đồng ý.</li>
            <li>Lý do: “{reason.trim().replace(/\s+/g, " ")}”</li>
          </ul>
        </Modal>
      )}
    </>
  );
}

const historyColumns: DataTableColumn<HoldPolicyChange>[] = [
  { key: "at", header: "Thời gian", render: (c) => fmtDateTime(c.at) },
  { key: "by", header: "Người thực hiện", render: (c) => c.actorName ?? "—" },
  { key: "scope", header: "Phạm vi", render: (c) => (c.scope === "default" ? <b>{scopeLabel(c)}</b> : scopeLabel(c)) },
  { key: "change", header: "Thay đổi", render: (c) => changeLabel(c) },
  { key: "reason", header: "Lý do", render: (c) => c.reason ?? <span className="muted">—</span> },
];

/** `/admin/settings`: tài khoản đang đăng nhập + chính sách giữ chỗ thật (`/admin/settings/hold-policy`). */
export function AdminSettings() {
  const session = useSession();
  const policy = useHoldPolicy();
  const me = session.user;
  const p = policy.state.status === "ready" ? policy.state.data : null;

  return (
    <div className={styles.page}>
      <PageHeader title="Cài đặt" description="Tài khoản quản trị và chính sách giữ chỗ của nền tảng." />

      <Section title="Tài khoản quản trị">
        <KeyValue
          items={[
            { label: "Họ và tên", value: me?.fullName ?? "—" },
            { label: "Email", value: me?.email ?? "—" },
            { label: "Vai trò", value: me?.role ? ROLE_LABEL[me.role] ?? me.role : "—" },
          ]}
        />
      </Section>

      <Section
        title="Thời gian giữ chỗ toàn sàn"
        description="Số giờ căn được khoá sau khi ngân hàng báo có cọc giữ chỗ, áp dụng cho căn không đặt thời gian riêng (chỉnh riêng từng căn ở Kho căn)."
      >
        {policy.state.status === "loading" && <div className="skeleton" style={{ height: 220, borderRadius: 16 }} aria-busy="true" aria-label="Đang tải chính sách giữ chỗ" />}
        {policy.state.status === "error" && (
          <div className={`card ${styles.widgetError}`} role="alert">
            <b>Không tải được chính sách giữ chỗ</b>
            <p className="small">{policy.state.message}</p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={policy.reload}>
              Thử lại
            </button>
          </div>
        )}
        {p && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <KeyValue
              items={[
                {
                  label: "Đang áp dụng",
                  value: (
                    <span>
                      <b>{p.defaultHours} giờ</b>
                      {p.isDefault && <span className="muted"> (mặc định hệ thống, chưa ai thay đổi)</span>}
                    </span>
                  ),
                },
                {
                  label: "Cập nhật lần cuối",
                  value: p.updatedAt ? `${fmtDateTime(p.updatedAt)} · ${p.updatedBy?.name ?? "Không rõ"}` : "Chưa có",
                },
                { label: "Tiền cọc giữ chỗ", value: `${vnd(p.holdingDepositAmount)}đ (cố định, không chỉnh được)` },
              ]}
            />
            {/* Không đặt key theo version: sau 409 form giữ số admin vừa nhập + thông báo, chỉ `version` mới đổi theo server. */}
            <HoldPolicyForm policy={p} />
          </div>
        )}
      </Section>

      <Section title="Nhật ký thay đổi thời gian giữ chỗ (10 lần gần nhất)" flush>
        {p ? (
          <DataTable<HoldPolicyChange>
            columns={historyColumns}
            rows={p.history}
            empty={<span className="muted">Chưa có thay đổi nào.</span>}
          />
        ) : (
          <p className="small muted" style={{ padding: 16 }}>
            {policy.state.status === "error" ? "Không tải được nhật ký." : "Đang tải…"}
          </p>
        )}
      </Section>

      <Section title="Tham số khác">
        <p className="small muted" style={{ margin: 0 }}>
          Thù lao và hoa hồng Field Host chỉnh được tại{" "}
          <Link href="/admin/commission" className="link">
            Biến phí Host
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
