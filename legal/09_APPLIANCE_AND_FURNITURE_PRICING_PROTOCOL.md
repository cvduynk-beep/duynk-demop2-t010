# QUY CHUẨN VẬN HÀNH & CẤU TRÚC PHÁP LÝ CHI TIẾT: ĐỊNH GIÁ & BỒI THƯỜNG TRANG THIẾT BỊ ĐIỆN TỬ VÀ ĐỒ GỖ NỘI THẤT
*(VINSTAY ASSET VALUATION & COMPENSATION PROTOCOL — PROTOCOL 09)*

> **CĂN CỨ PHÁP LÝ & PHẠM VI ÁP DỤNG:**  
> * Căn cứ Bộ luật Dân sự 2015: Điều 328 (Đặt cọc), Điều 472–482 (Hợp đồng thuê tài sản), Điều 584 & Điều 589 (Nguyên tắc bồi thường thiệt hại tài sản);
> * Căn cứ Luật Giao dịch Điện tử 2023 & Luật Nhà ở 2023 (Khoản 2 Điều 164: Hiệu lực hợp đồng thuê nhà ở không bắt buộc công chứng);
> * Áp dụng thống nhất cho toàn bộ quy trình kiểm định của Field Host, Phụ lục Điều 5 Hợp đồng thuê căn hộ số hóa, và quy trình đối soát hoàn trả Tiền Cọc Bảo Đảm Tài Sản (Security Deposit) tại Vinhomes Ocean Park.

---

## MỤC I: NGUYÊN TẮC CỐT LÕI (CORE TENETS)
1. **Loại trừ 100% định giá cảm tính:** Tuyệt đối không để Field Host hoặc Chủ nhà tự phỏng đoán, tự ý kê giá bồi thường bằng cảm nhận chủ quan.
2. **Nguyên tắc "Ưu tiên phục hồi / Sửa chữa" (Repair First):** 90% hư hỏng thông thường phải được xử lý theo chi phí sửa chữa, bảo dưỡng, thay thế linh kiện hoặc giặt sấy thực tế. Tuyệt đối không bắt đền nguyên chiếc khi tài sản còn khả năng phục hồi.
3. **Nguyên tắc "Giá trị còn lại" (Residual Value):** Khi tài sản bị hư hại hoàn toàn không thể sửa chữa (Total Loss), mức bồi thường tối đa căn cứ theo: `[Giá tham chiếu thị trường] × [% Độ mới bàn giao ban đầu]`. Không bao giờ bắt khách thuê bồi thường theo giá mua mới 100%.
4. **Miễn trừ hao mòn tự nhiên (Fair Wear & Tear):** Mọi hao mòn cơ lý thông thường do thời gian và thời tiết (sơn ngả màu nhẹ, ron gạch mờ, xước dăm siêu nhỏ) do Chủ nhà chịu chi phí, không tính vào trách nhiệm bồi thường của Khách thuê.

---

## MỤC II: QUY CHUẨN NHÓM TRANG THIẾT BỊ ĐIỆN TỬ & ĐIỆN MÁY
*(Áp dụng cho: Điều hòa nhiệt độ, Tủ lạnh, Máy giặt, Tivi, Bếp từ, Bình nóng lạnh, Máy hút mùi, Lò vi sóng, Quạt điện...)*

### 1. Định danh chính xác theo Tem nhãn kỹ thuật (Nameplate Identification)
* Khi Field Host kiểm định căn hộ, bắt buộc chụp 01 ảnh rõ nét Tem nhãn thông số kỹ thuật (Model Tag / Serial Plate) của từng thiết bị.
* Cấu trúc định danh chuẩn lưu vào hệ thống:  
  $$\text{Tên thiết bị} + \text{Thương hiệu (Brand)} + \text{Mã Model đầy đủ (Model Code)}$$
  *Ví dụ:* `Tivi Sony 55 inch 4K · Model: KD-55X75K`, `Tủ lạnh Toshiba Inverter 180L · Model: GR-RT252WE`, `Điều hòa Casper 9000 BTU Inverter · Model: GC-09IS33`.

### 2. Thuật toán so khớp giá sàn thương mại điện tử (E-Commerce Market Benchmark)
Mức giá gốc chuẩn ($P_{\text{base}}$) của thiết bị điện máy được hệ thống tự động trích xuất theo nguyên tắc khách quan:
* **Nguồn dữ liệu tham chiếu chính thức:**
  * **Kênh Siêu thị điện máy lớn:** Giá bán lẻ niêm yết công khai trên website chính thức của *Điện Máy Xanh, MediaMart, Nguyễn Kim, Pico*.
  * **Kênh Gian hàng chính hãng TMĐT:** Giá bán của gian hàng chính hãng (Mall / Official Flagship Store) trên *Shopee Mall, LazMall, Tiki Official*.
* **Xác định mức giá chuẩn:** Lấy mức giá bán lẻ thấp nhất đang niêm yết còn hàng tại thời điểm đối soát (không tính các mã giảm giá flash-sale chớp nhoáng theo giờ).
* **Xử lý Model ngừng sản xuất (End-of-Life / Discontinued):** Hệ thống tự động so khớp sang Model thế hệ kế cận (Successor Model) của cùng thương hiệu, cùng dung tích/công suất và cùng phân khúc tính năng.
* **Ngoại lệ ưu tiên chứng từ gốc:** Nếu Chủ nhà xuất trình được Hóa đơn điện tử / Hóa đơn VAT / Phiếu xuất kho chính hãng lúc mua, hệ thống ưu tiên ghi nhận giá trị trên hóa đơn nếu giá đó $\le$ giá thị trường.

### 3. Cơ chế phân tầng xử lý bồi thường Thiết bị điện máy
* **Tầng 1 — Hư hỏng khắc phục được (Chiếm $\ge 90\%$ trường hợp):**
  - Áp dụng khi: Điều hòa hết gas/rỉ nước máng, bếp từ chập cầu chì bo mạch, máy giặt hỏng van xả, tủ lạnh hỏng quạt gió, mất điều khiển remote...
  - **Mức bồi thường:** Bằng đúng chi phí linh kiện thay thế chính hãng + tiền công thợ dịch vụ thực tế (theo phiếu thu/hóa đơn từ trung tâm bảo hành hãng hoặc đơn vị kỹ thuật đối tác uy tín của VinStay AI tại Ocean Park).
* **Tầng 2 — Hư hỏng hoàn toàn / Không thể phục hồi (Total Loss):**
  - Áp dụng khi: Vỡ nát màn hình Tivi, nứt vỡ mặt kính bếp từ không có linh kiện thay, chập cháy biến dạng lốc máy do sử dụng sai nguồn điện, mất hoàn toàn thiết bị.
  - **Công thức tính mức trần bồi thường ràng buộc pháp lý:**
    $$\text{Giá bồi thường tối đa} = P_{\text{TMĐT}} \times \text{\% Độ mới lúc bàn giao ban đầu}$$
    *(Ví dụ: Tivi Sony KD-55X75K giá TMĐT 9.800.000đ, độ mới bàn giao 80% $\rightarrow$ Khách bồi thường tối đa: $9.800.000 \times 80\% = 7.840.000\text{ VNĐ}$).*

---

## MỤC III: QUY CHUẨN CHI TIẾT NHÓM ĐỒ GỖ & NỘI THẤT HOÀN THIỆN (KẾT HỢP PHƯƠNG PHÁP 1 & PHƯƠNG PHÁP 2)
*(Áp dụng cho: Sofa, Bàn trà, Kệ Tivi, Bộ bàn ghế ăn, Giường ngủ, Nệm ngủ, Tủ quần áo, Hệ tủ bếp, Tủ giày dép, Rèm cửa...)*

### 1. Bản chất vật lý & Bối cảnh kinh tế đặc thù tại Vinhomes Ocean Park
* **Đặc tính vật liệu & cấu tạo module:** 
  - Trên 90% căn hộ cho thuê tại Vinhomes Ocean Park sử dụng nội thất từ **Gỗ công nghiệp MDF lõi xanh chống ẩm** (Moisture Resistant Green Core MDF tiêu chuẩn E1/E2, phủ bề mặt Melamine chống trầy hoặc Laminate/Acrylic bóng gương, viền nẹp nhựa PVC dán tự động).
  - Nội thất đồ gỗ là tài sản kết cấu tĩnh, không chịu hao mòn điện cơ tự nhiên như đồ điện tử.
* **Xác suất rủi ro thực tế:** 
  - Trong thực tế vận hành cho thuê căn hộ, **tỷ lệ đồ gỗ bị phá hủy kết cấu hoàn toàn (Total Loss) là cực kỳ thấp ($< 0.1\%$)**. 
  - Hơn **$99\%$ sự cố trả phòng là hư hại cục bộ**: trầy xước mặt bàn, gãy bản lề bật giảm chấn, bung nẹp chỉ mép nhựa PVC, kẹt hỏng ray trượt ngăn kéo, nứt vỡ mặt kính bàn trà, ố loang mặt nỉ sofa hoặc rách một góc đệm mút.
* **Nguy cơ tranh chấp nếu định giá cảm tính:**
  - Nếu để Chủ nhà hoặc Field Host tự ước lượng giá bồi thường bằng cảm tính, Chủ nhà có xu hướng đòi khách "bồi thường nguyên bộ/nguyên cái mới 100%" (ví dụ: bung 1 bản lề bắt đền cả tủ bếp 15 triệu, xước 1 góc bắt đền cả bộ sofa 8 triệu). 
  - Điều này gây bức xúc tột cùng cho khách thuê, dẫn tới khiếu nại, phong tỏa tiền cọc và làm tê liệt quy trình tái cho thuê căn hộ.
* **Giải pháp cốt lõi của VinStay AI:** Kết hợp chặt chẽ **Phương pháp 1 (Bảng giá định mức chuẩn hệ thống $P_{\text{catalog}}$ làm trần giá trị)** và **Phương pháp 2 (Sửa chữa cục bộ hỏng đâu tính đó theo hóa đơn thợ mộc nội khu Ocean Park)**.

---

### 2. PHƯƠNG PHÁP 1: Bảng giá định mức chuẩn hệ thống tự điền ($P_{\text{catalog}}$)
*(Thiết lập mức trần bồi thường minh bạch — Loại trừ 100% việc định giá cảm tính)*

Hệ thống VinStay AI tự động niêm yết và điền sẵn mức giá định mức chuẩn ($P_{\text{catalog}}$) cho từng món nội thất đồ gỗ khi Field Host thực hiện kiểm định căn hộ. Mức giá này được khảo sát, chuẩn hóa theo chi phí thi công thực tế của các xưởng nội thất chuyên nghiệp tại khu vực Gia Lâm / Vinhomes Ocean Park:

| Mã | Hạng mục nội thất | Mức giá định mức chuẩn ($P_{\text{catalog}}$) | Tiêu chuẩn kỹ thuật & Quy cách hoàn thiện chuẩn Ocean Park |
| :-: | :--- | :---: | :--- |
| **01** | **Bộ ghế Sofa phòng khách** | **6.000.000 VNĐ** | Sofa văng 1m8–2m2 hoặc góc L mini; nỉ chống bám bẩn hoặc da microfiber công nghiệp; khung gỗ thông sấy/gỗ keo bọc mút D40 kèm đôn phụ. |
| **02** | **Bàn trà phòng khách** | **1.500.000 VNĐ** | Bàn trà tròn đôi hoặc chữ nhật; mặt kính cường lực 8mm / đá ceramic chống trầy; khung kim loại sơn tĩnh điện hoặc chân gỗ. |
| **03** | **Kệ Tivi phòng khách** | **2.000.000 VNĐ** | Kệ treo tường hoặc đặt sàn dài 1m6–1m8; gỗ MDF lõi xanh chống ẩm phủ Melamine 2 mặt; ngăn kéo gắn ray trượt bi 3 tầng. |
| **05** | **Rèm cửa phòng khách** | **2.500.000 VNĐ** | Rèm vải 2 lớp (1 lớp vải cản sáng 95% + 1 lớp voan trắng); thanh ray nhôm định hình chống rỉ; bao gồm phụ kiện treo. |
| **09** | **Hệ thống tủ bếp trên & dưới** | **12.000.000 VNĐ** | Thùng tủ MDF lõi xanh chống ẩm; cánh phủ Acrylic hoặc Melamine; bản lề giảm chấn inox; tính cho module căn Studio / 1PN–2PN tiêu chuẩn. |
| **12** | **Bộ bàn ăn + 4 ghế** | **3.500.000 VNĐ** | Bàn ăn 1m2–1m4 mặt đá ceramic/gỗ cao su hoàn thiện + 4 ghế ăn bọc nệm da/nỉ khung thép sơn tĩnh điện. |
| **13** | **Giường ngủ Master (1m8)** | **5.000.000 VNĐ** | Giường hộp 1m8x2m; cốt gỗ MDF lõi xanh chống ẩm; giát phản phẳng nguyên tấm; đầu giường bọc nệm êm hoặc ốp gỗ phẳng. |
| **14** | **Đệm nệm & Tấm bảo vệ** | **3.000.000 VNĐ** | Nệm cao su non tổng hợp / Lò xo túi độc lập dày 15–20cm; đàn hồi tiêu chuẩn; kèm vỏ bảo vệ đệm chống thấm. |
| **15** | **Tủ quần áo Master** | **6.500.000 VNĐ** | Tủ 3–4 cánh mở hoặc cánh lùa kịch trần (rộng 1m6–2m, cao 2m4–2m6); chia khoang treo, khoang gấp và hộc kéo âm; ray giảm chấn. |
| **16** | **Rèm chắn sáng phòng ngủ** | **1.800.000 VNĐ** | Rèm vải cản sáng 100% hoặc rèm cầu vồng Hàn Quốc; cơ cấu kéo bi trơn tru. |
| **X** | **Tủ giày dép thông minh sảnh** | **2.000.000 VNĐ** | Tủ MDF lõi xanh 3 cánh lật hoặc cánh mở; sức chứa 15–20 đôi; có ngăn để mũ bảo hiểm và hộc chìa khóa. |

#### Quy tắc ngoại lệ bắt buộc đối với Nội thất Cao cấp / Gỗ tự nhiên:
* **Điều kiện áp dụng:** Trường hợp Chủ nhà trang bị nội thất gỗ tự nhiên quý hiếm (Gỗ Sồi Mỹ, Gỗ Gõ Đỏ, Gỗ Óc Chó...), sofa da bò thật nhập khẩu Ý/Malaysia, hoặc hàng đặt thiết kế kiến trúc cao cấp có giá trị vượt mức $P_{\text{catalog}}$ trên.
* **Nghĩa vụ chứng minh bằng hóa đơn chứng từ gốc:** Chủ nhà **BẮT BUỘC phải tải lên bản chụp Hợp đồng thi công nội thất có hóa đơn VAT hoặc Phiếu thu/Phiếu xuất kho chính hãng** ngay trong bước Tiếp nhận Ký gửi căn hộ.
* **Chế tài chống thổi giá (Anti-Price Inflation Guardrail):** Nếu Chủ nhà **không xuất trình được chứng từ gốc hợp lệ**, hệ thống VinStay AI **mặc định áp dụng 100% Bảng định mức chuẩn $P_{\text{catalog}}$** của nền tảng làm trần pháp lý cao nhất. Nghiêm cấm Chủ nhà tự kê khống giá trị tài sản để gây bất lợi cho khách thuê.

---

### 3. PHƯƠNG PHÁP 2: Báo giá thực chi từ thợ mộc & xưởng nội thất Ocean Park
*(Nguyên tắc phục hồi cục bộ — Áp dụng cho $\ge 95\%$ các trường hợp hư hỏng)*

#### A. Nguyên tắc vàng "Hỏng đâu sửa đó / Thay đúng linh kiện hỏng" (Component-level Repair):
* **Cấm tuyệt đối yêu cầu đền nguyên món đồ:** Khi hư hại chỉ xảy ra ở một bộ phận rời, có thể thay thế, sửa chữa hoặc khắc phục thẩm mỹ độc lập (ví dụ: gãy bản lề, trầy xước mặt, vỡ kính bàn, ố bọc nệm), Chủ nhà và Field Host tuyệt đối không được yêu cầu khách mua mới hay bồi thường toàn bộ món đồ.
* **Căn cứ thanh toán:** Số tiền bồi thường khấu trừ từ tiền cọc căn cứ chính xác theo **Hóa đơn / Phiếu thu dịch vụ thực tế** do thợ mộc hoặc đơn vị kỹ thuật đối tác của VinStay AI tại Ocean Park cung cấp.

#### B. Mạng lưới Thợ cơ động & Cam kết SLA 2–4 giờ:
* VinStay AI duy trì mạng lưới xưởng mộc đối tác và đội ngũ thợ kỹ thuật cơ động túc trực thường trực tại địa bàn Vinhomes Ocean Park (Gia Lâm).
* Ngay khi có biên bản đối soát bàn giao phòng ghi nhận hư hại đồ gỗ: Thợ mộc có mặt tại căn hộ khảo sát thực địa trong vòng **2–4 giờ**, lập phiếu báo giá chi tiết gồm chi phí vật tư/linh kiện thay thế + tiền công thợ niêm yết công khai.

#### C. Biểu phí định khung Dịch vụ Sửa chữa & Phục hồi Đồ gỗ Mẫu (Benchmark Service Rates):
Biểu phí tham chiếu niêm yết minh bạch trên hệ thống VinStay AI nhằm bảo đảm mức giá dịch vụ cạnh tranh, hợp lý, không bị thợ chặt chém:

| STT | Hạng mục dịch vụ sửa chữa / phục hồi | Đơn giá tham chiếu (VNĐ) | Ghi chú kỹ thuật |
| :-: | :--- | :---: | :--- |
| **1** | **Thay bản lề giảm chấn cánh tủ áo / tủ bếp** | `100.000 – 180.000đ / chiếc` | Bản lề thép mạ niken / inox 304 chống rỉ (Hafele, Ivan, Blum); đã bao gồm công thợ lắp đặt. |
| **2** | **Thay ray trượt bi 3 tầng ngăn kéo tủ / kệ** | `150.000 – 250.000đ / bộ` | Ray trượt bi giảm chấn 45cm/50cm chịu lực 30kg; thay trọn bộ 2 thanh ray. |
| **3** | **Thay cặp piston thủy lực nâng cánh tủ bếp trên** | `120.000 – 200.000đ / cặp` | Piston nâng lực đẩy 80N–120N đóng mở nhẹ êm. |
| **4** | **Dán lại chỉ nẹp viền nhựa PVC cạnh bàn / tủ** | `200.000 – 350.000đ / vị trí` | Nẹp chỉ nhựa PVC 1mm–2mm tiệp màu gỗ; ép keo nhiệt chuyên dụng chống bong tróc. |
| **5** | **Cắt thay mới mặt kính cường lực bàn trà (vỡ)** | `350.000 – 550.000đ / tấm` | Kính cường lực 8mm–10mm mài vát cạnh xiết bóng; đo chuẩn theo kích thước bàn trà cũ. |
| **6** | **Xử lý dặm vá, phủ bóng vết trầy xước sâu mặt gỗ** | `250.000 – 500.000đ / điểm` | Xử lý sáp trét chuyên dụng, chấm cọ màu tiệp vân gỗ và xịt phủ PU bảo vệ bề mặt. |
| **7** | **Đóng thay mới 01 tấm đợt / đáy tủ ngấm nước hư hại**| `300.000 – 600.000đ / tấm` | Cắt ván MDF lõi xanh chống ẩm đúng kích thước, dán chỉ cạnh hoàn thiện lắp trả lại vị trí. |
| **8** | **Giặt sấy công nghiệp hơi nước diệt khuẩn Sofa nỉ** | `350.000 – 500.000đ / bộ` | Máy hút giặt phun hút hơi nước nóng 140°C, tẩy ố mốc và khử mùi sinh học an toàn. |
| **9** | **Giặt sấy chuyên sâu nệm ngủ bị vết loang ố** | `300.000 – 450.000đ / tấm` | Đánh tan vết ố sinh hoạt, hút sạch chân nệm, sấy khô cưỡng bức tại chỗ. |
| **10**| **Bọc lại nệm mút / da nỉ 01 vị trí ghế ăn hoặc góc sofa** | `400.000 – 800.000đ / vị trí` | Tháo đệm cũ, gia cố mút xốp đàn hồi và bọc lại chất liệu vải/da tương đồng $\ge 90\%$. |
| **11**| **Thay thế tay nắm / khóa tủ ngăn kéo bị gãy** | `80.000 – 150.000đ / chiếc` | Tay nắm nhôm đúc hoặc đồng mạ tiệp kiểu dáng ban đầu. |

---

### 4. CƠ CHẾ PHỐI HỢP HYBRID (PP1 + PP2): Ma trận quyết định bồi thường minh bạch

Hệ thống tự động phân loại tình trạng hư hại của đồ gỗ lúc trả phòng theo Ma trận 4 Cấp độ:

```
                  ┌────────────────────────────────────────────────────────┐
                  │ KIỂM TRA HIỆN TRẠNG ĐỒ GỖ KHI TRẢ PHÒNG (CHECK-OUT)    │
                  └──────────────────────────┬─────────────────────────────┘
                                             │
             ┌───────────────────────────────┴───────────────────────────────┐
             ▼                                                               ▼
   【CẤP 1: HAO MÒN TỰ NHIÊN】                                    【CÓ HƯ HẠI THỰC TẾ DO DÙNG】
   • Vết xước dăm siêu nhỏ < 2cm                                             │
   • Đệm mút lún nhẹ cơ học                                                  │
   • Màu sơn ngả màu do nắng                                                 ▼
   ═══════════════════════════                           ┌───────────────────┴───────────────────┐
   👉 CHỦ NHÀ CHỊU 100%                                  ▼                                       ▼
   (Khách thuê miễn trừ toàn bộ)               【CẤP 2 & 3: CÒN KHUNG KẾT CẤU】            【CẤP 4: HỎNG HOÀN TOÀN】
                                               • Gãy bản lề, kẹt ray                   • Gãy sập khung chịu lực
                                               • Nẹp bung, xước bề mặt                 • Ngập nước phồng rộp nát
                                               • Vỡ kính mặt bàn trà                   • Không thể sửa chữa
                                               • Ố bẩn đệm sofa                        ═════════════════════════
                                               ═════════════════════════════           👉 ÁP DỤNG PHƯƠNG PHÁP 1:
                                               👉 ÁP DỤNG PHƯƠNG PHÁP 2:               Số tiền bồi thường =
                                               Thực chi hóa đơn thợ mộc Ocean Park     P_catalog × % Độ mới bàn giao
                                               (Hỏng đâu sửa đó theo biểu phí niêm yết)(Khách nhận xác phế liệu nếu muốn)
```

#### Ma trận chi tiết 4 Cấp độ:
1. **Cấp độ 1 — Hao mòn tự nhiên (Fair Wear & Tear):**
   * *Đặc điểm:* Các vết xước dăm siêu nhỏ dưới 2cm không xuyên thủng lớp bảo vệ Melamine, đệm mút lún nhẹ do ngồi tự nhiên, gỗ ngả màu đều do thời gian tiếp xúc ánh sáng.
   * *Quyết định:* **Miễn trừ 100% trách nhiệm bồi thường cho Khách thuê**. Chủ nhà chịu toàn bộ chi phí hao mòn tài sản đã được bù đắp trong tiền thuê hàng tháng.
2. **Cấp độ 2 — Hư hại linh kiện / Cơ khí rời (Component Defect):**
   * *Đặc điểm:* Bản lề cong vênh/gãy, ray trượt bi bung ốc, bung nẹp chỉ cạnh, lỏng tay nắm cửa tủ.
   * *Quyết định:* **Áp dụng Phương pháp 2**. Thợ mộc đối tác thay thế linh kiện chính hãng. Khấu trừ cọc bằng đúng hóa đơn thực chi (`100.000 – 250.000đ`).
3. **Cấp độ 3 — Hư hại module / Bề mặt thẩm mỹ cục bộ (Cosmetic / Modular Damage):**
   * *Đặc điểm:* Mặt kính bàn trà bị vỡ, vết cào xước sâu vào cốt gỗ do vật nhọn, ố bẩn loang màu trên vải nỉ sofa/nệm, ngấm nước phồng rộp 1 tấm đợt/ngăn kéo.
   * *Quyết định:* **Áp dụng Phương pháp 2**. Thợ mộc cắt kính mới, dặm vá sơn PU hoặc giặt sấy súc bọc lại module hư hỏng. Khấu trừ cọc bằng đúng chi phí hóa đơn thợ (`300.000 – 600.000đ`).
4. **Cấp độ 4 — Hư hỏng nát hoàn toàn / Mất kết cấu chịu lực (Total Loss — $< 0.1\%$ trường hợp):**
   * *Đặc điểm:* Gãy sập hoàn toàn khung chịu lực giường/sofa không thể gia cố lại, ngập nước dài ngày trương nở mục nát toàn bộ cốt gỗ tủ, cháy rụi hoặc mất tích hoàn toàn món đồ.
   * *Quyết định:* **Áp dụng Phương pháp 1**. Khấu trừ cọc theo công thức giá trị còn lại ràng buộc:
     $$\text{Số tiền bồi thường tối đa} = P_{\text{catalog}} \times \text{\% Độ mới lúc bàn giao ban đầu}$$
     *(Ví dụ: Bộ ghế sofa có giá định mức chuẩn $P_{\text{catalog}} = 6.000.000\text{ VNĐ}$, độ mới lúc bàn giao nhận nhà là $80\% \rightarrow$ Số tiền bồi thường tối đa khách thuê phải gánh chịu là: $6.000.000 \times 80\% = 4.800.000\text{ VNĐ}$. Khách thuê có quyền thu hồi tài sản hỏng phế liệu đó nếu đã thanh toán trọn số tiền bồi thường).*

---

### 5. Cơ chế Niêm phong Pháp lý Đầu - Cuối & Bảo vệ quyền lợi Khách thuê

#### A. Khóa pháp lý số hóa lúc nhận nhà (Check-in Legal Locking):
* Khi Field Host và Khách thuê kiểm định căn hộ ngày đầu, hệ thống tự động gắn Bảng giá định mức chuẩn ($P_{\text{catalog}}$) và % Độ mới chụp ảnh thực tế vào **Phụ lục Bảng kê Điều 5 Hợp đồng thuê căn hộ**.
* Khách thuê kiểm tra, đối soát và **ký số xác nhận bằng mã OTP Zalo/SMS** trước khi chìa khóa được bàn giao.
* Việc ký số này xác lập **thỏa thuận dân sự có hiệu lực pháp lý ràng buộc theo Điều 328 và Điều 589 Bộ luật Dân sự 2015**. Cả Chủ nhà và Khách thuê đã thống nhất trước nguyên tắc tính tiền, triệt tiêu 100% khả năng xảy ra cãi vã, khiếu nại mức giá khi kết thúc hợp đồng.

#### B. Điều khoản trần chi phí thị trường (Replacement Ceiling Guarantee):
* Hợp đồng thuê quy định rõ ràng: Mức bồi thường tối đa đối với bất kỳ món đồ gỗ nào **tuyệt đối không được vượt quá giá bán của một sản phẩm mới tương đương trên thị trường tại thời điểm bồi thường**. Khách thuê được pháp luật và quy chế nền tảng bảo vệ toàn diện, không bao giờ phải chịu rủi ro bồi thường vượt quá giá trị thực tế của tài sản.

#### C. Quy trình Trọng tài nhanh & Hoàn cọc trong 24 giờ (Arbitration & Refund SLA):
1. **Bước 1 (Giờ 0–2):** Chụp ảnh đối xứng hiện trạng trả phòng so với ảnh nhận ban đầu; kích hoạt điều phối thợ mộc khảo sát.
2. **Bước 2 (Giờ 2–4):** Thợ mộc gửi báo giá thực chi có kèm ảnh chụp chi tiết vị trí hư hỏng lên hệ thống VinStay AI.
3. **Bước 3 (Giờ 4–12):** Hệ thống gửi thông báo đối soát tự động qua Zalo ZNS cho Khách thuê. Khách thuê bấm "Đồng ý" trên điện thoại.
4. **Bước 4 (Giờ 12–24):** Nền tảng tự động cấn trừ số tiền theo đúng hóa đơn thợ mộc và **giải tỏa 100% phần Tiền Cọc Bảo Đảm Tài Sản còn lại về tài khoản ngân hàng của Khách thuê qua VietQR trong vòng 24 giờ làm việc**.
5. **Trường hợp Khách thuê khiếu nại:** Area Lead của VinStay AI cùng chuyên gia độc lập có mặt tại phòng tái kiểm định trong 4 giờ, đưa ra phán quyết cuối cùng dựa trên Quy chuẩn Protocol 09 và biểu phí niêm yết của nền tảng.

---

## MỤC IV: CƠ CHẾ KHÓA PHÁP LÝ & QUY TRÌNH ĐỐI SOÁT ĐẦU - CUỐI

### 1. Cơ chế đồng thuận 2 bên trước khi nhận nhà (Check-in Legal Locking)
* Bảng kiểm định trang thiết bị (kèm Mã Model thiết bị điện tử, ảnh hiện trạng và % Độ mới) được tích hợp trực tiếp vào **Phụ lục Điều 5 Hợp đồng thuê căn hộ số hóa**.
* Khách thuê được đối soát toàn bộ thông tin trực tiếp trên ứng dụng trước khi nhận bàn giao chìa khóa.
* Khi Khách thuê nhập mã OTP Zalo/SMS để ký số Hợp đồng, toàn bộ dữ liệu này được niêm phong mật mã học (SHA-256) và **trở thành thỏa thuận dân sự có hiệu lực pháp lý ràng buộc (Điều 328 BLDS 2015)**. Cả hai bên đã cam kết đồng thuận từ ngày đầu, loại trừ triệt để tranh chấp lúc trả nhà.

### 2. Điều khoản trần bảo vệ khách thuê (Replacement Cost Ceiling)
* Hợp đồng thuê quy định rõ: Trong mọi trường hợp bồi thường thiết bị điện máy hoặc đồ gỗ, mức bồi thường trần **tuyệt đối không được vượt quá giá bán của một sản phẩm mới cùng loại/cùng thông số kỹ thuật trên thị trường tại thời điểm bồi thường**. Khách thuê được bảo đảm 100% không bị ép bồi thường theo giá mua đắt trong quá khứ của chủ nhà.

### 3. Quy trình đối soát trả phòng & Tất toán cọc thần tốc trong 24 giờ (Check-out Mirroring SLA)
1. **Chụp ảnh đối xứng (Mirroring Angle):** Khi trả phòng, Field Host chụp ảnh hiện trạng tại đúng góc chụp lúc nhận phòng.
2. **AI & Nhân sự đối chiếu song song:** Giao diện hiển thị trực quan: *Ảnh lúc nhận (trái) vs Ảnh lúc trả (phải)*.
3. **Phân loại xử lý trong 60 phút:**
   - Nếu không có sai lệch: Hệ thống giải tỏa 100% Tiền Cọc Bảo Đảm Tài Sản về tài khoản khách thuê trong 24 giờ.
   - Nếu có hư hại khắc phục được: Đơn vị kỹ thuật xuất hóa đơn chi phí $\rightarrow$ Khấu trừ đúng số tiền theo hóa đơn.
   - Nếu hỏng hoàn toàn: Áp dụng công thức `[Giá TMĐT/Catalog] × [% Độ mới bàn giao]` $\rightarrow$ Khấu trừ đúng số tiền đã chốt và hoàn trả phần tiền cọc còn lại.

---

## MỤC V: CƠ CHẾ XÁC THỰC ẢNH KIỂM ĐỊNH NỘI THẤT 3 LỚP (3-TIER PHOTO INTEGRITY ARCHITECTURE)

Nhằm bảo đảm tính xác thực 100% của ảnh chụp hiện trạng, ngăn chặn triệt để tình trạng Field Host chụp sai loại đồ, chụp đối phó, chụp ảnh thiếu sáng hoặc tải ảnh cũ/ảnh mạng, VinStay AI thiết lập kiến trúc kiểm soát 3 lớp đồng bộ:

### 1. Lớp 1 — AI Vision Object Validation (Nhận diện & So khớp tự động thời gian thực)
* **Thuật toán phân loại đối tượng (Computer Vision & Multimodal Matching):** Ngay khi ảnh được chụp/tải lên, mô-đun AI Vision tiến hành phân tích quang học trong vòng $\le 1.5$ giây:
  - So khớp trực tiếp hình ảnh với nhãn phân loại chuẩn của hạng mục (ví dụ: Mã 01 - Sofa $\leftrightarrow$ `['sofa', 'couch', 'living room furniture']`).
  - Đánh giá mức độ tin cậy nhận diện (Confidence Score). Nếu độ tin cậy $\ge 80\%$, hệ thống đóng dấu: `✓ AI Vision: Khớp chủng loại [Tên món đồ] ([% Độ tin cậy])`.
* **Cơ chế lọc ảnh rác & Cảnh báo sai lệch (Garbage Rejection Guardrail):**
  - *Ảnh thiếu sáng / Bị che ống kính:* Thuật toán phân tích cường độ sáng (Luminance) tự động từ chối các ảnh tối đen (Luminance $< 14$) hoặc lóa trắng (Luminance $> 248$), yêu cầu Host chụp lại nơi đủ sáng.
  - *Cảnh báo chụp sai chủng loại:* Trường hợp Host chụp nhầm (ví dụ: chụp bồn cầu vào ô kiểm tra ghế Sofa), hệ thống lập tức hiển thị cảnh báo màu hổ phách/đỏ: `⚠️ Cảnh báo AI: Phát hiện [Bồn cầu], không khớp với [Bộ ghế Sofa]. Vui lòng chụp lại!`.

### 2. Lớp 2 — Metadata & Rào cản Chống gian lận Thực địa (Geofence & Timestamp Proof)
* **Kích hoạt Camera trực tiếp (`capture="environment"`):** Nút chụp ảnh trên thiết bị di động của Field Host bắt buộc mở trực tiếp Camera sau của điện thoại để ghi hình tại hiện trường, hạn chế tối đa việc tải file ảnh lưu sẵn từ thư viện ảnh máy cá nhân.
* **Định vị Geofencing nội khu Vinhomes Ocean Park:** Hệ thống tự động ghi nhận tọa độ định vị GPS của thiết bị chụp ảnh, bảo đảm vị trí chụp nằm trong bán kính ranh giới hành chính của Khu đô thị Vinhomes Ocean Park (Gia Lâm, Hà Nội).
* **Đóng dấu số kỹ thuật số (Cryptographic Watermark Tag):** Mỗi ảnh chụp được gắn siêu dữ liệu bất biến:
  $$\text{Dấu định danh} = [\text{Mã Căn hộ: Tòa - Tầng - Căn}] + [\text{Thời gian ISO chính xác từng giây}] + [\text{Mã định danh Host thực hiện}]$$

### 3. Lớp 3 — Cơ chế Đối soát Chéo 3 Bên (Tripartite Legal Cross-check)
* **Chủ nhà duyệt trên Landlord Portal:** Chủ nhà là người sở hữu và hiểu rõ nhất cấu hình nội thất căn hộ. Báo cáo kiểm định kèm ảnh chụp được chuyển tới tài khoản Chủ nhà để phê duyệt. Nếu phát hiện Host chụp nhầm phòng hoặc sai góc, Chủ nhà có quyền yêu cầu chụp lại.
* **Khách thuê đối soát trực tiếp lúc bàn giao chìa khóa:** Trước khi nhận nhà, Khách thuê mở Hộ chiếu bàn giao số trên ứng dụng VinStay AI, đứng trước từng món đồ và đối chiếu trực quan ảnh chụp với hiện trạng thực tế.
* **Khóa pháp lý bằng mã OTP Zalo (Legal Finality):** Khi cả Chủ nhà và Khách thuê cùng kiểm tra và ký số xác nhận bằng mã OTP Zalo/SMS, toàn bộ bộ ảnh kiểm định chính thức trở thành **chứng cứ pháp lý có hiệu lực tối cao theo Điều 328 & Điều 589 Bộ luật Dân sự 2015**, loại trừ 100% mọi nguy cơ tranh cãi hay khiếu nại về sau.

