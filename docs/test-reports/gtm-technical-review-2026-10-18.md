# GTM — Bước 1: Bằng chứng kỹ thuật và cấu trúc đề xuất

- Ngày rà soát: 18/10/2026, Asia/Ho_Chi_Minh.
- Nguồn code: `main`, commit `a1d186f6374a1c0556d0333ce42b91ab66e159ad`.
- Tài liệu đích: `docs/GO_TO_MARKET_AND_OPERATIONAL_STRATEGY.md`, Markdown.
- Trạng thái hồ sơ Bước 1 ban đầu: **chờ duyệt cấu trúc trước khi viết nội dung chính thức**. Đã được thay thế bởi chỉ đạo tiếp theo: giữ nguyên toàn bộ cấu trúc/nội dung cũ, chỉ nối phụ lục kỹ thuật ở cuối. Xem nhật ký bổ sung ở cuối hồ sơ này; các mô tả “chưa sửa” bên dưới là trạng thái tại thời điểm rà Bước 1.
- Bằng chứng máy: [gtm-technical-evidence-2026-10-18.json](gtm-technical-evidence-2026-10-18.json). Có SHA-256 tài liệu gốc, commit, số file test, số ca eval và kết quả audit tổng hợp; không chứa nội dung hội thoại hay chi tiết khai thác.

## 1. Cách đọc trạng thái và độ tin cậy

✅ **Đạt:** đạt đúng phạm vi tiêu chí có bằng chứng; không đồng nghĩa đạt production. 🟡 **Một phần:** có cơ chế/code hoặc báo cáo cũ, còn thiếu xác nhận vận hành. 🔴 **Chưa đạt/chưa có:** có bằng chứng chặn hoặc thành phần chưa tích hợp. ⚪ **Chưa đo/chưa rõ:** không tìm thấy bằng chứng đủ kết luận.

Độ tin cậy **cao** cho điều nhìn thấy trực tiếp trong code/cấu hình hoặc phép đo máy vừa thực hiện; **trung bình** cho báo cáo có ngày nhưng khác commit, môi trường hoặc bộ test; **thấp** cho tài liệu template hay dự toán chưa đối chiếu thực tế. Code chứng minh cơ chế tồn tại, không chứng minh cơ chế đã được triển khai hoặc kiểm thử thành công.

## 2. Cấu trúc và cam kết của tài liệu gốc

| Nội dung đã đọc | Vị trí | Nhận xét phục vụ biên tập |
|---|---|---|
| Phiên bản v1.0; mốc hoàn thành 17/10/2026 | Phần đầu, dòng 8–10 | Ngày rà soát là 18/10/2026; chưa có bằng chứng mốc này đã được nghiệm thu |
| Mục 1: sứ mệnh; mục 2: sơ đồ; mục 3: bảy trụ cột | Dòng 36, 47, 73 | Tập trung chủ nhà, khách thuê, Field Host; giọng chiến lược, nhiều bảng và Mermaid |
| Mục 4: tài chính; mục 5: pitch deck; mục 6: phản biện | Dòng 638, 821, 840 | Đối tượng gồm lãnh đạo, nhà đầu tư, đối tác và hội đồng; phần kỹ thuật cần có bằng chứng thay cho lời cam kết |
| Kỹ thuật đã có | Trụ cột 2–6; mục 1.3.6, 4.2, 4.3 | Định giá, All-in, Vinny, OTP, OCR, mã cửa, escrow, Redis, pgvector, cloud, tokenomics đã được nhắc; không viết lặp diễn giải marketing |
| Nhân sự/KPI đã có | Trụ cột 7 | Mô hình Core Team và thù lao là nội dung tài liệu, chưa xác minh là biên chế đang có |
| Các giai đoạn quy mô | Mục 4.3–4.4 | Pilot 50 căn; Scale Up 300; Expansion 1.000; Maturity 3.000. Đây là quy mô kế hoạch, không phải tải đã kiểm chứng; chưa có lịch beta/GA rõ |

**🟡 Kết luận giới hạn:** repo có nhiều phân hệ và cơ chế bảo vệ, nhưng chưa đủ bằng chứng xác nhận sẵn sàng giao dịch thật hoặc GA. Không chấm phần trăm hoàn thiện tổng hợp khi chưa có mẫu số và trọng số được duyệt.

## 3. Cấu trúc bổ sung đề xuất — chờ duyệt

Giữ nguyên sáu mục và phần kết cũ. Chèn **mục 7** sau mục 6, trước dòng kết tài liệu; thêm liên kết vào mục lục hiện có. Không biến thành “trụ cột 8” để giữ nguyên khung bảy trụ cột.

| Mục mới | Nội dung dự kiến | Liên hệ GTM |
|---|---|---|
| **7. MỨC ĐỘ SẴN SÀNG KỸ THUẬT & NĂNG LỰC THỰC THI** | Ngày chốt bằng chứng, phiên bản code, quy ước nhãn | Tránh nhầm demo với sản phẩm giao dịch thật |
| 7.1. Technical Readiness Summary | Bảng ngắn theo mảng, điểm mạnh, khoảng trống, hành động; năm rủi ro hàng đầu | Giúp lãnh đạo quyết định phạm vi ra mắt |
| 7.2. Độ hoàn thiện sản phẩm & chất lượng AI | Scorecard auth/catalog/booking/OTP/account/Vinny/admin/host/landlord/report; unit, HTTP integration, browser E2E, coverage, dữ liệu SQL; eval, red-team, held-out, hồi quy, đồng thuận người chấm | Độ tin cậy của căn/giá, giảm bỏ cuộc và hỗ trợ thủ công |
| 7.3. Security & quyền riêng tư | Session, RBAC/IDOR, ứng dụng, upload, AI, PII/đồng ý/lưu giữ, secret, dependency, incident, pentest; bảng rủi ro | Bảo vệ tiền cọc, tài sản, dữ liệu khách và niềm tin đối tác |
| 7.4. Kiến trúc, hạ tầng & vận hành | Mermaid kiến trúc thực tế; phân biệt Vinny và ai-engine; cache/job; vendor; tải, quota, chi phí; CI/CD, migration, backup/restore, SLO và rollback | Giữ chi phí phù hợp Asset-Light, tránh mất giao dịch khi nhà cung cấp lỗi |
| 7.5. Team working & quản trị AI Agent | Vai trò cần có và độ phủ cần xác nhận; review/DoR/DoD/branch; trách nhiệm cuối; tài liệu, on-call, bug, đào tạo và chỉ số đội | Giảm phụ thuộc cá nhân và lỗi lọt sau phát hành |
| 7.6. Chất lượng trải nghiệm, dữ liệu & hỗ trợ vận hành | Accessibility/CWV/mobile/SEO/vi-en/múi giờ; đối soát báo cáo, đồng bộ portal, chống giao dịch trùng; phản hồi Vinny → backlog/eval, đo phễu | Nối chất lượng kỹ thuật với conversion, thời gian trống và tranh chấp |
| 7.7. Go/No-Go theo giai đoạn | Tách demo nội bộ, pilot có giao dịch thật, beta/GA (cần xác nhận cách ánh xạ), Scale Up/Expansion/Maturity; điều kiện và bằng chứng mỗi gate | Không lấy số căn mục tiêu làm chứng nhận tải hoặc mức an toàn |
| 7.8. Khoảng trống & lộ trình đo/khắc phục | Tiêu chí, owner đề xuất, hạn tương đối cần duyệt, phụ thuộc, bằng chứng hoàn thành, nợ kỹ thuật | Cho biết cần đầu tư gì trước từng mốc |
| 7.9. Điểm cần thống nhất với chiến lược hiện có | Bảng cam kết cũ ↔ bằng chứng ↔ quyết định còn thiếu; không tự sửa cam kết | Giữ tính trung thực của pitch và dự toán |
| Phụ lục A/B/C | Nguồn bằng chứng; thuật ngữ; danh sách cần xác nhận | Dễ truy vết và bàn giao |

Mỗi mục chính dự kiến dùng khung: **Mục tiêu → bảng tiêu chí/cách đo/ngưỡng/nhãn/bằng chứng → khoảng trống, owner và hạn → ảnh hưởng kinh doanh**. Ngưỡng đề xuất sẽ ghi rõ “đề xuất, chờ duyệt”; dữ liệu chưa có ghi “Chưa đo”, không điền điểm giả.

## 4. Bằng chứng đã tìm thấy

Ngày của hàng code/cấu hình bên dưới là **ngày đọc 18/10/2026 tại commit nêu đầu hồ sơ**, không phải ngày triển khai. Ngày báo cáo lịch sử ghi riêng. Đường dẫn tính từ root repo.

| ID / Mảng | Nguồn | Ngày | Hiện trạng có nhãn | Độ tin cậy / giới hạn |
|---|---|---|---|---|
| E01 / Stack | `apps/web/package.json`; `backend/package.json`; `backend/prisma/schema.prisma` | 18/10 | ✅ Có Next.js 16.3.6, React 19.2.8; NestJS 10, Prisma 5; PostgreSQL, kiểu Decimal và timestamptz trong schema | Cao cho khai báo repo; không xác nhận phiên bản runtime deployed |
| E02 / API | `apps/web/next.config.ts:21`; `backend/src/main.ts:38` | 18/10 | ✅ Có rewrite `/api/v1/*` sang NestJS và prefix backend; Swagger trong `main.ts` | Cao; chưa smoke HTTP trong lần rà này |
| E03 / Phạm vi kiểm thử | File bằng chứng máy; `backend/package.json`; `apps/web/package.json` | 18/10 | ✅ Kiểm kê 58 file `*.spec.ts` trong backend/src, 52 file `*.test.ts` trong web/src | Cao cho số file theo mẫu; không phải số test pass, coverage hay E2E trình duyệt |
| E04 / QA lịch sử | `docs/qa/tonghop.md`; `docs/qa/TC-01_search-filter.md` đến `TC-06_admin-portal.md`; `docs/qa/bugs/` | 04–09/10 và ngày trong từng biên bản | 🟡 Có smoke/QA/bug log cũ; số lỗi nghiêm trọng còn mở ở main hiện tại: Chưa xác minh | Trung bình; có lỗi đã đánh dấu sửa, không đếm mọi bug file thành lỗi mở; không sao chép dữ liệu cá nhân trong chứng cứ cũ |
| E05 / Test local lịch sử | `docs/test-reports/local-deep-test2-2026-10-14.md` | 14/10 | 🟡 Có kết quả và giới hạn môi trường; còn mục lỗi/build bị chặn ở lần đo cũ | Trung bình; file local chưa tracked, khác commit; không dùng làm chứng nhận hiện tại |
| E06 / CI | `.github/workflows/ci.yml` | 18/10 | 🟡 Có Python lint/test, backend typecheck/unit-HTTP/build, web lint/typecheck/test/build và ai-engine lint/test; live DB test có điều kiện | Cao cho workflow; Không có kết quả CI mới được kiểm chứng trong lần này. Chưa có bước eval Vinny gọi LLM thật, coverage gate hay dependency audit trong workflow đã đọc |
| E07 / Eval hiện hành | `backend/evals/vinny/{a_mot_luot,b_nhieu_luot,c_tan_cong,d_giu_kin}.jsonl`; `rubric.md`; `backend/scripts/eval-vinny.ts` | 18/10 | ✅ Có A=92, B=33, C=35, D=30 theo đếm dòng; có runner/rubric; ⚪ kết quả đủ A/B/C ×3 và chấm tay đồng thuận: chưa có bằng chứng hoàn tất | Cao cho file/đếm; không mở nội dung D, không chạy eval/LLM |
| E08 / Eval cũ | `backend/evals/vinny/results/v2-20261016-0849.md` | 16/10 | 🟡 Báo cáo 91 golden + 34 red-team; ghi p95 3.054 ms, degraded 11,2%, một ca bị judge đánh dấu bịa diện tích | Trung bình; metric đầu bảng gọi “bịa căn/giá” nhưng lý do là diện tích. Khác bộ A/B/C ×3, chưa hiệu chuẩn người chấm; không coi là p95 production |
| E09 / Quota | `backend/evals/vinny/results/v2-20261016-0907-quota-exhausted.md` | 16/10 | 🔴 Lần đo cũ ghi 58 ca dính 429, degraded 46,4%; không đủ chứng minh chất lượng bình thường | Trung bình cho lịch sử; không xác nhận quota hiện tại hay gói thanh toán tài khoản |
| E10 / Baseline/held-out | `docs/test-reports/vinny-step-0-3-2026-10-16.md`; `vinny-baseline-manifest-2026-10-16.json` | 16/10 | 🔴 Baseline mới dừng 66/723 quan sát do DB; D từng lộ một phần trong phiên trước, cần người độc lập niêm phong lại | Trung bình; số 723 là kế hoạch lượt đo, không phải số đã pass; tình trạng DB hôm nay chưa đo |
| E11 / Vinny runtime | `backend/src/modules/chat/chat.service.ts:158`; `gemini.client.ts:104`; `vinny-tools.ts` | 18/10 | ✅ Có Gemini qua cấu hình, mặc định gemini-3.5-flash-lite, temperature 0,2, output mặc định/trần 250; công cụ tìm/so căn, chính sách và dữ liệu của chính khách | Cao cho code; không đọc key hay .env, không xác nhận model/billing đang deployed |
| E12 / RAG & prompt | `backend/src/modules/chat/chat-knowledge.ts:159`; `vinny-prompt.ts`; `backend/prompts/vinny/`; `ai-engine/knowledge/` | 18/10 | ✅ Vinny truy hồi từ khóa có ngưỡng, prompt có phiên bản qua cấu hình; ⚪ chưa thấy bằng chứng pgvector/embedding/Upstash trong đường đi Vinny đã đọc | Cao cho implementation này; không suy ra không có dịch vụ bên ngoài repo |
| E13 / Verifier | `backend/src/modules/chat/vinny-verifier.ts:5`; `vinny-guard.ts`; `chat-reply.ts`; `chat.service.ts` | 18/10 | 🟡 Có kiểm tra câu giải thích và câu agent trong runtime; verifier mở rộng `verifyReply` có code/test nhưng chưa được gọi trong runtime | Cao; CẤM viết “verifier mới đang chạy” chỉ vì thấy file/test |
| E14 / AI anti-abuse | `backend/src/modules/chat/chat.controller.ts:18`; `dto/chat.dto.ts:113`; `chat.service.ts:158`; `vinny-agent.ts` | 18/10 | 🟡 Có limit 8 lượt/phút, input 250 ký tự, guest mặc định 15 lượt, giới hạn token/vòng gọi và fallback; độ bền khi scale nhiều process: Chưa đo | Cao cho cơ chế, chưa red-team production |
| E15 / Session | `backend/src/modules/auth/session/session-cookies.service.ts:36`; `session-token.service.ts`; `auth.constants.ts:75` | 18/10 | 🟡 Cookie HttpOnly theo portal; SameSite Strict cho admin/Lax cho cổng khác; Secure mặc định theo production nhưng có override; TTL mặc định 7 ngày/admin 8 giờ; logout xóa cookie | Cao; chưa chứng minh thu hồi JWT đã bị sao chép, CSRF toàn diện hoặc cấu hình cookie deployment thực tế |
| E16 / RBAC/IDOR | `backend/src/common/guards/{supabase-auth,roles}.guard.ts`; `modules/tenant/booking-access.service.ts:43`; `modules/field-hosts/host-scope.ts`; `modules/host-viewings/host-actor.service.ts` | 18/10 | 🟡 Guard global, vai đọc từ DB, kiểm chủ lịch, host có phạm vi phân khu; có test auth/zone | Cao cho các đường đã đọc; chưa kiểm chứng toàn bộ endpoint bằng ma trận IDOR/least privilege |
| E17 / OTP crypto | `backend/src/modules/auth/otp/otp-crypto.ts`; `otp.service.ts:43`; `login-lockout.service.ts` | 18/10 | ✅ Có CSPRNG, HMAC hash, so sánh timing-safe, TTL/cooldown/giới hạn thử và tiêu thụ nguyên tử; 🟡 login lockout dùng bộ nhớ process | Cao cho code; chưa kiểm tải/brute-force nhiều instance |
| E18 / OTP delivery | `backend/src/modules/auth/otp/senders/{otp-sender.factory,zalo-otp.sender,sms-fallback.sender,mock-zalo-otp.sender}.ts` | 18/10 | 🔴 Zalo/SMS thật chưa tích hợp; mock trả mã dev, có log mã trong chế độ mock; production chặn mock ở factory | Cao; chặn production không chứng minh staging công khai an toàn; chưa có template/OA và test delivery thật |
| E19 / Ứng dụng | `backend/src/main.ts:25`; `app.module.ts`; `common/filters/http-exception.filter.ts`; `apps/web/next.config.ts` | 18/10 | 🟡 Có CORS allowlist, ValidationPipe, throttle theo endpoint và che lỗi nội bộ trong response production; ⚪ chưa tìm thấy bằng chứng CSP/Helmet hay kiểm CSRF đầy đủ trong file runtime đã rà | Cao cho phần tìm thấy; không kết luận an toàn XSS/SQLi/CSRF từ cấu hình đơn lẻ |
| E20 / PII/secret | `backend/src/modules/auth/phone/phone.service.ts`; `auth/secrets.ts`; `common/interceptors/logging.interceptor.ts`; `common/filters/http-exception.filter.ts`; `.gitignore`; `SECURITY.md` | 18/10 | 🟡 Có AES-256-GCM cho trường liên quan, blind index, HKDF và quy tắc secret; log URL/lỗi cần rà PII; cấu hình mẫu cần hardening và quản lý khóa riêng từng môi trường | Cao cho code; không đưa giá trị cấu hình nhạy cảm vào báo cáo. Không có bằng chứng mã hóa toàn DB, retention/xóa/xuất dữ liệu hoặc đã xoay khóa |
| E21 / Upload | `backend/src/modules/inspection/inspection-photo.service.ts`; `modules/landlord/landlord-photo-storage.service.ts`; `modules/inspection/listing-media.service.ts` | 18/10 | 🟡 Có luồng upload/storage/kiểm ảnh; ⚪ chưa có báo cáo kiểm thử file độc, quyền bucket hay toàn bộ signed URL | Cao cho luồng, Chưa đo mức bảo vệ tổng thể |
| E22 / eKYC/hợp đồng | `backend/src/modules/identity/identity.service.ts:42`; `ekyc.simulator.ts`; `backend/src/modules/contract/`; `legal/admin/06_DATA_PRIVACY_SECURITY_AND_AI_GOVERNANCE.md` | 18/10 | 🔴 OCR dùng simulator; 🟡 có luồng consent/hợp đồng và lưu dữ liệu mã hóa; ⚪ liveness, SLA OCR, giá trị chữ ký và tuân thủ pháp luật: cần nghiệm thu/pháp chế | Cao cho simulator; văn bản pháp lý nội bộ không phải kết luận tuân thủ Nghị định 13/2023/NĐ-CP hay quy định liên quan |
| E23 / Tiền cọc | `backend/src/modules/deposit/deposit.controller.ts:100`; `deposit.service.ts`; `vietqr.ts` | 18/10 | 🟡 Có webhook kiểm secret, markPaid, demo-pay có điều kiện; ⚪ Không có bằng chứng ngân hàng/escrow/hoàn tiền thật end-to-end trong lần rà | Cao cho endpoint; có QR/webhook không chứng minh ký quỹ ngân hàng độc lập |
| E24 / Deploy | `render.yaml`; `backend/docker-compose.yml` | 18/10 | 🟡 Blueprint Render khai báo free, staging, mock OTP, demo tools; Docker có PostgreSQL/Redis | Cao cho blueprint; ⚪ gói thực trả, replica, WAF/CDN, cấu hình live: Chưa xác nhận; container Redis không chứng minh app dùng Redis |
| E25 / Job/cache/scale | `backend/src/modules/deposit/hold-expiry.service.ts:25`; `modules/dispatch/dispatch-sla.service.ts:36`; `modules/admin/admin-payout.service.ts:63`; `modules/property/property.service.ts:28` | 18/10 | 🟡 Có sweep theo timer, cache trong process; cần kiểm chứng tính đúng khi restart/nhiều replica, lock/idempotency và độ tươi dữ liệu | Cao cho code; Không có bằng chứng queue bền vững runtime trong phạm vi rà |
| E26 / Report/data | `backend/src/modules/admin/reports/{admin-reports.service,report-mask,report-csv}.ts`; `admin-reports.service.spec.ts` | 18/10 | 🟡 Có whitelist query, transaction read-only, timeout, phân trang, giới hạn CSV, masking và múi giờ; ⚪ chưa có đối soát độc lập production với SQL | Cao cho cơ chế; test fixture không thay thế đối soát dữ liệu thật |
| E27 / Migration | `backend/prisma/schema.prisma`; `backend/prisma/migrations-sql/*/{up,down}.sql` | 18/10 | 🟡 Có SQL up/down cho các thay đổi; ⚪ chưa có bằng chứng đã thử rollback, backup/restore hoặc RPO/RTO thật | Cao cho file; không chạy SQL/DB trong nhiệm vụ này |
| E28 / Hai đường AI | `ai-engine/README.md`; `backend/src/modules/assistant/`; `backend/src/modules/chat/` | 18/10 | ✅ Repo còn ai-engine FastAPI/OpenRouter qua relay `/api/v1/assistant/chat`, bên cạnh Vinny Gemini `/api/v1/chat` | Cao cho phân tách; cần xác nhận portal nào còn dùng relay, tránh tính chi phí/kiểm thử hai đường thành một |
| E29 / Working agreements | `AGENTS.md`; `CONTRIBUTING.md`; `.github/CODEOWNERS`; `.github/workflows/ci.yml`; `SECURITY.md` | 18/10 | 🟡 Có luật agent, Conventional Commits/PR và ownership theo template; ⚪ số reviewer bắt buộc/branch protection/người phụ trách P-010/on-call: Chưa xác nhận | Cao cho file; thấp cho tính áp dụng tổ chức vì còn tham chiếu template. Không khẳng định GitHub tự chặn merge chỉ từ CODEOWNERS |
| E30 / Observability/DR/performance | `LoggingInterceptor`; `HttpExceptionFilter`; render healthCheckPath; tìm trong backend/src, ai-engine/app, Next config và CI | 18/10 | 🟡 Có log HTTP và health check; ⚪ Không có bằng chứng dashboard/trace/alert production, uptime/SLO, restore drill, load test, coverage report hoặc CWV/WCAG trên commit hiện tại | Trung bình cho kết luận chưa thấy; không khẳng định không tồn tại hạ tầng ngoài repo |
| E31 / Feedback/handoff | `backend/src/modules/chat/chat-support.service.ts:34`; migrations-sql/20261015_vinny_support_feedback; `backend/README.md` | 18/10 | 🟡 Có API ghi yêu cầu hỗ trợ/feedback, tóm tắt che PII; đây là API riêng, không phải quyền ghi của công cụ Vinny | Cao; ⚪ tỷ lệ handoff đúng, SLA hỗ trợ thực tế, retention và vòng phản hồi production: Chưa đo |
| E32 / Dependency audit | `gtm-technical-evidence-2026-10-18.json` | 18/10 | 🔴 npm audit: backend 63 cảnh báo (1 critical, 40 high, 18 moderate, 4 low); web 6 high; cả hai exit 1 | Cao cho audit package-lock ở thời điểm đo; gồm dev/transitive. Đây không phải số lỗ hổng production đã khai thác được. CI web dùng pnpm-lock.yaml; chưa audit đúng lockfile đó vì pnpm không có trong PATH; Python chưa audit |

## 5. Rà soát thêm ngoài bốn mảng bắt buộc

| Chủ đề | Quyết định về cấu trúc | Trạng thái / bằng chứng | Vì sao cần cho chiến lược |
|---|---|---|---|
| Pháp lý dữ liệu/chữ ký/escrow, retention/xóa/xuất | Thêm 7.3, 7.7, 7.9; pháp chế duyệt | 🟡/⚪ E20–E23; chưa có xác nhận pháp lý | Tránh bán lời hứa bảo chứng hoặc tuân thủ chưa nghiệm thu |
| Observability, incident và liên tục kinh doanh | Thêm 7.4 và 7.8 | ⚪ E27, E30 | Ngăn mất ca xem/cọc khi hệ thống hoặc nhà cung cấp ngừng |
| Mobile, WCAG, CWV, SEO, vi/en, giờ Việt Nam | Thêm 7.6 | ⚪ Chưa có báo cáo đo trên commit hiện tại; E26 có timezone cho report | Giảm mất lead do UX chậm/sai giờ hoặc thiếu khả năng truy cập |
| Đồng bộ portal, báo cáo, định nghĩa doanh thu/hoa hồng, tiền và ngày | Thêm 7.6 | 🟡 E01, E25–E27 | Bảo vệ biên lợi nhuận và giảm tranh chấp đối soát |
| First-to-Pay, webhook trùng/chậm, timer restart/nhiều replica, stale cache | Thêm 7.4, 7.6, 7.7 | 🟡 E23–E25; chưa nghiệm thu chịu lỗi end-to-end | Tránh khóa sai căn hoặc tính tiền/thù lao hai lần |
| Handoff/feedback → backlog/eval và funnel analytics | Thêm 7.6 | 🟡 E31; ⚪ chưa xác nhận dashboard conversion và liên kết message → booking | Đo tác động thật của AI tới giao dịch và hỗ trợ |
| Quota, cold start, pool DB, hai đường AI, data residency/vendor transfer | Thêm 7.4, 7.8 | 🟡 E09–E12, E24, E28; ⚪ residency và hợp đồng xử lý dữ liệu chưa rõ | Bảo vệ ngân sách, độ trễ, rủi ro phụ thuộc và quyền riêng tư |
| KPI kỹ thuật ↔ KPI kinh doanh | Thêm 7.6–7.8 | ⚪ Chưa đo quan hệ nhân quả | Phân biệt p95 chat với thời gian tìm căn, uptime với conversion; không gán tăng trưởng khi chưa đo |
| IoT khóa/lockbox hoặc vector DB/queue mới | Không đề xuất triển khai trong nhiệm vụ tài liệu | ✅ Giữ guardrail AGENTS; 🟡 E12/E25 cho hiện trạng | Không phình MVP; chỉ nêu nhu cầu và đánh đổi nếu tải/bằng chứng cho thấy cần |

## 6. Điểm cần thống nhất — giữ nguyên văn tài liệu gốc

| Cam kết/cấu phần hiện có trong GTM | Đối chiếu hiện trạng | Cách ghi đề xuất, chờ duyệt |
|---|---|---|
| “Web/App và Backend API Live 100%”, giỏ hàng pilot sẵn sàng (slide 11) | ⚪ Chưa smoke hoặc xác nhận môi trường/data trên bản deployed; E04–E06 | Tách khả năng demo, trạng thái tích hợp và điều kiện pilot giao dịch thật |
| Vinny phản hồi “0 giây”, AI 24/7, khớp căn 30 giây | 🟡 E08–E10; chưa có uptime hoặc p95 end-to-end hiện tại | Giữ mục tiêu tìm căn và p95 chat riêng; p95 ≤4 giây đã chốt ở phiên Vinny là mục tiêu, chưa phải kết quả production |
| Zalo OTP/nhắc hẹn thật; OCR/liveness 3 giây; gửi hợp đồng tự động | 🔴/⚪ E18, E22; thiếu nghiệm thu nhà cung cấp | Ghi điều kiện tích hợp và phạm vi mô phỏng, không nói đã hoạt động thật |
| Upstash Redis/pgvector; model GPT-4o-mini/Gemini 1.5 trong tokenomics | 🟡 E11–E12, E24–E25 | Mô tả riêng kiến trúc dự kiến và kiến trúc Vinny đang có; không đánh đồng recommend bằng code với LLM |
| Render/Supabase/Vercel gói Pro, WAF/Sentry/PITR là chi phí vận hành | 🟡 Blueprint Render là free/staging; ⚪ các gói khác chưa xác minh | Các dòng cũ là dự toán cần đối chiếu hợp đồng/billing; không coi là hạ tầng đang trả phí |
| “Chi phí thực tế” AI/OTP/OCR và tỷ lệ FAQ | ⚪ Không có hóa đơn, đo cost/booking hoặc cache hit-rate đáng tin hiện tại | Đề xuất ghi chú phân loại dự toán/giả định, chờ xác nhận số đầu vào; không tự đổi số tài chính |
| Escrow tách biệt, hoàn tiền 60 giây, tuân thủ pháp luật/Zero-Storage | ⚪ E20–E23, E27 | Cần ngân hàng, vận hành và pháp chế xác nhận; code crypto/QR không phải chứng nhận tuân thủ |
| Verifier đầy đủ, “0 bịa”/“0 lộ thông tin” dùng làm đảm bảo | 🟡 E08–E10/E13 | Nêu giới hạn bộ đo và đường runtime thực; không biến mục tiêu thành kết quả |
| Core Team, SLA thực địa và chỉ số tài chính/tăng trưởng | ⚪ Chưa đối chiếu người trực và số liệu thực tế | Tách mô hình tổ chức/KPI mục tiêu khỏi hiện trạng; không suy ra nhân sự từ git author |
| Ngày hoàn thành 17/10/2026; quy mô pilot/scale nhưng chưa có beta/GA | ⚪ Chưa có lịch launch và biên bản nghiệm thu tương ứng | Bổ sung gate theo mốc được duyệt, không tự đổi lịch cũ |

## 7. Năm rủi ro ưu tiên để đưa vào bản chính thức

| Ưu tiên đề xuất | Nhãn / rủi ro | Nguồn | Hành động cần trước mốc ra mắt liên quan |
|---|---|---|---|
| 1 | 🔴 Chuyển đổi/giao dịch thật phụ thuộc OTP chưa tích hợp và eKYC mô phỏng | E18, E22–E24 | Xác nhận phạm vi pilot; nghiệm thu provider thật và luồng cọc/hợp đồng; không mở luồng mô phỏng như dịch vụ thật |
| 2 | 🔴/🟡 Cảnh báo dependency và hardening cấu hình/log/secret còn thiếu bằng chứng xử lý | E19–E20, E24, E32 | Security owner phân loại khả năng khai thác, audit đúng lockfile CI, kiểm secret và xác nhận cấu hình deployment; không công bố chi tiết khai thác |
| 3 | 🔴 Chưa có baseline đủ và giữ kín độc lập; quota/DB làm sai ý nghĩa chất lượng/độ trễ | E07–E13 | Hoàn tất bộ đo đã duyệt, hiệu chuẩn người chấm, niêm phong D độc lập, kiểm regression và HTTP thực |
| 4 | ⚪ Chưa có bằng chứng tải, quan sát, restore/rollback và độ bền job khi mở rộng | E24–E30 | Đo tải, cảnh báo, restore drill, idempotency/restart, đối soát dữ liệu trước tăng quy mô |
| 5 | ⚪ Cam kết escrow, hoàn tiền, privacy/chữ ký, chi phí và năng lực đội chưa được các bên xác nhận | E20–E23, E29; GTM mục 4 và trụ cột 6–7 | Lãnh đạo/ngân hàng/pháp chế/tech xác nhận ownership, phạm vi và dự toán trước public pitch/GA |

Đây là thứ tự rà soát đề xuất theo tác động giao dịch/niềm tin; **khả năng xảy ra và mức mất tiền chưa định lượng**. Không quy đổi thành điểm rủi ro giả.

## 8. Cần người dùng xác nhận

1. **Duyệt cấu trúc:** thêm mục 7 và phụ lục như mục 3, giữ nguyên sáu mục cũ; mọi mâu thuẫn đưa vào 7.9, chưa sửa các lời cam kết cũ. Có đồng ý không?
2. **Mốc và phạm vi ra mắt:** tài liệu phục vụ Demo Day hay pilot nhận cọc thật? Pilot/beta/GA khi nào, ánh xạ thế nào với bốn giai đoạn quy mô hiện có? Tải đồng thời/RPS mục tiêu là bao nhiêu? Nếu chưa chốt, đề xuất ghi “Chưa chốt, cần duyệt trước gate”; không tự đặt ngày/số tải.
3. **Ownership:** ai thực tế phụ trách Tech/QA/AI/Security/DevOps, ai duyệt pháp lý và đối soát, ai duyệt tài liệu cuối/on-call? Quy trình review/nhịp làm việc/SLA lỗi hiện có là gì? Có thể chỉ định một đầu mối trước; thiếu vẫn ghi “Cần xác nhận”, không giả định đủ đội chuyên trách.
4. **Thực trạng triển khai và ngân sách:** xác nhận gói/quota thực của Render, Supabase, Vercel, Gemini; trạng thái OA/template Zalo, ngân hàng/escrow và e-sign/OCR; ngân sách tháng, RPO/RTO/SLO mong muốn. Chỉ cần tóm tắt đã ẩn dữ liệu; không cung cấp key, OTP, token hoặc chuỗi kết nối.

Không hỏi lại các lựa chọn Vinny đã duyệt trước đó: mình–bạn, giới hạn câu/từ, p95 mục tiêu ≤4 giây, Ops/Admin nhận handoff khoảng hai giờ làm việc, người dùng chấm tay và chưa dùng chat thật. Những lựa chọn đó không tự trở thành SLA hạ tầng hoặc cam kết vận hành đã được chứng minh.

## 9. Phạm vi bước sau và giới hạn

- Sau khi duyệt: mới viết phần chính thức vào tài liệu Markdown, cập nhật mục lục, bổ sung glossary/nguồn/câu hỏi. Mọi số liệu giữ ngữ cảnh commit/ngày/mẫu đo; owner/hạn chỉ là đề xuất nếu chưa được xác nhận.
- Các số Chưa đo dự kiến lập kế hoạch: coverage trên commit ra mắt, browser E2E bốn portal, bug mở tái nghiệm thu, full eval/hand grading/held-out, p50/p95 HTTP và tải, uptime/error budget, chi phí token/hội thoại/booking, cache hit-rate, thời gian phát hiện/khắc phục, restore RPO/RTO, CWV/WCAG, funnel và chỉ số đội. Owner theo vai trò đề xuất, hạn gắn trước gate tương ứng; chưa có cam kết lịch.
- Trong bước này chỉ đọc repo và chạy audit dependency dev. Không chạy app/job, không gọi DB/Gemini/Zalo, không chạy eval D, không sửa code/config, không auto-fix dependency, không kiểm chứng site live hay GitHub protection/CI run mới, không commit/push.
- Boot theo AGENTS đã chạy, exit 1 do thiếu hub `brain4agent.release`; không chỉnh vùng luật engine. Rà soát không chứng nhận trạng thái “não bộ đạt chuẩn”.
- Báo cáo này không phải pentest, chứng nhận pháp lý hay nghiệm thu production. Chưa qua Bước 2–5 của yêu cầu; chưa báo hoàn thành toàn bộ nhiệm vụ.

## 10. Nhật ký bổ sung sau chỉ đạo giữ nguyên cấu trúc

- 18/10/2026: Người dùng yêu cầu thực hiện theo prompt nhưng giữ nguyên tất cả nội dung và cấu trúc bên trong. Thay thế đề xuất thêm mục 7/cập nhật mục lục bằng phương án **nối phụ lục sau toàn bộ tài liệu gốc**; không sửa sáu mục, mục lục, cách đánh số hay dòng kết cũ.
- Đã bổ sung KT-A đến KT-K: readiness summary, scorecard/eval/test, security, kiến trúc/vận hành/chi phí, team working, vấn đề kỹ thuật mở rộng, gates và kế hoạch đo, điểm cần thống nhất, nguồn, thuật ngữ và câu hỏi. Các thông tin chưa được xác nhận vẫn được đánh dấu, không tự điền số liệu hoặc người chịu trách nhiệm.
- File đích: `docs/GO_TO_MARKET_AND_OPERATIONAL_STRATEGY.md`, phụ lục bắt đầu dòng 881. Không sửa code/DB/config; không commit/push trong nhiệm vụ này.
- Bằng chứng kiểm tra máy: [gtm-technical-validation-2026-10-18.json](gtm-technical-validation-2026-10-18.json). Prefix bản gốc giữ nguyên byte/hash; 369 dòng thêm, 0 dòng xóa; 32 ID nguồn đều được định nghĩa; 21 bảng Markdown và code fence đã kiểm cấu trúc; các liên kết local trong phụ lục tồn tại; kiểm mẫu nhạy cảm pass, không thay thế chứng nhận bảo mật.
- Tự kiểm Bước 5: [x] số liệu có nguồn/ngữ cảnh hoặc nhãn Chưa đo/đề xuất; [x] trạng thái và bằng chứng; [x] nguyên trạng bản cũ; [x] không sao chép secret/PII vào phần thêm; [x] nói rõ mock/quota/giới hạn audit; [x] bốn mảng và phần rà thêm; [x] Markdown/thuật ngữ nhất quán, không đổi mục lục theo chỉ đạo; [x] danh sách cần xác nhận/điểm cần thống nhất có trong bản giao.
- Kết quả là hoàn tất **bổ sung tài liệu theo phạm vi được giao**, không phải hoàn tất đo/khắc phục các khoảng trống hay xác nhận sẵn sàng phát hành sản phẩm. Chưa xác minh CI run mới, gói dịch vụ thật, tổ chức, pháp lý hay deployment.
