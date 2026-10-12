import { FURNISHING_LABEL, ITEM_LABEL, type Unit } from "@/lib/units";
import { allInCost, DEFAULT_HOUSEHOLD, RATES } from "@/lib/pricing/cost";
import { api } from "@/lib/apiClient";
import type { ChatResponse } from "@/lib/chat/api";
import { getUnitLivingInsights } from "./livingIntelligence";
import { vnd } from "@/lib/format";

export interface ConciergeAnswer {
  text: string;
  suggestBooking?: boolean;
}

export const QUICK_CHIPS = [
  "⚡ Tiền điện nước khoảng bao nhiêu?",
  "🎓 Gần ĐH VinUni không?",
  "💰 Tổng chi phí gồm những gì?",
  "🐾 Có được nuôi thú cưng không?",
  "🚗 Gửi xe máy & ô tô ở đâu?",
  "🛋️ Nội thất có sẵn những gì?",
];

/**
 * LỚP 1: STRICT TOPIC GUARDRAILS — CHẶN CỨNG NGOÀI PHẠM VI (0đ TOKEN)
 * Ngăn chặn tuyệt đối việc người dùng lợi dụng hỏi chuyện ngoài lề (code, toán học, chính trị, địa điểm ngoài Ocean Park...)
 */
const OUT_OF_SCOPE_KEYWORDS = [
  "code", "python", "javascript", "html", "css", "java", "sql", "lập trình",
  "giải phương trình", "tính nhẩm", "1+", "2+", "phép nhân", "phép chia", "phép cộng", "phép trừ", "bài toán", "giải toán",
  "thơ", "bài hát", "ca dao", "viết thư", "kể chuyện", "đùa", "vui",
  "chính trị", "tổng thống", "chiến tranh", "bầu cử", "đảng",
  "sài gòn", "tp hồ chí minh", "tphcm", "đà nẵng", "quận 1", "bình thạnh", "cầu giấy", "đống đa", "hà đông",
  "chứng khoán", "cổ phiếu", "vinfast", "bitcoin", "crypto", "tiền số", "chứng chỉ", "thời tiết",
  "khách sạn", "du lịch", "resort", "nhà nghỉ",
];

export function isOutOfScope(question: string): boolean {
  const q = question.toLowerCase().trim();
  return OUT_OF_SCOPE_KEYWORDS.some((kw) => q.includes(kw));
}

export const OUT_OF_SCOPE_RESPONSE =
  "Xin lỗi bạn, tôi là Quản gia Vinny chuyên trách căn hộ tại Vinhomes Ocean Park 1. Tôi chỉ có thể giải đáp các thông tin về căn hộ này, biểu phí sinh hoạt, vị trí và tiện ích nội khu thôi nhé!";

/**
 * Chuẩn hóa tiếng Việt & sửa lỗi gõ tắt / lỗi Telex thường gặp
 * Ví dụ: "tiền điên" -> "tiền điện", "bao nhiu/bn" -> "bao nhiêu", "k/ko" -> "không"
 */
function normalizeQuery(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Sửa lỗi gõ dấu nhầm phổ biến (không dùng \b ASCII với ký tự Unicode tiếng Việt)
  s = s.replace(/điên/g, "điện");
  s = s.replace(/nhiu/g, "nhiêu");
  s = s.replace(/(^|\s)bn(\s|$|[?!.,])/g, "$1bao nhiêu$2");
  s = s.replace(/(^|\s)nc(\s|$|[?!.,])/g, "$1nước$2");
  s = s.replace(/(^|\s)(ko|k)(\s|$|[?!.,])/g, "$1không$2");
  s = s.replace(/(^|\s)(dc|đc)(\s|$|[?!.,])/g, "$1được$2");
  s = s.replace(/(^|\s)oto(\s|$|[?!.,])/g, "$1ô tô$2");
  s = s.replace(/(^|\s)đh(\s|$|[?!.,])/g, "$1đại học$2");
  s = s.replace(/(^|\s)bql(\s|$|[?!.,])/g, "$1ban quản lý$2");
  return s;
}

/**
 * LỚP 2: ZERO-COST LOCAL FAST-PATH / SEMANTIC INTENT ENGINE (0đ TOKEN, 0ms)
 * Phản hồi chính xác dữ liệu của chính căn hộ đang xem, thấu hiểu ngữ nghĩa tự nhiên của người Việt.
 */
export function answerUnitQuestion(unit: Unit, question: string): ConciergeAnswer | null {
  const q = normalizeQuery(question);

  // 1. Kiểm tra phạm vi
  if (isOutOfScope(q)) {
    return { text: OUT_OF_SCOPE_RESPONSE, suggestBooking: false };
  }

  const insights = getUnitLivingInsights(unit);
  // Không bịa tên Host: Host được điều phối khi khách đặt lịch.
  const host = { name: "Field Host nội khu" };
  const cost = allInCost(unit, DEFAULT_HOUSEHOLD);

  // 2. Tiền điện / Tiền nước EVN / Chi phí điện nước (Giải quyết triệt để lỗi "tiền điên bao nhiu")
  if (
    q.includes("điện") ||
    q.includes("nước") ||
    q.includes("evn") ||
    q.includes("công tơ") ||
    q.includes("tiền điện") ||
    q.includes("hóa đơn điện")
  ) {
    return {
      text: `⚡ Tiền điện nước tại toà ${unit.building} tính theo biểu giá bậc thang EVN, nộp trực tiếp qua app EVN Hà Nội hoặc VinID.
• Trong All-in Cost, hệ thống ước tính điện nước theo định mức ${vnd(RATES.utilityPerPerson)}đ/người/tháng; hoá đơn thực tế phụ thuộc mức dùng điều hoà.
*(Chủ nhà và Field Host cùng bạn chốt chỉ số công tơ bằng ảnh có timestamp lúc nhận nhà, đảm bảo không nợ đọng từ khách thuê trước).*`,
      suggestBooking: true,
    };
  }

  // 3. Trường học liên cấp Vinschool
  if (
    q.includes("vinschool") ||
    q.includes("mầm non") ||
    q.includes("tiểu học") ||
    q.includes("cấp 1") ||
    q.includes("cấp 2") ||
    q.includes("cấp 3") ||
    q.includes("trường phổ thông")
  ) {
    return {
      text: `🏫 Hệ thống trường học liên cấp Vinschool (Mầm non, Tiểu học, THCS & THPT) được quy hoạch ngay trong nội khu Ocean Park 1 (các điểm trường tại phân khu Sapphire và San Hô).\nHọc sinh có thể tự đi bộ đến trường qua lối nội khu an toàn, có bảo vệ và phân luồng giao thông chặt chẽ!`,
      suggestBooking: true,
    };
  }

  // 4. Đại học VinUni
  if (
    q.includes("vinuni") ||
    q.includes("đại học") ||
    q.includes("dh") ||
    q.includes("sinh viên") ||
    (q.includes("trường") && !q.includes("vinschool"))
  ) {
    const { distanceM, bikeMin, walkMin, note, busInfo } = insights.commute.vinUni;
    let reply = `🎓 Căn toà ${unit.building} cách Đại học VinUni khoảng ${distanceM}m (chỉ mất ${bikeMin} phút đạp xe hoặc ${walkMin} phút đi bộ).`;
    if (note) reply += ` ${note}.`;
    if (busInfo) reply += `\n🚌 ${busInfo}.`;
    return { text: reply, suggestBooking: true };
  }

  // 4. Trạm VinBus / Xe buýt
  if (q.includes("bus") || q.includes("xe buýt") || q.includes("xe bus") || q.includes("vinbus")) {
    const { distanceM, routes, name } = insights.commute.vinBus;
    return {
      text: `🚌 ${name} nằm cách sảnh chỉ ${distanceM}m (khoảng 1 phút đi bộ).\nCó các tuyến xe buýt điện VinBus miễn phí: ${routes.join(", ")} đưa đón thẳng tới trường ĐH VinUni, Vincom Mega Mall và các điểm nội khu!`,
      suggestBooking: true,
    };
  }

  // 5. Tháp văn phòng TechnoPark
  if (q.includes("techno") || q.includes("technopark") || q.includes("văn phòng") || q.includes("đi làm")) {
    const { distanceM, bikeMin, walkMin } = insights.commute.technoPark;
    return {
      text: `🏢 Căn hộ toà ${unit.building} cách Tháp văn phòng TechnoPark khoảng ${distanceM}m (mất khoảng ${bikeMin} phút đi xe hoặc ${walkMin || 7} phút đi bộ), rất thuận tiện cho nhân sự đi làm hàng ngày.`,
      suggestBooking: true,
    };
  }

  // 6. Chỗ gửi xe / Đậu xe / Xe hơi / Ô tô / Xe máy / Xe điện
  if (
    q.includes("gửi xe") ||
    q.includes("đậu xe") ||
    q.includes("đỗ xe") ||
    q.includes("giữ xe") ||
    q.includes("chỗ đậu") ||
    q.includes("chỗ đỗ") ||
    q.includes("xe hơi") ||
    q.includes("ô tô") ||
    q.includes("oto") ||
    q.includes("xe máy") ||
    q.includes("xe điện") ||
    q.includes("bãi xe") ||
    q.includes("nhà xe") ||
    q.includes("hầm xe") ||
    q.includes("lốt xe") ||
    q.includes("slot xe") ||
    q.includes("gara") ||
    q.includes("trụ sạc") ||
    q.includes("vinfast")
  ) {
    return {
      text: `🚗 Phương án đỗ & gửi xe tại toà ${unit.building}:
• Ô tô / Xe hơi: ${vnd(RATES.car)}đ/tháng/xe theo biểu phí hệ thống (đỗ hầm toà nhà hoặc nhà xe nổi).
• Xe máy / Xe điện: ${vnd(RATES.motorbike)}đ/tháng/xe.
*(Mức phí và chỗ đỗ thực tế do BQL Vinhomes niêm yết từng thời điểm. Field Host hỗ trợ bạn đăng ký thẻ xe lúc nhận phòng.)*`,
      suggestBooking: true,
    };
  }

  // 7. Nuôi thú cưng / Chó mèo
  if (q.includes("thú cưng") || q.includes("chó") || q.includes("mèo") || q.includes("pet") || q.includes("nuôi")) {
    if (unit.petFriendly) {
      return {
        text: `🐾 Căn hộ này CHO PHÉP nuôi thú cưng nhỏ! Bạn chỉ cần tuân thủ nội quy BQL: tiêm phòng đầy đủ, dắt ra ngoài có dây xích/rọ mõm và tránh gây ồn sau 22h đêm nhé.`,
        suggestBooking: true,
      };
    }
    return {
      text: `🐾 Căn hộ này chủ nhà KHÔNG cho phép nuôi thú cưng để đảm bảo giữ gìn sàn gỗ và đồ nội thất da/vải nỉ. Nếu bạn có thú cưng, hãy hỏi Quản gia để được gợi ý các căn pet-friendly khác nhé!`,
      suggestBooking: false,
    };
  }

  // 8. Ban công / Hướng căn hộ / View
  if (
    q.includes("ban công") ||
    q.includes("hướng") ||
    q.includes("view") ||
    q.includes("lô gia") ||
    q.includes("logia") ||
    q.includes("phơi đồ") ||
    q.includes("nắng") ||
    q.includes("thoáng")
  ) {
    return {
      text: `🌅 Căn ${unit.code || unit.building} (tầng ${unit.floor}):\n• Hướng: Hướng ${unit.direction || "Đông Nam"} đón gió tự nhiên thông thoáng, không bị nắng gắt.\n• Tầm view: ${unit.view || "Nội khu xanh mát, công viên và hồ nước"}.\n• Ban công & Lô gia rộng rãi, riêng biệt để máy giặt và giàn phơi quần áo rất thuận tiện!`,
      suggestBooking: true,
    };
  }

  // 9. Thang máy / Thẻ cư dân / An ninh / Giờ giấc tự do
  if (
    q.includes("thang máy") ||
    q.includes("thẻ cư dân") ||
    q.includes("thẻ từ") ||
    q.includes("an ninh") ||
    q.includes("bảo vệ") ||
    q.includes("ra vào") ||
    q.includes("giờ giấc") ||
    q.includes("tự do")
  ) {
    return {
      text: `🛡️ Tiện ích & An ninh toà ${unit.building}:\n• Thang máy: Tốc độ cao, phân tầng bằng thẻ từ cư dân an ninh cao.\n• Giờ giấc sinh hoạt: Cư dân ra vào tự do 24/7 (sử dụng thẻ cư dân hoặc vân tay/mã số cửa).\n• Bảo vệ trực sảnh 24/7, camera giám sát sảnh và hành lang an toàn tuyệt đối!`,
      suggestBooking: true,
    };
  }

  // 10. Sân chơi trẻ em / Tiện ích gia đình
  if (
    q.includes("trẻ em") ||
    q.includes("con nít") ||
    q.includes("khu vui chơi") ||
    q.includes("sân chơi") ||
    q.includes("cầu trượt")
  ) {
    return {
      text: `🎈 Tiện ích cho trẻ nhỏ & gia đình:\nNgay dưới chân toà ${unit.building} là cụm sân chơi vận động liên hoàn cát mịn (cầu trượt, xích đu, bập bênh) và công viên dạo bộ cây xanh hoàn toàn tách biệt với làn xe cơ giới, cực kỳ an toàn cho các bé vui chơi mỗi chiều!`,
      suggestBooking: true,
    };
  }

  // 11. Siêu thị / Tạp hóa / Tiệm thuốc chân toà
  if (
    q.includes("siêu thị") ||
    q.includes("winmart") ||
    q.includes("tạp hóa") ||
    q.includes("tiệm thuốc") ||
    q.includes("nhà thuốc") ||
    q.includes("circle k") ||
    q.includes("cửa hàng")
  ) {
    return {
      text: `🛒 Nhu yếu phẩm & mua sắm dưới chân toà:\nNgay tại tầng 1 (shophouse khối đế) toà ${unit.building} có sẵn siêu thị WinMart+, VinMart, các cửa hàng thực phẩm sạch, tiệm thuốc Long Châu/Pharmacity phục vụ cư dân từ 6h sáng tới 23h đêm!`,
      suggestBooking: true,
    };
  }

  // 12. Thủ tục thuê & Tạm trú BQL
  if (
    q.includes("thủ tục") ||
    q.includes("tạm trú") ||
    q.includes("lưu trú") ||
    q.includes("hợp đồng") ||
    q.includes("giấy tờ") ||
    q.includes("cccd")
  ) {
    return {
      text: `📑 Quy trình thuê phòng tại VinStay AI:\n1. Field Host dẫn xem phòng thực tế miễn phí.\n2. Cọc giữ chỗ 2.000.000đ qua VietQR động khóa căn 48h.\n3. Ký Hợp đồng điện tử minh bạch qua hệ thống (AI OCR CCCD tự động).\n4. Field Host hỗ trợ làm thủ tục đăng ký tạm trú công an và khai báo cư dân BQL Vinhomes từ A-Z!`,
      suggestBooking: true,
    };
  }

  // 8. Chi phí / Tiền thuê / Phí quản lý / All-in Cost
  if (
    q.includes("chi phí") ||
    q.includes("tiền thuê") ||
    q.includes("giá thuê") ||
    q.includes("phí quản lý") ||
    q.includes("tổng tiền") ||
    q.includes("hàng tháng") ||
    q.includes("all in") ||
    q.includes("trọn gói")
  ) {
    return {
      text: `💰 Chi phí ước tính hàng tháng căn ${unit.code || unit.building} (1 người, 1 xe máy):
• Tiền thuê nhà: ${vnd(cost.rent)} đ/tháng.
• Phí quản lý BQL: ${vnd(cost.mgmt)} đ/tháng.
• Phí gửi xe: ${vnd(cost.parking)} đ/tháng (ô tô ${vnd(RATES.car)}đ/xe).
• Điện nước ước tính: ${vnd(cost.utility)} đ/tháng (${vnd(RATES.utilityPerPerson)}đ/người).
👉 All-in dự kiến: ${vnd(cost.total)} đ/tháng — thay đổi theo số người và số xe bạn khai báo.`,
      suggestBooking: true,
    };
  }

  // 9. Tầng / Hướng / Nắng / Gió / View / Yên tĩnh
  if (q.includes("tầng") || q.includes("hướng") || q.includes("nắng") || q.includes("gió") || q.includes("ồn") || q.includes("view")) {
    return {
      text: `🏙️ Căn nằm ở tầng ${unit.floor} (${insights.floorInsight.title}), ban công hướng ${unit.direction}, view ${unit.view}.\n${insights.directionInsight.description}`,
      suggestBooking: true,
    };
  }

  // 10. Nội thất / Đồ đạc / Trang thiết bị (Tủ lạnh, máy giặt, điều hòa, bếp)
  if (
    q.includes("nội thất") ||
    q.includes("đồ đạc") ||
    q.includes("thiết bị") ||
    q.includes("có sẵn") ||
    q.includes("máy giặt") ||
    q.includes("tủ lạnh") ||
    q.includes("điều hòa") ||
    q.includes("bếp") ||
    q.includes("giường")
  ) {
    const itemsText = unit.items.map((i) => ITEM_LABEL[i]).join(", ");
    return {
      text: `🛋️ Căn hộ bàn giao ${FURNISHING_LABEL[unit.furnishing]}.\nĐã trang bị sẵn: ${itemsText}.\nĐầy đủ thiết bị thiết yếu, bạn chỉ cần xách vali cá nhân vào ở ngay!`,
      suggestBooking: true,
    };
  }

  // 11. Đặt lịch / Xem phòng / Host / Mã cửa
  if (q.includes("đặt lịch") || q.includes("xem phòng") || q.includes("host") || q.includes("mã cửa") || q.includes("mở cửa") || q.includes("chìa khóa")) {
    return {
      text: `🔑 Quy trình xem phòng hoàn toàn miễn phí!\n• Field Host phụ trách: ${host.name} (đã có thẻ cư dân thang máy) sẽ đón bạn đúng giờ tại sảnh toà ${unit.building}.\n• Khi tới trước cửa phòng, Host xác nhận trên app để mở cửa tức thì.\nBạn bấm nút "Đặt lịch xem phòng" ngay bên dưới để chọn giờ phù hợp nhé!`,
      suggestBooking: true,
    };
  }

  // 12. Cọc giữ căn / 2 triệu / VietQR
  if (q.includes("cọc") || q.includes("giữ chỗ") || q.includes("vietqr") || q.includes("2 triệu") || q.includes("2.000.000")) {
    return {
      text: `🛡️ Khi xem ưng ý, bạn quét mã VietQR động 2.000.000đ để khóa giữ chỗ căn hộ độc quyền trong 48 giờ.\nKhoản 2 triệu này khi ký Hợp đồng thuê chính thức sẽ chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản (không trừ vào tiền thuê tháng đầu) và hoàn lại khi hết hạn thuê!`,
      suggestBooking: true,
    };
  }

  // 13. Vincom Mega Mall / TTTM / Mua sắm giải trí
  if (
    q.includes("vincom") ||
    q.includes("mega mall") ||
    q.includes("trung tâm thương mại") ||
    q.includes("tttm") ||
    q.includes("mua sắm") ||
    q.includes("siêu thị lớn") ||
    q.includes("rạp phim") ||
    q.includes("cgv")
  ) {
    const isZurichOrZenpark = unit.building.startsWith("ZR") || unit.building.startsWith("R");
    const distVincom = isZurichOrZenpark ? "khoảng 850m" : "khoảng 400m – 900m";
    return {
      text: `🛍️ Vincom Mega Mall Ocean Park là TTTM lớn nhất khu vực (gồm siêu thị WinMart, rạp chiếu phim CGV, khu ẩm thực & mua sắm 4 tầng).\n• Từ toà ${unit.building}: Cách ${distVincom} (chỉ mất 3 phút đi xe hoặc đi xe buýt điện VinBus miễn phí OCP01/OCP02 đón ngay chân sảnh toà đưa thẳng vào sảnh Vincom).\nRất tiện lợi cho việc mua sắm, xem phim và giải trí hàng ngày!`,
      suggestBooking: true,
    };
  }

  // 14. Biển hồ nước mặn Crystal Lagoon / Hồ Ngọc Trai / Hồ San Hô / Hồ nhân tạo
  if (
    q.includes("hồ nhân tạo") ||
    q.includes("biển hồ") ||
    q.includes("hồ ngọc trai") ||
    q.includes("hồ san hô") ||
    q.includes("hồ nước mặn") ||
    q.includes("bãi cát") ||
    q.includes("biển nhân tạo") ||
    q.includes("hồ lớn") ||
    q.includes("bờ hồ") ||
    (q.includes("hồ") && !q.includes("hộp"))
  ) {
    return {
      text: `🌊 Hệ sinh thái hồ tại Vinhomes Ocean Park 1 gồm 3 đại tiện ích biểu tượng:\n• Biển hồ nước mặn nhân tạo Crystal Lagoon 6,1ha (nước trong xanh như biển thật với bãi cát trắng dừa xanh).\n• Hồ Ngọc Trai 24,5ha (hồ điều hòa cát trắng mịn tự nhiên gấp đôi hồ Gươm, câu cá và chèo thuyền Kayak).\n• Công viên Hồ San Hô: Trải dài kế bên các toà căn hộ (chỉ 100m – 300m đi bộ), có vườn nướng BBQ và đường chạy bộ ven hồ lộng gió.\nTừ toà ${unit.building}, bạn chỉ mất vài phút đi bộ hoặc đón xe buýt điện VinBus tại sảnh đi dạo hồ hoàn toàn miễn phí!`,
      suggestBooking: true,
    };
  }

  // 15. Bệnh viện Đa khoa Quốc tế Vinmec
  if (q.includes("vinmec") || q.includes("bệnh viện") || q.includes("phòng khám") || q.includes("y tế") || q.includes("cấp cứu")) {
    return {
      text: `🏥 Bệnh viện Đa khoa Quốc tế Vinmec Ocean Park nằm ngay trục đại lộ lớn kế bên Vincom Mega Mall (cách toà ${unit.building} khoảng 900m – 1.3km).\nCó xe buýt điện VinBus nội khu kết nối thẳng và dịch vụ y tế cấp cứu túc trực 24/7 rất an tâm cho cư dân!`,
      suggestBooking: true,
    };
  }

  // 17. Chợ đêm & Ẩm thực shophouse khối đế
  if (q.includes("chợ đêm") || q.includes("phố đi bộ") || q.includes("ăn uống") || q.includes("nhà hàng") || q.includes("quán ăn")) {
    return {
      text: `🍜 Thiên đường ẩm thực tại Ocean Park 1:\n• Ngay khối đế toà ${unit.building}: Đầy đủ shophouse quán cơm, bún phở, trà sữa, cafe Highlands/Circle K mở cửa đến khuya.\n• Phố đêm ẩm thực Ocean Park (khu Sao Biển ven hồ) mở từ 18h – 24h hàng ngày với hàng trăm gian hàng ẩm thực đường phố và sự kiện ca nhạc cuối tuần!`,
      suggestBooking: true,
    };
  }

  // 18. Tiện ích thể thao / Bể bơi / Gym / Công viên
  if (q.includes("bể bơi") || q.includes("hồ bơi") || q.includes("gym") || q.includes("tiện ích") || q.includes("công viên")) {
    return {
      text: `🏊 Cư dân toà ${unit.building} được hưởng trọn hệ sinh thái Vinhomes Ocean Park:\n• Miễn phí sân thể thao (tennis, bóng rổ, cầu lông), công viên nướng BBQ và lối dạo bộ ven hồ.\n• Bể bơi tiêu chuẩn & phòng gym đăng ký vé cư dân ưu đãi qua app cư dân Vinhomes!`,
      suggestBooking: true,
    };
  }

  // 19. Không gian +1 (nếu có)
  if (q.includes("+1") || q.includes("phòng phụ") || q.includes("bàn học") || q.includes("làm việc")) {
    return {
      text: `✨ ${insights.layoutInsight.title}:\n${insights.layoutInsight.description}\n${insights.layoutInsight.plusOneHighlight || ""}`,
      suggestBooking: true,
    };
  }

  // Không khớp câu nào về dữ liệu căn ⇒ để lớp 3 (backend) trả lời.
  return null;
}

/**
 * LỚP 3: Câu không có trong dữ liệu căn ⇒ hỏi backend `POST /api/v1/chat` (FAQ quy chế từ tri thức đã kiểm + fee_configs,
 * hoặc tìm căn bằng AI Matchmaker). Không còn route Next gọi thẳng LLM bằng dữ liệu mock.
 */
export async function askVinnyConcierge(unit: Unit, question: string): Promise<ConciergeAnswer> {
  const trimmed = question.trim();
  if (isOutOfScope(trimmed)) {
    return { text: OUT_OF_SCOPE_RESPONSE, suggestBooking: false };
  }

  // Dữ liệu của chính căn đang xem (0đ, 0ms).
  const local = answerUnitQuestion(unit, trimmed);
  if (local) return local;

  const res = await api.post<ChatResponse>("/chat", { message: trimmed.slice(0, 250) });
  if (res.ok && res.data?.reply && (res.data.kind === "faq" || res.data.kind === "refusal")) {
    return { text: res.data.reply, suggestBooking: res.data.kind === "faq" };
  }
  const insights = getUnitLivingInsights(unit);
  return {
    text: `Căn hộ ${unit.layoutLabel} toà ${unit.building} (tầng ${unit.floor}, ${unit.areaM2}m²) có giá thuê ${vnd(unit.rent)} đ/tháng, cách ĐH VinUni khoảng ${insights.commute.vinUni.distanceM}m. Bạn có muốn đặt lịch để Field Host dẫn xem phòng thực tế không?`,
    suggestBooking: true,
  };
}
