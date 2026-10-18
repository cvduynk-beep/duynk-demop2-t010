---
topic: fast_deposit
title: Chốt cọc nhanh không cần đi xem là gì?
summary: Căn chủ nhà đã ủy quyền "Chốt nhanh" có nút "Chốt cọc nhanh" ngay trên trang căn, không cần đi xem trước. Tiền về trong vòng hai mươi bốn giờ thì tiền cọc bảo đảm được giảm khoảng 5%; mức giảm cụ thể của căn hiển thị trên trang căn.
sources: [backend/src/modules/booking/booking.service.ts#createFastDeposit, backend/src/modules/deposit/deposit.service.ts#getPublicFastDeposit, backend/src/modules/deposit/fast-close.ts, AGENTS.md#Chủ nhà 1 (Fast-Close Floor Price Corridor)]
verified_at: 2026-10-15
verified_sha: vinny-v1
owner: Ops/Admin VinStay
---
- Chỉ căn mà chủ nhà đã ủy quyền "Chốt nhanh" và đang trống mới có nút "Chốt cọc nhanh" ngay trên trang căn. Căn khác thì đặt lịch xem trước như bình thường.
- Khách đăng nhập và xác thực số điện thoại qua OTP Zalo, tick đồng ý điều khoản cọc và xác nhận chốt cọc dù chưa xem trực tiếp, rồi quét VietQR.
- Ưu đãi: tiền cọc bảo đảm được giảm khoảng 5%, chỉ khi tiền về trong vòng hai mươi bốn giờ. Tiền về muộn hơn thì ưu đãi hết hiệu lực, tiền được hoàn lại và căn không bị khóa.
- Mức giảm cụ thể của từng căn hiển thị trên trang căn và ở bước đặt cọc; bot không tự tính.
- Khi ký Hợp đồng thuê, khách chọn trả trước theo chu kỳ một, ba hoặc sáu tháng để được giảm giá thuê; giá chốt không bao giờ thấp hơn mức chủ nhà cho phép. Hợp đồng giữ đúng chu kỳ và giá đã chọn.
- Khoản cọc đã giảm là Tiền cọc bảo đảm đầy đủ, không phải nộp bù, và không bao giờ trừ vào tiền thuê tháng đầu.
- Nguyên tắc First-to-Pay Wins vẫn áp dụng: ai được ngân hàng ghi nhận tiền cọc trước thì căn khóa cho người đó.
