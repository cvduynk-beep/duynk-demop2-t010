/**
 * Gọi Google Gemini `generateContent` từ backend. Key chỉ đi trong header `x-goog-api-key` (KHÔNG nằm trên URL nên
 * không lọt vào log proxy/access log), không bao giờ được log. Timeout cứng + tối đa 1 lần thử lại cho lỗi tạm thời.
 */

export type GeminiErrorKind = 'not_configured' | 'timeout' | 'http' | 'blocked' | 'empty' | 'network';

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiErrorKind,
    readonly status?: number,
  ) {
    super(`gemini_${kind}${status ? `_${status}` : ''}`);
  }
}

export interface GeminiOptions {
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Số lần thử lại cho 429/5xx/lỗi mạng, và cho lần thử chậm quá `attemptTimeoutMs` nếu ngân sách còn đủ. */
  retries: number;
  /**
   * Trần MỘT lần thử (mặc định = `timeoutMs`, tức không cắt sớm). Đo 2026-10-16: độ trễ Gemini lite hai đỉnh (~1,2–2,3s
   * hoặc ≥ 6s) ⇒ cắt lần thử chậm ở ~3,5s rồi thử lại trong phần ngân sách còn lại thường nhanh hơn chờ hết 6s.
   */
  attemptTimeoutMs?: number;
  baseUrl?: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Đo 2026-10-12: dòng "flash-lite" thế hệ 3 từ chối `thinkingBudget` (400 INVALID_ARGUMENT) nhưng nhận `thinkingLevel`;
 * `gemini-3.8-flash` và dòng 2.x nhận `thinkingBudget: 0`.
 */
export function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  // Gemma (đo 2026-10-16) từ chối mọi cấu hình suy luận ⇒ bỏ hẳn trường này.
  if (/^gemma-/.test(model)) return undefined;
  return /^gemini-3[\d.]*-flash-lite/.test(model) ? { thinkingLevel: 'minimal' } : { thinkingBudget: 0 };
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiClient {
  constructor(
    private readonly opts: GeminiOptions,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  get configured(): boolean {
    return !!this.opts.apiKey;
  }

  get model(): string {
    return this.opts.model;
  }

  async generate(system: string, user: string): Promise<string> {
    return (await this.generateWithUsage(system, user)).text;
  }

  async generateWithUsage(system: string, user: string): Promise<{ text: string; usage?: GeminiUsage }> {
    const json = await this.post({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: this.generationConfig(),
    });
    const text = textOf(json.candidates?.[0]?.content?.parts);
    if (!text) throw new GeminiError('empty');
    return { text, usage: json.usageMetadata };
  }

  /**
   * Một lượt có function calling. `contents` là toàn bộ hội thoại (user / model / function). Trả nguyên `parts` của model
   * (gồm `thoughtSignature` của Gemini 3 — PHẢI gửi lại y nguyên ở vòng sau), các lời gọi hàm và chữ nếu có.
   */
  /** `timeoutMs`: trần riêng cho lần gọi này (ngân sách còn lại của lượt agent), không vượt `GEMINI_TIMEOUT_MS`. */
  async generateTurn(system: string, contents: GeminiContent[], tools: readonly unknown[], timeoutMs?: number): Promise<GeminiTurn> {
    const json = await this.post(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        // Không có công cụ ⇒ bỏ hẳn khối tools (buộc trả lời bằng chữ).
        ...(tools.length ? { tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
        generationConfig: this.generationConfig(),
      },
      timeoutMs,
    );
    const parts = (json.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
    const calls = parts
      .filter((p) => p.functionCall && typeof p.functionCall.name === 'string')
      .map((p) => ({ name: p.functionCall!.name, args: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
    const text = textOf(parts);
    if (!calls.length && !text) throw new GeminiError('empty');
    return { parts, calls, text, usage: json.usageMetadata };
  }

  private generationConfig() {
    return {
      temperature: 0.2,
      maxOutputTokens: this.opts.maxOutputTokens,
      // Suy luận ngầm ăn vào trần output token ⇒ giảm tối đa để câu trả lời không bị cụt/rỗng.
      ...(thinkingConfigFor(this.opts.model) ? { thinkingConfig: thinkingConfigFor(this.opts.model) } : {}),
    };
  }

  /** POST generateContent: timeout cứng, thử lại 429/5xx/mạng, chặn safety. Trả JSON đã kiểm. */
  private async post(payload: Record<string, unknown>, timeoutMs?: number): Promise<GeminiResponse> {
    const started = Date.now();
    const budget = Math.min(this.opts.timeoutMs, timeoutMs ?? this.opts.timeoutMs);
    if (!this.opts.apiKey) throw new GeminiError('not_configured');
    const url = `${(this.opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')}/models/${encodeURIComponent(this.opts.model)}:generateContent`;
    const body = JSON.stringify(payload);

    let lastError: GeminiError = new GeminiError('network');
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      // 429 (hết hạn mức/phút) cần chờ lâu hơn lỗi 5xx; không chờ quá phần ngân sách còn lại.
      if (attempt > 0) await this.sleep(Math.min(lastError.status === 429 ? 1000 * attempt : 300 * attempt, Math.max(0, budget - (Date.now() - started) - 500)));
      const abort = new AbortController();
      // Lần thử lại chỉ dùng phần thời gian còn lại của ngân sách (không nhân đôi độ trễ).
      const left = budget - (Date.now() - started);
      if (left <= 0) throw new GeminiError('timeout');
      const attemptMs = Math.min(left, this.opts.attemptTimeoutMs ?? left);
      const timer = setTimeout(() => abort.abort(), attemptMs);
      // Lần thử bị cắt sớm (chưa hết ngân sách) ⇒ còn lượt + còn ≥ 1s thì thử lại, ngược lại báo timeout.
      const retryAfterAbort = () => attempt < this.opts.retries && budget - (Date.now() - started) >= 1000 && attemptMs < left;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
          body,
          signal: abort.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (abort.signal.aborted || (err as Error)?.name === 'AbortError') {
          lastError = new GeminiError('timeout');
          if (retryAfterAbort()) continue;
          throw lastError;
        }
        lastError = new GeminiError('network');
        continue;
      }
      try {
        if (!res.ok) {
          lastError = new GeminiError('http', res.status);
          if (RETRYABLE.has(res.status)) continue;
          throw lastError;
        }
        const json = (await res.json()) as GeminiResponse;
        if (json.promptFeedback?.blockReason) throw new GeminiError('blocked');
        const cand = json.candidates?.[0];
        if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') throw new GeminiError('blocked');
        return json;
      } catch (err) {
        if (err instanceof GeminiError) throw err;
        if (abort.signal.aborted) {
          lastError = new GeminiError('timeout');
          if (retryAfterAbort()) continue;
          throw lastError;
        }
        throw new GeminiError('empty');
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }
}

export interface GeminiPart {
  text?: unknown;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: unknown };
  functionResponse?: { name: string; response: unknown };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiTurn {
  parts: GeminiPart[];
  calls: { name: string; args: Record<string, unknown> }[];
  text: string;
  usage?: GeminiUsage;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsage;
}

/** Chữ trả lời (bỏ phần suy luận `thought`). */
function textOf(parts: GeminiPart[] | undefined): string {
  return (parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}
