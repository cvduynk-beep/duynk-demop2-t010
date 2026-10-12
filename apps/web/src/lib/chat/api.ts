import { api, type ApiResponse } from "@/lib/apiClient";
import type { ApiQueryDef } from "@/lib/query/useApiQuery";
import type { CriteriaState } from "./types";

/**
 * Lớp dữ liệu của khung chat trang `/`. Mọi danh sách căn + thứ tự đều do backend (AI Matchmaker) quyết định:
 * - `POST /chat`: một lượt hội thoại (lời đáp + top căn).
 * - `POST /matchmaker/recommend`: danh sách ở tab kết quả khi khách chỉnh bộ lọc (cùng thuật toán xếp hạng).
 * FE không tự phân tích câu chat, không tự xếp hạng, không có FAQ cục bộ.
 */

export interface RankedCost {
  baseRent: number;
  managementFee: number;
  parkingFee: number;
  utilityCost: number;
  allInTotal: number;
}

export interface RankedComparison {
  marketAllInEstimate: number;
  savingAmount: number;
  savingPercentage: number;
  isBargain: boolean;
}

export interface ChatRecommendation {
  id: string;
  rank: number;
  score: number;
  unitCode: string;
  buildingCode: string;
  zoneName?: string;
  layout: string;
  areaM2: number;
  floor?: number;
  allInCost: RankedCost;
  comparison: RankedComparison;
  explanation: string;
}

export type ChatKind = "search" | "faq" | "clarify" | "greeting" | "refusal";
export type ChatDegradedReason = "llm_not_configured" | "llm_timeout" | "llm_error" | "llm_rejected" | "recommend_unavailable";

export interface ChatResponse {
  conversationId: string;
  kind: ChatKind;
  reply: string;
  recommendations: ChatRecommendation[];
  criteria: Omit<CriteriaState, "moveIn" | "sortByPrice" | "preferNewFurnishing" | "nearLocation"> | null;
  scan: { scanned: number; matched: number } | null;
  source: "llm" | "template" | "knowledge" | "rule";
  degraded: boolean;
  degradedReason?: ChatDegradedReason;
}

/** Giới hạn của backend (AGENTS.md lớp 1). */
export const CHAT_MESSAGE_MAX = 250;

/** Chỉ gửi các khoá backend hiểu; khoá rỗng bỏ đi. */
function contextOf(c: CriteriaState, searched: boolean) {
  return {
    budget: c.budget,
    layouts: c.layouts.length ? c.layouts : undefined,
    zones: c.zones.length ? c.zones : undefined,
    buildings: c.buildings.length ? c.buildings : undefined,
    floor: c.floor,
    furnishing: c.furnishing,
    items: c.items.length ? c.items : undefined,
    pets: c.pets || undefined,
    household: c.household,
    searched,
  };
}

export const chatApi = {
  send: (message: string, criteria: CriteriaState, searched: boolean, conversationId?: string): Promise<ApiResponse<ChatResponse>> =>
    api.post<ChatResponse>("/chat", { message, conversationId, context: contextOf(criteria, searched) }),
};

/** Thông báo cho các mã lỗi của `POST /chat`. */
export function chatErrorText(res: ApiResponse<unknown>): string {
  if (res.status === 401 || res.code === "LOGIN_REQUIRED") return "Bạn đã dùng hết lượt tư vấn thử. Đăng nhập (miễn phí) để tiếp tục trò chuyện nhé.";
  if (res.status === 429) return "Bạn gửi hơi nhanh — chờ khoảng một phút rồi hỏi tiếp nhé.";
  if (res.status === 400) return `Tin nhắn tối đa ${CHAT_MESSAGE_MAX} ký tự. Bạn rút gọn giúp mình nhé.`;
  if (res.status === 0) return "Mất kết nối tới máy chủ. Bạn kiểm tra mạng rồi thử lại nhé.";
  return "Trợ lý đang gặp sự cố. Bạn thử lại sau ít phút nhé.";
}

// ─── Danh sách tab kết quả (cùng thuật toán xếp hạng của matchmaker) ────────────────────────

export interface RecommendResponse {
  scanSummary: { totalScannedUnits: number; totalMatched: number; matchedUnits: number };
  topRecommendations: {
    rank: number;
    score: number;
    unitCode: string;
    allInCost: RankedCost;
    comparison: RankedComparison;
    aiExplanation: string;
  }[];
}

export const RESULTS_LIMIT = 100;

function recommendBody(c: CriteriaState) {
  return {
    maxAllInBudget: c.budget,
    layouts: c.layouts.length ? c.layouts : undefined,
    zones: c.zones.length ? c.zones : undefined,
    buildings: c.buildings.length ? c.buildings : undefined,
    floor: c.floor,
    furnishing: c.furnishing,
    items: c.items.length ? c.items : undefined,
    pets: c.pets || undefined,
    occupants: c.household.persons,
    motorbikes: c.household.motorbikes,
    cars: c.household.cars,
    limit: RESULTS_LIMIT,
  };
}

export const recommendQuery = (c: CriteriaState): ApiQueryDef<RecommendResponse> => {
  const body = recommendBody(c);
  return {
    key: `tenant:recommend:${JSON.stringify(body)}`,
    fetch: () => api.post<RecommendResponse>("/matchmaker/recommend", body),
    errorText: () => "Không tải được danh sách căn phù hợp.",
  };
};
