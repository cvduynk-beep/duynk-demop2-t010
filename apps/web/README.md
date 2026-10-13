# VinStay AI — Web (Next.js)

Giao diện 4 cổng (Khách thuê, Chủ nhà, Field Host, Admin), gọi backend NestJS (`../../backend`, `BACKEND_URL`) qua rewrite
`/api/v1/*`. Luồng khách thuê (tìm căn, chat, đặt lịch, cọc, eKYC, ký HĐ) chạy dữ liệu thật; một số màn Admin/Host/Landlord
còn dùng `src/lib/mock` (đang gỡ dần — các mục "mock" bên dưới là mô tả cũ của các màn đó).

## Dữ liệu căn hộ (`/units`, `/units/[id]`)

- **Nguồn duy nhất:** `src/lib/units/source.ts` (+ `source.server.ts` đọc env ở server). Danh sách/chi tiết luôn lấy từ DB
  qua `GET /api/v1/properties/units[/:code]`; map sang kiểu UI ở MỘT chỗ (`src/lib/tenant/adapters.ts` → `toUnit`).
- **Trình duyệt** đọc danh sách qua route Next `GET /api/catalog/units` (`?zone&layout&maxRent&q`):
  `200 { success, data: { units: TenantUnit[], source: "api" | "mock" } }` · `502 { success:false, code:"units_upstream" }`.
  Thứ hạng "Phù hợp nhất" vẫn do `POST /api/v1/matchmaker/recommend`.
- **Chi tiết** render ở server: 404 ⇒ `notFound()`; backend lỗi ⇒ `app/units/[id]/error.tsx` (Thử lại), không rơi về dữ liệu giả.
- **Fallback có cờ:** `ALLOW_MOCK_FALLBACK=true` (mặc định tắt, **bị bỏ qua ở production**) ⇒ khi backend lỗi 5xx/timeout/mạng,
  trả `src/lib/units/fixtures.ts` với `source: "mock"`, log cảnh báo ở server, UI hiện banner "Dữ liệu mẫu, chưa xếp hạng"
  (xếp theo giá thuê). 404 và danh sách rỗng thật không bao giờ bị thay bằng dữ liệu mẫu.
- **API client chung** (`src/lib/apiClient.ts`): `credentials: "include"`, timeout 15s (upload 90s), lỗi mạng/timeout có mã
  `network`/`timeout`; 401 mã `unauthorized` ⇒ chuyển về trang đăng nhập đúng cổng kèm `next` (401 nghiệp vụ như
  `LOGIN_REQUIRED` để màn hình tự xử lý); `apiErrorText` cho 403/404/429/5xx.

## Chạy

```bash
pnpm install && pnpm dev   # http://localhost:3000
```

| Lệnh | Mục đích |
|---|---|
| `pnpm dev` / `build` / `start` | chạy / build |
| `pnpm lint` / `typecheck` / `test` | ESLint / tsc / Vitest |

## Cách demo hoạt động

- **Đăng nhập (mock)**: hai cổng duy nhất — `/login` có tab Khách thuê/Chủ nhà; `/admin/login` có tab Sale (Field Host)/Quản trị. `/host/login` chỉ chuyển hướng về `/admin/login` (tab Sale mặc định), không còn là lối vào riêng. Tài khoản thử trong `src/lib/mock/auth.ts` (`DEMO_CREDENTIALS`): `minhanh@vinstay.demo` / `hung.nguyen@vinstay.demo` / `0934556201` (mật khẩu `demo1234`, RFID `VS-0412`) / `ops@vinstay.vn` (`admin1234`). Phiên dùng cookie `vs_role=v2.<role>`; `src/proxy.ts` chặn `/account`, `/booking`, `/booking/*`, `/landlord`, `/host`, `/admin` và đưa về đúng trang đăng nhập của cổng. Nút "Demo" ở góc màn hình đổi vai trò tức thì và đặt lại dữ liệu.
- **Một store dùng chung** (`src/lib/mock/store.ts`, localStorage): khách đặt lịch (điều phối tự động 3 tầng) → Host nhận (hoặc claim ticket mở) → khách bấm 'Tôi đã tới sảnh' → Host dẫn, lấy mã cửa → Host báo khách cọc → khách đồng ý điều khoản cọc + nội quy + VietQR (giữ chỗ theo giờ Admin cài đặt, mặc định 48h, 12–72h) → khách eKYC + khai người cùng ở + TK hoàn cọc + ký HĐ thuê điện tử (không OTP) → thanh toán kỳ đầu (demo báo có), mọi vai trò cùng thấy một dòng sự kiện. Cọc bị bỏ chia 50/50 (chủ nhà/nền tảng); Admin có thể huỷ cọc do chủ nhà vi phạm (hoàn khách gấp đôi) hoặc bất khả kháng tại `/admin/contracts/[key]`.
  Dữ liệu seed gắn với ngày hiện tại; qua ngày mới sẽ tự dựng lại.
- **OTP đi qua backend thật** (`/auth/otp/*`, `/auth/phone/*`, ký ủy quyền). Chỉ khi backend chạy `OTP_PROVIDER=mock` (dev/staging nội bộ, cấm ở production — xem `backend/README.md` §4.1) response mới có `devOtp` và màn OTP hiện khối "Zalo giả lập – chỉ môi trường phát triển" kèm nút "Điền mã"; kênh Zalo thật không trả mã nên khối này không hiện. VietQR / OCR vẫn mô phỏng; nút "Demo" trong màn Host/khách
  cho phép tua (T-10 phút, ngân hàng báo có, khách bấm có mặt).
- **Cổng Chủ nhà đã nối API thật** (trừ trang Tổng quan `/landlord/dashboard` vẫn dùng mock): Căn hộ, Chi tiết căn, Ký gửi (tạo hồ sơ → OTP Zalo → ký), Hồ sơ ký gửi, Khoản thu, Thoát ủy quyền, Tài khoản. Mã nằm ở `src/lib/landlord/` (`types.ts` khớp backend, `api.ts` gọi `/api/v1/landlord/*`, `useLandlordQuery.ts` tải dữ liệu) và `src/components/landlord/`. Cần backend chạy (`BACKEND_URL`) và đăng nhập tab Chủ nhà bằng tài khoản thật có căn trong DB; muốn thấy mã OTP khi thử, đặt `OTP_ECHO_DEV_CODE=true` trong `backend/.env`.
- **Tải ảnh ở `/landlord/consign`**: chọn ở bước 2, tải lên ngay sau khi tạo hồ sơ nháp (trước khi gửi OTP). `next.config.ts` đặt `experimental.proxyClientMaxBodySize: "30mb"` — thiếu dòng này thì Next cắt body ở 10MB và proxy lỗi 500 khi tải nhiều ảnh (8 × 3MB). Ảnh được nén trên trình duyệt (cạnh dài ≤1600px, JPEG) trước khi tải, thường còn 200–500KB, để tiết kiệm dung lượng Supabase. Giới hạn ảnh nằm ở `src/lib/landlord/photos.ts`, phải khớp `backend/src/modules/landlord/landlord.mappers.ts`.
- Căn hộ mẫu ở `src/lib/mock/units.ts`, ảnh ở `public/units/` (lấy từ `tech data/caodata`, giá/mã căn đã chuẩn hoá cho demo).
- Logic thuần (All-in Cost, Matchmaker, luồng nghiệp vụ) có test ở `src/tests/`.

## Route

| Cổng | Route |
|---|---|
| Công khai | `/` (chat AI), `/units`, `/units/[id]` |
| Xác thực | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/admin/login` (`/host/login` → chuyển hướng `/admin/login`) |
| Khách thuê (yêu cầu vai `tenant`) | `/booking`, `/booking/[ref]`, `/account`, `/account/bookings`, `/account/saved`, `/account/contracts` |
| Chủ nhà | `/landlord/dashboard`, `/landlord/units`, `/landlord/units/[id]`, `/landlord/consign`, `/landlord/consignments/[id]`, `/landlord/finance`, `/landlord/exit-request`, `/landlord/account` |
| Field Host | `/host/dispatch`, `/host/viewing/[id]`, `/host/inspections`, `/host/inspections/[id]`, `/host/earnings`, `/host/handbook`, `/host/account` (trang cổng nằm trong route group `app/host/(portal)/`) |
| Admin | `/admin/dashboard`, `/admin/inventory`, `/admin/inventory/[id]`, `/admin/bookings`, `/admin/contracts`, `/admin/contracts/[key]`, `/admin/contracts/templates`, `/admin/contracts/templates/[id]`, `/admin/contracts/parties`, `/admin/contracts/parties/[key]`, `/admin/hosts`, `/admin/hosts/[id]`, `/admin/commission`, `/admin/settings` (route group `app/admin/(portal)/`) |

Giao diện dùng hệ token "kinh doanh tối giản" trong `src/app/globals.css` và các primitive ở `src/components/ui/` (`AuthLayout`, `PageHeader`, `Section`, `DataTable`, `StatusBadge`, `EmptyState`, `Field`, `PasswordInput`, `KeyValue`).

## Khôi phục đăng nhập thật qua backend

Mã cũ vẫn còn: `src/lib/auth/*`, `src/components/auth/*`, `src/app/login/LoginTabs.tsx`, `src/app/admin/login/AdminLoginTabs.tsx`
và cấu hình rewrite `/api/v1/*` → `BACKEND_URL` trong `next.config.ts`. Muốn dùng lại: thay `src/proxy.ts` bằng bản gọi
`GET /api/v1/auth/session` (xem lịch sử git) và gắn lại các trang `/login`, `/admin/login`.
