# VINSTAY AI — QUY CHẾ ĐẶT CỌC CHỐT CĂN BẰNG TIỀN CỌC BẢO ĐẢM & THANH TOÁN VIETQR ĐỘNG
*(DÀNH CHO KHÁCH THUÊ • BƯỚC 2 TRONG KHUNG PHÁP LÝ KHÁCH HÀNG)*
*(Số: VSA-TENANT-02-DEPOSIT-2026 • Phiên bản điều khoản `DEP-2026.10-v2` • Căn cứ Điều 328 Bộ luật Dân sự 2015 & Nghị định 52/2024/NĐ-CP)*

> **BẢN NHÁP CỌC v2 (2026-10-14) — CẦN PHÁP CHẾ RÀ SOÁT TRƯỚC KHI ÁP DỤNG.** Thay cho khoản cọc giữ chỗ cố định 2.000.000 VNĐ (`HOLD-2026.10-v1`). Khoản cọc đã tạo theo bản cũ tiếp tục áp dụng bản cũ.

---

## 1. MỤC ĐÍCH & PHẠM VI ÁP DỤNG
Quy chế này áp dụng tại thời điểm Khách Thuê sau khi trực tiếp khảo sát hiện trường căn hộ cùng Field Host và quyết định **đặt cọc chốt căn để khóa căn hộ trong thời hạn giữ căn do Admin cài đặt (mặc định 48 giờ, 12–72 giờ, có thể chỉnh riêng từng căn)**, chuẩn bị tiến tới ký kết Hợp đồng thuê chính thức trên nền tảng VinStay AI.

---

## 2. BẢN CHẤT PHÁP LÝ CỦA KHOẢN TIỀN CỌC

### 2.1. Căn cứ theo Điều 328 Bộ luật Dân sự 2015
1. Khoản tiền do Khách thuê chuyển khoản bằng đúng **Tiền Cọc Bảo Đảm Tài Sản & Nội Thất** niêm yết của căn hộ (Chủ nhà xác lập trong biên độ chính sách cọc của Nền tảng, từ nửa tháng đến 03 tháng tiền thuê; mặc định **01 tháng tiền thuê**), được xác lập dưới hình thức **Đặt cọc nhằm bảo đảm việc giao kết Hợp đồng thuê căn hộ chính thức**. Số tiền do hệ thống tính và in sẵn trên mã VietQR.
2. Thỏa thuận này có hiệu lực pháp lý ràng buộc ba bên: Khách thuê $\leftrightarrow$ Chủ nhà $\leftrightarrow$ VinStay AI (Đơn vị đại diện điều phối và giữ hộ tiền cọc ký quỹ).
3. Khách thuê chấp thuận điều khoản bằng ô tick ngay trước khi quét VietQR; không ký thỏa thuận đặt cọc riêng.

### 2.2. Phương thức Thanh toán qua VietQR Động Chuẩn NAPAS 247
1. **Mã VietQR động định danh:** Ứng dụng VinStay AI sinh trực tiếp mã VietQR duy nhất gắn với mã căn hộ và mã lịch hẹn của khách (Cú pháp: `COC [MÃ CĂN] [MÃ LỊCH HẸN]`), số tiền in sẵn.
2. **Tài khoản thụ hưởng:** Tiền được chuyển thẳng vào **Tài khoản Ký quỹ Định danh (Escrow Account)** mở tại Ngân hàng đối tác, không đi qua tài khoản cá nhân của Field Host hay Chủ nhà nhằm triệt tiêu 100% rủi ro lừa đảo tiền cọc.
3. **Gạch nợ thời gian thực:** Hệ thống tự động gạch nợ trong vòng $\le 10$ giây qua Webhook ngân hàng khi số tiền khớp đúng khoản cọc, và gửi thông báo Zalo xác nhận ngay lập tức cho Khách thuê và Chủ nhà. Số tiền không khớp sẽ không được gạch nợ và được đối soát hoàn lại.

---

## 3. HIỆU LỰC KHÓA CĂN (`HOLDING` STATE)

1. **Khóa căn toàn mạng lưới:** Ngay khi nhận đủ tiền cọc, trạng thái căn hộ tự động chuyển sang **`HOLDING` (Đang giữ căn)** trong đúng số giờ giữ căn đã chốt lúc Khách thuê chấp thuận điều khoản (Admin đổi cấu hình sau đó không làm thay đổi khoản cọc này).
2. **Quyền bảo đảm ưu tiên của Khách thuê:**
   * Nền tảng VinStay AI cam kết từ chối 100% các yêu cầu xem phòng hoặc đặt cọc từ các khách hàng khác đối với căn hộ này trong suốt thời gian giữ căn.
   * Giá thuê cơ bản và các khoản bóc tách All-in Cost đã chốt được cố định nguyên vẹn, Chủ nhà không được phép tự ý thay đổi.
3. **Nghĩa vụ trong thời gian giữ căn của Khách thuê:** Khách thuê có trách nhiệm cung cấp ảnh chụp CCCD gắn chip 2 mặt để hệ thống thực hiện bóc tách AI Vision OCR và tiến hành ký kết Hợp đồng thuê số hóa chính thức.
4. **Ưu đãi Chốt nhanh (chỉ khi Chủ nhà ủy quyền Chốt nhanh & Giá sàn An toàn):**
   * **Khi đặt cọc:** tiền cọc giảm khoảng **5%** (tối thiểu 200.000 VNĐ, tối đa 8%), không phải chọn chu kỳ. Căn đã ủy quyền Chốt nhanh cho phép **chốt cọc ngay trên trang căn, không cần đi xem trực tiếp** (xác thực SĐT qua OTP Zalo, xác nhận đã xem ảnh thực tế có dấu thời gian; người thân được chuyển khoản thay theo Điều 283 BLDS 2015, Khách thuê vẫn là người đặt cọc).
   * **Khi ký Hợp đồng thuê:** Khách thuê chọn trả trước tiền thuê theo chu kỳ **01 / 03 / 06 tháng/kỳ** để nhận giá thuê giảm **3,5% / 5,5% / 10%** (làm tròn 50.000 VNĐ, không bao giờ thấp hơn Giá sàn bảo mật của Chủ nhà).
   * Ưu đãi chỉ giữ khi tiền cọc về trong **24 giờ** kể từ lúc chấp thuận; về muộn hơn thì căn **không** bị khóa và Nền tảng hoàn lại đúng số tiền đã nhận trong 24 giờ làm việc. Chưa có tiền về thì Khách thuê được đổi lựa chọn (hệ thống báo giá lại).
   * Hợp đồng thuê ghi đúng chu kỳ và giá thuê đã chọn khi ký; khoản cọc đã giảm là Tiền cọc bảo đảm đầy đủ, không nộp bù. Không áp dụng phụ phí thuê ngắn hạn.
5. **Ngày dọn vào (Smart Move-in Window Protocol):** Ngày dọn vào sớm nhất là T0 + 2 ngày (T0 = ngày tiền cọc về), muộn nhất T0 + 30 ngày. Miễn tiền thuê thời gian chờ tới T0 + 7 (ngày thứ 08); chọn dọn vào muộn hơn thì Hợp đồng và tiền thuê tính từ ngày thứ 08, Khách thuê được nhận mã cửa từ ngày đó.

---

## 4. NGUYÊN TẮC VÀNG: CHUYỂN ĐỔI 100% THÀNH TIỀN CỌC BẢO ĐẢM TÀI SẢN (SECURITY DEPOSIT)

> [!IMPORTANT]
> **ĐIỀU KHOẢN CỐT LÕI BẢO VỆ TÀI SẢN & MINH BẠCH TÀI CHÍNH:**

1. **Chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản:**
   * Khi Khách thuê ký kết Hợp đồng thuê chính thức, toàn bộ số tiền cọc đã chuyển được **chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản & Nội Thất (Security Deposit)**. Vì tiền cọc đã bằng Tiền Cọc Bảo Đảm của căn, Khách thuê **không phải nộp bù**.
   * Số tiền này tiếp tục nằm an toàn tại Tài khoản Ký quỹ Phong tỏa Ngân hàng suốt toàn bộ thời hạn hợp đồng thuê để bảo vệ căn hộ và nội thất của Chủ nhà.
2. **TUYỆT ĐỐI KHÔNG KHẤU TRỪ VÀO TIỀN THUÊ THÁNG ĐẦU TIÊN:**
   * Khoản tiền cọc này **tuyệt đối KHÔNG được khấu trừ vào tiền thuê nhà tháng đầu tiên**.
   * Kỳ thanh toán đầu tiên chỉ gồm tiền thuê nhà theo chu kỳ đã chọn, thanh toán đầy đủ theo lịch bàn giao nhà.
3. **Quyền lợi hoàn trả khi hết hạn:** Khi hết hạn hợp đồng thuê và Hai Bên đã hoàn tất đối soát công tơ điện nước EVN cùng Hộ chiếu bàn giao 10 hạng mục nội thất, toàn bộ Tiền Cọc Bảo Đảm Tài Sản sẽ được hoàn trả lại 100% cho Khách thuê (sau khi khấu trừ các khoản hư hại / phạt BQL do lỗi Khách thuê nếu có).

---

## 5. CƠ CHẾ PHẠT CỌC & XỬ LÝ VI PHẠM (KHOẢN 2 ĐIỀU 328 BLDS 2015)

### 5.1. Trường hợp Khách thuê Bỏ cọc (Lỗi từ Bên thuê)
* Nếu quá thời hạn giữ căn kể từ thời điểm gạch nợ thành công mà Khách thuê tự ý đổi ý không thuê, từ chối ký Hợp đồng chính thức hoặc không hoàn tất nghĩa vụ mà không thuộc trường hợp Bất khả kháng:
  - Khách thuê sẽ **bị mất toàn bộ số tiền cọc đã chuyển**.
  - Số tiền này được phân bổ **50% cho Chủ nhà** để bù đắp chi phí cơ hội trống phòng và **50% cho Nền tảng** để bù chi phí vận hành, điều phối.
  - Căn hộ tự động được mở khóa về trạng thái `AVAILABLE` trên hệ thống.

### 5.2. Trường hợp Chủ nhà Hủy cọc (Lỗi từ Bên cho thuê)
* Nếu trong thời hạn giữ căn, Chủ nhà tự ý hủy cọc, từ chối ký hợp đồng cho khách thuê, tự ý tăng giá thuê hoặc thay đổi hiện trạng nội thất so với cam kết ban đầu:
  - Chủ nhà phải **hoàn trả lại 100% số tiền cọc cho Khách thuê**.
  - Đồng thời Chủ nhà phải **bồi thường phạt cọc cho Khách thuê một khoản tiền tương đương số tiền đã đặt cọc** (Tổng số tiền Khách thuê nhận lại là **gấp 02 lần tiền cọc**) theo đúng quy định tại Khoản 2 Điều 328 Bộ luật Dân sự 2015.
  - VinStay AI sẽ tự động khấu trừ khoản phạt cọc này từ tài khoản của Chủ nhà trên nền tảng để chi trả bảo vệ quyền lợi cho Khách thuê.

### 5.3. Trường hợp Miễn trừ do Sự kiện Bất Khả Kháng
* Nếu trong thời hạn giữ căn phát sinh sự kiện bất khả kháng được pháp luật công nhận (thiên tai nghiêm trọng, sự cố kỹ thuật hạ tầng tòa nhà, căn hộ phát sinh cháy nổ hoặc hỏng hóc lớn không thể khắc phục để ở ngay), hoặc căn đã được khách khác cọc trước (First-to-Pay Wins):
  - Giao dịch được hủy bỏ trên tinh thần thiện chí.
  - Khách thuê được **hoàn trả lại 100% số tiền cọc** trong vòng 24 giờ làm việc, Các Bên không phải chịu bất kỳ khoản phạt nào.

---

## 6. MÃ TRA CỨU ĐIỆN TỬ & THÔNG BÁO TỨC THÌ
1. Mỗi giao dịch cọc thành công được cấp một **Mã tra cứu cọc điện tử (Holding Reference Code)** có mã QR tra cứu tính xác thực trực tiếp trên cổng thông tin VinStay AI.
2. Zalo OA chính thức của VinStay AI gửi tin nhắn xác nhận chi tiết bao gồm: Mã căn hộ, Số tiền cọc, Thời gian hết hạn khóa căn, và đường dẫn trực tiếp để chuyển sang Bước 3 (Bóc tách CCCD & Ký hợp đồng).
