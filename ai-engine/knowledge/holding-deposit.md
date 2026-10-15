---
topic: holding_deposit
title: Đặt cọc chốt căn hoạt động thế nào?
sources: [backend/src/modules/deposit/deposit.service.ts#createDeposit, backend/src/modules/deposit/deposit-amount.ts, backend/src/modules/deposit/fast-close.ts, backend/src/modules/deposit/deposit.service.ts#markPaid, backend/src/modules/deposit/deposit.service.ts#resolveHoldHours, backend/src/modules/deposit/deposit-terms.ts, legal/tenant/02_HOLDING_DEPOSIT_AND_VIETQR_TERMS.md, legal/02_HOLDING_AND_SECURITY_DEPOSIT_AGREEMENT.md]
verified_at: 2026-10-14
verified_sha: deposit-v2
---
- Đặt cọc chỉ mở sau khi khách đã xem căn cùng Field Host và Host chuyển ca sang bước chốt cọc.
- Số tiền cọc bằng đúng Tiền cọc bảo đảm của căn (chủ nhà đặt, thường bằng một tháng tiền thuê), do hệ thống tính và in sẵn trên mã VietQR. Không còn khoản cọc giữ chỗ cố định. Con số của từng căn lấy từ công cụ xem căn hoặc hiển thị ở bước đặt cọc; bot không đoán.
- Khách đọc điều khoản cọc và tick ô đồng ý (Điều 328 BLDS 2015, Nghị định 13/2023/NĐ-CP) trước khi quét mã. Không ký thỏa thuận cọc riêng.
- Thanh toán bằng VietQR động vào tài khoản định danh của nền tảng; không chuyển cho Field Host hay chủ nhà.
- Chuyển đúng số tiền và đúng nội dung hiển thị trên màn hình cọc; giao dịch sai số tiền không được khớp.
- Ngân hàng báo có ⇒ căn được giữ riêng {hold_hours} giờ cho khách, từ chối lịch xem mới và cọc của người khác.
- Thời lượng do Quản trị viên cài cho từng căn, trong khoảng {hold_hours_min} đến {hold_hours_max} giờ; con số của căn hiển thị ở bước đặt cọc.
- Trong thời hạn giữ chỗ, khách hoàn tất xác minh CCCD để hệ thống lập Hợp đồng thuê.
- Khi ký Hợp đồng thuê, khoản cọc chuyển 100% thành Tiền cọc bảo đảm, khách không phải nộp bù; không bao giờ trừ vào tiền thuê tháng đầu.
- Ưu đãi chốt nhanh chỉ có khi chủ nhà ủy quyền, gồm hai bước. Lúc đặt cọc: giảm khoảng 5% tiền cọc nếu tiền về trong vòng hai mươi bốn giờ kể từ lúc đồng ý (về muộn thì tiền được hoàn và căn không bị khoá); căn có nút "Chốt cọc nhanh" thì khách cọc ngay trên trang căn, không cần đi xem trực tiếp, chỉ cần xác thực số điện thoại qua Zalo. Lúc ký hợp đồng thuê: khách chọn trả trước một, ba hoặc sáu tháng một lần để được giảm giá thuê lần lượt 3,5%, 5,5% hoặc 10% (không thấp hơn giá sàn bảo mật của chủ nhà); hợp đồng giữ đúng chu kỳ và giá đã chọn. Bot không tự tính giá chốt nhanh; khách xem mức giảm cọc trên trang căn và mức giá thuê theo chu kỳ ở bước ký hợp đồng.
- Chủ nhà vi phạm: khách được hoàn đủ tiền cọc và thêm một khoản phạt bằng tiền cọc. Bất khả kháng hoặc căn đã được người khác cọc trước: hoàn đủ tiền cọc. Bộ phận vận hành xử lý từng trường hợp.
