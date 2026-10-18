# Vinny — lịch sử phiên bản prompt

Chọn phiên bản bằng `VINNY_PROMPT_VERSION` (mặc định `v1`). Rollback = đặt lại biến về phiên bản trước rồi khởi động lại backend.
Mỗi phiên bản là một thư mục `vN/` gồm `core.md` (chung), `explain.md` (giải thích danh sách), `agent.md` (trả lời có công cụ).
Quy trình đổi: sao chép thư mục thành `vN+1/` → sửa → `npm run eval:vinny -- --version vN+1` → so kết quả với `evals/vinny/results/` của bản cũ → đổi biến.

| Phiên bản | Ngày | Thay đổi | Eval |
|---|---|---|---|
| v1 | 2026-10-15 | Bản đầu: persona đã chốt (mình/bạn, ≤90 từ), cọc v2 + chốt cọc nhanh, chuyển người thật, công cụ chỉ đọc | `evals/vinny/results/v1-baseline-3.5-flash-lite.md` |
| v2 | 2026-10-16 | Theo eval v1: trả lời đúng ngôn ngữ (dòng `NGÔN_NGỮ_TRẢ_LỜI`), hỏi lại đúng 1 câu ≤ 2 thông tin, `found: false` ⇒ không nhắc lại mã, luôn tra công cụ khi có mã căn, nhờ đặt/huỷ ⇒ đưa link, không cung cấp mã cửa; thêm ví dụ 9–11; chế độ giải thích nhắc All-in đã tính theo số người/xe khách nêu và nói rõ khi DỮ_LIỆU không có thông tin khách hỏi | `evals/vinny/results/v2-20261016-0849.md` (đo đủ bộ trước 2 dòng cuối của explain.md; đo lại sau khi hạn mức Gemini ngày phục hồi) |
