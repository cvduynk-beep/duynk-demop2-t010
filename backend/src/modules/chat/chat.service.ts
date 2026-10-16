import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthSessionService } from '../auth/session/auth-session.service';
import { SessionCookieService } from '../auth/session/session-cookies.service';
import { GuestLimiter } from '../assistant/guest-limiter';
import { MatchmakerRequestDto } from '../matchmaker/dto/matchmaker-request.dto';
import { MatchmakerService } from '../matchmaker/matchmaker.service';
import { emptyCriteria, fold, isGreeting, isOffTopic, parseMessage } from './chat-criteria';
import { FaqValues, KnowledgeTopic, loadKnowledge, rankTopics, RenderFocus, renderTopic, routeFaq, vnd } from './chat-knowledge';
import {
  CLARIFY_REPLY,
  CODE_RE,
  GREETING_REPLY,
  RECOMMEND_DOWN_REPLY,
  REFUSAL_REPLY,
  buildUserPrompt,
  checkExplanation,
  moneyMentions,
  noMatchReply,
  templateReply,
} from './chat-reply';
import { AccountService } from '../account/account.service';
import { DepositService } from '../deposit/deposit.service';
import { PropertyService } from '../property/property.service';
import { HistoryTurn, VinnyAgent } from './vinny-agent';
import { AGENT_FALLBACK_REPLY_EN, renderToolFallback } from './vinny-fallback';
import { detectHandoff, detectNegotiation, detectProbe, HANDOFF_REPLY, isEnglish, NEGOTIATE_REPLY, PROBE_REPLY } from './vinny-guard';
import { SUPPORT_SLA_TEXT } from './chat-support.service';
import { loadVinnyPrompt, VinnyPrompt } from './vinny-prompt';
import { VinnyTools } from './vinny-tools';
import { ChatCriteria, ChatDegradedReason, ChatRecommendation, ChatResponseData } from './chat.types';
import type { ToolContext } from './vinny-tools';

/** Một lượt trả lời trước khi gắn id hội thoại / id lượt / phiên bản prompt. */
type TurnData = Omit<ChatResponseData, 'conversationId' | 'messageId' | 'promptVersion'>;

export interface TurnMetrics {
  tools: string[];
  calls: number;
  prompt: number;
  output: number;
  /** CHỈ cho eval (`observe`): dữ liệu nguồn của câu trả lời (kết quả công cụ / đoạn tri thức). Không bao giờ log. */
  evidence?: unknown[];
  /** Mã lỗi Gemini (vd `gemini_http_429`) để eval tách lỗi hạn mức khỏi lỗi chất lượng. */
  llmError?: string;
}
import { ChatContextDto, ChatRequestDto } from './dto/chat.dto';
import { GeminiClient, GeminiError } from './gemini.client';
import { clampHoldHours, HOLD_HOURS_DEFAULT, HOLD_HOURS_KEY, HOLD_HOURS_MAX, HOLD_HOURS_MIN } from '../deposit/hold-policy';

export const CHAT_TOP_N = 3;
const FEE_CACHE_MS = 60_000;

/** Câu khách hỏi về dữ liệu của CHÍNH mình (cần công cụ my_bookings / my_contracts). */
const PERSONAL_RE = /(lich (xem|hen)|booking|coc|hop dong|tien thue|ky thanh toan).{0,15}(cua )?(minh|toi|em|tui)\b|(minh|toi|em|tui) (da )?(dat|coc|ky|co) (lich|coc|hop dong)|my (booking|deposit|contract|viewing)/;
const COMPARE_RE = /so sanh|khac (nhau|gi)|compare|nen chon (can )?nao|can nao (tot|hon)/;
/** Câu dự phòng khi câu trả lời có công cụ không dùng được (lỗi / bị guardrail chặn). */
export const AGENT_FALLBACK_REPLY =
  'Mình chưa chắc chắn câu trả lời cho câu này nên không muốn đoán. Bạn hỏi lại cụ thể hơn (mã căn, ngân sách), hoặc bấm "Gặp nhân viên" để nhân viên VinStay hỗ trợ nhé.';
const LOGIN_REPLY =
  'Để xem lịch hẹn, tiền cọc hay hợp đồng của bạn, bạn đăng nhập (xác thực SĐT qua OTP Zalo) giúp mình nhé. Sau đó hỏi lại, mình tra ngay.';
const UNRESOLVED_REPLIES = [CLARIFY_REPLY, AGENT_FALLBACK_REPLY, AGENT_FALLBACK_REPLY_EN];
/** Khách nhắc lại căn Vinny vừa gợi ý ("căn đầu tiên", "căn số 2", "căn đó") — chỉ có nghĩa khi lịch sử có mã căn. */
export const BACK_REF_RE = /\bcan (dau tien|dau|thu (nhat|hai|ba|\d)|so \d|do|nay|tren|vua roi|ban vua (noi|gui|goi y))\b|\b(the )?(first|second|third|last) (one|unit|apartment)\b|\bthat (one|unit|apartment)\b/;

/** Đọc số nguyên từ env; sai định dạng/ngoài khoảng ⇒ dừng khởi động (lỗi cấu hình phải lộ ra sớm, không chạy ngầm sai). */
export function intEnv(raw: string | undefined, name: string, def: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Cấu hình ${name} không hợp lệ: cần số nguyên trong [${min}, ${max}]`);
  }
  return n;
}

function toCriteria(ctx: ChatContextDto | undefined): ChatCriteria {
  const base = emptyCriteria();
  if (!ctx) return base;
  return {
    budget: ctx.budget,
    layouts: ctx.layouts ?? [],
    zones: ctx.zones ?? [],
    buildings: ctx.buildings ?? [],
    floor: ctx.floor,
    furnishing: ctx.furnishing,
    items: ctx.items ?? [],
    pets: ctx.pets || undefined,
    household: ctx.household ? { ...ctx.household } : base.household,
  };
}

function matchDto(c: ChatCriteria, limit: number, withBudget = true): MatchmakerRequestDto {
  return Object.assign(new MatchmakerRequestDto(), {
    maxAllInBudget: withBudget ? c.budget : undefined,
    layouts: c.layouts.length ? c.layouts : undefined,
    zones: c.zones.length ? c.zones : undefined,
    buildings: c.buildings.length ? c.buildings : undefined,
    floor: c.floor,
    furnishing: c.furnishing,
    items: c.items.length ? c.items : undefined,
    pets: c.pets,
    occupants: c.household.persons,
    motorbikes: c.household.motorbikes,
    cars: c.household.cars,
    limit,
  });
}

function toRecommendation(r: any): ChatRecommendation {
  return {
    id: r.unitCode,
    rank: r.rank,
    score: r.score,
    unitCode: r.unitCode,
    buildingCode: r.buildingCode,
    zoneName: r.zoneName,
    layout: r.layoutType,
    areaM2: r.carpetAreaM2,
    floor: r.floor,
    allInCost: r.allInCost,
    comparison: r.comparison,
    explanation: r.aiExplanation,
  };
}

/**
 * `POST /api/v1/chat` — một nguồn sự thật cho khung chat trang `/`:
 * phân tích câu chat tất định → MatchmakerService (nguồn DUY NHẤT của danh sách, thứ tự, điểm) → Gemini chỉ giải thích
 * → kiểm lời giải thích. Câu hỏi quy chế trả từ tri thức đã kiểm, không tốn token.
 */
@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);
  private readonly guests: GuestLimiter;
  private readonly gemini: GeminiClient;
  private readonly knowledgeDir: string;
  private knowledge = new Map<string, KnowledgeTopic>();
  private fees: { at: number; values: Map<string, number> } | null = null;
  private prompt!: VinnyPrompt;
  private agent: VinnyAgent | null = null;
  private tools: VinnyTools | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly matchmaker: MatchmakerService,
    private readonly sessions: AuthSessionService,
    private readonly cookies: SessionCookieService,
    // Công cụ của Vinny (chỉ đọc). Thiếu (test cũ) ⇒ không có chế độ trả lời có công cụ, giữ hành vi cũ.
    @Optional() private readonly property?: PropertyService,
    @Optional() private readonly deposit?: DepositService,
    @Optional() private readonly account?: AccountService,
  ) {
    const get = (k: string) => this.config.get<string>(k);
    this.guests = new GuestLimiter(intEnv(get('CHAT_GUEST_TURNS'), 'CHAT_GUEST_TURNS', 15, 0, 1000));
    this.gemini = new GeminiClient({
      apiKey: get('GEMINI_API_KEY')?.trim() || undefined,
      model: get('GEMINI_MODEL')?.trim() || 'gemini-3.5-flash-lite',
      timeoutMs: intEnv(get('GEMINI_TIMEOUT_MS'), 'GEMINI_TIMEOUT_MS', 6000, 1000, 20000),
      // AGENTS.md lớp 3: trần output 200–250 token.
      maxOutputTokens: intEnv(get('GEMINI_MAX_OUTPUT_TOKENS'), 'GEMINI_MAX_OUTPUT_TOKENS', 250, 50, 250),
      retries: intEnv(get('GEMINI_RETRIES'), 'GEMINI_RETRIES', 1, 0, 2),
      attemptTimeoutMs: intEnv(get('GEMINI_ATTEMPT_TIMEOUT_MS'), 'GEMINI_ATTEMPT_TIMEOUT_MS', 3500, 1000, 20000),
    });
    this.knowledgeDir = resolve(get('CHAT_KNOWLEDGE_DIR')?.trim() || resolve(process.cwd(), '..', 'ai-engine', 'knowledge'));
  }

  /** Kiểm cấu hình lúc khởi động: chỉ log CÓ/KHÔNG có key, không bao giờ log giá trị. */
  onModuleInit(): void {
    const promptDir = resolve(this.config.get<string>('VINNY_PROMPT_DIR')?.trim() || resolve(process.cwd(), 'prompts', 'vinny'));
    this.prompt = loadVinnyPrompt(promptDir, this.config.get<string>('VINNY_PROMPT_VERSION')?.trim() || 'v2');
    if (this.property && this.deposit && this.account) {
      this.tools = new VinnyTools({
        matchmaker: this.matchmaker,
        property: this.property,
        deposit: this.deposit,
        account: this.account,
        knowledge: (q) => this.searchKnowledge(q),
      });
      this.agent = new VinnyAgent(this.gemini, this.tools);
    }
    this.knowledge = loadKnowledge(this.knowledgeDir);
    if (!this.knowledge.size) {
      this.logger.warn(`[CHAT] Không đọc được tri thức FAQ ở ${this.knowledgeDir} (CHAT_KNOWLEDGE_DIR) — câu hỏi quy chế sẽ nhận câu hỏi lại.`);
    }
    if (!this.gemini.configured) {
      this.logger.warn('[CHAT] Chưa cấu hình GEMINI_API_KEY — khung chat vẫn trả danh sách thật nhưng lời đáp ở chế độ rút gọn (degraded).');
    }
    this.logger.log(
      `[CHAT] model=${this.gemini.model} gemini=${this.gemini.configured ? 'on' : 'off'} prompt=${this.prompt.version} agent=${this.agent ? 'on' : 'off'} faqTopics=${this.knowledge.size}`,
    );
  }

  onModuleDestroy(): void {
    this.guests.stop();
  }

  /** Khách chưa đăng nhập: tối đa CHAT_GUEST_TURNS lượt/24h theo IP (AGENTS.md lớp 1) ⇒ 401 LOGIN_REQUIRED. */
  async assertQuota(request: { ip?: string }): Promise<void> {
    if (await this.hasTenantSession(request)) return;
    if (!this.guests.take(request.ip || 'unknown')) {
      throw new UnauthorizedException({
        code: 'LOGIN_REQUIRED',
        message: 'Bạn đã dùng hết lượt tư vấn thử. Vui lòng đăng nhập (miễn phí) để tiếp tục.',
      });
    }
  }

  private async hasTenantSession(request: unknown): Promise<boolean> {
    return !!(await this.tenantUserId(request));
  }

  /** Profile id khách `tenant` từ cookie phiên (KHÔNG nhận từ client). Không có / hết hạn ⇒ null. */
  async tenantUserId(request: unknown): Promise<string | null> {
    try {
      const token = this.cookies.readAccessToken(request as never, 'tenant');
      const user = token ? await this.sessions.authenticate(token, 'tenant') : null;
      return user?.id ?? null;
    } catch {
      return null;
    }
  }

  get promptVersion(): string {
    return this.prompt.version;
  }

  /** `observe`: nhận số đo của lượt (công cụ, số lần gọi LLM, token) — dùng cho eval, không ảnh hưởng response. */
  async chat(dto: ChatRequestDto, userId: string | null = null, observe?: (m: TurnMetrics | null) => void): Promise<ChatResponseData> {
    const started = Date.now();
    const conversationId = dto.conversationId || randomUUID();
    const message = dto.message;
    const base = toCriteria(dto.context);
    const history: HistoryTurn[] = (dto.history ?? []).map((h) => ({ role: h.role, text: h.text }));

    const out = await this.answer(message, base, !!dto.context?.searched, history, userId);
    const data: ChatResponseData = { conversationId, messageId: randomUUID(), promptVersion: this.prompt.version, ...out };
    // Chỉ log số đo — KHÔNG log nội dung câu chat, tiêu chí cá nhân, mã lịch hay key.
    const m = out.metrics;
    this.logger.log(
      `[CHAT] conv=${conversationId.slice(0, 8)} v=${this.prompt.version} kind=${data.kind} recs=${data.recommendations.length} source=${data.source}` +
        ` degraded=${data.degradedReason ?? 'no'} auth=${userId ? 'tenant' : 'guest'}` +
        (m ? ` tools=${m.tools.join('+') || '-'} llmCalls=${m.calls} tokIn=${m.prompt} tokOut=${m.output}` : '') +
        ` ${Date.now() - started}ms`,
    );
    delete (data as { metrics?: unknown }).metrics;
    observe?.(m ?? null);
    return data;
  }

  private async answer(
    message: string,
    base: ChatCriteria,
    searched: boolean,
    history: HistoryTurn[] = [],
    userId: string | null = null,
  ): Promise<TurnData & { metrics?: TurnMetrics }> {
    const plain = (kind: ChatResponseData['kind'], reply: string, source: ChatResponseData['source'] = 'rule') => ({
      kind,
      reply,
      recommendations: [],
      criteria: null,
      scan: null,
      source,
      degraded: false,
    });

    // Guardrail tất định trước mọi lời gọi LLM: dò hỏi nội bộ / injection, ngoài chủ đề, cần nhân viên thật.
    const probe = detectProbe(message);
    if (probe) return plain('refusal', PROBE_REPLY[probe]);
    if (isOffTopic(message)) return plain('refusal', REFUSAL_REPLY);
    const handoff = detectHandoff(message);
    const slaEvidence = { tools: [], calls: 0, prompt: 0, output: 0, evidence: [{ supportSla: SUPPORT_SLA_TEXT }] };
    if (handoff) return { ...plain('handoff', HANDOFF_REPLY[handoff]), handoff: { category: handoff }, metrics: slaEvidence };
    // Hai lượt gần nhất của Vinny đều chưa giải quyết được ⇒ chủ động mời gặp nhân viên.
    const lastBot = history.filter((h) => h.role === 'assistant').slice(-2);
    if (lastBot.length === 2 && lastBot.every((h) => UNRESOLVED_REPLIES.some((r) => h.text.startsWith(r.slice(0, 40))))) {
      return { ...plain('handoff', HANDOFF_REPLY.human_request), handoff: { category: 'human_request' as const }, metrics: slaEvidence };
    }
    // Mặc cả / xin giữ căn ngoài chính sách ⇒ câu cố định, không gọi LLM.
    if (detectNegotiation(message)) return plain('refusal', NEGOTIATE_REPLY);
    // Tri thức FAQ và câu mẫu đều tiếng Việt ⇒ khách viết tiếng Anh đi thẳng agent (có knowledge_lookup) khi có LLM.
    const english = isEnglish(message) && this.agentReady;

    const parsed = parseMessage(message, base, searched);
    const folded = fold(message);
    const mentionsUnit = [...message.matchAll(CODE_RE)].length > 0;
    const personal = PERSONAL_RE.test(folded);

    if (personal) {
      if (!userId) return plain('clarify', LOGIN_REPLY);
      if (this.agentReady) return this.agentAnswer(message, history, userId);
    }
    const refersBack = BACK_REF_RE.test(folded) && history.some((h) => h.role === 'assistant' && [...h.text.matchAll(CODE_RE)].length > 0);
    if (mentionsUnit || refersBack || COMPARE_RE.test(folded)) {
      if (this.agentReady) return this.agentAnswer(message, history, userId);
    }
    if (parsed.strongSignal) return this.search(message, parsed.criteria);

    const faq = english ? null : routeFaq(message);
    if (faq) {
      const reply = await this.faqReply(faq.topic, faq.fees, { query: message });
      if (reply) {
        const evidence = [await this.faqReply(faq.topic, true)];
        return { ...plain('faq', reply, 'knowledge'), metrics: { tools: [], calls: 0, prompt: 0, output: 0, evidence } };
      }
    }
    if (!english && isGreeting(message)) return plain('greeting', GREETING_REPLY);
    if (parsed.weakSignal) return this.search(message, parsed.criteria);
    if (this.agentReady) return this.agentAnswer(message, history, userId);
    return plain('clarify', CLARIFY_REPLY);
  }

  private get agentReady(): boolean {
    return !!this.agent && this.gemini.configured;
  }

  /** Trả lời có công cụ chỉ đọc. Danh sách căn (nếu model gọi search_units) vẫn NGUYÊN thứ tự của matchmaker. */
  private async agentAnswer(message: string, history: HistoryTurn[], userId: string | null) {
    const ctx: ToolContext = { userId };
    const res = await this.agent!.run(this.prompt.agent, message, history, ctx, moneyMentions(message));
    const metrics: TurnMetrics = { tools: res.toolsUsed, ...res.usage, evidence: res.evidence, llmError: res.llmError };
    const recs = ctx.recommendations ?? [];
    const kind: ChatResponseData['kind'] = recs.length ? 'search' : 'answer';
    if (res.ok) {
      return { kind, reply: res.text!, recommendations: recs, criteria: null, scan: ctx.scan ?? null, source: 'llm' as const, degraded: false, metrics };
    }
    const reason: ChatDegradedReason = res.failure === 'llm_timeout' ? 'llm_timeout' : res.failure === 'llm_error' ? 'llm_error' : 'llm_rejected';
    // Không hiển thị dữ liệu giả: danh sách THẬT nếu matchmaker đã chạy; không thì in lại đúng số liệu công cụ đã trả
    // (hoặc tra nhanh mã căn khách gõ); không có gì ⇒ câu "chưa chắc chắn".
    const en = isEnglish(message);
    let reply: string;
    if (recs.length && ctx.scan) reply = templateReply(emptyCriteria(), recs, ctx.scan);
    else {
      let evidence = res.evidence ?? [];
      const folded = fold(message);
      const personal = !!userId && PERSONAL_RE.test(folded);
      const codes = [...new Set([...message.matchAll(CODE_RE)].map((m) => `VHOP-${m[1].toUpperCase()}`))].slice(0, 3);
      if (!evidence.length && this.tools) {
        // Câu hỏi của chính khách ⇒ đọc lịch hẹn / hợp đồng theo phiên (không bao giờ trả tri thức chung thay cho dữ liệu cá nhân).
        if (personal) evidence = [await this.tools.run(/hop dong|contract|lease/.test(folded) ? 'my_contracts' : 'my_bookings', {}, ctx)];
        else if (codes.length) evidence = await Promise.all(codes.map((c) => this.tools!.run('get_unit', { unit_code: c }, ctx)));
      }
      // Không có dữ liệu công cụ ⇒ thử chủ đề tri thức đã duyệt gần nhất (tiếng Việt) trước khi nói "chưa chắc chắn".
      const topic = !en && !personal && !evidence.length ? rankTopics(message, this.knowledge, 1, 10)[0] : undefined;
      const kb = topic ? await this.faqReply(topic.topic, false, { query: message }) : null;
      reply = renderToolFallback(evidence, en) ?? kb ?? (en ? AGENT_FALLBACK_REPLY_EN : AGENT_FALLBACK_REPLY);
      // Nguồn THẬT của câu dự phòng (cho eval chấm; không log).
      metrics.evidence = kb ? [...evidence, kb] : evidence;
    }
    return { kind, reply, recommendations: recs, criteria: null, scan: ctx.scan ?? null, source: 'template' as const, degraded: true, degradedReason: reason, metrics };
  }

  /** Công cụ `knowledge_lookup`: đoạn tri thức đã duyệt (số thay từ fee_configs). */
  private async searchKnowledge(query: string) {
    const hits = rankTopics(query, this.knowledge);
    const out = [];
    for (const t of hits) {
      const text = await this.faqReply(t.topic, true, { query, budgetWords: 220, maxBullets: 4 });
      if (text) out.push({ topic: t.topic, title: t.title, text });
    }
    return out;
  }

  private async search(message: string, criteria: ChatCriteria): Promise<TurnData & { metrics?: TurnMetrics }> {
    let res: Awaited<ReturnType<MatchmakerService['findTopRecommendations']>>;
    try {
      res = await this.matchmaker.findTopRecommendations(matchDto(criteria, CHAT_TOP_N));
    } catch (err) {
      this.logger.error(`[CHAT] recommend lỗi: ${(err as Error)?.message ?? err}`);
      // Không bao giờ dựng danh sách giả khi recommend lỗi: chỉ trả lời bằng chữ.
      return {
        kind: 'search',
        reply: RECOMMEND_DOWN_REPLY,
        recommendations: [],
        criteria,
        scan: null,
        source: 'rule',
        degraded: true,
        degradedReason: 'recommend_unavailable',
      };
    }

    const recommendations = res.topRecommendations.map(toRecommendation);
    const scan = { scanned: res.scanSummary.totalScannedUnits, matched: res.scanSummary.totalMatched };

    if (!recommendations.length) {
      const cheapest = criteria.budget ? await this.cheapestIgnoringBudget(criteria) : null;
      const metrics: TurnMetrics = { tools: [], calls: 0, prompt: 0, output: 0, evidence: [{ scan, cheapestOutsideBudget: cheapest }] };
      return { kind: 'search', reply: noMatchReply(criteria, scan.scanned, cheapest), recommendations, criteria, scan, source: 'template', degraded: false, metrics };
    }

    const explained = await this.explain(message, criteria, recommendations, scan);
    return { kind: 'search', recommendations, criteria, scan, ...explained };
  }

  private async explain(
    message: string,
    criteria: ChatCriteria,
    recs: ChatRecommendation[],
    scan: { scanned: number; matched: number },
  ): Promise<Pick<ChatResponseData, 'reply' | 'source' | 'degraded' | 'degradedReason'> & { metrics?: TurnMetrics }> {
    const fallback = (reason: ChatDegradedReason) => ({
      reply: templateReply(criteria, recs, scan),
      source: 'template' as const,
      degraded: true,
      degradedReason: reason,
    });
    if (!this.gemini.configured) return fallback('llm_not_configured');
    let raw: string;
    let metrics: TurnMetrics | undefined;
    try {
      const lang = isEnglish(message) ? '\n\nNGÔN_NGỮ_TRẢ_LỜI: English (giữ nguyên mã căn và số tiền VNĐ).' : '';
      const out = await this.gemini.generateWithUsage(this.prompt.explain, buildUserPrompt(message, criteria, recs, scan) + lang);
      raw = out.text;
      metrics = { tools: [], calls: 1, prompt: out.usage?.promptTokenCount ?? 0, output: out.usage?.candidatesTokenCount ?? 0 };
    } catch (err) {
      const kind = err instanceof GeminiError ? err.kind : 'network';
      const detail = err instanceof GeminiError ? err.message : 'unknown';
      this.logger.warn(`[CHAT] Gemini lỗi: ${detail}`);
      return { ...fallback(kind === 'timeout' ? 'llm_timeout' : 'llm_error'), metrics: { tools: [], calls: 1, prompt: 0, output: 0, llmError: detail } };
    }
    // Cọc v2: tiền cọc theo từng căn (≈ 1 tháng thuê) ⇒ chỉ cho nhắc đúng giá thuê các căn gợi ý (đã nằm trong allowedMoney).
    const checked = checkExplanation(raw, criteria, recs);
    if ('why' in checked) {
      this.logger.warn(`[CHAT] Bỏ lời giải thích của LLM: ${checked.why}`);
      return { ...fallback('llm_rejected'), metrics };
    }
    return { reply: checked.text, source: 'llm', degraded: false, metrics };
  }

  /** Gợi ý nới ngân sách: căn All-in thấp nhất khớp các điều kiện còn lại (vẫn từ matchmaker). */
  private async cheapestIgnoringBudget(criteria: ChatCriteria): Promise<{ unitCode: string; allInTotal: number } | null> {
    try {
      const res = await this.matchmaker.findTopRecommendations(matchDto(criteria, 100, false));
      const best = res.topRecommendations.reduce<any>((m, r) => (!m || r.allInCost.allInTotal < m.allInCost.allInTotal ? r : m), null);
      return best ? { unitCode: best.unitCode, allInTotal: best.allInCost.allInTotal } : null;
    } catch {
      return null;
    }
  }

  // ─── FAQ 0 đồng ──────────────────────────────────────────────────────────────────────────

  private async feeValues(): Promise<Map<string, number> | null> {
    if (this.fees && Date.now() - this.fees.at < FEE_CACHE_MS) return this.fees.values;
    try {
      const rows = await this.prisma.feeConfig.findMany({
        where: { configKey: { in: ['mgmt_fee_per_m2', 'parking_fee_motorbike', 'parking_fee_car', 'utility_per_person', HOLD_HOURS_KEY] } },
        select: { configKey: true, paramValue: true },
      });
      const values = new Map(rows.map((r) => [r.configKey, Number(r.paramValue)]));
      this.fees = { at: Date.now(), values };
      return values;
    } catch (err) {
      this.logger.warn(`[CHAT] Không đọc được fee_configs: ${(err as Error)?.message ?? err}`);
      return null;
    }
  }

  private async faqReply(topic: string, withFees: boolean, focus?: RenderFocus): Promise<string | null> {
    const doc = this.knowledge.get(topic);
    if (!doc) return null;
    const fees = await this.feeValues();
    const holdHours = fees?.get(HOLD_HOURS_KEY);
    const values: FaqValues = {
      holding_deposit: 'Tiền cọc bảo đảm của căn (chủ nhà quy định, mặc định bằng 1 tháng tiền thuê)',
      // Cùng nguồn với deposit/hold-policy: fee_configs.hold_hours_default → 48, kẹp [12, 72].
      hold_hours: fees ? String(clampHoldHours(holdHours ?? HOLD_HOURS_DEFAULT)) : undefined,
      hold_hours_min: String(HOLD_HOURS_MIN),
      hold_hours_max: String(HOLD_HOURS_MAX),
    };
    let feeLine: string | undefined;
    if (withFees && fees) {
      const parts: string[] = [];
      const add = (key: string, label: string, unit: string) => {
        const v = fees.get(key);
        if (v != null) parts.push(`${label} ${vnd(v)}đ${unit}`);
      };
      add('mgmt_fee_per_m2', 'phí quản lý', '/m² (nếu căn chưa có mức riêng)');
      add('parking_fee_motorbike', 'gửi xe máy', '/xe/tháng');
      add('parking_fee_car', 'ô tô', '/xe/tháng');
      add('utility_per_person', 'điện nước ước tính', '/người/tháng');
      if (parts.length) feeLine = `Biểu phí hiện hành trên hệ thống: ${parts.join(', ')}.`;
    }
    return renderTopic(doc, values, feeLine, focus);
  }
}
