import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthSessionService } from '../auth/session/auth-session.service';
import { SessionCookieService } from '../auth/session/session-cookies.service';
import { GuestLimiter } from '../assistant/guest-limiter';
import { MatchmakerRequestDto } from '../matchmaker/dto/matchmaker-request.dto';
import { MatchmakerService } from '../matchmaker/matchmaker.service';
import { emptyCriteria, isGreeting, isOffTopic, parseMessage } from './chat-criteria';
import { FaqValues, KnowledgeTopic, loadKnowledge, renderTopic, routeFaq, vnd } from './chat-knowledge';
import {
  CLARIFY_REPLY,
  GREETING_REPLY,
  RECOMMEND_DOWN_REPLY,
  REFUSAL_REPLY,
  SYSTEM_PROMPT,
  buildUserPrompt,
  checkExplanation,
  noMatchReply,
  templateReply,
} from './chat-reply';
import { ChatCriteria, ChatDegradedReason, ChatRecommendation, ChatResponseData } from './chat.types';
import { ChatContextDto, ChatRequestDto } from './dto/chat.dto';
import { GeminiClient, GeminiError } from './gemini.client';
import { clampHoldHours, HOLD_HOURS_DEFAULT, HOLD_HOURS_KEY, HOLD_HOURS_MAX, HOLD_HOURS_MIN } from '../deposit/hold-policy';

export const CHAT_TOP_N = 3;
const FEE_CACHE_MS = 60_000;

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

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly matchmaker: MatchmakerService,
    private readonly sessions: AuthSessionService,
    private readonly cookies: SessionCookieService,
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
    });
    this.knowledgeDir = resolve(get('CHAT_KNOWLEDGE_DIR')?.trim() || resolve(process.cwd(), '..', 'ai-engine', 'knowledge'));
  }

  /** Kiểm cấu hình lúc khởi động: chỉ log CÓ/KHÔNG có key, không bao giờ log giá trị. */
  onModuleInit(): void {
    this.knowledge = loadKnowledge(this.knowledgeDir);
    if (!this.knowledge.size) {
      this.logger.warn(`[CHAT] Không đọc được tri thức FAQ ở ${this.knowledgeDir} (CHAT_KNOWLEDGE_DIR) — câu hỏi quy chế sẽ nhận câu hỏi lại.`);
    }
    if (!this.gemini.configured) {
      this.logger.warn('[CHAT] Chưa cấu hình GEMINI_API_KEY — khung chat vẫn trả danh sách thật nhưng lời đáp ở chế độ rút gọn (degraded).');
    }
    this.logger.log(`[CHAT] model=${this.gemini.model} gemini=${this.gemini.configured ? 'on' : 'off'} faqTopics=${this.knowledge.size}`);
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
    try {
      const token = this.cookies.readAccessToken(request as never, 'tenant');
      return !!token && !!(await this.sessions.authenticate(token, 'tenant'));
    } catch {
      return false;
    }
  }

  async chat(dto: ChatRequestDto): Promise<ChatResponseData> {
    const started = Date.now();
    const conversationId = dto.conversationId || randomUUID();
    const message = dto.message;
    const base = toCriteria(dto.context);

    const out = await this.answer(message, base, !!dto.context?.searched);
    const data: ChatResponseData = { conversationId, ...out };
    // Chỉ log số đo — KHÔNG log nội dung câu chat, tiêu chí cá nhân hay key.
    this.logger.log(
      `[CHAT] conv=${conversationId.slice(0, 8)} kind=${data.kind} recs=${data.recommendations.length} source=${data.source}` +
        ` degraded=${data.degradedReason ?? 'no'} ${Date.now() - started}ms`,
    );
    return data;
  }

  private async answer(message: string, base: ChatCriteria, searched: boolean): Promise<Omit<ChatResponseData, 'conversationId'>> {
    const plain = (kind: ChatResponseData['kind'], reply: string, source: ChatResponseData['source'] = 'rule') => ({
      kind,
      reply,
      recommendations: [],
      criteria: null,
      scan: null,
      source,
      degraded: false,
    });

    if (isOffTopic(message)) return plain('refusal', REFUSAL_REPLY);

    const parsed = parseMessage(message, base, searched);
    if (parsed.strongSignal) return this.search(message, parsed.criteria);

    const faq = routeFaq(message);
    if (faq) {
      const reply = await this.faqReply(faq.topic, faq.fees);
      if (reply) return plain('faq', reply, 'knowledge');
    }
    if (isGreeting(message)) return plain('greeting', GREETING_REPLY);
    if (parsed.weakSignal) return this.search(message, parsed.criteria);
    return plain('clarify', CLARIFY_REPLY);
  }

  private async search(message: string, criteria: ChatCriteria): Promise<Omit<ChatResponseData, 'conversationId'>> {
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
      return { kind: 'search', reply: noMatchReply(criteria, scan.scanned, cheapest), recommendations, criteria, scan, source: 'template', degraded: false };
    }

    const explained = await this.explain(message, criteria, recommendations, scan);
    return { kind: 'search', recommendations, criteria, scan, ...explained };
  }

  private async explain(
    message: string,
    criteria: ChatCriteria,
    recs: ChatRecommendation[],
    scan: { scanned: number; matched: number },
  ): Promise<Pick<ChatResponseData, 'reply' | 'source' | 'degraded' | 'degradedReason'>> {
    const fallback = (reason: ChatDegradedReason) => ({
      reply: templateReply(criteria, recs, scan),
      source: 'template' as const,
      degraded: true,
      degradedReason: reason,
    });
    if (!this.gemini.configured) return fallback('llm_not_configured');
    let raw: string;
    try {
      raw = await this.gemini.generate(SYSTEM_PROMPT, buildUserPrompt(message, criteria, recs, scan));
    } catch (err) {
      const kind = err instanceof GeminiError ? err.kind : 'network';
      this.logger.warn(`[CHAT] Gemini lỗi: ${err instanceof GeminiError ? err.message : 'unknown'}`);
      return fallback(kind === 'timeout' ? 'llm_timeout' : 'llm_error');
    }
    // Cọc v2: tiền cọc theo từng căn (≈ 1 tháng thuê) ⇒ chỉ cho nhắc đúng giá thuê các căn gợi ý (đã nằm trong allowedMoney).
    const checked = checkExplanation(raw, criteria, recs);
    if ('why' in checked) {
      this.logger.warn(`[CHAT] Bỏ lời giải thích của LLM: ${checked.why}`);
      return fallback('llm_rejected');
    }
    return { reply: checked.text, source: 'llm', degraded: false };
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

  private async faqReply(topic: string, withFees: boolean): Promise<string | null> {
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
    return renderTopic(doc, values, feeLine);
  }
}
