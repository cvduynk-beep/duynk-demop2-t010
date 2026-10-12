import type { Household } from "@/lib/pricing/cost";
import type { Furnishing, ItemKey, LayoutKind, ZoneId } from "@/lib/units";

/** Tiêu chí tìm căn của khách (khung chat + bộ lọc). Chỉ là lựa chọn của người xem, không phải dữ liệu nghiệp vụ. */
export interface CriteriaState {
  /** Ngân sách trần All-in / tháng (VNĐ). */
  budget?: number;
  layouts: LayoutKind[];
  zones: ZoneId[];
  buildings: string[];
  floor?: "low" | "mid" | "high";
  furnishing?: Furnishing;
  items: ItemKey[];
  pets?: boolean;
  household: Household;
  moveIn?: string;
  /** Khách ưu tiên tìm căn giá thấp nhất / tối ưu chi phí */
  sortByPrice?: boolean;
  /** Khách ưu tiên căn nội thất mới (tình trạng >= 85%) */
  preferNewFurnishing?: boolean;
  /** Khách yêu cầu gần một địa điểm / tiện ích cụ thể */
  nearLocation?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  /** Tin trả lời có kết quả tìm căn (mã căn). */
  resultIds?: string[];
  criteria?: CriteriaState;
}

export interface ChatState {
  messages: ChatMessage[];
  criteria: CriteriaState;
  /** Đã có ít nhất một lần tìm căn → giao diện chuyển sang chế độ kết quả. Danh sách căn luôn tính lại từ `criteria`. */
  searched: boolean;
}
