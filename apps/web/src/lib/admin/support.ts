import { api, type ApiResponse } from "@/lib/apiClient";
import { invalidateApiPattern, useApiQuery, type Query } from "@/lib/query/useApiQuery";

/** Yêu cầu "Gặp nhân viên" khách gửi từ Vinny (`GET/PATCH /admin/support-requests`). Tóm tắt đã che SĐT/email/CCCD. */
export type SupportStatus = "open" | "in_progress" | "resolved";

export interface SupportRequest {
  id: string;
  category: string;
  summary: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  requester: { id: string; name: string | null };
  handler: { id: string; name: string | null } | null;
  note: string | null;
  version: string;
}

export const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  complaint: "Khiếu nại",
  deposit_dispute: "Tranh chấp tiền cọc",
  payment: "Sự cố thanh toán",
  contract: "Hợp đồng",
  damage: "Chủ nhà / Host không giữ cam kết",
  human_request: "Muốn gặp nhân viên",
};

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Chờ nhận",
  in_progress: "Đang xử lý",
  resolved: "Đã xong",
};

/** SLA phản hồi đã chốt: 2 giờ làm việc. Quá hạn (tính theo giờ thực) ⇒ đánh dấu đỏ. */
export const SUPPORT_SLA_MS = 2 * 3_600_000;

const BASE = "/admin/support-requests";

export const supportApi = {
  list: (status?: SupportStatus) => api.get<SupportRequest[]>(`${BASE}${status ? `?status=${status}` : ""}`),
  update: (id: string, dto: { status: SupportStatus; note?: string; version: string }): Promise<ApiResponse<SupportRequest>> =>
    api.patch<SupportRequest>(`${BASE}/${encodeURIComponent(id)}`, dto),
};

export const useSupportRequests = (status?: SupportStatus): Query<SupportRequest[]> =>
  useApiQuery<SupportRequest[]>(
    { key: `admin-support:${status ?? "all"}`, fetch: () => supportApi.list(status), errorText: (r) => r.message || "Không tải được yêu cầu hỗ trợ." },
    true,
    { pollMs: 30_000 },
  );

export const invalidateSupport = () => invalidateApiPattern("admin-support");
