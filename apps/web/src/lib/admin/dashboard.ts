import { api, apiErrorText } from "@/lib/apiClient";
import { useApiQuery, type Query } from "@/lib/query/useApiQuery";

// ─── Contract backend (/admin/bi-funnel · /admin/dispatch-sla/summary · /admin/dashboard/work-items · /admin/activity) ──

export interface DashboardRange {
  from: string;
  to: string;
  timezone: string;
  days: number;
}

export interface FunnelStage {
  key: string;
  stage: string;
  /** null = bước chưa có nguồn dữ liệu (khác với 0 thật). */
  count: number | null;
  available: boolean;
  dropRate: number | null;
}

export interface BiFunnel {
  range: DashboardRange;
  funnel: {
    stages: FunnelStage[];
    noShowRate: number | null;
    noShowCount: number;
    noShowDenominator: number;
  };
  dailyBookings: { date: string; count: number }[];
  viewingsToday: { date: string; today: number; yesterday: number };
  occupancyHeatmap: { buildingCode: string; zone: string; total: number; rented: number; occupancyRate: number; alert: string }[];
  portfolioStatus: {
    totalUnits: number;
    rentedUnits: number;
    holdingUnits: number;
    availableUnits: number;
    unlistedUnits: number;
    maintenanceUnits: number;
    occupancyRate: number | null;
  };
}

export interface DispatchSummary {
  breachedCount: number;
  actionable: { manualDispatch: number; overSla: number };
  byHost: { hostId: string; hostName: string; accepted: number; avgAcceptSeconds: number; overSla: number }[];
  avgAcceptSeconds: number | null;
}

export interface DashboardWorkItems {
  generatedAt: string;
  dispatch: { manualDispatch: number; overSla: number };
  /** total = số hồ sơ không trùng (chờ phân Host và/hoặc quá hạn). */
  consignments: { awaitingHost: number; overdue: number; total: number };
  mandatesExiting: number;
  contracts: { needsAction: number; byKind: Record<string, number> };
}

export interface ActivityItem {
  id: string;
  actionType: string;
  entityName: string;
  entityId: string;
  actorRole: string;
  actorName: string | null;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

// ─── Khoảng thời gian (giờ Việt Nam, khớp backend: tối đa 90 ngày) ───────────────────────────────────────────────

export const MAX_RANGE_DAYS = 90;
export const RANGE_PRESETS = [7, 30, 90] as const;
const DAY_MS = 86_400_000;
const ICT_OFFSET_MS = 7 * 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ictDay = (ms: number) => new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00+07:00`);
export const addDays = (day: string, n: number) => ictDay(dayMs(day) + n * DAY_MS);

export interface RangeInput {
  from: string;
  to: string;
}

/** N ngày gần nhất tính tới hôm nay (giờ VN). */
export const presetRange = (days: number, nowMs: number): RangeInput => {
  const to = ictDay(nowMs);
  return { from: addDays(to, -(days - 1)), to };
};

/** Kiểm khoảng trước khi gọi API (backend vẫn kiểm lại). null = hợp lệ. */
export function validateRange(r: RangeInput): Partial<Record<"from" | "to", string>> | null {
  const errors: Partial<Record<"from" | "to", string>> = {};
  const valid = (d: string) => DATE_RE.test(d) && !Number.isNaN(dayMs(d)) && ictDay(dayMs(d)) === d;
  if (!valid(r.from)) errors.from = "Chọn ngày bắt đầu hợp lệ.";
  if (!valid(r.to)) errors.to = "Chọn ngày kết thúc hợp lệ.";
  if (!errors.from && !errors.to) {
    if (r.from > r.to) errors.from = "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.";
    else if ((dayMs(r.to) - dayMs(r.from)) / DAY_MS + 1 > MAX_RANGE_DAYS) errors.to = `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày.`;
  }
  return Object.keys(errors).length ? errors : null;
}

// ─── Truy vấn (mỗi widget một query ⇒ một nguồn lỗi không kéo sập cả trang) ───────────────────────────────────

const qs = (r: RangeInput) => `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;
const errorText = (res: { status: number; code?: string; message?: string }) => apiErrorText(res, "Không tải được số liệu.");

export const dashboardQueries = {
  bi: (r: RangeInput) => ({ key: `admin-dashboard:bi:${r.from}:${r.to}`, fetch: () => api.get<BiFunnel>(`/admin/bi-funnel?${qs(r)}`), errorText }),
  dispatch: (r: RangeInput) => ({
    key: `admin-dashboard:dispatch:${r.from}:${r.to}`,
    fetch: () => api.get<DispatchSummary>(`/admin/dispatch-sla/summary?${qs(r)}`),
    errorText,
  }),
  workItems: () => ({ key: "admin-dashboard:work-items", fetch: () => api.get<DashboardWorkItems>("/admin/dashboard/work-items"), errorText }),
  activity: (limit = 8) => ({
    key: `admin-dashboard:activity:${limit}`,
    fetch: () => api.get<ActivityPage>(`/admin/activity?limit=${limit}`),
    errorText,
  }),
};

export const useDashboardBi = (r: RangeInput): Query<BiFunnel> => useApiQuery(dashboardQueries.bi(r));
export const useDashboardDispatch = (r: RangeInput): Query<DispatchSummary> => useApiQuery(dashboardQueries.dispatch(r));
export const useDashboardWorkItems = (): Query<DashboardWorkItems> => useApiQuery(dashboardQueries.workItems());
export const useDashboardActivity = (limit = 8): Query<ActivityPage> => useApiQuery(dashboardQueries.activity(limit));

// ─── Định dạng vi-VN — null hiển thị "—" (chưa có dữ liệu), 0 hiển thị 0 ────────────────────────────────────────

const NUM = new Intl.NumberFormat("vi-VN");
const PCT = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
export const NO_DATA = "—";
export const fmtNumber = (n: number | null | undefined) => (n === null || n === undefined ? NO_DATA : NUM.format(n));
export const fmtPercentValue = (n: number | null | undefined) => (n === null || n === undefined ? NO_DATA : PCT.format(n));
export const fmtDuration = (sec: number | null | undefined) =>
  sec === null || sec === undefined ? NO_DATA : `${Math.floor(sec / 60)}′${String(Math.round(sec) % 60).padStart(2, "0")}″`;
/** "07/10" từ "2026-10-07". */
export const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
export const fmtRange = (r: RangeInput) => `${shortDay(r.from)}/${r.from.slice(0, 4)} – ${shortDay(r.to)}/${r.to.slice(0, 4)}`;

// ─── Ánh xạ dữ liệu → widget ─────────────────────────────────────────────────────────────────────────────────

export interface FunnelStepView {
  key: string;
  label: string;
  /** null = chưa có nguồn dữ liệu. */
  value: number | null;
}

const STAGE_LABEL: Record<string, string> = {
  visit: "Lượt truy cập web",
  matchmaker: "Chat AI Matchmaker",
  booked: "Đặt lịch xem (đã OTP)",
  checkin: "Check-in sảnh",
  deposit: "Quét VietQR cọc",
  signed: "Ký hợp đồng thuê",
};

export const funnelSteps = (stages: FunnelStage[]): FunnelStepView[] =>
  stages.map((s) => ({ key: s.key, label: STAGE_LABEL[s.key] ?? s.stage.replace(/^\d+\.\s*/, ""), value: s.available ? s.count : null }));

export interface WorkItemView {
  key: string;
  bad: boolean;
  title: string;
  body: string;
  href: string;
  cta: string;
}

/** Chỉ hiện việc có số > 0. */
export function workItemViews(w: DashboardWorkItems): WorkItemView[] {
  const items: (WorkItemView | null)[] = [
    w.dispatch.manualDispatch > 0
      ? { key: "manual", bad: true, title: `${fmtNumber(w.dispatch.manualDispatch)} ticket cần điều phối tay`, body: "Đã leo thang hoặc tới tầng Area Lead mà chưa có Host nhận ca.", href: "/admin/bookings", cta: "Điều phối" }
      : null,
    w.dispatch.overSla > 0
      ? { key: "sla", bad: true, title: `${fmtNumber(w.dispatch.overSla)} ticket quá SLA nhận ca`, body: "Host chưa nhận ca trong thời hạn của tầng điều phối hiện tại.", href: "/admin/bookings", cta: "Điều phối" }
      : null,
    w.consignments.awaitingHost > 0 || w.consignments.overdue > 0
      ? {
          key: "consign",
          bad: w.consignments.overdue > 0,
          title:
            w.consignments.awaitingHost > 0
              ? `${fmtNumber(w.consignments.awaitingHost)} hồ sơ ký gửi chờ duyệt & phân Host thẩm định`
              : `${fmtNumber(w.consignments.overdue)} hồ sơ ký gửi quá SLA thẩm định 2 giờ`,
          body:
            w.consignments.awaitingHost > 0 && w.consignments.overdue > 0
              ? `${fmtNumber(w.consignments.overdue)} hồ sơ đã quá SLA thẩm định 2 giờ.`
              : w.consignments.awaitingHost > 0
                ? "Chủ nhà đã ký uỷ quyền, chưa có Host thẩm định nhận hồ sơ."
                : "Host đã nhận nhưng chưa nộp phiếu thẩm định đúng hạn.",
          href: "/admin/inventory?tab=requests",
          cta: "Xem",
        }
      : null,
    w.mandatesExiting > 0
      ? { key: "exit", bad: false, title: `${fmtNumber(w.mandatesExiting)} căn đang đếm ngược thoát uỷ quyền`, body: "Chủ nhà đã báo thoát; hết 15 ngày cần chấm dứt uỷ quyền và gỡ mã cửa.", href: "/admin/inventory?tab=exit", cta: "Xem" }
      : null,
    w.contracts.needsAction > 0
      ? { key: "contracts", bad: true, title: `${fmtNumber(w.contracts.needsAction)} hồ sơ trong sổ hợp đồng cần xử lý`, body: "Sắp hết hạn, quá hạn thoát, tranh chấp hoặc chờ đối soát.", href: "/admin/contracts", cta: "Mở sổ hợp đồng" }
      : null,
  ];
  return items.filter((x): x is WorkItemView => x !== null);
}

/** Heatmap: gom toà theo phân khu; "used" = căn đã cho thuê (cùng định nghĩa lấp đầy). */
export function heatRows(rows: BiFunnel["occupancyHeatmap"]) {
  const byZone = new Map<string, { building: string; total: number; used: number }[]>();
  for (const r of rows) {
    const cells = byZone.get(r.zone) ?? [];
    cells.push({ building: r.buildingCode, total: r.total, used: r.rented });
    byZone.set(r.zone, cells);
  }
  return [...byZone.entries()].map(([zone, cells]) => ({ zone, cells }));
}

const ACTION_LABEL: Record<string, string> = {
  CONSIGNMENT_CREATED: "Chủ nhà tạo hồ sơ ký gửi",
  CONSIGNMENT_SIGNED: "Chủ nhà ký uỷ quyền độc quyền",
  CONSIGNMENT_PRICING_DECISION: "Chủ nhà duyệt giá đề xuất",
  CONSIGNMENT_PHOTOS_ADDED: "Chủ nhà bổ sung ảnh ký gửi",
  LANDLORD_EKYC_VERIFIED: "Chủ nhà xác thực eKYC",
  LANDLORD_FEE_UPDATED: "Admin đổi phí dịch vụ chủ nhà",
  EKYC_NAME_MISMATCH: "eKYC lệch họ tên",
  INSPECTION_ACCEPTED: "Host nhận thẩm định",
  INSPECTION_SUBMITTED: "Host nộp phiếu thẩm định",
  UNIT_PUBLISHED: "Căn được niêm yết",
  UNIT_HOLD_HOURS_UPDATED: "Admin đổi thời gian giữ căn",
  UNIT_RENT_UPDATED: "Đổi giá thuê căn",
  MANDATE_EXIT_REQUESTED: "Chủ nhà báo thoát uỷ quyền",
  MANDATE_EXIT_CANCELLED: "Chủ nhà huỷ báo thoát",
  MANDATE_TERMINATED_BY_ADMIN: "Admin chấm dứt uỷ quyền",
  DISPATCH_REASSIGNED: "Admin giao lại ca xem",
  DISPATCH_ESCALATED: "Leo thang điều phối",
  DEPOSIT_TERMS_ACCEPTED: "Khách đồng ý điều khoản cọc",
  DEPOSIT_PAID: "Cọc giữ chỗ đã gạch nợ",
  DEPOSIT_LOST_RACE: "Cọc đến sau — căn đã có người cọc trước",
  DEPOSIT_AMOUNT_MISMATCH: "Chuyển khoản sai số tiền cọc",
  DEPOSIT_UNMATCHED: "Giao dịch VietQR không khớp",
  DEPOSIT_UNC_UPLOADED: "Khách tải lên UNC",
  DEPOSIT_UNC_APPROVED: "Admin duyệt UNC",
  DEPOSIT_UNC_REJECTED: "Admin từ chối UNC",
  DEPOSIT_UNC_EXPIRED: "UNC quá hạn đối soát",
  HOLD_EXPIRED: "Hết hạn giữ căn, căn mở lại",
  DEPOSIT_VOID_REQUESTED: "Yêu cầu huỷ cọc",
  DEPOSIT_POLICY_UPDATED: "Admin đổi chính sách cọc",
  LEASE_ESTABLISHED: "Hợp đồng thuê có hiệu lực",
  LEASE_PDF_DOWNLOADED: "Tải PDF hợp đồng thuê",
  DOOR_KEY_REVEAL: "Mở mã cửa",
  DOOR_KEY_ROTATED: "Đổi mã cửa",
  DOOR_KEY_REVOKED: "Thu hồi mã cửa",
  FEE_CONFIG_UPDATED: "Admin đổi cấu hình thù lao",
  HOST_CREATE: "Admin tạo Field Host",
  HOST_ROLES_UPDATE: "Admin đổi vai Field Host",
  HOST_UPDATE: "Admin cập nhật Field Host",
  HOST_DEACTIVATE: "Admin khoá Field Host",
  HOST_REACTIVATE: "Admin mở lại Field Host",
  HOST_EMERGENCY: "Host báo khẩn cấp",
  VIEWING_ACCEPT: "Host nhận ca xem",
  VIEWING_CLAIM: "Host nhận ca từ Open Pool",
  VIEWING_REJECT: "Host từ chối ca xem",
  VIEWING_REMIND: "Nhắc hẹn T-10 phút",
  VIEWING_RECEIVE: "Host đón khách tại sảnh",
  VIEWING_OPEN_DOOR: "Host xác nhận xem phòng, cấp mã cửa",
  VIEWING_NO_SHOW: "Khách bỏ hẹn",
  VIEWING_NOT_INTERESTED: "Khách không chốt sau khi xem",
  VIEWING_START_DEPOSIT: "Khách bắt đầu đặt cọc",
  HOST_PAYOUT_ACCRUED: "Ghi nhận thu nhập Host",
  PAYOUT_SWEEP: "Quét bảng kê thu nhập",
  PAYOUT_CSV_EXPORT: "Xuất bảng kê thu nhập",
  PAYOUT_ACCOUNT_VERIFIED: "Xác minh tài khoản nhận tiền",
};

const ROLE_LABEL: Record<string, string> = {
  ops_admin: "Admin",
  tenant: "Khách thuê",
  landlord: "Chủ nhà",
  field_host: "Field Host",
  area_lead: "Area Lead",
  system: "Hệ thống",
};

const HANDOVER_LABEL: Record<string, string> = { CHECK_IN: "Biên bản bàn giao nhận phòng", CHECK_OUT: "Biên bản bàn giao trả phòng" };

/** Mã chưa có nhãn ⇒ hiện nguyên mã (không đoán nghĩa). */
export function activityTitle(actionType: string): string {
  const handover = /^HANDOVER_(.+)_CREATED$/.exec(actionType);
  if (handover) return HANDOVER_LABEL[handover[1]] ?? `Biên bản bàn giao ${handover[1]}`;
  return ACTION_LABEL[actionType] ?? actionType;
}
export const activityActor = (i: Pick<ActivityItem, "actorName" | "actorRole">) =>
  [ROLE_LABEL[i.actorRole] ?? i.actorRole, i.actorName].filter(Boolean).join(" · ");
