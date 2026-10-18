# Rà kho tri thức Vinny — 2026-10-16

Nguồn: `ai-engine/knowledge/` (13 chủ đề). Sinh bằng `scripts/audit-knowledge.ts` — CHỈ liệt kê, KHÔNG sửa nội dung (chủ sở hữu Ops/Admin quyết).

| Loại vấn đề | Số lượng |
|---|---|
| thiếu người duyệt | 12 |
| ý quá dài | 8 |
| ý cụt | 1 |
| chờ duyệt | 1 |
| trùng ý | 3 |

## Chi tiết

| File | Loại | Chi tiết |
|---|---|---|
| all-in-cost.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| bql-rules.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| bql-rules.md | ý quá dài | ý 3: 48 từ (> 45) |
| contract-ekyc.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| contract-ekyc.md | ý quá dài | ý 5: 74 từ (> 45) |
| first-to-pay.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| holding-deposit.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| holding-deposit.md | ý quá dài | ý 1: 49 từ (> 45) |
| holding-deposit.md | ý quá dài | ý 2: 59 từ (> 45) |
| holding-deposit.md | ý quá dài | ý 10: 149 từ (> 45) |
| holding-expiry.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| holding-expiry.md | ý quá dài | ý 3: 46 từ (> 45) |
| maintenance.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| maintenance.md | ý cụt | ý 5 kết thúc bằng ":" nhưng không có ý con — "Phân định chi phí theo Hộ chiếu bàn giao số:" |
| move-out.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| move-out.md | ý quá dài | ý 6: 52 từ (> 45) |
| op1-overview.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| op1-overview.md | chờ duyệt | 9 ý đánh dấu "CẦN DUYỆT" |
| privacy.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| security-deposit.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| security-deposit.md | ý quá dài | ý 1: 48 từ (> 45) |
| viewing-process.md | thiếu người duyệt | không có `reviewer:` / `owner:` (brief 3C.3 yêu cầu nguồn + ngày cập nhật + người duyệt) |
| fast-deposit.md ↔ holding-deposit.md | trùng ý | ý 6 ↔ ý 9 (giống 61%): "Khoản cọc đã giảm là Tiền cọc bảo đảm đầy đủ, không phải nộp bù, và kh…" |
| holding-deposit.md ↔ holding-expiry.md | trùng ý | ý 8 ↔ ý 2 (giống 65%): "Trong thời hạn giữ chỗ, khách hoàn tất xác minh CCCD để hệ thống lập H…" |
| holding-deposit.md ↔ security-deposit.md | trùng ý | ý 9 ↔ ý 2 (giống 64%): "Khi ký Hợp đồng thuê, khoản cọc chuyển 100% thành Tiền cọc bảo đảm, kh…" |

## Mâu thuẫn code ↔ pháp lý trong `_conflicts.md` (cần người phụ trách xác nhận còn hiệu lực)

Duyệt lần cuối: 2026-10-07. Khi API và tri thức nói khác nhau thì API đúng; các mục dưới đây là chỗ chưa chốt:

- C1. Thời hạn giữ chỗ mặc định bao lâu?
- C2. Hết hạn giữ chỗ có luôn mất cọc không?
- C3. eKYC chưa chạy ⇒ khách không thể hoàn tất nghĩa vụ trong hạn
- C4. Không chỗ nào chuyển cọc sang `CONVERTED_TO_CONTRACT`
- C5. Khoản cọc bị mất chia cho ai?
- C6. Hết hạn được xử lý ngay hay "lười"?
- C7. Khách thua First-to-Pay được hoàn tiền khi nào?
- C8. Khách chuyển sai số tiền thì sao?
- C9. Chủ nhà vi phạm hoặc bất khả kháng
- C10. Nội dung chuyển khoản VietQR
- C11. Còn văn bản nhắc "Thỏa thuận cọc" riêng
- C12. Nhắc hẹn mười phút trước, nút Zalo, tự đóng no-show
- C13. Geofence trong Hộ chiếu bàn giao
- C14. Ai hoàn Tiền cọc bảo đảm khi trả nhà?
- C15. Mức Tiền cọc bảo đảm
- C16. Badge "Căn hời" gần như không bao giờ bật
- C17. Dữ liệu OP1 chưa kiểm chứng
- C18. Đường dẫn thư mục tri thức
