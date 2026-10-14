import { NextResponse } from "next/server";
import { answerFromFacts, buildPrompt, QUESTION_MAX, type CopilotFacts } from "@/lib/admin/copilot";
import type { DealRow, DealSummary, HostEarningsSummary, HostPerformanceRow, HostPerformanceSummary, ReportPage } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

/** Số liệu Copilot: 7 ngày gần nhất (giờ VN), cùng định nghĩa với màn Báo cáo. */
const RANGE_DAYS = 7;
const BACKEND_TIMEOUT_MS = 10_000;
const LLM_TIMEOUT_MS = 8_000;
/** Lớp 3 (AGENTS): trần token đầu ra 200–250. */
const MAX_OUTPUT_TOKENS = 250;

/** Cùng nguồn với `lib/auth/session.backendUrl` (file đó là `server-only`, không import được trong test). */
const backendUrl = () => (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const ictDay = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`backend ${status}`);
  }
}

/**
 * Gọi báo cáo admin ở backend BẰNG cookie phiên của chính người hỏi ⇒ backend tự kiểm `ops_admin`
 * (chưa đăng nhập 401, sai vai 403) — route này không tự quyết quyền và không có dữ liệu riêng.
 */
async function report<T>(req: Request, id: string, qs: string): Promise<T> {
  const res = await fetch(`${backendUrl()}/api/v1/admin/reports/${id}?${qs}`, {
    headers: { cookie: req.headers.get("cookie") ?? "", "x-portal": "admin" },
    cache: "no-store",
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new UpstreamError(res.status);
  return ((await res.json()) as { data: T }).data;
}

async function loadFacts(req: Request): Promise<CopilotFacts> {
  const today = ictDay(Date.now());
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (RANGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const range = `from=${from}&to=${today}`;
  // Tuần tự: pool kết nối DB của backend nhỏ (Supabase session), Copilot không cần nhanh hơn màn Báo cáo.
  const host = await report<ReportPage<HostPerformanceRow, HostPerformanceSummary>>(req, "host-performance", `${range}&sort=deals&dir=desc&pageSize=100`);
  const deals = await report<ReportPage<DealRow, DealSummary>>(req, "deals", `${range}&sort=receivedAt&dir=desc&pageSize=20`);
  const earnings = await report<ReportPage<unknown, HostEarningsSummary>>(req, "host-earnings", `${range}&pageSize=1`);
  return {
    from,
    to: today,
    today,
    host: { summary: host.summary, rows: host.rows },
    deals: { summary: deals.summary, rows: deals.rows },
    earnings: { summary: earnings.summary },
  };
}

/** Key Gemini CHỈ đọc từ biến môi trường của server (không đọc file, không lộ ra client). */
function geminiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY_ADMIN || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return k && !k.includes("your-key") ? k : undefined;
}

async function askGemini(prompt: string): Promise<string | null> {
  const key = geminiKey();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) {
    console.warn(`[copilot] Gemini trả ${res.status}; dùng câu trả lời theo luật từ cùng số liệu.`);
    return null;
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

/**
 * Vinny Copilot của Admin. Trả `{ok, text, actions?, source, range}`. Số liệu luôn thật (báo cáo backend); có key Gemini
 * thì LLM diễn đạt lại CHỈ từ số liệu đó, không có / lỗi ⇒ câu trả lời theo luật (cùng số liệu). Không có nhánh mock.
 */
export async function POST(req: Request) {
  let body: { question?: unknown; pageContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_request", message: "Body phải là JSON." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ ok: false, code: "invalid_request", message: "Thiếu câu hỏi." }, { status: 400 });
  if (question.length > QUESTION_MAX) {
    return NextResponse.json({ ok: false, code: "question_too_long", message: `Câu hỏi tối đa ${QUESTION_MAX} ký tự.` }, { status: 400 });
  }
  const page = typeof body.pageContext === "string" ? body.pageContext.slice(0, 60) : "Báo cáo & KPI";

  let facts: CopilotFacts;
  try {
    facts = await loadFacts(req);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json({ ok: false, code: err.status === 401 ? "unauthorized" : "forbidden", message: "Cần đăng nhập cổng Quản trị." }, { status: err.status });
    }
    console.error(`[copilot] Không đọc được số liệu báo cáo: ${(err as Error).message}`);
    return NextResponse.json({ ok: false, code: "reports_unavailable", message: "Chưa đọc được số liệu báo cáo, vui lòng thử lại." }, { status: 502 });
  }

  const rules = answerFromFacts(question, facts);
  let llm: string | null = null;
  try {
    llm = await askGemini(buildPrompt(question, facts, page));
  } catch (err) {
    console.warn(`[copilot] Gemini lỗi: ${(err as Error).message}; dùng câu trả lời theo luật.`);
  }
  return NextResponse.json(
    { ok: true, text: llm ?? rules.text, actions: rules.actions ?? [], source: llm ? "gemini" : "rules", range: { from: facts.from, to: facts.to } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
