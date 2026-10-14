# VINSTAY AI — BACKEND SERVICE PLATFORM

Hệ thống API Backend toàn diện cho nền tảng thuê căn hộ Asset-Light tại **Vinhomes Ocean Park (The Sapphire 1 & 2)**.

> **Công nghệ:** NestJS 10 + Prisma ORM + PostgreSQL trên Supabase; Storage dùng cho ảnh hồ sơ. Đăng nhập do backend quản lý, không dùng Supabase Auth.
> **Tuân thủ chuẩn:** [SAD v2.0](../docs/SAD_v2.md), bộ văn bản pháp lý [`legal/`](../legal/) và [Interactive Prototype Guide](../docs/PROTOTYPE_GUIDE.md).  
> **🎯 TRÌNH DIỄN SƠ ĐỒ & TÀI LIỆU BACKEND:** Mở tệp tin [`backend/BACKEND_SHOW.html`](./BACKEND_SHOW.html) để xem tài liệu cơ bản và bấm nút **"Mở Trình Chiếu Sơ Đồ (Show Mode)"** để xem 6 sơ đồ kiến trúc tương tác!

---

## 1. DANH MỤC API THEO MÀN HÌNH & LUỒNG NGHIỆP VỤ

Danh mục API được dựng từ **các màn hình và luồng nghiệp vụ** của 4 cổng (Khách thuê, Chủ nhà, Field Host, Admin).
API đọc/ghi dữ liệu nghiệp vụ bằng Prisma trên database Supabase và bám theo quy tắc trong [`legal/`](../legal/) và [`AGENTS.md`](../AGENTS.md).

> **Nguồn hiện hành:** Bảng endpoint bên dưới có các hàng kế hoạch được viết trước khi API hoàn thiện. Hợp đồng route, quyền và trạng thái provider hiện tại được xác định bởi controller/service và Swagger tại `/api/docs`.

- Base URL `/api/v1` · Swagger `/api/docs` · Phiên = cookie httpOnly (xem §4).
- Route công khai, xác thực và phân quyền được khai báo bằng decorators trên controller/route; backend là nguồn quyết định quyền thực tế.
- Trạng thái so với code backend: ✅ đã có · ⚠️ đã có nhưng lệch nghiệp vụ (phải sửa) · ⬜ chưa có (đường dẫn là đề xuất).

### 1.0. Quy tắc nghiệp vụ API phải tuân thủ

Giá thuê và phí quản lý căn lấy từ bản ghi Supabase. Biểu giá gửi xe/điện nước và ngưỡng nghiệp vụ hiện theo quy tắc trong code; biến phí Host và thời hạn giữ chỗ đọc từ `FeeConfig` khi có cấu hình.

| Quy tắc | Nội dung | Nguồn |
|---|---|---|
| All-in Cost | tiền thuê + phí quản lý lưu trên căn + biểu giá gửi xe + điện nước ước tính theo số người | AGENTS (Khách thuê #2) |
| Badge "Căn hời phân khu" | rẻ hơn ≥ 10% so với layout cùng phân khu | AGENTS (Chủ nhà #1) |
| Xác thực SĐT | OTP Zalo bắt buộc trước khi đặt lịch, mỗi SĐT xác thực một lần | AGENTS (Chủ nhà #2) |
| Điều phối | 3 tầng: Host gần nhất → Open Pool 500m sau 3 phút → Area Lead; nhắc hẹn kép T-10m | AGENTS (Vận hành #3, #5) |
| Mã cửa | chỉ cấp khi Host xác nhận xem phòng tại cửa; không Lockbox, không QR sảnh | AGENTS (Chủ nhà #2) |
| Cọc chốt căn (cọc v2) | khách chuyển ngay **Tiền cọc bảo đảm của căn** (`units.security_deposit`, mặc định 1 tháng thuê; không còn 2.000.000đ cố định) qua VietQR cấu hình bằng tài khoản nhận thật; số tiền do server tính; tạo giao dịch bị khóa nếu thiếu cấu hình nhận/đối soát — xem §1.1.1 | [legal/02](../legal/02_HOLDING_AND_SECURITY_DEPOSIT_AGREEMENT.md) |
| Điều khoản cọc | khách tick đồng ý trước khi hiện VietQR — **không** ký thỏa thuận cọc riêng | AGENTS (Chủ nhà #3) |
| Kết cục cọc | ký HĐ thuê → chuyển **100%** vào Tiền cọc bảo đảm, không nộp bù (không trừ tiền thuê tháng đầu) · khách quá hạn/từ chối → mất cọc, chia 50% chủ nhà / 50% nền tảng · chủ nhà vi phạm → hoàn cọc + phạt tương đương · bất khả kháng → hoàn 100% | [legal/02 Điều 6](../legal/02_HOLDING_AND_SECURITY_DEPOSIT_AGREEMENT.md) |
| Tiền cọc bảo đảm | chủ nhà đặt từ nửa tháng đến 3 tháng thuê (mặc định 1 tháng) = khoản cọc khi chốt căn; giữ nguyên suốt kỳ thuê để cấn trừ hư hỏng nội thất, phạt BQL, nợ điện nước; hoàn khách khi thanh lý HĐ | [legal/06 Điều 4](../legal/06_OFFICIAL_APARTMENT_LEASE_AGREEMENT.md) |
| Uỷ quyền độc quyền | 12 tháng, tự gia hạn; chủ nhà thoát khi căn trống, báo trước 15 ngày, hết hạn thì thu hồi mã cửa | [legal/01 Điều 8](../legal/01_EXCLUSIVE_RENTAL_MANDATE.md) |
| Biến phí Field Host | phí lượt dẫn, hoa hồng chốt cọc, hệ số đánh giá, thưởng nóng — Admin cấu hình, có nhật ký | AGENTS (Vận hành #4) |

Vòng đời lịch xem: `pending → confirmed → lobby → receiving → viewing → closing → holding → leased`;
nhánh phụ `completed` (xem xong chưa thuê), `no_show`, `cancelled`, `rejected`.

### 1.1. 👤 Công khai & Khách thuê

Màn: trang chủ chat AI, danh sách/chi tiết căn, đặt lịch xem & OTP, theo dõi lịch hẹn và các cổng Chủ nhà/Host/Admin. VietQR yêu cầu cấu hình nhận/đối soát thật; eKYC và lập hợp đồng tạm khóa đến khi tích hợp nhà cung cấp thật.

| Endpoint | Vai | Nghiệp vụ / Contract | TT |
|---|---|---|---|
| `GET /properties/buildings` (A1) | công khai | Bộ lọc toà | ✅ |
| `GET /properties/units` (A1) | công khai | Catalog căn hộ: All-in Cost, Căn hời, ẩn căn 0 ảnh | ✅ |
| `GET /properties/units/:code` (A2) | công khai | Chi tiết căn hộ: `holdHours`, `activeViewingAt`, `photos` | ✅ |
| `GET /properties/units/:code/busy-slots` (A3) | công khai | Khung giờ đã bận của căn hộ trong 14 ngày | ✅ |
| `POST /auth/otp/send` (A4) `{phone, purpose}` | công khai | Gửi OTP 4 số → `{expiresInSeconds, resendInSeconds}`; `OTP_PROVIDER=mock` thêm `devOtp` (xem §4.1). Zalo thật chưa cấu hình ⇒ 502 `otp_send_failed` | ⚠ Zalo thật chưa tích hợp |
| `POST /auth/otp/verify` (A5) `{phone, purpose, code}` | công khai | Xác thực OTP thật → sinh `actionToken` dùng 1 lần (15 phút) | ✅ |
| `POST /bookings` (A6) | tenant | Đặt lịch xem phòng với `actionToken` hợp lệ | ✅ |
| `GET /me/bookings` (A7) | tenant | Danh sách lịch xem của tôi (chỉ xem lịch thuộc tài khoản) | ✅ |
| `GET /bookings/:ref` (A8) | tenant | Chi tiết lịch xem (timeline 7 bước, DTO TenantBooking) | ✅ |
| `POST /bookings/:ref/cancel` (A9) | tenant | Huỷ lịch xem phòng (trước ≥ 2h) | ✅ |
| `POST /bookings/:ref/reschedule` (A10) | tenant | Đổi giờ xem phòng (trước ≥ 2h, kiểm tra slot bận) | ✅ |
| `POST /bookings/:ref/late` (A11) | tenant | Báo xin đến muộn 10 phút | ✅ |
| `POST /bookings/:ref/lobby-checkin` (A12) | tenant | Bấm "Tôi đã có mặt tại sảnh" | ✅ |
| `POST /bookings/:ref/rating` (A13) | tenant | Chấm sao đánh giá Field Host | ✅ |
| `GET /legal/deposit-terms` (A14) | công khai | Văn bản điều khoản cọc (`DEP-2026.10-v2`), 6 nội quy BQL, phiên bản pháp lý; `?unitCode=` ⇒ số tiền + giờ giữ căn của căn đó (không có ⇒ `amount: 0`) | ✅ |
| `GET /bookings/:ref/fast-close` (A14b) | tenant (chủ lịch) | Báo giá chốt nhanh 1/3/6 tháng khi lịch `closing` và chủ nhà ủy quyền; không bao giờ trả giá sàn | ✅ |
| `POST /bookings/:ref/deposit` (A15) `{acceptTerms, termsVersion, fastCloseCycle?}` | tenant | Tạo cọc và URL VietQR từ tài khoản nhận thật; chưa có tiền về thì gọi lại để báo giá lại trên cùng khoản cọc; từ chối nếu thiếu webhook secret | ⚠ thiếu cấu hình trong `.env` hiện tại |
| `POST /vietqr/webhook` (A16) | ngân hàng/đối tác webhook | First-to-Pay Wins; cần cấu hình callback thật về endpoint này | ⚠ chưa có provider callback |
| `POST /bookings/:ref/ekyc/scan` (A17) | tenant | Quét CCCD qua provider eKYC | ⚠ chưa tích hợp provider |
| `POST /bookings/:ref/ekyc` (A18) | tenant | Xác minh danh tính và xác lập HĐ sau khi provider trả kết quả thật | ⚠ chưa tích hợp provider |
| `POST /contracts/lease/sign` (A18b) `{bookingRef, startDate, months, paymentCycle, signatureSvg}` | tenant | Ký HĐ thuê: `startDate` = ngày dọn vào (T0+2…T0+30), HĐ tính tiền từ ngày dọn vào hoặc T0+7 nếu muộn hơn; cọc chốt nhanh bắt buộc đúng chu kỳ + giá đã chốt (422 `lease_terms_invalid`) | ✅ |
| `GET /me/contracts` (A19) | tenant | Danh sách hợp đồng thuê: thời hạn, cọc, tiền thanh toán kỳ 1 | ✅ |
| `GET /me/contracts/:id/pdf` (A20) | tenant | Tải PDF HĐ thuê chính thức tiếng Việt có niêm phong sha256 | ✅ |
| `GET/PUT/DELETE /me/favorites[/:code]` | đăng nhập | Căn đã lưu theo tài khoản (bảng `favorite_units`), nhận mã căn hoặc UUID, trả DTO `TenantUnit` | ✅ |

#### 1.1.1. Cọc v2 — cọc bằng Tiền cọc bảo đảm, Chốt nhanh, Smart Move-in (2026-10-14)

- **Số tiền** (`deposit/deposit-amount.ts#securityDepositAmount`): `units.security_deposit`, chưa đặt ⇒ `base_rent_price`. Server tính,
  bỏ qua `amount` client gửi. VietQR in đúng `holding_deposits.amount`; webhook chỉ gạch nợ khi số tiền **khớp đúng** khoản cọc
  (lệch ⇒ `ignored` + audit `DEPOSIT_AMOUNT_MISMATCH {expected, received}`).
- **Chốt nhanh** (`deposit/fast-close.ts`): chỉ khi meta ký gửi mới nhất có `allowFastClose` + `floorRent`
  (`exclusiveMandate.doorAccessConfig.consignment.form`, đọc bằng `readConsignmentMeta`). Chu kỳ 1/3/6 ⇒ giá thuê
  `max(floor, round50k(rent × (1 − 3,5% / 5,5% / 10%)))`; cọc giảm `max(200k, round50k(5%))`, trần `floor50k(8%)`.
  Báo giá hết hạn sau **24 giờ** (`quote_expires_at`); tiền về sau mốc đó ⇒ `REFUNDED` + escrow `INBOUND_DEPOSIT`/`REFUND`,
  audit `DEPOSIT_QUOTE_EXPIRED_REFUND`, căn không khóa. Đổi lựa chọn khi chưa có tiền về ⇒ ghi đè đúng dòng
  (`viewing_id` UNIQUE), audit `DEPOSIT_REQUOTED` (cũ/mới). Không phụ phí thuê ngắn hạn.
- **Smart Move-in** (`contract/move-in.ts`, giờ VN): T0 = `paid_at`; dọn vào T0+2…T0+30; miễn phí chờ tới T0+7, muộn hơn
  ⇒ HĐ + tiền thuê bắt đầu T0+7. Sai khung ⇒ 422 `lease_terms_invalid` + `errors.startDate` + `errors.window`.
- **Ký HĐ**: `monthlyRent = quoted_monthly_rent ?? base_rent_price`; cọc v2 ⇒ `securityDeposit = amount`, không thu bù. Cọc cũ
  (`terms_version` `HOLD-*`, 2.000.000đ) vẫn ký được: cọc bảo đảm theo căn, kỳ đầu thu phần chênh.
- **Migration** (đã áp DB thật 2026-10-14): `prisma/migrations-sql/20261014_deposit_v2_fast_close/{up,down}.sql` — thêm 4 cột
  nullable `base_amount`, `fast_close_cycle`, `quoted_monthly_rent`, `quote_expires_at` vào `holding_deposits`.
  Áp: `npx prisma db execute --file prisma/migrations-sql/20261014_deposit_v2_fast_close/up.sql --schema prisma/schema.prisma`.

### 1.3. 🏠 Chủ nhà

Màn: tổng quan, căn của tôi, ký gửi căn mới, hồ sơ ký gửi, tài chính, yêu cầu thoát uỷ quyền, tài khoản.

| Endpoint | Vai | Màn hình / bước nghiệp vụ | TT |
|---|---|---|---|
| `GET /landlord/dashboard` | landlord | tổng quan | ⚠️ bản tối thiểu, UI làm sau |
| `GET /landlord/units` | landlord | danh sách căn đã ký gửi (trạng thái căn + ủy quyền, giá hiện hành) | ✅ |
| `GET /landlord/units/:id` | landlord | chi tiết căn **gồm luôn** `viewings` + `doorAudit`: All-in, ủy quyền + ngày gia hạn, giữ chỗ, HĐ đang chạy (không có mã cửa); các truy vấn chạy song song, phí và danh bạ Host cache 60 giây | ✅ |
| `GET /landlord/units/:id/viewings` | landlord | nhật ký xem phòng (khách bị che SĐT) | ✅ |
| `GET /landlord/units/:id/audit-trail` | landlord | nhật ký mở cửa của căn (lọc theo căn) | ✅ |
| `GET /landlord/consignments` · `GET /landlord/consignments/:id` | landlord | hồ sơ ký gửi + kết quả thẩm định | ✅ |
| `POST /landlord/consignments` `{building, floor, door, layout, areaM2, askRent, suggestedDeposit, leaseTerm (mid\|long\|fixed), furnished, locks[], doorCode, note, draft}` | landlord | form ký gửi căn → tạo Unit `UNLISTED` + ủy quyền `PENDING_INSPECTION` (draft) | ✅ |
| `POST /landlord/consignments/:id/photos` (multipart `files`) · `DELETE /landlord/consignments/:id/photos/:photoId` | landlord | đính kèm/xóa ảnh tham khảo của hồ sơ: JPG/PNG/WebP (kiểm tra theo nội dung file), ≤3MB/ảnh (web nén ảnh trước khi gửi), tối đa 8 ảnh; chỉ khi hồ sơ còn nháp hoặc chờ Host nhận. Lưu Supabase Storage bucket **private** `consignment-photos` (tự tạo lần đầu), xem qua link ký 1 giờ. **Không** ghi vào `UnitMedia` — ảnh Verified do Host chụp khi thẩm định | ✅ |
| `POST /landlord/consignments/send-otp` `{phone?}` | landlord | gửi OTP Zalo tới SĐT đã lưu của chủ nhà (chưa có SĐT thì dùng `phone` truyền lên) → `{otpRequired, maskedPhone, expiresInSeconds, resendInSeconds}`; mock thêm `devOtp` (§4.1) | ✅ |
| `POST /landlord/consignments` `{…form, ownershipWarranted, otp, phone?}` | landlord | ký ủy quyền bằng OTP (PHONE_VERIFY); số ĐÃ XÁC THỰC của tài khoản ⇒ KHÔNG cần OTP (`send-otp` trả `otpRequired:false`); nhập số khác hoặc tài khoản chưa có số ⇒ bắt buộc OTP trên số đó. Số ký lưu mã hoá trong hồ sơ ký gửi, KHÔNG gắn vào tài khoản, không kiểm trùng; → giao Inspector phân khu, SLA 48h | ✅ |
| `GET /landlord/finance` | landlord | khoản thu: tháng này, 6 tháng, theo căn, cọc giữ hộ; phí dịch vụ đọc từ FeeConfig `landlord_service_fee_rate` (chưa có ⇒ 5% tạm, `feeSource: "default"`) | ✅ tính từ hợp đồng |
| `POST /landlord/mandates/request-exit` `{mandateId, reason}` · `POST /landlord/mandates/cancel-exit` `{mandateId}` | landlord | thoát ủy quyền: chỉ khi căn `AVAILABLE`, báo trước 15 ngày | ✅ (chưa có job thu hồi mã cửa khi hết hạn) |

Mọi route `/landlord/*` có `@Roles('landlord')`; `landlordId` lấy từ phiên, căn của người khác trả 404.
Hồ sơ ký gửi lưu phần mở rộng (giá cọc đề xuất, nội thất, hạn thẩm định, báo cáo…) trong `ExclusiveMandate.doorAccessConfig.consignment`; mã cửa lưu mã hóa ở `DoorAccessKey.vaultSecretRef` (`aes:` + AES-256-GCM), không trả lại qua API.

### 1.4. 🚶 Field Host (Sale / Inspector)

Màn: bảng điều phối, buổi xem phòng, thẩm định căn ký gửi, thu nhập, cẩm nang, tài khoản.

| Endpoint | Vai | Màn hình / bước nghiệp vụ | TT |
|---|---|---|---|
| `GET /host/board` | field_host (sale) | **Lịch & yêu cầu**: yêu cầu mới (ASSIGNED 3′ → Open Pool phân khu → mọi Sale) · lịch của tôi · lịch sử · KPI — 1 request, web poll 15″ | ✅ |
| `POST /host/tickets/:id/accept` · `/reject` `{reason}` · `/claim` | field_host (sale) | nhận ticket được giao / từ chối (giao Sale khác) / nhận trong Open Pool (nguyên tử, ai nhận trước thắng) | ✅ |
| `GET /host/viewings/:ref` | field_host (sale) | chi tiết ca — chỉ chủ ca (khác ⇒ 404), có SĐT đầy đủ của khách | ✅ |
| `POST /host/viewings/:ref/remind` · `/receive` · `/no-show` | field_host (sale) | nhắc T-10 (chỉ ghi mốc) · đã đón khách ở sảnh · khách không đến (≥ giờ hẹn + 15′) | ✅ |
| `POST /host/viewings/:ref/open-door` · `/door-code` | field_host (sale) | [Mở cửa] ca RECEIVING → VIEWING, trả mã cửa hiển thị 10′ + ghi `DOOR_KEY_REVEAL` cho chủ nhà; thiếu mã ⇒ 409 `door_code_missing` (không có PIN giả) | ✅ |
| `POST /host/viewings/:ref/start-deposit` · `/not-interested` `{reason}` · `/emergency` | field_host (sale) | khách muốn cọc (⇒ CLOSING, khách tự quét VietQR — Host không đụng tiền) · khách chưa quyết · báo sự cố khoá/chìa (chỉ ghi nhật ký) | ✅ |
| `PATCH /host/me/duty` `{status}` | field_host (sale) | bật/tắt trực (đang dẫn khách ⇒ 409 `host_busy`) | ✅ |
| `GET /host/inspections` · `GET /host/inspections/:id` | field_host (inspector) | **Thẩm định ký gửi** (hồ sơ 16): ca giao cho tôi + Open Pool (sau 4h chưa nhận) + đã nộp; chi tiết kèm catalog 32 hạng mục, ảnh tham khảo chủ nhà, ảnh đã chụp | ✅ |
| `POST /host/inspections/:id/accept` · `/claim` · `/door-code` | field_host (inspector) | nhận ca được giao · nhận ca Open Pool (nguyên tử) · lấy mã cửa (hiển thị 10′, ghi `DOOR_KEY_REVEAL`; thiếu mã ⇒ 409 `door_code_missing`) | ✅ |
| `POST /host/inspections/:id/photos` (multipart `file`, `slot`, `room?`) · `DELETE .../photos/:photoId` | field_host (inspector) | ảnh hạng mục (1–4/dòng) + ảnh niêm yết (4–12); kiểm theo nội dung, cạnh ngắn ≥200px, ≤3MB; bucket private, đường dẫn `inspections/<mandateId>/…` | ✅ |
| `POST /host/inspections/:id/photos/import-landlord` | field_host (inspector) | đưa ảnh tham khảo chủ nhà gửi vào ảnh niêm yết (phòng "Khác", `fromLandlord: true`) MỘT lần mỗi ca — SAO CHÉP file nên Host xoá không đụng ảnh gốc; ảnh hỏng/quá nhỏ bỏ qua, chỉ lấy phần còn chỗ trong hạn mức 12 ảnh; gọi lại ⇒ `[]`. Web tự gọi khi mở phiếu | ✅ |
| `POST /host/inspections/:id/submit` | field_host (inspector) | nộp phiếu 32 hạng mục. **Đạt (căn bình thường) ⇒ một giao dịch tự niêm yết** (ủy quyền ACTIVE, căn AVAILABLE + Verified, ảnh niêm yết vào `UnitMedia`) — KHÔNG qua Admin; đổi giá/cọc ⇒ `awaiting_landlord`. **Không đạt (căn bất thường) ⇒ `reviewing`, chờ Admin** (`/admin/consignments/:id/approve|reject`). `livingFees` `{mgmtFeePerM2, motorbikeFee, carFee, note?}` (biểu phí thực tế tại tòa, số nguyên; ghi chú ≤150 ký tự, cấm SĐT/link) ⇒ khi niêm yết ghi vào căn (`management_fee`, `motorbike_fee`, `car_fee`, `fee_note`) và All-in Cost (matchmaker, `GET /units`) tính theo căn; căn chưa có ⇒ đơn giá chung `fee_configs`. Lỗi phiếu ⇒ 400 `report_invalid` kèm `field` | ✅ |
| `GET /media/listing/:mandateId/:file` | public | ảnh niêm yết của căn đã đạt (ảnh hạng mục/hồ sơ chưa đạt ⇒ 404), cache 1 ngày | ✅ |
| `GET /host/inspections` | field_host (inspector) | danh sách căn ký gửi cần thẩm định | ⬜ |
| `POST /host/inspections/:consignmentId/accept` | field_host | nhận việc thẩm định | ⬜ |
| `POST /host/inspections/:consignmentId/report` | field_host | nộp báo cáo: đối chiếu thông tin khai báo, kiểm kê nội thất có ảnh + % độ mới, diện tích thông thuỷ, đề xuất duyệt/từ chối | ⬜ |
| `POST /handovers` · `GET /handovers/contracts/:contractId` | field_host / tenant | Hộ chiếu bàn giao số 10 hạng mục + công tơ điện nước | ✅ |
| `GET /host/earnings` | field_host | thu nhập: lượt dẫn, hoa hồng, thưởng | ⬜ |

### 1.5. ⚙️ Admin

Màn: tổng quan, rổ hàng ký gửi, lịch hẹn & điều phối, sổ hợp đồng (mẫu, bên ký), Field Host, biến phí, cài đặt.

| Endpoint | Vai | Màn hình / bước nghiệp vụ | TT |
|---|---|---|---|
| `GET /admin/bi-funnel` `?from&to` | ops_admin | tổng quan: phễu, no-show, lịch xem/ngày theo khoảng; lấp đầy, heatmap, rổ hàng, lịch xem hôm nay/hôm qua (ảnh chụp hiện tại) — cách tính ở §1.5.1 | ✅ |
| `GET /admin/dispatch-sla/summary` `?from&to` | ops_admin | SLA theo tầng, `actionable` (việc điều phối), thời gian nhận ca từng Host (lọc theo `offeredAt` khi có khoảng) | ✅ |
| `GET /admin/dashboard/work-items` | ops_admin | "Việc cần xử lý" + badge menu admin: điều phối tay / quá SLA, hồ sơ ký gửi chờ phân Host / quá hạn 2h, căn đang thoát uỷ quyền, sổ hợp đồng cần xử lý | ✅ |
| `GET /admin/activity` `?limit=1..50&before=<cursor>` | ops_admin | dòng sự kiện từ `audit_logs`, phân trang con trỏ; chỉ trả loại hành động, đối tượng, vai + tên người làm, thời điểm (KHÔNG trả giá trị cũ/mới, IP, user-agent) | ✅ |
| `GET /admin/exclusive-inventory` | ops_admin | rổ hàng ký gửi | ✅ |
| `POST /admin/consignments/:id/approve` `{note?}` · `/reject` `{note ≥5 ký tự}` | ops_admin | quyết hồ sơ **`reviewing`** (Inspector đề xuất không duyệt — căn bất thường: giá thuê quá cao, nội thất sai hiện trạng…). Duyệt ⇒ niêm yết theo phiếu (giá/cọc trên phiếu khác chủ khai ⇒ `awaiting_landlord`); từ chối ⇒ ủy quyền `TERMINATED`. 409 `inspection_bad_stage` (không ở reviewing) / `review_incomplete` (phiếu thiếu ảnh niêm yết hoặc PIN cửa). Căn bình thường Inspector tự niêm yết, không qua đây | ✅ |
| `GET /admin/dispatch-sla` | ops_admin | lịch hẹn & cảnh báo quá SLA | ✅ |
| `GET /admin/bookings` `?tab=open\|today\|all&q&page&pageSize≤50` | ops_admin | màn điều phối: lịch xem + ticket hiện tại (Host, tầng, hạn SLA), khách (SĐT che bớt), `canReassign` + lý do, "Admin đã giao" (từ audit), `version` — phân trang/lọc/tìm (mã booking, mã căn) phía server | ✅ |
| `GET /admin/bookings/:id/reassign-candidates` | ops_admin | Host đủ điều kiện nhận ca (cùng quy tắc lúc ghi), cùng phân khu lên trước, `sameZone` để cảnh báo; `ineligible` kèm lý do; không trả SĐT/email | ✅ |
| `POST /admin/bookings/:id/reassign` `{hostId, reason, version}` | ops_admin | điều phối tay — quy tắc ở §1.5.2 | ✅ |
| `GET /admin/contracts` · `GET /admin/contracts/:id` | ops_admin | sổ hợp đồng: uỷ quyền, giữ chỗ, thuê, hợp tác Host | ⬜ |
| `POST /admin/contracts/:id/void-hold` `{reason: landlord_breach \| force_majeure, note}` | ops_admin | huỷ cọc chốt căn (chủ nhà vi phạm ⇒ hoàn 2× / bất khả kháng ⇒ hoàn 1×) | ⬜ |
| `POST /admin/contracts/:id/complete-exit` | ops_admin | hoàn tất thoát uỷ quyền sau 15 ngày | ⬜ |
| `POST /admin/contracts/:id/remind-renewal` | ops_admin | nhắc gia hạn HĐ thuê sắp hết hạn | ⬜ |
| `GET /admin/contract-templates[/:id]` · `GET /admin/contract-parties[/:id]` | ops_admin | thư viện mẫu văn bản, danh bạ bên ký | ⬜ |
| `GET /admin/field-hosts` `?q&role=sale\|inspector\|both&zone&active=true\|false` | ops_admin | danh sách Field Host (tìm theo tên/email/SĐT, lọc vai, phân khu, tài khoản khoá) | ✅ |
| `GET /admin/field-hosts/zones` | ops_admin | phân khu hợp lệ để gán cho Host | ✅ |
| `POST /admin/field-hosts` `{email, fullName, assignedZone, roles[1..2], password?}` | ops_admin | Admin tạo Host: Profile `field_host` + hồ sơ Host cùng 1 giao dịch. Không có SĐT (Host tự xác thực OTP), không có số thẻ. Email là Profile `field_host` chưa có hồ sơ Host ⇒ nhận vào. Bỏ `password` ⇒ Host chỉ đăng nhập Google | ✅ |
| `GET /admin/field-hosts/:id` | ops_admin | hồ sơ Host + `ticketStats` (7 trạng thái ticket); thu nhập/lịch xem chi tiết ở hồ sơ 15 | ✅ |
| `PATCH /admin/field-hosts/:id` `{fullName?, assignedZone?, roles?, password?, isActive?}` | ops_admin | sửa tên/phân khu, đổi vai (AuditLog `HOST_ROLES_UPDATE`), đặt lại mật khẩu, khoá/mở. Email không sửa được. Phiên của Host đọc lại ngay | ✅ |
| `DELETE /admin/field-hosts/:id` | ops_admin | khoá mềm (giữ lịch sử ticket/cọc/chi trả); Host đang có ticket OFFERED/ACCEPTED/CHECKED ⇒ 409 `host_has_active_tickets` | ✅ |
| `GET /admin/commission-engine` · `POST /admin/commission-engine/config` | ops_admin | cấu hình biến phí + nhật ký thay đổi | ✅ |
| `GET /admin/settings/hold-policy` · `PUT /admin/settings/hold-policy` `{defaultHours, reason, version}` | ops_admin | màn Cài đặt: thời gian giữ chỗ mặc định toàn sàn + người/thời điểm cập nhật cuối + 10 thay đổi gần nhất (gộp giờ riêng từng căn) — quy tắc ở §1.5.3 | ✅ |
| `POST /admin/exclusive-inventory/:id/hold-hours` `{hours \| null, reason}` | ops_admin | giờ giữ chỗ riêng một căn (chỉ khi căn `AVAILABLE`), AuditLog `UNIT_HOLD_HOURS_UPDATED` | ✅ |
| `GET /admin/reports` | ops_admin | màn Báo cáo: danh mục báo cáo (id, bộ lọc, sort, cột), phân khu, giới hạn — §1.5.4 | ✅ |
| `GET /admin/reports/:reportId` `?from&to&zone&hostId&status&sort&dir&page&pageSize≤100` | ops_admin | `host-performance` · `deals` · `host-earnings`: `{rows, summary, page, pageSize, total, meta}` — §1.5.4 | ✅ |
| `GET /admin/reports/:reportId/export?format=csv` (cùng bộ lọc) | ops_admin | CSV UTF-8 BOM, chống CSV injection, ≤ 10.000 dòng (quá ⇒ 422), 5 lần/phút (⇒ 429), AuditLog `REPORT_EXPORTED` | ✅ |
| `GET /contracts/:id/evidence-package` | ops_admin | gói chứng cứ hợp đồng | ✅ |

#### 1.5.1. Cách tính số liệu dashboard admin

- **Khoảng thời gian**: `from`/`to` dạng `YYYY-MM-DD`, là ngày lịch giờ **Asia/Ho_Chi_Minh** (UTC+7), gồm cả hai đầu. Thiếu ⇒ 7 ngày gần nhất tới hôm nay. Sai định dạng / ngày không tồn tại / `from > to` / dài hơn **90 ngày** ⇒ `400 invalid_range` kèm `errors.from|to`.
- **Phễu** (theo nhóm lịch xem, đã chốt): nhóm = lịch xem `created_at` trong khoảng, trừ `CANCELLED`. Bước 3 = số lịch của nhóm · bước 4 = có `lobby_check_in_at` · bước 5 = cọc của nhóm `PAID_HOLDING | CONVERTED_TO_CONTRACT` · bước 6 = hợp đồng của cọc đó `ACTIVE | TERMINATED_SETTLED`. Bước 1–2 (truy cập web, chat AI) **chưa có nguồn** ⇒ `count: null, available: false` (UI ghi "Chưa có nguồn dữ liệu", không phải 0). `dropRate` chỉ tính giữa hai bước liền kề đều có số và bước trước > 0.
- **No-show** = `NO_SHOW / (COMPLETED + NO_SHOW + LEASED + HOLDING + CLOSING)` của nhóm; mẫu số 0 ⇒ `null`.
- **Lịch xem mỗi ngày**: đếm nhóm theo ngày ICT của `created_at`, đủ mọi ngày trong khoảng (ngày không có lịch = 0).
- **Lịch xem hôm nay / hôm qua**: theo `viewing_slot` trong ngày ICT, trừ `CANCELLED` — không phụ thuộc khoảng.
- **Lấp đầy** = `RENTED / tổng mọi căn` (gồm UNLISTED, MAINTENANCE — đã chốt); không có căn ⇒ `null`. Heatmap theo toà cùng công thức, `< 80%` ⇒ `ATTENTION_NEEDED`. Rổ hàng/heatmap đếm bằng `groupBy` ở DB.
- **Thời gian nhận ca** = `accepted_at − offered_at` của ticket đã có Host nhận; trung bình theo Host rồi gộp có trọng số; ngưỡng hiển thị SLA 3 phút.
- **Việc điều phối** (chỉ ticket của lịch còn `PENDING_CONFIRMATION | CONFIRMED`): `manualDispatch` = `ESCALATED` + `OFFERED` tầng 3 quá hạn; `overSla` = `OFFERED` tầng 1–2 quá hạn (hạn = `offered_at + sla_seconds`; tầng 1 300 s, tầng 2–3 180 s). Không đếm trùng.
- **Hồ sơ ký gửi**: uỷ quyền `PENDING_INSPECTION` đã ký; `awaitingHost` = stage `awaiting_host`; `overdue` = stage `awaiting_host | inspecting` có `inspectDueAt` (SLA 2 h) đã qua; `total` = số hồ sơ không trùng của hai nhóm (badge menu).
- **Không cache**: mỗi lần gọi đọc DB trực tiếp (số liệu nhỏ, cần phản ánh ngay sau thao tác). Khi `viewings` lớn, đề xuất index `viewings(created_at)` (cần migration riêng, chưa làm).

#### 1.5.2. Quy tắc giao lại ca xem (reassign)

- `:id` = viewing id; ticket hiện tại = ticket mới nhất theo `offered_at`.
- **Được giao lại** khi ticket `OFFERED | EXPIRED | ESCALATED` **và** lịch `PENDING_CONFIRMATION | CONFIRMED`. Ticket `ACCEPTED/CHECKED` (Host đã nhận) hoặc lịch `LOBBY/RECEIVING/VIEWING/CLOSING` (Host đang đón/dẫn) hoặc đã kết thúc ⇒ **409 `reassign_not_allowed`**.
- **Host nhận hợp lệ**: tài khoản còn hoạt động + vai `SALE` + `ONLINE_AVAILABLE` + khác Host hiện tại + không có ticket `OFFERED/ACCEPTED/CHECKED` cho lịch khác có giờ hẹn cách < 45 phút. Sai ⇒ **422 `reassign_target_invalid`** kèm `errors.hostId`. Khác phân khu vẫn cho (UI cảnh báo).
- **Body**: `reason` 5–300 ký tự (gom khoảng trắng); thiếu/sai ⇒ **400 `invalid_request`** kèm lỗi theo field.
- **Sau khi giao**: ticket ⇒ `OFFERED`, Host mới, `offered_at = now`, `accepted_at = null`, giữ tầng & `sla_seconds` (Host mới phải bấm nhận, SLA tính lại).
- **Đồng thời**: `version` = mã hoá (`ticketId`, `hostId`, `status`, `offered_at`) của ticket lúc client tải (không cần cột version). Lệch, hoặc ghi có điều kiện `updateMany where {id, hostId, status, offered_at}` đổi 0 dòng ⇒ **409 `reassign_conflict`**, `errors.latest` = dòng mới nhất; không ghi đè.
- **Một transaction**: ghi ticket + `audit_logs` `DISPATCH_REASSIGNED` (actor, vai, `oldValue {hostId, status, tier, offeredAt}`, `newValue {hostId, status, tier, offeredAt, reason, viewingId}`). Ghi audit lỗi ⇒ rollback cả thay đổi. Trả dòng booking đã cập nhật.

#### 1.5.3. Chính sách giữ chỗ (hold-policy)

- **Nguồn duy nhất** `src/modules/deposit/hold-policy.ts` (`HOLD_HOURS_MIN 12`, `HOLD_HOURS_MAX 72`, `HOLD_HOURS_DEFAULT 48`,
  `readDefaultHoldHours`, `resolveHoldHours`). Mọi luồng dùng chung: biên bản cọc (A14), tạo cọc, báo có (webhook VietQR),
  duyệt UNC, catalog + chi tiết căn, căn đã lưu, lịch hẹn, chatbot, PDF hợp đồng.
- **Thứ tự**: giờ đã chốt trong cọc (`holding_deposits.hold_hours`, ghi lúc khách tick điều khoản) → giờ riêng của căn
  (`units.hold_hours_override`) → mặc định toàn sàn (`fee_configs.hold_hours_default`) → 48; làm tròn, kẹp [12, 72].
- **Tác động khi đổi mặc định**: chỉ cọc tạo **sau** khi lưu. Cọc chờ thanh toán giữ số giờ đã chốt; cọc đang giữ giữ `expires_at`.
- **GET** chưa ai lưu ⇒ `isDefault: true`, `defaultHours: 48`, `version: "default"`, `updatedBy: null`. Không có mock.
- **PUT** `defaultHours` số nguyên 12–72, `reason` 5–300 ký tự (gom khoảng trắng), `version` từ GET. Sai ⇒ **400 `invalid_request`**
  + `errors.<field>`. Cùng giá trị ⇒ 200 `changed:false`, không ghi gì.
- **Đồng thời**: `version` = `fee_configs.updated_at`; ghi có điều kiện (CAS theo khoảng 1 ms vì Postgres giữ micro giây); lần
  đầu (chưa có dòng) hai admin cùng tạo ⇒ unique `config_key` chặn người sau. Lệch ⇒ **409 `hold_policy_conflict`** + `errors.latest`.
- **Một transaction**: ghi `fee_configs` + `audit_logs` `HOLD_POLICY_UPDATED` (actor, vai, `oldValue {defaultHours, isDefault}`,
  `newValue {defaultHours, reason}`); audit lỗi ⇒ rollback, chính sách không đổi.

#### 1.5.4. Báo cáo admin (`modules/admin/reports`)

Mỗi báo cáo là một `ReportDefinition` riêng (`*.report.ts`, đăng ký ở `REPORTS`). Tổng hợp ở Postgres (`$queryRaw` +
`Prisma.sql`, mọi giá trị là tham số; `sort` chỉ qua whitelist), chạy trong **một transaction READ ONLY** (một kết nối — pool
Supabase session giới hạn 15) với `statement_timeout = 10s`. Khoảng ngày theo **giờ VN** `[from 00:00, to+1 00:00)`, mặc định
30 ngày, tối đa 366. Tiền trả **chuỗi decimal VND** (`SUM` numeric ở DB); tỷ lệ/trung vị làm tròn ở DB. `summary` tính trên toàn
bộ tập đã lọc (không phải trang hiện tại). Lọc phân khu/Host = Field Host được gán. Không cache (số liệu tài chính: độ trễ 0).

| Báo cáo | Chỉ số = công thức | Bảng nguồn |
|---|---|---|
| `host-performance` | **Lượt dẫn** = lịch xem giờ hẹn trong khoảng, Host đã nhận ticket (ACCEPTED/CHECKED/COMPLETED) và `viewing_started_at` có giá trị · **Căn chốt** = cọc `attributed_host_id`, `paid_at` trong khoảng, `PAID_HOLDING`/`CONVERTED_TO_CONTRACT`/`FORFEITED` (không REFUNDED) · **GRV** = Σ giá thuê căn chốt: có HĐ ⇒ `contracts.monthly_rent_price`, chưa ⇒ `units.base_rent_price` hiện tại · **Tỷ lệ chốt** = căn chốt/lượt dẫn ×100 · **Nhận ticket** = trung vị & TB `accepted_at − offered_at` (lọc `offered_at`) · **Vi phạm SLA** = nhận muộn > `sla_seconds` + ticket EXPIRED · **Đánh giá** = TB `viewings.tenant_rating` | `field_hosts`, `profiles`, `dispatch_tickets`, `viewings`, `holding_deposits`, `contracts`, `units` |
| `deals` | Từng cọc có tiền về trong khoảng (`paid_at`, REFUNDED ⇒ INBOUND đầu tiên) · **Tiền vào/hoàn** = Σ escrow `INBOUND_DEPOSIT`/`REFUND` · **Đang/đã giữ** = vào − hoàn · **Căn chốt, GRV** = cùng định nghĩa trên · **Chu kỳ chốt** = tiền về − `viewings.created_at` (ngày). Tên khách giữ họ + chữ cái đầu, SĐT `09•• ••• 678` (cả file xuất) | `holding_deposits`, `escrow_transactions`, `viewings`, `units`, `buildings`, `contracts`, `field_hosts`, `profiles` |
| `host-earnings` | Σ `host_payouts.amount` theo `created_at`, tách theo `trans_ref`: `viewing:` thù lao dẫn · `deposit:<id>` hoa hồng cọc · `:rating` / `:campaign` thưởng · `inspection:` thẩm định · Đã trả = `PAID` | `host_payouts`, `field_hosts`, `profiles` |

Lỗi: 400 `invalid_range` / `invalid_report_query` + `errors.<field>` · 404 `report_not_found` · 422 `export_too_large` · 429 xuất quá
nhanh · 401/403 theo phiên/vai. Đã bỏ (không có dữ liệu nguồn): AI Lead Scoring, ROI chiến dịch, hoa hồng sàn, chỉ tiêu KPI, loại khách, kênh.

**Hiệu năng** (Supabase ap-south-1, 30.000 lịch xem + 30.000 ticket + 10.072 cọc + 12.636 escrow + 34.553 khoản thu nhập, cache nóng):
thời gian thực thi ở Postgres (EXPLAIN ANALYZE, 2 câu/ báo cáo) — 30 ngày: 20–70 ms; 366 ngày: `host-performance` ~300 ms,
`deals` ~225 ms, `host-earnings` ~175 ms. Tổng mỗi request ~1–2 s, phần lớn là độ trễ mạng tới DB. Index đề xuất **chưa áp**
(đo không thấy khác biệt ở quy mô này; áp khi dữ liệu tăng hoặc khi EXPLAIN thấy Seq Scan chậm):

```sql
CREATE INDEX CONCURRENTLY holding_deposits_paid_at_idx ON holding_deposits (paid_at);
CREATE INDEX CONCURRENTLY holding_deposits_attributed_host_id_paid_at_idx ON holding_deposits (attributed_host_id, paid_at);
CREATE INDEX CONCURRENTLY dispatch_tickets_offered_at_idx ON dispatch_tickets (offered_at);
CREATE INDEX CONCURRENTLY host_payouts_host_id_created_at_idx ON host_payouts (host_id, created_at);
-- rollback
DROP INDEX CONCURRENTLY IF EXISTS holding_deposits_paid_at_idx, holding_deposits_attributed_host_id_paid_at_idx,
  dispatch_tickets_offered_at_idx, host_payouts_host_id_created_at_idx;
```

### 1.6. ⏱ Tác vụ nền (không có màn hình)

| Tác vụ | Kích hoạt | TT |
|---|---|---|
| Nhắc hẹn kép T-10m (push Host + Zalo 1-chạm cho khách) | lịch hẹn `confirmed` | ⬜ |
| Leo thang điều phối 3 tầng khi ticket quá 3 phút chưa nhận | ticket chưa nhận | ⬜ |
| Hết hạn giữ chỗ → xử lý mất cọc 50/50, mở lại căn `available` | hết thời hạn `holding` | ⬜ |
| Đếm ngược thoát uỷ quyền 15 ngày → ngừng niêm yết, thu hồi mã cửa | yêu cầu thoát | ⬜ |
| Cảnh báo quá hạn thẩm định ký gửi | hồ sơ chờ thẩm định | ⬜ |

---

## 2. CẤU TRÚC THƯ MỤC SOURCE CODE

```
backend/
├── prisma/
│   ├── schema.prisma          # 27 model (IAM/Auth, Property, Door Key, Mandate, Viewing/Dispatch, VietQR, eKYC, E-Sign, Handover, Payout, Audit)
│   └── legacy/                # drop_web_schema.sql — gỡ schema cũ của apps/web
│
├── src/
│   ├── main.ts                # Entrypoint, Swagger UI, cookie-parser, Global Pipes, CORS
│   ├── app.module.ts          # Root Module
│   ├── prisma/                # PrismaService & PrismaModule (Global)
│   ├── supabase/              # SupabaseService (Auth & Storage)
│   ├── testing/               # Tiện ích test
│   │
│   ├── common/
│   │   ├── decorators/        # @CurrentUser, @Roles, @Public
│   │   ├── guards/            # SupabaseAuthGuard, RolesGuard
│   │   ├── filters/           # HttpExceptionFilter
│   │   └── interceptors/      # LoggingInterceptor, TransformInterceptor
│   │
│   └── modules/
│       ├── auth/              # Đăng nhập, Google, phiên (kèm `hostRoles`), OTP Zalo (§4)
│       ├── field-hosts/       # Admin CRUD Field Host + vai Sale/Thẩm định (§1.5)
│       ├── property/          # Toà, căn hộ, All-in Cost
│       ├── matchmaker/        # AI Matchmaker & badge "Căn hời"
│       ├── booking/           # Lịch xem, check-in sảnh
│       ├── dispatch/          # DispatchAssignerService (chọn Sale), tầng 3 lớp tính lúc đọc — route `/dispatch/*` giả đã xoá (hồ sơ 15)
│       ├── host-viewings/     # Cổng Sale `/host/board|tickets|viewings` — ViewingFlowService là nguồn duy nhất chuyển trạng thái ca (hồ sơ 15)
│       ├── door/              # DoorCodeService: mã cửa `aes:<AES-256-GCM>` (`npm run rekey:door-codes`)
│       ├── deposit/           # VietQR cọc chốt căn (v2), chốt nhanh, webhook, Conflict Resolver
│       ├── identity/          # eKYC CCCD
│       ├── contract/          # Mandate, gói chứng cứ
│       ├── landlord/          # Dashboard, audit trail, thoát uỷ quyền
│       ├── handover/          # Hộ chiếu bàn giao số
│       ├── admin/             # BI funnel, rổ hàng, SLA điều phối, biến phí
│       └── audit/             # Audit Service append-only
│
├── .env.example
├── docker-compose.yml         # PostgreSQL & Redis local dev
├── package.json
└── tsconfig.json
```

Các endpoint ⬜ ở §1 dự kiến thêm vào module sẵn có (`booking`, `dispatch`, `deposit`, `landlord`, `admin`); `/me/*`
và `/host/*` cần module mới (`account`, `host`).

---

## 3. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY

### Bước 1: Cài đặt thư viện dependencies

```bash
cd backend
npm install
```

### Bước 2: Cấu hình biến môi trường

```bash
cp .env.example .env
```

_(Nếu dùng Supabase Cloud, điền `DATABASE_URL`, `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`. Nếu chạy local dev offline, cấu hình database local theo Docker Compose.)_

**Trợ lý AI (relay `modules/assistant`):** `POST /api/v1/assistant/chat` (`@Public`, giới hạn 20 req/phút/IP) chuyển tiếp SSE nguyên văn tới ai-engine (`ai-engine/`). Cần 2 biến: `AI_ENGINE_URL` (vd `http://localhost:8001`) và `AI_ENGINE_INTERNAL_KEY` (trùng `INTERNAL_KEY` của ai-engine). Body `{messages[≤20, content≤2000], locale:'vi'|'en'}`; backend tự gắn tên gọi từ phiên (không gửi id/email/SĐT). Thiếu `AI_ENGINE_URL` hoặc ai-engine chết ⇒ 503 `AI_UPSTREAM_DOWN`, web rơi về bộ lọc cũ. Khách chưa đăng nhập chỉ được `ASSISTANT_GUEST_TURNS` (mặc định 2) lượt chấp nhận mỗi IP (X-Forwarded-For đầu tiên, bộ nhớ, cửa sổ 24h); lượt sau ⇒ 401 `{code:"LOGIN_REQUIRED"}` không gọi ai-engine.

**Khung chat trang chủ (`modules/chat`):** `POST /api/v1/chat` (`@Public`, 8 req/phút/IP) là nguồn duy nhất cho chat ở `/`. Body `{message ≤250 ký tự, conversationId?, context?}` (`context` = bộ lọc FE). Luồng: phân tích câu tất định → `MatchmakerService` (nguồn DUY NHẤT của danh sách, thứ tự, `score`) → Gemini chỉ viết lời giải thích → backend kiểm lại lời đó (mã căn ⊆ danh sách, đúng thứ tự rank, số tiền khớp dữ liệu, luật cứng AGENTS) rồi mới trả. Câu hỏi quy chế trả 0 đồng từ `ai-engine/knowledge/*.md` + `fee_configs` (không gọi LLM). Fallback: Gemini lỗi/timeout/bị loại ⇒ vẫn trả danh sách thật kèm `degraded: true`; matchmaker lỗi ⇒ chỉ trả chữ, `recommendations: []`. Biến: `GEMINI_API_KEY` (chỉ ở backend, gửi qua header, không log), `GEMINI_MODEL` (mặc định `gemini-3.5-flash-lite`; dòng 2.5 Google đã khoá với tài khoản mới), `GEMINI_TIMEOUT_MS` (6000), `GEMINI_RETRIES` (1), `GEMINI_MAX_OUTPUT_TOKENS` (≤250), `CHAT_GUEST_TURNS` (15 lượt/IP/24h ⇒ 401 `LOGIN_REQUIRED`), `CHAT_KNOWLEDGE_DIR`. Lưu ý Windows: biến môi trường hệ thống `GEMINI_API_KEY` sẽ ĐÈ lên `.env`.

**Biểu phí All-in (`property/fee-rates.service.ts`):** matchmaker và chi tiết căn đọc đơn giá gửi xe máy/ô tô và điện nước/người từ `fee_configs` (`parking_fee_motorbike`, `parking_fee_car`, `utility_per_person`), cache 60s; thiếu khoá hoặc DB lỗi ⇒ dùng giá trị dự phòng bằng seed hiện tại và ghi cảnh báo. Lưu ý: `apps/web/src/lib/pricing/cost.ts` (`RATES`) vẫn là bản sao phía FE dùng để vẽ thẻ căn.

**Tài khoản (`modules/account`, `/me/*`):** user luôn lấy từ phiên (`@CurrentUser`), không nhận `userId` từ client. `GET /me/profile` (mọi cổng) trả hồ sơ của chính người gọi (`phone` dạng 0xxx, không lộ `phoneEnc`/`phoneHash`). `PATCH /me/profile` chỉ đổi `fullName` (2–100 ký tự sau khi bỏ khoảng trắng thừa, sai ⇒ 400 `profile_invalid` + `errors.fullName`); gửi `email`/`phone` ⇒ 400 `field_not_editable` + `errors.<field>` (email là định danh đăng nhập, SĐT chỉ đổi qua OTP khi đặt lịch); trường lạ (vai, cổng, trạng thái) bị loại. `GET /me/bookings`, `GET /me/contracts`, `GET /me/contracts/:id/pdf` (người khác ⇒ 404) và `GET|PUT|DELETE /me/favorites[/:code]` chỉ cho cổng tenant (`@Roles('tenant')`). `PUT` idempotent (upsert); `DELETE` idempotent kể cả căn không còn tồn tại ⇒ 200 `{saved:false}`. `GET /auth/session` KHÔNG bị throttle (proxy Next gọi cho mọi lần điều hướng từ cùng một IP).

### Bước 3: Khởi chạy Database local (Tùy chọn nếu không dùng Supabase Cloud)

```bash
docker compose up -d
```

### Bước 4: Tạo Prisma Client

```bash
npx prisma generate
```

Backend dùng schema database Supabase hiện có. Không chạy seed hoặc `prisma db push` lên database thật.

### Bước 5: Khởi chạy Backend Server ở chế độ Development

```bash
npm run start:dev
```

- **Backend API Base URL:** `http://localhost:4000/api/v1`
- **Swagger UI Interactive Documentation:** `http://localhost:4000/api/docs`

### Bước 6: Tài khoản & đăng nhập

```bash
npm run create:admin -- you@example.com 'mat-khau-manh' "Ten"   # Admin (không có đăng ký trên UI)
npm run create:admin -- you@example.com 'mat-khau-manh' "Ten"   # tạo Admin theo thông tin chỉ định
npm run set:password -- you@example.com 'mat-khau-manh'         # đặt mật khẩu cho Profile có sẵn
```

## 4. ĐĂNG NHẬP & PHÂN QUYỀN (`modules/auth`)

Toàn bộ đăng nhập nằm ở backend; `apps/web` chỉ có form và proxy `/api/v1/*` → backend.
Phiên là **cookie httpOnly** (`vs_access`, SameSite=Lax) do backend set — response không chứa token.
**Không dùng Supabase Auth** (bảng `auth.users` không liên quan): email + mật khẩu kiểm tra ngay trong bảng `public.profiles`
(`password_hash` = scrypt `scrypt$<salt>$<hash>`, NULL với tài khoản chỉ dùng Google; Prisma omit toàn cục nên cột này không
bao giờ lộ ra response của module khác). Cả hai cách đăng nhập (mật khẩu, Google/Passport) đều phát JWT phiên do backend tự ký
(HS256, `iss=vinstay-backend`, sống 7 ngày, không có refresh token — hết hạn thì đăng nhập lại). **Đăng ký không xác nhận email**:
tạo Profile rồi đăng nhập luôn; email đã có tài khoản (kể cả Google) → 409, không bao giờ đặt mật khẩu lên tài khoản có sẵn.
API client có thể dùng `Authorization: Bearer <token>`. Vai trò đọc từ DB (`profiles.role`). Supabase chỉ còn dùng cho
Postgres + Storage ảnh hồ sơ ký gửi.

Hai cổng đăng nhập trên UI: `/login` (Khách thuê / Chủ nhà) và `/admin/login` (Field Host – Sale / Thẩm định · Quản trị).

| Endpoint | Mô tả |
|---|---|
| `POST /auth/login` `{email,password,portal}` | portal = tenant / landlord / host / admin |
| `POST /auth/signup` | tenant / landlord — đăng ký xong đăng nhập luôn, không xác nhận email. Host/Admin ⇒ 403 `signup_not_allowed` |
| `GET /auth/google?portal=` → `GET /auth/google/callback` | Google OAuth (Passport; `state` = `portal.nonce`, nonce nằm trong cookie httpOnly `vs_oauth`; luôn hiện màn chọn tài khoản; nhận `login_hint=<email>` để chọn sẵn tài khoản; thành công thì set cookie không-httpOnly `vs_google_hint` {name,email} để FE hiện "Tiếp tục bằng tên …") |
| `GET /auth/session`, `POST /auth/logout` | phiên hiện tại, đăng xuất (xoá cookie) |
| `npm run set:password -- <email> <mật khẩu>` | đặt/đặt lại mật khẩu cho Profile có sẵn |
| `GET /host/me` | Field Host xem hồ sơ của chính mình (vai, phân khu, SĐT đã xác thực, ca trực). Không có số thẻ/mật khẩu |
| `POST /auth/otp/send`, `/otp/verify` | OTP xác thực SĐT của Khách thuê (không phải đăng nhập) → action token dùng một lần |
| `POST /auth/phone/send-otp`, `/phone/verify` | Chủ nhà / Field Host xác thực SĐT của mình (PHONE_VERIFY) |
| `/admin/field-hosts` (ops_admin) | Admin CRUD Field Host — xem §1.5. Host chỉ đăng nhập (email+mật khẩu hoặc Google); Profile `field_host` chưa có hồ sơ Host ⇒ 403 `host_not_provisioned`. Vai con: `@HostRoles('sale' \| 'inspector')` (guard `RolesGuard`, lỗi `host_role_missing`) |

### 4.1. OTP và Zalo giả lập (`OTP_PROVIDER`)

Một lõi `OtpService` cho mọi màn (đặt lịch, xác thực SĐT Chủ nhà/Host, ký ủy quyền): mã 4 số `crypto.randomInt`, lưu HMAC
(`otp_codes.code_hash`), TTL `OTP_TTL_SECONDS` (300), sai `OTP_MAX_ATTEMPTS` (3) lần ⇒ khóa `OTP_LOCKOUT_SECONDS` (600),
gửi lại sau `OTP_RESEND_SECONDS` (60), mã mới vô hiệu mã cũ. Kênh gửi là interface `OtpSender.send({phone, code, purpose, expiresAt})`:

| `OTP_PROVIDER` | Sender | Response gửi OTP | Ghi chú |
|---|---|---|---|
| trống / `zalo` | `ZaloOtpSender` (ZNS → `SmsFallbackSender`) | `{expiresInSeconds, resendInSeconds}` — **không bao giờ có mã** | Chưa tích hợp: thiếu `ZALO_*` ⇒ 502 `otp_send_failed` |
| `mock` | `MockZaloOtpSender` | thêm `devOtp: "0427"` | Không gửi gì ra ngoài; log `[MOCK-ZALO]`. Chỉ dev/staging nội bộ |
| giá trị khác | — | — | backend không khởi động |

`NODE_ENV=production` + `OTP_PROVIDER=mock` ⇒ backend **từ chối khởi động** (factory `otp-sender.factory.ts` throw lúc dựng DI;
test `otp-sender.factory.spec.ts`, `auth.http.spec.ts`). `MockZaloOtpSender` còn tự chặn production lần nữa, và `OtpService` chỉ trả
`devOtp` khi provider là mock. Mock chỉ thay kênh gửi: xác minh vẫn qua `/otp/verify` · `/phone/verify` · ký ủy quyền như thật.
Giao diện chỉ hiện khối "Zalo giả lập" khi response có `devOtp` (không đọc biến `NEXT_PUBLIC_*`), mã chỉ nằm trong state của màn đang mở.

Lỗi: 400 `invalid_phone` · 400 `otp_invalid` (`errors.attemptsRemaining`) · 400 `otp_not_found_or_expired` ·
429 `otp_cooldown` / `otp_locked` (`errors.retryAfterSeconds`) · 502 `otp_send_failed`.

Bật Zalo thật: điền `ZALO_OA_ID`, `ZALO_ACCESS_TOKEN`, `ZALO_ZNS_OTP_TEMPLATE_ID`, viết lời gọi API ở `TODO(zalo-zns)` trong
`zalo-otp.sender.ts`, đặt `OTP_PROVIDER=zalo` (hoặc để trống). Không phải sửa logic nghiệp vụ.

Portal `host` ↔ role `field_host`, `admin` ↔ `ops_admin`. Google: điền `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`JWT_SECRET` trong `.env`
và thêm `${WEB_APP_URL}/api/v1/auth/google/callback` vào *Authorized redirect URIs* của OAuth client (Google Cloud Console) — không cần
cấu hình gì ở Supabase Dashboard. Cùng email đã đăng ký bằng mật khẩu thì Google dùng chung Profile đó. Schema là nguồn chân lý duy nhất ở `prisma/schema.prisma`
(`prisma/legacy/drop_web_schema.sql` gỡ schema cũ của apps/web nếu DB từng áp migration đó).

### Seed nội thất DEMO cho căn chưa qua thẩm định (hồ sơ 18, fix4)
```bash
npm run seed:unit-inventory                 # chạy khô: bảng unit | furnishing | số món | độ mới TB
npm run seed:unit-inventory -- --apply      # ghi thật (xoá dòng cũ của căn rồi tạo lại, 1 transaction)
npm run seed:unit-inventory -- --overwrite  # ghi cả căn đã có dòng (mặc định bỏ qua)
```
Sinh định danh theo `unitCode`, theo `furnishing` (FULL ~85–100%, BASIC ~35–55%, EMPTY không món) trong 32 hạng mục catalog. Dữ liệu demo; căn thật sẽ bị ghi đè khi niêm yết qua thẩm định. `GET /units/:code` trả thêm `code` và `conditionPct` (độ mới %) cho từng dòng.
