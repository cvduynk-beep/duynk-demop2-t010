/** Contract của `POST /api/v1/chat` (envelope chung `{ success, statusCode, data }` do TransformInterceptor bọc). */

export type ChatLayout = 'Studio' | '1PN' | '2PN' | '3PN';
export type ChatFloor = 'low' | 'mid' | 'high';
export type ChatFurnishing = 'full' | 'basic' | 'empty';

export interface ChatHousehold {
  persons: number;
  motorbikes: number;
  cars: number;
}

/** Tiêu chí tìm căn sau khi gộp `context` (bộ lọc FE) với câu chat. Cùng hình với `CriteriaState` ở apps/web. */
export interface ChatCriteria {
  budget?: number;
  layouts: ChatLayout[];
  zones: string[];
  buildings: string[];
  floor?: ChatFloor;
  furnishing?: ChatFurnishing;
  items: string[];
  pets?: boolean;
  household: ChatHousehold;
}

/**
 * - `search`: có tiêu chí ⇒ danh sách lấy NGUYÊN từ MatchmakerService (thứ tự, điểm), LLM chỉ giải thích.
 * - `faq`: câu hỏi quy chế ⇒ trả lời 0 đồng từ tri thức đã kiểm (ai-engine/knowledge + fee_configs), không gọi LLM.
 * - `clarify` / `greeting` / `refusal`: câu cố định, không gọi LLM.
 */
export type ChatKind = 'search' | 'faq' | 'clarify' | 'greeting' | 'refusal';

/** Vì sao trả lời ở chế độ rút gọn (`degraded: true`). */
export type ChatDegradedReason =
  | 'llm_not_configured'
  | 'llm_timeout'
  | 'llm_error'
  | 'llm_rejected'
  | 'recommend_unavailable';

export interface ChatRecommendation {
  /** = unitCode (FE dùng mã căn làm id, link `/units/:id`). */
  id: string;
  rank: number;
  /** Khoá xếp hạng của matchmaker: % tiết kiệm All-in so với giá tham chiếu. */
  score: number;
  unitCode: string;
  buildingCode: string;
  zoneName?: string;
  layout: string;
  areaM2: number;
  floor?: number;
  allInCost: { baseRent: number; managementFee: number; parkingFee: number; utilityCost: number; allInTotal: number };
  comparison: { marketAllInEstimate: number; savingAmount: number; savingPercentage: number; isBargain: boolean };
  /** Câu giải trình tất định của matchmaker (không phải LLM). */
  explanation: string;
}

export interface ChatResponseData {
  conversationId: string;
  kind: ChatKind;
  reply: string;
  /** Rỗng khi không phải lượt tìm căn, khi không có căn khớp, hoặc khi recommend lỗi (không bao giờ là danh sách giả). */
  recommendations: ChatRecommendation[];
  /** Tiêu chí đã áp dụng (chỉ có ở lượt `search`). */
  criteria: ChatCriteria | null;
  /** Số căn đã quét / khớp trước khi cắt top (chỉ có ở lượt `search` khi recommend chạy được). */
  scan: { scanned: number; matched: number } | null;
  /** `reply` do đâu sinh ra. */
  source: 'llm' | 'template' | 'knowledge' | 'rule';
  degraded: boolean;
  degradedReason?: ChatDegradedReason;
}
