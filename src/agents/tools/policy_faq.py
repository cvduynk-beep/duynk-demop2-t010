"""
VinStay AI - Policy & FAQ Knowledge Engine
Tra cứu nội quy BQL Vinhomes Ocean Park và cơ chế cọc giữ chỗ 48h của VinStay AI.
"""


POLICY_KNOWLEDGE = {
    "all_in_cost": (
        "💡 **Chi phí All-in Cost tại VinStay AI gồm 4 khoản minh bạch 100%:**\n"
        "1. **Tiền thuê gốc:** Thỏa thuận trực tiếp với chủ nhà, không kênh giá.\n"
        "2. **Phí quản lý BQL Vinhomes:** 9.500đ/m² diện tích thông thủy (đã bao gồm VAT).\n"
        "3. **Phí gửi xe:** 150.000đ/xe máy/tháng, 1.250.000đ/ô tô/tháng (gửi hầm/nhà xe nổi).\n"
        "4. **Dự toán điện nước EVN:** Tạm tính ~300.000đ/người/tháng theo biểu giá lũy tiến EVN.\n"
        "👉 VinStay AI cam kết hiển thị giá All-in trọn gói trước khi bạn đặt lịch, 0% chi phí ẩn!"
    ),
    "holding_deposit": (
        "🔒 **Cơ chế Khóa căn giữ chỗ qua VietQR động (2.000.000 VNĐ):**\n"
        "- Khi bạn ưng ý căn hộ, chuyển đúng 2 triệu qua mã VietQR động gạch nợ tức thì.\n"
        "- Căn hộ lập tức khóa trạng thái `HOLDING` trong **48 giờ** trên toàn mạng lưới.\n"
        "- Áp dụng nguyên tắc **'First-to-Pay Wins'**: Ai chuyển cọc trước sẽ giữ căn độc quyền.\n"
        "- **Bảo toàn 100%:** Khoản 2 triệu này khi ký HĐ chính thức sẽ chuyển thành một phần của Tiền Cọc Bảo Đảm Tài Sản (Security Deposit) suốt kỳ thuê, hoàn lại khi hết hạn HĐ (không trừ vào tiền thuê tháng đầu để bảo vệ tài sản chủ nhà)."
    ),
    "lobby_and_viewing": (
        "🚪 **Quy trình Tiếp đón Thực địa 1-Chạm (Chủ nhà ở nhà 100%):**\n"
        "- Bạn chỉ cần đặt lịch trên web, nhập số điện thoại để nhận mã xác thực OTP Zalo.\n"
        "- Trước giờ hẹn 10 phút (T-10m), hệ thống gửi tin Zalo kèm nút 1-chạm *'Tôi đã có mặt tại sảnh'*.\n"
        "- Field Host nội khu (đã có sẵn thẻ cư dân thang máy) xuống sảnh đón bạn và quẹt thẻ dẫn lên phòng.\n"
        "- Khi đến trước cửa căn hộ, Host bấm xác nhận trên app $\rightarrow$ Mã PIN khóa điện tử được cấp tức thời (JIT Access Code) để mở cửa. Tuyệt đối không dùng hộp khóa Lockbox trái phép."
    ),
    "pet_policy": (
        "🐾 **Quy định Nuôi Thú Cưng tại Vinhomes Ocean Park:**\n"
        "- Ban Quản lý Vinhomes cho phép nuôi thú cưng (chó, mèo cảnh) nhưng phải đăng ký với BQL.\n"
        "- Khi dắt thú cưng ra khu vực công cộng (sảnh, thang máy, công viên), bắt buộc phải có rọ mõm và dây xích.\n"
        "- Chủ nuôi phải tự dọn dẹp vệ sinh. Vi phạm để phóng uế bừa bãi sẽ bị BQL lập biên bản phạt tiền trực tiếp."
    ),
    "noise_and_quiet_hours": (
        "🔇 **Quy định Tiếng ồn & Giờ yên tĩnh:**\n"
        "- Giờ yên tĩnh chung của khu đô thị: Từ **22:00 đêm đến 06:00 sáng hôm sau**.\n"
        "- Nghiêm cấm bật nhạc lớn, tụ tập ồn ào hoặc khoan đục sửa chữa ngoài giờ quy định (thứ Bảy và Chủ Nhật cấm tuyệt đối các hoạt động sửa chữa gây tiếng ồn)."
    ),
    "handyman_repairs": (
        "🔧 **Mô hình Vận hành Tinh gọn & Thợ Kỹ Thuật Ngoài (Asset-Light):**\n"
        "- VinStay AI và Field Host không làm tổng thầu sửa chữa cồng kềnh.\n"
        "- Khi phát sinh hỏng hóc vặt (điều hòa rỉ nước, bóng đèn hỏng...), Host giới thiệu ngay Danh bạ thợ kỹ thuật ngoài uy tín tại Ocean Park.\n"
        "- Khách thuê và thợ tự thỏa thuận chi phí minh bạch, giải phóng chủ nhà khỏi cảnh bị gọi lúc nửa đêm."
    ),
}


def lookup_policy(query: str) -> str | None:
    q = query.lower()
    if any(k in q for k in ["all-in", "all in", "chi phí", "bao nhiêu tiền", "phí quản lý", "điện nước", "gửi xe"]):
        return POLICY_KNOWLEDGE["all_in_cost"]
    elif any(k in q for k in ["cọc", "giữ chỗ", "2 triệu", "vietqr", "khóa căn", "holding"]):
        return POLICY_KNOWLEDGE["holding_deposit"]
    elif any(k in q for k in ["xem phòng", "đón sảnh", "thẻ thang máy", "mở cửa", "lockbox", "field host"]):
        return POLICY_KNOWLEDGE["lobby_and_viewing"]
    elif any(k in q for k in ["chó", "mèo", "thú cưng", "pet"]):
        return POLICY_KNOWLEDGE["pet_policy"]
    elif any(k in q for k in ["tiếng ồn", "ồn ào", "khoan đục", "mấy giờ"]):
        return POLICY_KNOWLEDGE["noise_and_quiet_hours"]
    elif any(k in q for k in ["sửa chữa", "thợ", "hỏng", "bảo trì"]):
        return POLICY_KNOWLEDGE["handyman_repairs"]
    return None
