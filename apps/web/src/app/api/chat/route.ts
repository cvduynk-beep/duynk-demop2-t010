import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * LỚP 1: IN-MEMORY SLIDING WINDOW RATE LIMITER CHO KHÁCH VÃNG LAI
 * Tối đa 6 request / 60 giây trên mỗi IP/Client để chặn spam và tấn công vét cạn API token.
 */
interface RateRecord {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateRecord>();

function checkRateLimit(clientId: string, maxRequests = 6, windowMs = 60000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);

  // Dọn dẹp các record hết hạn
  if (!record || now > record.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: maxRequests - record.count };
}

/**
 * LỚP 2: ZERO-COST LOCAL FAST-PATH FAQ (CHI PHÍ = 0đ, PHẢN HỒI 0ms)
 * Nhận diện câu hỏi quy chế/tiện ích kinh điển nội khu để trả lời ngay mà không cần gọi LLM.
 */
function matchLocalFastPathFaq(msg: string): string | null {
  const lower = msg.toLowerCase();

  // 1. Phí gửi xe
  if (lower.includes("gửi xe") || lower.includes("xe máy") || lower.includes("ô tô") || lower.includes("xe con")) {
    return "Biểu phí gửi xe chuẩn BQL Vinhomes Ocean Park:\n• Xe máy: 60.000đ – 80.000đ/tháng (tùy phân khu).\n• Ô tô: 1.250.000đ/tháng (gửi hầm hoặc nhà để xe nổi 5 tầng).\nKhoản này đã được tự động cộng vào bảng All-in Cost trọn gói của VinStay AI!";
  }

  // 2. Phí quản lý BQL
  if (lower.includes("phí quản lý") || lower.includes("phí dịch vụ") || lower.includes("bql")) {
    return "Phí quản lý BQL Vinhomes tính theo m² thông thủy:\n• Phân khu The Sapphire: ~8.800đ/m²/tháng (đã VAT).\n• Phân khu The Zenpark / Pavilion: ~11.000đ – 14.000đ/m²/tháng.\nTrên VinStay AI, phí này luôn được tính sẵn vào mục All-in Cost trọn gói để bạn không bị sốc chi phí ẩn!";
  }

  // 3. Nuôi thú cưng / chó mèo
  if (lower.includes("chó") || lower.includes("mèo") || lower.includes("thú cưng") || lower.includes("pet")) {
    return "Theo nội quy BQL Vinhomes Ocean Park:\n• Được phép nuôi thú cưng nhỏ nếu tiêm phòng đầy đủ, dắt ra ngoài phải có dây xích/rọ mõm và dọn vệ sinh sạch sẽ.\n• Giữ trật tự, tránh sủa gây ồn sau 22h đêm.\nVinStay AI có sẵn bộ lọc căn hộ ưu tiên cho phép nuôi thú cưng, bạn có thể bấm lọc ngay nhé!";
  }

  // 4. Định nghĩa All-in Cost
  if (lower.includes("all in") || lower.includes("all-in") || lower.includes("trọn gói gồm")) {
    return "Công thức All-in Cost của VinStay AI gồm 4 cấu phần chuẩn xác:\n1. Giá thuê nhà gốc niêm yết\n2. Phí quản lý BQL Vinhomes (theo m² căn hộ)\n3. Phí gửi xe (xe máy & ô tô)\n4. Điện nước sinh hoạt ước tính theo số người ở\nCam kết 100% không phát sinh chi phí ẩn khi vào ở!";
  }

  // 5. Cọc giữ chỗ & Thủ tục khóa căn
  if (lower.includes("cọc") || lower.includes("giữ chỗ") || lower.includes("vietqr") || lower.includes("khóa căn")) {
    return "Quy trình cọc giữ chỗ tại VinStay AI:\n• Cọc 2.000.000 VNĐ qua VietQR động để khóa căn độc quyền 48h (nguyên tắc First-to-Pay Wins).\n• Khi ký Hợp đồng chính thức, khoản 2 triệu này sẽ chuyển đổi 100% thành Tiền Cọc Bảo Đảm Tài Sản (Security Deposit) giữ suốt kỳ hạn thuê và hoàn lại khi trả nhà.";
  }

  // 6. Thẻ thang máy & Tiếp đón xem phòng
  if (lower.includes("thẻ thang máy") || lower.includes("xem phòng") || lower.includes("đón") || lower.includes("sảnh")) {
    return "Chủ nhà không cần đi 20-30km sang mở cửa! Đội ngũ Field Host nội khu VinStay AI có sẵn thẻ cư dân thang máy, túc trực sẵn sàng đón bạn tại sảnh tòa nhà và dẫn lên xem phòng chỉ trong 60 giây.";
  }

  return null;
}

/**
 * VinStay AI - Trang chủ Chat Copilot Endpoint tích hợp 3 Lớp Bảo Vệ:
 * - Lớp 1: Rate Limiting & Độ dài ký tự tối đa 250
 * - Lớp 2: Zero-Cost Local Fast-Path FAQ Cache
 * - Lớp 3: Strict Topic Guardrails & Giới hạn Output Token 200
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous-client";

    // LỚP 1: Kiểm tra Rate Limit
    const { allowed } = checkRateLimit(ip, 8, 60000);
    if (!allowed) {
      return NextResponse.json(
        {
          ok: false,
          rateLimited: true,
          message: "Bạn đang gửi tin nhắn hơi nhanh. Quản gia Vinny xin đợi khoảng 30 giây trước khi tiếp tục nhé!",
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    let { message, budget_ceiling, occupants, motorbikes, cars } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ ok: false, message: "Tin nhắn không được để trống" }, { status: 400 });
    }

    // LỚP 1 (Tiếp): Cắt gọn độ dài tối đa 250 ký tự để chống prompt stuffing
    message = message.trim().slice(0, 250);

    // LỚP 2: Kiểm tra Local Fast-Path FAQ (0ms, 0đ API token)
    const fastFaqAnswer = matchLocalFastPathFaq(message);
    if (fastFaqAnswer) {
      return NextResponse.json({
        ok: true,
        provider: "zero-cost-faq-fastpath",
        model: "local-fast-path",
        response: fastFaqAnswer,
        token_cost: 0,
      });
    }

    // 1. Thử chuyển tiếp tới FastAPI Python Agent (LangGraph + Gemini Flash) nếu đang chạy ở port 8000
    try {
      const agentRes = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          budget_ceiling,
          occupants,
          motorbikes,
          cars,
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        return NextResponse.json({
          ok: true,
          provider: "langgraph-gemini-agent",
          model: "gemini-3.8-flash",
          response: agentData.response,
          analysis: agentData.analysis,
          matched_units: agentData.matched_units || [],
          criteria: agentData.criteria || {},
        });
      }
    } catch {
      // FastAPI agent offline -> chuyển sang fallback
    }

    // LỚP 3: Gọi trực tiếp Gemini Flash với Strict System Prompt Guardrail & maxOutputTokens=200
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey && !geminiKey.startsWith("sk-") && !geminiKey.includes("your-key")) {
      try {
        const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

        const prompt = [
          "Bạn là Vinny - AI Quản Gia Số chuyên trách thuê căn hộ Vinhomes Ocean Park (VinStay AI).",
          "QUY TẮC BẢO VỆ NGHIÊM NGẶT (STRICT GUARDRAILS):",
          "1. BẮT BUỘC chỉ tư vấn thuê căn hộ, giá All-in Cost, tiện ích và quy chế BQL tại Vinhomes Ocean Park (Gia Lâm, Hà Nội).",
          "2. NẾU khách hỏi chủ đề ngoài lề (toán học, viết mã lập trình, sáng tác thơ, chính trị, dịch vụ ngoài Ocean Park...): Từ chối lịch sự bằng ĐÚNG 1 câu ngắn: 'Vinny là Quản gia số chỉ chuyên tìm căn hộ và hướng dẫn tiện ích tại Ocean Park thôi nè! Bạn cần tìm phòng như thế nào để Vinny hỗ trợ nhé!'.",
          "3. Câu trả lời BẮT BUỘC ngắn gọn, súc tích (dưới 70 từ), giải thích All-in Cost trọn gói và nhắc khách đặt lịch xem phòng đón tận sảnh.",
          `Khách hỏi: "${message}"`,
        ].join("\n");

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 200, // LỚP 3: Giới hạn token đầu ra siêu tiết kiệm
            },
          }),
          signal: AbortSignal.timeout(3000),
        });

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const replyText = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            return NextResponse.json({
              ok: true,
              provider: "direct-gemini-flash",
              model: modelName,
              response: replyText.trim(),
            });
          }
        }
      } catch {
        // Fallback sang local
      }
    }

    // Fallback Hybrid Local Engine
    return NextResponse.json({
      ok: true,
      provider: "vinstay-hybrid-local",
      model: "gemini-flash-ready",
      message: "Agent ready for local deterministic execution",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
