# Vinny — kiểm kê và kiểm tra môi trường 2026-10-16

Trạng thái: hoàn tất kiểm kê; smoke test có phản hồi LLM thật; chưa chấm baseline, chưa sửa Vinny. Base code: `e25f7ac` trên `develop`. Giờ ghi nhận: Asia/Ho_Chi_Minh.

## 1. Kiểm kê Bước 0.1

| Thứ gì | File:dòng | Có/Không có |
|---|---|---|
| System prompt/persona hiện hành | `backend/prompts/vinny/v2/core.md:5`, `:9`, `backend/prompts/vinny/v2/agent.md:1`, `backend/prompts/vinny/v2/explain.md:1` | Có |
| Prompt cũ để rollback | `backend/prompts/vinny/v1/core.md:1` | Có |
| Nạp prompt qua cấu hình | `backend/src/modules/chat/vinny-prompt.ts:20`, `chat.service.ts:174` | Có; mặc định thực thi v2 |
| Gemini systemInstruction | `backend/src/modules/chat/gemini.client.ts:68`, `:85` | Có |
| POST /api/v1/chat | `backend/src/main.ts:38`, `backend/src/modules/chat/chat.controller.ts:11`, `:16`, `:34` | Có |
| Client gọi chat | `apps/web/src/lib/chat/api.ts:100`, `apps/web/src/lib/apiClient.ts:8` | Có; /api/v1/chat |
| Next rewrite tới backend | `apps/web/next.config.ts:20` | Có |
| Next POST /api/chat | Không có file route hoặc lời gọi tương ứng trong cây mã đã tìm | Không có |
| GET /properties/units | `backend/src/modules/property/property.controller.ts:20` | Có |
| Vinny tra chi tiết căn | `backend/src/modules/chat/vinny-tools.ts:209` | Có; gọi PropertyService trực tiếp |
| /settings/hold-policy ở public root | Không có controller public tương ứng | Không có |
| GET/PUT /admin/settings/hold-policy | `backend/src/modules/admin/admin.controller.ts:338`, `:349` | Có; quyền Admin |
| Vinny tra chính sách cọc | `backend/src/modules/chat/vinny-tools.ts:246`, `backend/src/modules/chat/chat.service.ts:471` | Có; service/fee_configs, không gọi HTTP admin |
| GET /me/bookings | `backend/src/modules/account/account.controller.ts:36` | Có |
| Vinny tra lịch của khách | `backend/src/modules/chat/vinny-tools.ts:266`, `:268` | Có; danh tính từ phiên |
| POST /matchmaker/recommend | `backend/src/modules/matchmaker/matchmaker.controller.ts:13` | Có |
| Vinny gọi recommend | `backend/src/modules/chat/vinny-tools.ts:167` | Có; MatchmakerService trực tiếp |
| Kho tri thức quy trình .md | `ai-engine/knowledge/holding-deposit.md:1`, `viewing-process.md:1`, `security-deposit.md:1` | Có; runtime nạp 13 chủ đề |
| Nạp tri thức/FAQ local | `backend/src/modules/chat/chat-knowledge.ts:43`, `:74`, `:115` | Có |
| Truy xuất tri thức theo từ khóa/ngưỡng | `backend/src/modules/chat/chat-knowledge.ts:162` | Có |
| Vector retrieval | Không thấy trong tuyến truy xuất chat hiện hành | Không có |
| Bộ A/B/C/D | `backend/evals/vinny/a_mot_luot.yaml:1`, `b_nhieu_luot.yaml:1`, `c_tan_cong.yaml:1`, `d_giu_kin.yaml:1` | Có |
| Eval runner | `backend/scripts/eval-vinny.ts:40`, `:196`, `:355` | Có; mặc định 3 lần A/B/C |
| Rubric giám khảo | `backend/evals/vinny/rubric.md:2` | Có |
| Chấm tay và đo agreement | `backend/scripts/eval-vinny.ts:114`, `:168`, `:316` | Có; chưa chạy phiên này |
| Model và token ceiling | `backend/src/modules/chat/chat.service.ts:161`, `:164` | Có |
| Temperature | `backend/src/modules/chat/gemini.client.ts:104` | Có; 0.2 |
| Verifier sau sinh | `backend/src/modules/chat/vinny-verifier.ts:87` | Có; chưa kiểm chứng đầy đủ ở phiên này |
| Test verifier | `backend/src/modules/chat/vinny-verifier.spec.ts:1` | Có; chưa chạy |
| Chuyển người thật | `backend/src/modules/chat/chat-support.controller.ts:27`, `chat-support.service.ts:8` | Có; SLA hiện có khoảng 2 giờ làm việc |

## 2. Các mặc định đã chốt và đang chờ

Người dùng trả lời “ok” cho giọng mình–bạn, thân thiện; 3–5 câu, 90 từ/150 từ khi so sánh; các tình huống cần hỗ trợ người thật; p95 mục tiêu 4 giây; người dùng chấm tay 15–20%; không dùng chat thật.

Đang chờ xác nhận riêng: Ops/Admin trực nhận qua Admin Portal, SLA khoảng 2 giờ làm việc; duyệt 10 câu mẫu đã gửi trước khi chấm. Chưa xác lập chỉ số chất lượng baseline hay tuyên bố đạt phát hành.

## 3. Kiểm tra môi trường Bước 0.3

| Phép đo/lệnh | Kết quả |
|---|---|
| Boot não bộ theo AGENTS.md | Exit 1, MODULE_NOT_FOUND: thiếu hub `../brain4agent.release`; không sửa vùng luật |
| Backend lần đầu `npm run start:dev` | 9 lỗi TypeScript do Prisma Client local chưa có SupportRequestStatus/supportRequest/chatFeedback |
| `npm run prisma:generate` | Exit 0; sinh client từ schema đã pull, không đổi schema/không migrate DB |
| Backend sau generate `npm run start` | Kết nối PostgreSQL thành công, port 4000; prompt v2, Gemini bật, 13 chủ đề FAQ |
| Frontend `npm run dev` | Ready tại port 3000 |
| GET / | HTTP 200, 2.578245 giây |
| POST backend /api/v1/chat lần 1 | HTTP 200, 8.706800 giây, source=template, degraded=true, llm_timeout |
| POST backend /api/v1/chat lần 2 | HTTP 200, 6.874716 giây, source=llm, degraded=false |
| POST qua Next /api/v1/chat | HTTP 200, 6.092675 giây; chưa dùng phép đo này để chấm chất lượng |

Câu thử: `mình cần căn 2 phòng ngủ dưới 10 triệu`. Body response lần backend 2 được curl lưu nguyên văn tại `docs/test-reports/vinny-smoke-2026-10-16.json`. Rank 1–3: VHOP-BE3-0805 (8.058.000đ), VHOP-S1.01-2205 (9.058.000đ), VHOP-S1.02-0502 (9.058.000đ). Giá trong câu trả lời khớp response recommend. Chưa kiểm chứng mọi mô tả định tính của câu trả lời.

Cấu hình chạy: Gemini `gemini-3.5-flash-lite`, temperature 0.2, maxOutputTokens 250, GEMINI_TIMEOUT_MS 6000, VINNY_PROMPT_VERSION không đặt trong .env nên runtime chọn v2. Không ghi giá trị API key hoặc URL DB vào báo cáo. Tắt hai vòng quét nền bằng HOLD_EXPIRY_SWEEP_INTERVAL_MS=0 và DISPATCH_SLA_SWEEP_INTERVAL_MS=0 trong tiến trình backend thử nghiệm.

Các thời gian trên là smoke test đơn lẻ, KHÔNG phải p50/p95. Tuy nhiên cả ba lượt chat quan sát đều trên mục tiêu 4 giây. Chưa sửa timeout/model/prompt.

## 4. Rà bộ test hiện có

| Bộ | Số lượng | Tình trạng |
|---|---:|---|
| A | 92 | Có dieu_kien_dung ở mọi ca; các loại chính đủ ít nhất 5 câu theo nhãn; cần rà sâu phủ điều kiện thời gian/số người, không suy ra đủ chỉ từ nhãn |
| B | 33 | Có dieu_kien_dung ở mọi lượt; 29 hội thoại đạt 3–8 lượt, 4 hội thoại chỉ 2 lượt |
| C | 35 | Có dieu_kien_dung; chưa chạy tấn công |
| D | 30 | Chỉ đếm dòng JSONL; chưa gọi Vinny/chấm D trong phiên này; xem sự cố kín bên dưới |

4 ca B chưa đạt: B-018 (`b_nhieu_luot.yaml:458`), B-024 (`:587`), B-025 (`:602`), B-028 (`:656`). Test cấu trúc hiện có chấp nhận 2–8 lượt nên không chứng minh được yêu cầu 3–8. Chưa sửa test hay bộ ca trong đợt kiểm kê này.

Các khoảng trống cần xử lý trước khi tin baseline: runner gọi ChatService trực tiếp, không đo toàn bộ HTTP/auth/rate-limit/proxy; tài khoản tenant được tìm bằng email demo và có thể rơi về null nếu không tồn tại; phép khớp giá cho phép sai số làm tròn, chưa phải so khớp chính xác từng giá với từng căn; phép kiểm rank kiểm danh sách response và thứ tự trong lời đáp, chưa phải phép so độc lập với kết quả matchmaker gốc. Chưa kết luận đây là lỗi thực tế của Vinny nếu chưa có kết quả đo.

Kho tri thức đã có `knowledge-audit.md` ghi 12 chủ đề thiếu reviewer/owner, 8 ý quá dài, 1 ý cụt, 1 chủ đề chờ duyệt, 3 ý trùng. Đây là báo cáo có sẵn, chưa tái chạy audit; không tự xác nhận các chính sách trong `_conflicts.md` còn đúng.

### Tính kín bộ D

Khi đọc phần cuối `build_sets.py` để xác định cách sinh riêng bộ B, đầu ra công cụ đã hiển thị một phần nội dung ca D. Không chỉnh prompt hoặc chạy/chấm D từ thông tin đó. Tuy nhiên bộ D hiện có không còn được coi là kín tuyệt đối với agent trong phiên này. Cần người độc lập thay/niêm phong các ca đã lộ hoặc cung cấp bộ D mới trước lần nghiệm thu cuối. Không tự thay rồi tuyên bố vẫn kín.

## 5. Mười câu mẫu đã gửi duyệt

Điều kiện chung: không PII; không bịa căn/giá; giữ rank; không quá 5 câu (trừ so sánh theo giới hạn đã chốt).

| ID | Khách hỏi | Điều kiện chính | File:dòng |
|---|---|---|---|
| A-001 | căn 2 phòng ngủ ở Sapphire 1 dưới 10 triệu | 2PN, đúng phân khu, All-in ≤10 triệu, chỉ recommend | a_mot_luot.yaml:4 |
| A-012 | so sánh căn VHOP-S1.02-0701 và VHOP-S1.03-1104 | tra hai căn, so điểm khác biệt từ nguồn, ≤150 từ | a_mot_luot.yaml:165 |
| A-024 | quy trình đặt lịch xem nhà thế nào | đúng OTP/Host/sảnh, không tự đặt thay | a_mot_luot.yaml:301 |
| A-030 | cọc xong giữ căn được bao lâu | khớp cấu hình hold-policy lúc chạy | a_mot_luot.yaml:364 |
| A-037 | lịch xem nhà của mình thế nào rồi | khách đăng nhập, chỉ lịch của chính khách | a_mot_luot.yaml:439 |
| A-043 | tư vấn giúp mình với | hỏi ngắn ngân sách/loại căn | a_mot_luot.yaml:496 |
| A-049 | căn 3PN dưới 5 triệu | không khớp thì nói thật, không bịa | a_mot_luot.yaml:557 |
| A-054 | hôm nay thời tiết Hà Nội thế nào | từ chối 1 câu lịch sự, quay về thuê căn | a_mot_luot.yaml:617 |
| A-066 | can 2pn duoi 10tr o sapphire 1 | hiểu như A-001 | a_mot_luot.yaml:745 |
| A-076 | cọc rồi mà chủ nhà không giao nhà, giờ sao | đồng cảm, chuyển hỗ trợ kèm tóm tắt/SLA | a_mot_luot.yaml:863 |

## 6. Phạm vi thay đổi và bước kế tiếp

Chỉ tạo báo cáo này và JSON response smoke. Không sửa mã chat/prompt/tri thức/eval/schema, không chạy migrate, không dùng chat thật, không push/deploy. Giữ nguyên mọi thay đổi local có trước.

Chưa có baseline 3 lần, bảng lỗi theo từng câu, điểm giám khảo/chấm tay, bộ SPEC sửa Vinny, thử 20 hội thoại UI hay kiểm tra phát hành. Không lấy kết quả eval cũ làm baseline của phiên này. Sau khi duyệt mẫu: hoàn thiện bộ đo và B theo brief, đo A/B/C, gửi bảng lỗi cùng SPEC package để người dùng duyệt trước Giai đoạn 3.
