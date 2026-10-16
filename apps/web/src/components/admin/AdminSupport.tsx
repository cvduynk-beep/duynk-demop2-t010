"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { fmtDateTime } from "@/lib/format";
import {
  invalidateSupport,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_SLA_MS,
  SUPPORT_STATUS_LABEL,
  supportApi,
  useSupportRequests,
  type SupportRequest,
  type SupportStatus,
} from "@/lib/admin/support";
import { useNow } from "@/lib/useNow";
import { AdminQuery } from "./AdminQuery";

const TONE: Record<SupportStatus, "warn" | "info" | "ok"> = { open: "warn", in_progress: "info", resolved: "ok" };
const FILTERS: (SupportStatus | undefined)[] = [undefined, "open", "in_progress", "resolved"];

/** Hàng đợi "Gặp nhân viên" từ Vinny: nhận xử lý / đóng (kiểm version, audit ở backend). Dữ liệu thật, không mock. */
export function AdminSupport() {
  const [filter, setFilter] = useState<SupportStatus | undefined>(undefined);
  const query = useSupportRequests(filter);
  const now = useNow(30_000);

  return (
    <>
      <PageHeader
        title="Yêu cầu hỗ trợ"
        description="Khách bấm “Gặp nhân viên” trong Vinny. Liên hệ khách qua SĐT đã xác thực trong hồ sơ; SLA phản hồi 2 giờ làm việc."
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f ?? "all"}
            type="button"
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-quiet"}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f ? SUPPORT_STATUS_LABEL[f] : "Tất cả"}
          </button>
        ))}
      </div>
      <AdminQuery query={query} title="Không tải được yêu cầu hỗ trợ">
        {(rows) =>
          rows.length === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <p className="muted" style={{ margin: 0 }}>Chưa có yêu cầu nào{filter ? ` ở trạng thái “${SUPPORT_STATUS_LABEL[filter]}”` : ""}.</p>
            </div>
          ) : (
            <Section flush>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r) => (
                  <SupportCard key={r.id} r={r} now={now ?? Date.now()} />
                ))}
              </div>
            </Section>
          )
        }
      </AdminQuery>
    </>
  );
}

function SupportCard({ r: fromList, now }: { r: SupportRequest; now: number }) {
  const [busy, setBusy] = useState(false);
  // Bản vừa ghi thành công (có `version` mới) dùng ngay, tới khi danh sách tải lại bắt kịp — tránh bấm tiếp bằng version cũ ⇒ 409.
  const [saved, setSaved] = useState<SupportRequest | null>(null);
  const r = saved && Date.parse(saved.updatedAt) >= Date.parse(fromList.updatedAt) ? saved : fromList;
  const overdue = r.status !== "resolved" && now - Date.parse(r.createdAt) > SUPPORT_SLA_MS;

  const move = async (status: SupportStatus) => {
    if (busy) return;
    setBusy(true);
    const res = await supportApi.update(r.id, { status, version: r.version });
    setBusy(false);
    if (!res.ok) {
      toast(res.code === "support_request_conflict" ? "Yêu cầu vừa được người khác cập nhật — đã tải lại." : res.message || "Không cập nhật được.");
      invalidateSupport();
      return;
    }
    setSaved(res.data);
    toast(`Đã chuyển sang “${SUPPORT_STATUS_LABEL[status]}”.`, "success");
    invalidateSupport();
  };

  return (
    <article className="card" style={{ padding: 16, borderColor: overdue ? "var(--danger)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b>{SUPPORT_CATEGORY_LABEL[r.category] ?? r.category}</b>
          <StatusBadge tone={TONE[r.status]}>{SUPPORT_STATUS_LABEL[r.status]}</StatusBadge>
          {overdue && <StatusBadge tone="danger">Quá SLA 2 giờ</StatusBadge>}
        </div>
        <span className="muted xs">
          {fmtDateTime(r.createdAt)} · {r.requester.name ?? "Khách thuê"}
          {r.handler ? ` · xử lý: ${r.handler.name ?? "Admin"}` : ""}
        </span>
      </div>
      <pre className="small" style={{ whiteSpace: "pre-wrap", margin: "10px 0", fontFamily: "inherit" }}>{r.summary}</pre>
      <div style={{ display: "flex", gap: 8 }}>
        {r.status === "open" && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => move("in_progress")}>
            Nhận xử lý
          </button>
        )}
        {r.status !== "resolved" && (
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => move("resolved")}>
            Đánh dấu đã xong
          </button>
        )}
        {r.status === "resolved" && (
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => move("open")}>
            Mở lại
          </button>
        )}
      </div>
    </article>
  );
}
