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
  /** Số lần thử lại cho 429/5xx/lỗi mạng (không thử lại khi timeout — đã tiêu hết ngân sách thời gian). */
  retries: number;
  baseUrl?: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Đo 2026-10-12: dòng "flash-lite" thế hệ 3 từ chối `thinkingBudget` (400 INVALID_ARGUMENT) nhưng nhận `thinkingLevel`;
 * `gemini-3.8-flash` và dòng 2.x nhận `thinkingBudget: 0`.
 */
export function thinkingConfigFor(model: string): Record<string, unknown> {
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
    if (!this.opts.apiKey) throw new GeminiError('not_configured');
    const url = `${(this.opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')}/models/${encodeURIComponent(this.opts.model)}:generateContent`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: this.opts.maxOutputTokens,
        // Suy luận ngầm ăn vào trần output token ⇒ giảm tối đa để câu trả lời không bị cụt/rỗng.
        thinkingConfig: thinkingConfigFor(this.opts.model),
      },
    });

    let lastError: GeminiError = new GeminiError('network');
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      if (attempt > 0) await this.sleep(300 * attempt);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), this.opts.timeoutMs);
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
        if (abort.signal.aborted || (err as Error)?.name === 'AbortError') throw new GeminiError('timeout');
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
        const text = (cand?.content?.parts ?? [])
          .map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join('')
          .trim();
        if (!text) throw new GeminiError('empty');
        return text;
      } catch (err) {
        if (err instanceof GeminiError) throw err;
        if (abort.signal.aborted) throw new GeminiError('timeout');
        throw new GeminiError('empty');
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: unknown }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}
