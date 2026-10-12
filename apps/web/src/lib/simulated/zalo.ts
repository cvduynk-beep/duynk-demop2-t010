/**
 * MÔ PHỎNG ZALO OA / ZNS (giữ có chủ đích — chưa tích hợp Zalo ZNS thật).
 *
 * Nội dung tin là mô phỏng, nhưng MỌI tin đều dựng từ dữ liệu thật của backend: mã OTP mà backend trả (`devCode`, chỉ
 * có ở dev) và các mốc thời gian thật của lịch hẹn (`TenantBooking`). Không có tin nào sinh ra từ dữ liệu giả.
 * Khi tích hợp ZNS thật: backend gửi tin, FE chỉ hiển thị lịch sử do API trả — xoá module này.
 */
import { fmtTime, vnd } from "@/lib/format";
import type { TenantBooking } from "@/lib/tenant/types";
import { unitAddress } from "@/lib/units";

export interface NoticeAction {
  id: "arrived" | "late";
  label: string;
  /** Đã bấm — nút chuyển sang trạng thái đã phản hồi. */
  doneAt?: string;
}

export interface Notice {
  id: string;
  at: string;
  title: string;
  body: string;
  tone?: "info" | "success" | "warning" | "alert";
  actions?: NoticeAction[];
}

const OTP_PURPOSE_LABEL = {
  TENANT_VIEWING: "đặt lịch xem phòng",
  TENANT_DEPOSIT_SIGN: "ký thỏa thuận đặt cọc",
  PHONE_VERIFY: "xác thực số điện thoại",
} as const;

/** Tin Zalo chứa mã OTP mà backend vừa phát (chỉ dựng được khi backend trả `devCode` — tức môi trường dev). */
export function otpNotice(code: string, purpose: keyof typeof OTP_PURPOSE_LABEL, at = new Date().toISOString()): Notice {
  return {
    id: `otp-${at}`,
    at,
    title: "Mã xác thực VinStay AI",
    body: `${code} là mã xác thực ${OTP_PURPOSE_LABEL[purpose]} của bạn. Mã có hiệu lực 5 phút. Không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên VinStay.`,
    tone: "info",
  };
}

const CLOSE_REASON: Record<string, string> = {
  auto_cancelled_due_to_deposit: "căn vừa được một khách khác hoàn tất cọc giữ chỗ (First-to-Pay Wins)",
  hold_expired: "hết thời hạn giữ chỗ",
};

/** Luồng tin Zalo OA của một lịch hẹn, dựng từ các mốc thời gian thật (createdAt, confirmedAt, reminderSentAt…). */
export function bookingZaloThread(b: TenantBooking): Notice[] {
  const where = unitAddress(b.unit);
  const host = b.host?.name ? `Host ${b.host.name}` : "Field Host nội khu";
  const out: Notice[] = [];
  const push = (key: string, at: string | undefined, n: Omit<Notice, "id" | "at">) => {
    if (at) out.push({ id: `${b.ref}-${key}`, at, ...n });
  };

  push("created", b.createdAt, {
    title: "Đã nhận yêu cầu xem phòng",
    body: `Cảm ơn ${b.contact.name}! VinStay AI đã nhận yêu cầu xem căn ${where} lúc ${fmtTime(b.slot)}. Mã lịch hẹn của bạn: ${b.ref}. Field Host nội khu có thẻ thang máy sẽ xác nhận và đón bạn tại sảnh.`,
    tone: "success",
  });
  push("confirmed", b.confirmedAt, {
    title: "Host đã xác nhận lịch xem",
    body: `Lịch ${b.ref} đã được xác nhận: căn ${where}, ${fmtTime(b.slot)}. ${host} sẽ chờ bạn ở sảnh toà ${b.unit.building}. Trước giờ hẹn 10 phút, mình sẽ nhắn kèm nút "Tôi đã có mặt tại sảnh".`,
    tone: "success",
  });
  push("reminder", b.reminderSentAt, {
    title: "Nhắc hẹn: còn 10 phút",
    body: `Còn 10 phút nữa là tới giờ xem căn ${where}. ${host} đang chờ ở sảnh toà ${b.unit.building}. Khi tới nơi, bấm nút bên dưới để Host xuống đón — không cần quét mã QR nào ở sảnh.`,
    tone: "info",
    actions: [
      { id: "arrived", label: "Tôi đã có mặt tại sảnh", doneAt: b.lobbyAt },
      { id: "late", label: "Đang trên đường — xin trễ 10 phút", doneAt: b.lateRequestedAt },
    ],
  });
  push("lobby", b.lobbyAt, {
    title: "Host đang xuống sảnh",
    body: `${host} đã nhận thông báo và sẽ xuống sảnh đón bạn trong khoảng 60 giây. Host đeo thẻ cư dân thang máy.`,
    tone: "success",
  });
  push("receiving", b.receivingAt, {
    title: "Host bắt đầu tiếp đón",
    body: `${host} đang đón bạn ở sảnh và sẽ quẹt thẻ cư dân để lên căn ${where}.`,
  });
  const dep = b.deposit;
  push("deposit", dep?.createdAt, {
    title: "Khách chốt phòng — Vui lòng quét VietQR giữ căn",
    body: `Mở lịch hẹn ${b.ref} để đồng ý điều khoản và quét VietQR giữ căn${dep?.holdHours ? ` ${dep.holdHours} giờ` : ""}.`,
    tone: "info",
  });
  push("paid", dep?.paidAt, {
    title: `Đã nhận cọc — giữ căn${dep?.holdHours ? ` ${dep.holdHours} giờ` : ""}`,
    body: `Thanh toán thành công ${vnd(dep?.amount ?? 0)}đ! Căn ${where} đã được khoá giữ chỗ cho bạn${dep?.expiresAt ? ` tới ${fmtTime(dep.expiresAt)}` : ""}. Khoản cọc này chuyển 100% thành Tiền cọc bảo đảm khi ký hợp đồng thuê, không trừ vào tiền thuê tháng đầu.`,
    tone: "success",
  });
  push("kyc", b.kyc?.verifiedAt, {
    title: "Đã xác minh CCCD",
    body: "VinStay AI đã xác minh CCCD của bạn một lần duy nhất và mã hoá AES-256 theo Nghị định 13/2023/NĐ-CP. Ảnh gốc không được chia sẻ với môi giới hay chủ nhà.",
    tone: "success",
  });
  const endedAt = b.viewEndedAt ?? b.confirmedAt ?? b.createdAt;
  if (b.status === "leased") {
    push("leased", endedAt, {
      title: "Hợp đồng thuê đã ký số",
      body: "Hợp đồng thuê đã có hiệu lực. Khoản cọc giữ chỗ được chuyển 100% thành Tiền cọc bảo đảm tài sản. Field Host sẽ hẹn bàn giao và lập Hộ chiếu số 10 hạng mục.",
      tone: "success",
    });
  }
  if (b.status === "cancelled" || b.status === "rejected" || b.status === "no_show") {
    const reason = b.closedReason ? CLOSE_REASON[b.closedReason] ?? b.closedReason : null;
    push("closed", endedAt, {
      title: b.status === "no_show" ? "Lịch xem đã tự huỷ" : b.status === "rejected" ? "Cần đổi giờ xem phòng" : "Đã huỷ lịch xem phòng",
      body:
        b.status === "no_show"
          ? `Bạn chưa có mặt sau 15 phút nên lịch ${b.ref} đã được huỷ để Host phục vụ khách khác. Bạn có thể đặt lại bất cứ lúc nào.`
          : `Lịch ${b.ref} xem căn ${where} đã đóng${reason ? ` (${reason})` : ""}. Bạn có thể đặt lại khung giờ khác bất cứ lúc nào.`,
      tone: "warning",
    });
  }
  if (b.status === "completed") {
    push("completed", endedAt, {
      title: "Cảm ơn bạn đã xem phòng",
      body: `Cảm ơn ${b.contact.name} đã dành thời gian xem căn ${where}. Căn tiếp tục mở đón khách; bạn có thể đặt lại hoặc nhờ VinStay AI gợi ý căn tương đương.`,
    });
  }
  return out;
}
