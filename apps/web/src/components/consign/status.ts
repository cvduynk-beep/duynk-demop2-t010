// Khoá theo trạng thái backend (bao trùm trạng thái mock) để mọi màn đều có nhãn.
import type { ConsignmentStatus } from "@/lib/landlord/types";
import type { StatusTone } from "@/components/ui/StatusBadge";

export const CONSIGN_STATUS_META: Record<
  ConsignmentStatus,
  { label: string; tone: StatusTone; landlordHint: string }
> = {
  awaiting_host: {
    label: "Chờ Field Host nhận",
    tone: "warn",
    landlordHint: "Field Host phân khu sẽ nhận và hẹn kiểm tra trong 48 giờ.",
  },
  inspecting: {
    label: "Đang thẩm định thực tế",
    tone: "info",
    landlordHint: "Field Host đang tiến hành kiểm tra và chụp ảnh hiện trạng tại căn.",
  },
  reviewing: {
    label: "Chờ Admin duyệt",
    tone: "warn",
    landlordHint: "Báo cáo thẩm định đã gửi lên Admin để phê duyệt ký gửi chính thức.",
  },
  awaiting_landlord: {
    label: "Chờ bạn duyệt giá",
    tone: "warn",
    landlordHint: "Chuyên viên thẩm định đề xuất điều chỉnh giá thuê / tiền cọc. Vui lòng xem và chấp nhận hoặc từ chối.",
  },
  approved: {
    label: "Đã ký gửi",
    tone: "ok",
    landlordHint: "Căn hộ đã hoàn tất thủ tục và được tiếp nhận ký gửi chính thức.",
  },
  rejected: {
    label: "Không duyệt",
    tone: "danger",
    landlordHint: "Hồ sơ ký gửi không được phê duyệt. Vui lòng xem lý do bên dưới.",
  },
};
