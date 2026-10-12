import { NextResponse } from "next/server";
import { isOutOfScope, OUT_OF_SCOPE_RESPONSE, answerUnitQuestion } from "@/lib/property/unitConcierge";
import { getSafeUnit } from "@/lib/mock/units";

export const dynamic = "force-dynamic";

/**
 * VinStay AI - Quản Gia Căn Hộ Endpoint (/api/concierge)
 * Tích hợp LLM Gemini Flash + Ngữ cảnh Căn hộ Thật + Guardrail Bảo vệ Chi phí
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, unitId, unitContext } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ ok: false, error: "Thiếu câu hỏi" }, { status: 400 });
    }

    const q = question.trim().slice(0, 200);

    // 1. LỚP 1: STRICT GUARDRAIL CHẶN NGOÀI PHẠM VI (0đ TOKEN)
    if (isOutOfScope(q)) {
      return NextResponse.json({
        ok: true,
        text: OUT_OF_SCOPE_RESPONSE,
        suggestBooking: false,
        source: "guardrail",
      });
    }

    // Lấy thông tin căn hộ đầy đủ và an toàn
    const baseUnit = getSafeUnit(unitId);
    const unit = { ...baseUnit, ...(unitContext || {}) };

    // 2. LỚP 2: THỬ GỌI LLM GEMINI FLASH NẾU CÓ KEY
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey && !geminiKey.startsWith("sk-") && !geminiKey.includes("your-key")) {
      try {
        const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

        const systemPrompt = `Bạn là Quản gia Vinny - Trợ lý số chuyên trách căn hộ tại toà ${unit.building} thuộc Vinhomes Ocean Park 1 (VinStay AI).
DỮ LIỆU THẬT CỦA CĂN HỘ ĐANG XEM:
- Mã căn: ${unit.code || "Căn hộ"}, Toà: ${unit.building}, Tầng: ${unit.floor}, Hướng: ${unit.direction || "Đông Nam"}, View: ${unit.view || "Nội khu thoáng mát"}
- Layout: ${unit.layoutLabel || unit.layout}, Diện tích: ${unit.areaM2}m²
- Giá thuê gốc: ${(unit.rent || 6000000).toLocaleString("vi-VN")} đ/tháng
- BIỂU PHÍ SINH HOẠT ƯỚC TÍNH (BẮT BUỘC BÁO THEO KHOẢNG DAO ĐỘNG TỪ... ĐẾN... TRÁNH SAI SỐT/KHIẾU NẠI):
  + Phí quản lý dịch vụ BQL: Dao động khoảng 8.000đ – 16.000đ/m²/tháng (căn ${unit.areaM2}m² ước tính khoảng ${Math.round(unit.areaM2 * 8000).toLocaleString("vi-VN")}đ – ${Math.round(unit.areaM2 * 16000).toLocaleString("vi-VN")}đ/tháng tùy phân khu).
  + Gửi xe ô tô: Dao động khoảng 1.000.000đ – 1.250.000đ/tháng/xe (tùy vị trí đỗ hầm hay nhà để xe nổi 5 tầng kế bên).
  + Gửi xe máy: Dao động khoảng 60.000đ – 90.000đ/tháng/xe (tùy xe thường hay xe điện).
  + Tiền điện EVN: Dao động khoảng 400.000đ – 800.000đ/tháng theo biểu giá bậc thang EVN (cao điểm mùa hè bật điều hòa có thể từ 900.000đ – 1.200.000đ/tháng tùy thói quen dùng).
  + Tiền nước: Khoảng 60.000đ – 120.000đ/tháng theo chỉ số công tơ nước BQL.
  + Lưu ý: Mọi mức phí do BQL Vinhomes niêm yết và có thể điều chỉnh theo từng thời điểm.
- Nuôi thú cưng: ${unit.petFriendly ? "Cho phép nuôi thú cưng nhỏ" : "Không cho phép nuôi thú cưng để bảo vệ nội thất"}.
- Tiện ích trọng điểm Ocean Park 1:
  + Vincom Mega Mall: Khoảng 850m từ toà ${unit.building}, có xe VinBus điện miễn phí đón tại chân toà sang thẳng Vincom.
  + Biển hồ & Hồ nhân tạo: Ocean Park 1 có Hồ ngọc trai nhân tạo 24.5ha (cát trắng tự nhiên, đạp vịt, nướng BBQ) và Biển hồ nước mặn Crystal Lagoon 6.1ha. Toà ${unit.building} kế bên Công viên Hồ San Hô (~100m) và cách Biển hồ chỉ ~1.2km.
  + Bệnh viện Vinmec: Cách ~900m (cạnh Vincom). Trường liên cấp Vinschool: Đi bộ nội khu 5 phút.
- Đặt lịch xem phòng: Miễn phí, Field Host nội khu có thẻ thang máy đón tại sảnh trong 60 giây.
- Khóa căn giữ chỗ: Cọc 2.000.000đ qua VietQR động khóa 48h, chuyển thành tiền cọc bảo đảm hợp đồng.

QUY TẮC PHẢN HỒI:
1. MỌI KHOẢN PHÍ (gửi xe, điện nước, quản lý) BẮT BUỘC báo theo KHOẢNG TỪ... ĐẾN... để khách quan, tránh khẳng định một con số cố định gây khiếu nại.
2. Thấu hiểu tiếng Việt tự nhiên, kể cả gõ tắt hoặc lỗi chính tả (vd: "tiền điên bao nhiu", "đậu xe hơi").
3. Trả lời trực tiếp, thân thiện, súc tích (dưới 80 từ), đúng số liệu trên.
4. TUYỆT ĐỐI KHÔNG trả lời chủ đề ngoài lề (toán, code, thơ, chính trị, dịch vụ ngoài Ocean Park).
5. Khách hỏi: "${q}"`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 450,
            },
          }),
          signal: AbortSignal.timeout(6500),
        });

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const replyText = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (replyText && replyText.length >= 25) {
            return NextResponse.json({
              ok: true,
              text: replyText,
              suggestBooking: true,
              source: "gemini-flash",
            });
          }
        }
      } catch {
        // Fallback tự động
      }
    }

    // 3. LỚP 3: LOCAL DETERMINISTIC SEMANTIC ENGINE (0đ TOKEN, 0ms)
    const localAnswer = answerUnitQuestion(unit, q);
    return NextResponse.json({
      ok: true,
      text: localAnswer?.text || `Căn toà ${unit.building} đang sẵn sàng đón bạn xem thực tế. Bạn có muốn đặt lịch để Field Host dẫn lên xem phòng không?`,
      suggestBooking: localAnswer?.suggestBooking ?? true,
      source: "semantic-local",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Lỗi xử lý yêu cầu" },
      { status: 500 }
    );
  }
}
