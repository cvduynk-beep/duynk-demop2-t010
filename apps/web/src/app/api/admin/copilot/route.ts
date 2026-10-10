import { NextResponse } from "next/server";
import { AGENT_KPIS, CAMPAIGN_DATA, HIGH_VALUE_PROSPECTS, RAW_DEALS } from "@/lib/mock/reports";

import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function getGeminiAdminKey(): string | undefined {
  if (process.env.GEMINI_API_KEY_ADMIN && !process.env.GEMINI_API_KEY_ADMIN.includes("your-key")) {
    return process.env.GEMINI_API_KEY_ADMIN;
  }
  if (process.env.NODE_ENV === "development") {
    try {
      const candidates = [
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(process.cwd(), ".env"),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const txt = fs.readFileSync(p, "utf8");
          const m = txt.match(/GEMINI_API_KEY_ADMIN=([^\r\n]+)/);
          if (m && m[1] && !m[1].includes("your-key")) {
            return m[1].trim();
          }
        }
      }
    } catch {}
  }
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

/**
 * Endpoint AI Trợ Lý Điều Hành Admin (/api/admin/copilot)
 * Tích hợp LLM Gemini Flash với toàn bộ Context Báo cáo & KPI thực tế của hệ thống.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, pageContext } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ ok: false, error: "Thiếu câu hỏi" }, { status: 400 });
    }

    const q = question.trim().slice(0, 300);

    const geminiKey = getGeminiAdminKey();
    if (geminiKey && !geminiKey.includes("your-key")) {
      const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

      const systemPrompt = `Bạn là Vinny Copilot - Trợ lý số điều hành vận hành cấp cao của Nền tảng Cho thuê VinStay AI tại Vinhomes Ocean Park 1.
BẠN ĐANG TRỢ GIÚP QUẢN TRỊ VIÊN (ADMIN/OPERATIONS LEAD) TẠI TRANG: ${pageContext || "Báo cáo & KPI"}.

DỮ LIỆU ĐỐI SOÁT HỆ THỐNG THỜI GIAN THỰC:
1. HIỆU SUẤT SALE & KPI (${AGENT_KPIS.length} nhân sự):
${AGENT_KPIS.map(
  (a) =>
    `- ${a.name} (${a.team}): Đạt ${a.kpiCompletionRate}% KPI, ${a.dealsActual}/${a.dealsTarget} deals, Doanh số GRV: ${(
      a.grvActual / 1000000
    ).toFixed(1)}M đ, Tốc độ nhận ticket: ${a.ticketAcceptSec}s (SLA < 180s), Đánh giá: ${a.rating}⭐ (${a.totalReviews} reviews), Ca trễ SLA: ${a.slaBreachCount}.`
).join("\n")}

2. GIAO DỊCH & HỢP ĐỒNG ĐÃ KÝ GẦN NHẤT (Hôm nay: 10/10/2026):
${RAW_DEALS.slice(0, 4)
  .map(
    (d) =>
      `- Ngày ${d.createdAt}: Khách ${d.clientName} (${d.clientType}) chốt căn ${d.unitAddress} (${d.layout}, giá ${(
        d.monthlyRent / 1000000
      ).toFixed(1)}M/tháng). Sale chốt: ${d.agentName}. Trạng thái: ${d.status}. Chu kỳ: ${d.salesCycleDays} ngày.`
  )
  .join("\n")}
Lưu ý: Hôm nay (10/10) chưa có HĐ thuê mới hoàn tất ký số, deal gần nhất là ngày hôm qua 09/10 (Nguyễn Văn Hùng, Sale Lê Quốc Bảo).

3. TOP KHÁCH HÀNG TIỀM NĂNG (AI LEAD SCORING 100đ):
${HIGH_VALUE_PROSPECTS.slice(0, 3)
  .map(
    (p) =>
      `- ${p.name} (${p.score}đ AI, ${p.clientType}): Ngân sách ${(p.budgetMonthly / 1000000).toFixed(1)}M/tháng (${
        p.preferredLayout
      }), cần vào ở gấp trong ${p.urgencyDays} ngày. Căn khớp: ${p.matchedUnitCode}. Sale: ${p.assignedHostName}. Note: ${p.aiNotes}.`
  )
  .join("\n")}

4. CHIẾN DỊCH QUẢNG CÁO & ROI:
${CAMPAIGN_DATA.map(
  (c) =>
    `- ${c.name} (${c.channel}): Chi ${(c.adSpend / 1000000).toFixed(1)}M -> GRV ${(
      c.grossRentalValue / 1000000
    ).toFixed(1)}M. ROI: +${c.roiPercent}%. Qualified Leads: ${c.qualifiedLeads} (CPQL: ${(
      c.costPerQualifiedLead / 1000
    ).toFixed(0)}k/lead). Deals: ${c.dealsClosed}.`
).join("\n")}

QUY TẮC PHẢN HỒI (BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT):
1. TRẢ LỜI THẲNG VÀO TRỌNG TÂM, SIÊU NGẮN GỌN (TỐI ĐA 2-4 DÒNG, DƯỚI 60-80 TỪ).
2. ĐI THẲNG VÀO CÂU TRẢ LỜI NGAY TỪ ĐẦU TIÊN (Ví dụ hỏi "sáng giờ chốt được nhiêu khách rồi?" -> Trả lời ngay: "Hôm nay hệ thống chưa ghi nhận hợp đồng mới chốt thành công anh nhé...").
3. TUYỆT ĐỐI KHÔNG DÙNG TIÊU ĐỀ HOA MỸ DÀI DÒNG, KHÔNG LIỆT KÊ DÀN TRẢI LỊCH SỬ NẾU KHÔNG ĐƯỢC HỎI.
4. Chỉ nêu 1-2 con số quan trọng nhất trực tiếp giải đáp câu hỏi.
5. Không in cú pháp LaTeX (dùng Unicode ≥, ≤, →, ⭐ thay vì $\\ge$).
6. Văn phong gãy gọn, tinh tế, tự nhiên như một Trợ lý Điều hành báo cáo nhanh cho Sếp.
7. Câu hỏi của Quản trị viên: "${q}"`;

      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.2,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return NextResponse.json({ ok: true, text, source: "gemini" });
        }
      }
    }

    // Nếu không có key hoặc lỗi key -> trả về ok: false để client dùng Semantic Reasoner
    return NextResponse.json({ ok: false, fallback: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message, fallback: true });
  }
}
