import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthSessionService } from '../auth/session/auth-session.service';
import { SessionCookieService } from '../auth/session/session-cookies.service';
import { MatchmakerService } from '../matchmaker/matchmaker.service';
import { emptyCriteria, isOffTopic, parseBudget, parseMessage } from './chat-criteria';
import { loadKnowledge, renderTopic, routeFaq } from './chat-knowledge';
import { checkExplanation, RECOMMEND_DOWN_REPLY } from './chat-reply';
import { ChatController } from './chat.controller';
import { ChatService, intEnv } from './chat.service';
import { ChatRecommendation } from './chat.types';
import { GeminiClient, GeminiError, thinkingConfigFor } from './gemini.client';

const KNOWLEDGE_DIR = `${process.cwd()}/../ai-engine/knowledge`;

const rec = (rank: number, code: string, allIn: number, saving: number) => ({
  rank,
  score: saving,
  unitId: `id-${code}`,
  unitCode: code,
  buildingCode: code.split('-')[1],
  zoneName: 'The Sapphire 1',
  layoutType: 'Studio',
  carpetAreaM2: 30,
  floor: 12,
  allInCost: { baseRent: allIn - 885_000, managementFee: 285_000, parkingFee: 150_000, utilityCost: 450_000, allInTotal: allIn },
  comparison: { marketAllInEstimate: allIn + 1_000_000, savingAmount: 1_000_000, savingPercentage: saving, isBargain: saving >= 10 },
  aiExplanation: `Căn ${code} giúp bạn tiết kiệm.`,
  verifiedImages: [],
});

// Thứ tự matchmaker CỐ Ý không theo All-in tăng dần (căn 2 rẻ hơn căn 1) để bắt lỗi "LLM/FE tự xếp lại".
const TOP = [rec(1, 'VHOP-S1.02-0701', 7_950_000, 14), rec(2, 'VHOP-S1.03-1104', 7_400_000, 9), rec(3, 'VHOP-ZR1-0805', 7_800_000, 3)];

function fakeMatchmaker(impl?: () => Promise<any>) {
  return {
    findTopRecommendations: jest.fn<Promise<any>, [any]>(
      impl ?? (async () => ({ scanSummary: { totalScannedUnits: 54, totalMatched: 12 }, topRecommendations: TOP })),
    ),
  };
}

const fakePrisma = () => ({
  feeConfig: {
    findMany: jest.fn(async () => [
      { configKey: 'mgmt_fee_per_m2', paramValue: '9500' },
      { configKey: 'parking_fee_motorbike', paramValue: '150000' },
      { configKey: 'parking_fee_car', paramValue: '1250000' },
      { configKey: 'utility_per_person', paramValue: '300000' },
    ]),
  },
});

function geminiReply(text: string, status = 200) {
  return jest.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status }));
}

function makeService(env: Record<string, string> = {}, matchmaker = fakeMatchmaker(), prisma: any = fakePrisma(), session = false) {
  const config = { get: (k: string) => ({ CHAT_KNOWLEDGE_DIR: KNOWLEDGE_DIR, ...env })[k] } as unknown as ConfigService;
  const cookies = { readAccessToken: () => (session ? 'tok' : null) } as unknown as SessionCookieService;
  const sessions = { authenticate: async () => ({ id: 'u1' }) } as unknown as AuthSessionService;
  const svc = new ChatService(config, prisma, matchmaker as unknown as MatchmakerService, sessions, cookies);
  svc.onModuleInit();
  return svc;
}

function withGemini(svc: ChatService, fetchImpl: any, timeoutMs = 2000) {
  (svc as any).gemini = new GeminiClient({ apiKey: 'test-key', model: 'gemini-test', timeoutMs, maxOutputTokens: 250, retries: 1 }, fetchImpl, async () => {});
  return svc;
}

describe('chat-criteria (phân tích tất định)', () => {
  it.each([
    ['Studio dưới 8 triệu', 8_000_000],
    ['tầm 7tr5 thôi', 7_500_000],
    ['ngân sách 10.000.000đ', 10_000_000],
    ['khoảng 9 củ', 9_000_000],
    ['cọc 2 triệu là sao', undefined],
  ])('parseBudget(%p) = %p', (text, want) => {
    expect(parseBudget(text)).toBe(want);
  });

  it('gộp context + câu chat, toà ưu tiên phân khu', () => {
    const base = { ...emptyCriteria(), budget: 9_000_000, items: ['ac'] };
    const p = parseMessage('2pn ở S2.05 có tủ lạnh, 2 người 2 xe máy', base, false);
    expect(p.strongSignal).toBe(true);
    expect(p.criteria).toMatchObject({ budget: 9_000_000, layouts: ['2PN'], buildings: ['S2.05'], zones: [], items: ['ac', 'fridge'] });
    expect(p.criteria.household).toEqual({ persons: 2, motorbikes: 2, cars: 0 });
  });

  it('"Beverly" = toà BE3 (tên trong DB), lọc theo toà', () => {
    const p = parseMessage('căn 1 phòng ngủ ở Beverly giá rẻ dưới 10 triệu', emptyCriteria(), false);
    expect(p.criteria).toMatchObject({ buildings: ['BE3'], zones: [], layouts: ['1PN'], budget: 10_000_000 });
  });

  it('câu nối tiếp "rẻ hơn nữa" giảm 10% ngân sách khi đã tìm', () => {
    const p = parseMessage('rẻ hơn nữa', { ...emptyCriteria(), budget: 10_000_000 }, true);
    expect(p.criteria.budget).toBe(9_000_000);
    expect(p.strongSignal).toBe(false);
    expect(p.weakSignal).toBe(true);
  });

  it('nhận diện câu ngoài phạm vi', () => {
    expect(isOffTopic('viết giúp mình code python sắp xếp mảng')).toBe(true);
    expect(isOffTopic('làm bài thơ về mùa thu')).toBe(true);
    expect(isOffTopic('studio dưới 8 triệu')).toBe(false);
  });
});

describe('chat-knowledge (FAQ 0 đồng)', () => {
  const kb = loadKnowledge(KNOWLEDGE_DIR);

  it('đọc tri thức ai-engine, bỏ file _ và dòng dặn bot', () => {
    expect(kb.size).toBeGreaterThanOrEqual(10);
    expect(kb.has('all_in')).toBe(true);
    for (const t of kb.values()) for (const b of t.bullets) expect(b).not.toMatch(/\bbot\b/i);
  });

  it('mọi chủ đề có summary; câu FAQ theo câu hỏi ngắn (≤ 100 từ), mở bằng tóm tắt, không còn biến', () => {
    const values = { holding_deposit: 'Tiền cọc bảo đảm của căn', hold_hours: '48', hold_hours_min: '12', hold_hours_max: '72' };
    for (const t of kb.values()) {
      expect(t.summary).toBeTruthy();
      const out = renderTopic(t, values, 'Biểu phí hiện hành trên hệ thống: gửi xe máy 150.000đ/xe/tháng.', { query: t.title });
      expect(out.split(/\s+/).length).toBeLessThanOrEqual(100);
      expect(out.startsWith(t.summary!.slice(0, 10))).toBe(true);
      expect(out).not.toMatch(/\{[a-z_]+\}/);
    }
  });

  it('định tuyến FAQ: không khớp nhầm "chuyển khoản cọc" sang hoàn cọc; "hỏng thì ai sửa" ⇒ sửa chữa', () => {
    expect(routeFaq('chuyển khoản cọc cho ai')?.topic).not.toBe('security_deposit');
    expect(routeFaq('điều hoà hỏng thì ai sửa')?.topic).toBe('maintenance');
    expect(routeFaq('hoàn cọc khi nào')?.topic).toBe('security_deposit');
  });

  it('thay biến; dòng thiếu giá trị bị bỏ thay vì đoán', () => {
    const doc = kb.get('holding_deposit')!;
    const full = renderTopic(doc, { hold_hours: '48', hold_hours_min: '12', hold_hours_max: '72' });
    expect(full).toContain('48 giờ');
    // Cọc v2: số tiền theo từng căn ⇒ tri thức nói quy tắc (= Tiền cọc bảo đảm), không còn con số cố định.
    expect(full).toContain('Tiền cọc bảo đảm');
    expect(full).not.toMatch(/2\.000\.000/);
    expect(full).not.toMatch(/\{[a-z_]+\}/);
    const partial = renderTopic(doc, { hold_hours: '48' });
    expect(partial).not.toMatch(/\{[a-z_]+\}/);
    expect(partial.split('\n').length).toBeLessThan(full.split('\n').length);
  });

  it.each([
    ['phí gửi xe máy bao nhiêu?', 'all_in', true],
    ['cọc giữ chỗ hoạt động thế nào', 'holding_deposit', false],
    ['tiền cọc bảo đảm có được hoàn không', 'security_deposit', false],
    ['có được nuôi mèo không', 'bql_rules', false],
    ['Host đón ở sảnh thế nào', 'viewing', false],
  ])('routeFaq(%p) → %p', (text, topic, fees) => {
    expect(routeFaq(text)).toEqual({ topic, fees });
  });
});

describe('checkExplanation (LLM chỉ được giải thích)', () => {
  const recs = TOP.map((r) => ({
    id: r.unitCode,
    rank: r.rank,
    score: r.score,
    unitCode: r.unitCode,
    buildingCode: r.buildingCode,
    layout: 'Studio',
    areaM2: 30,
    allInCost: r.allInCost,
    comparison: r.comparison,
    explanation: '',
  })) as ChatRecommendation[];
  const c = { ...emptyCriteria(), budget: 8_000_000 };

  it('chấp nhận lời giải thích đúng thứ tự, đúng số', () => {
    const r = checkExplanation('Căn VHOP-S1.02-0701 có All-in 7.950.000đ, tiết kiệm 14%. Tiếp theo là S1.03-1104 khoảng 7,4 triệu.', c, recs);
    expect(r.ok).toBe(true);
  });
  it('bỏ markdown model hay chèn', () => {
    const r = checkExplanation('## Gợi ý\n1. **VHOP-S1.02-0701**: All-in `7.950.000đ`.', c, recs);
    expect(r).toEqual({ ok: true, text: 'Gợi ý\n1. VHOP-S1.02-0701: All-in 7.950.000đ.' });
  });
  it('từ chối căn không có trong danh sách', () => {
    expect(checkExplanation('Bạn thử căn VHOP-S2.05-1808 nhé.', c, recs)).toEqual({ ok: false, why: 'unknown_unit' });
  });
  it('từ chối đổi thứ hạng', () => {
    expect(checkExplanation('VHOP-S1.03-1104 rẻ nhất, sau đó VHOP-S1.02-0701.', c, recs)).toEqual({ ok: false, why: 'order' });
  });
  it('từ chối số tiền tự bịa', () => {
    expect(checkExplanation('Căn VHOP-S1.02-0701 chỉ 5.300.000đ.', c, recs)).toEqual({ ok: false, why: 'money' });
  });
  it('từ chối khẳng định trái luật cứng, cho phép câu phủ định', () => {
    expect(checkExplanation('Cọc sẽ trừ vào tiền thuê tháng đầu.', c, recs)).toEqual({ ok: false, why: 'policy' });
    expect(checkExplanation('Cọc không trừ vào tiền thuê tháng đầu.', c, recs).ok).toBe(true);
  });
});

describe('GeminiClient', () => {
  const opts = { apiKey: 'secret-key', model: 'gemini-test', timeoutMs: 50, maxOutputTokens: 250, retries: 1 };

  it('key đi trong header, không nằm trên URL; trần output token được gửi', async () => {
    const f = geminiReply('xin chào');
    await new GeminiClient(opts, f as any, async () => {}).generate('sys', 'user');
    const [url, init] = (f.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body as string).generationConfig.maxOutputTokens).toBe(250);
  });

  it('thinkingConfig theo dòng model (lite thế hệ 3 dùng thinkingLevel)', () => {
    expect(thinkingConfigFor('gemini-3.5-flash-lite')).toEqual({ thinkingLevel: 'minimal' });
    expect(thinkingConfigFor('gemini-3.8-flash')).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
  });

  it('thử lại đúng 1 lần cho 503', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })));
    expect(await new GeminiClient(opts, f, async () => {}).generate('s', 'u')).toBe('ok');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('không thử lại 400; hết lượt thử ⇒ lỗi http', async () => {
    const f400 = jest.fn(async () => new Response('{}', { status: 400 }));
    await expect(new GeminiClient(opts, f400, async () => {}).generate('s', 'u')).rejects.toMatchObject({ kind: 'http', status: 400 });
    expect(f400).toHaveBeenCalledTimes(1);
    const f503 = jest.fn(async () => new Response('{}', { status: 503 }));
    await expect(new GeminiClient(opts, f503, async () => {}).generate('s', 'u')).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(f503).toHaveBeenCalledTimes(2);
  });

  it('quá timeout ⇒ GeminiError timeout', async () => {
    const hang = (_: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(new GeminiClient(opts, hang).generate('s', 'u')).rejects.toBeInstanceOf(GeminiError);
    await expect(new GeminiClient(opts, hang).generate('s', 'u')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('lần thử chậm quá attemptTimeoutMs ⇒ thử lại trong ngân sách còn lại; hết ngân sách ⇒ timeout', async () => {
    let n = 0;
    const slowThenFast = (_: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        n += 1;
        if (n === 1) init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        else resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }));
      });
    const c = new GeminiClient({ ...opts, timeoutMs: 1500, attemptTimeoutMs: 100 }, slowThenFast, async () => {});
    await expect(c.generate('s', 'u')).resolves.toBe('ok');
    expect(n).toBe(2);
    const hang = (_: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const started = Date.now();
    await expect(new GeminiClient({ ...opts, timeoutMs: 1500, attemptTimeoutMs: 100 }, hang, async () => {}).generate('s', 'u')).rejects.toMatchObject({ kind: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('không có key ⇒ not_configured, không gọi mạng', async () => {
    const f = jest.fn();
    await expect(new GeminiClient({ ...opts, apiKey: undefined }, f).generate('s', 'u')).rejects.toMatchObject({ kind: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('ChatService', () => {
  const ask = (svc: ChatService, message: string, context?: any) => svc.chat({ message, context } as any);

  it('danh sách + thứ tự + điểm lấy NGUYÊN từ matchmaker; LLM giải thích hợp lệ ⇒ source llm', async () => {
    const mm = fakeMatchmaker();
    const svc = withGemini(makeService({}, mm), geminiReply('Căn VHOP-S1.02-0701 tiết kiệm 14%, All-in 7.950.000đ/tháng.'));
    const res = await ask(svc, 'Studio dưới 8 triệu, 1 người 1 xe máy');
    expect(res.kind).toBe('search');
    expect(res.recommendations.map((r) => [r.id, r.rank, r.score])).toEqual([
      ['VHOP-S1.02-0701', 1, 14],
      ['VHOP-S1.03-1104', 2, 9],
      ['VHOP-ZR1-0805', 3, 3],
    ]);
    expect(res).toMatchObject({ source: 'llm', degraded: false, scan: { scanned: 54, matched: 12 } });
    expect(res.conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mm.findTopRecommendations.mock.calls[0][0]).toMatchObject({ maxAllInBudget: 8_000_000, layouts: ['Studio'], occupants: 1, motorbikes: 1, limit: 3 });
  });

  it('LLM bịa căn / đổi thứ tự ⇒ bỏ lời LLM, danh sách giữ nguyên, degraded llm_rejected', async () => {
    const svc = withGemini(makeService(), geminiReply('Rẻ nhất là VHOP-S1.03-1104, sau đó VHOP-S1.02-0701.'));
    const res = await ask(svc, 'Studio dưới 8 triệu');
    expect(res).toMatchObject({ source: 'template', degraded: true, degradedReason: 'llm_rejected' });
    expect(res.recommendations.map((r) => r.id)).toEqual(TOP.map((r) => r.unitCode));
    expect(res.reply).toContain('VHOP-S1.02-0701');
  });

  it('chưa cấu hình GEMINI_API_KEY ⇒ vẫn trả danh sách thật, degraded llm_not_configured', async () => {
    const res = await ask(makeService(), 'Studio dưới 8 triệu');
    expect(res.recommendations).toHaveLength(3);
    expect(res).toMatchObject({ degraded: true, degradedReason: 'llm_not_configured', source: 'template' });
  });

  it('Gemini timeout ⇒ danh sách thật, degraded llm_timeout', async () => {
    const hang = (_: string, init: RequestInit) =>
      new Promise<Response>((_r, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' }))));
    const res = await ask(withGemini(makeService(), hang, 30), 'Studio dưới 8 triệu');
    expect(res.recommendations).toHaveLength(3);
    expect(res).toMatchObject({ degraded: true, degradedReason: 'llm_timeout' });
  });

  it('recommend lỗi ⇒ chỉ có chữ, KHÔNG có danh sách, không gọi Gemini', async () => {
    const f = geminiReply('x');
    const svc = withGemini(makeService({}, fakeMatchmaker(async () => Promise.reject(new Error('db down')))), f);
    const res = await ask(svc, 'Studio dưới 8 triệu');
    expect(res).toMatchObject({ kind: 'search', recommendations: [], reply: RECOMMEND_DOWN_REPLY, degraded: true, degradedReason: 'recommend_unavailable' });
    expect(f).not.toHaveBeenCalled();
  });

  it('không có căn khớp ⇒ gợi ý nới ngân sách từ matchmaker, không bịa căn', async () => {
    const mm = fakeMatchmaker();
    mm.findTopRecommendations
      .mockResolvedValueOnce({ scanSummary: { totalScannedUnits: 54, totalMatched: 0 }, topRecommendations: [] })
      .mockResolvedValueOnce({ scanSummary: { totalScannedUnits: 54, totalMatched: 3 }, topRecommendations: TOP });
    const res = await ask(makeService({}, mm), 'Studio dưới 5 triệu');
    expect(res.recommendations).toEqual([]);
    expect(res.reply).toContain('VHOP-S1.03-1104'); // All-in thấp nhất trong danh sách không lọc ngân sách
    expect(mm.findTopRecommendations.mock.calls[1][0].maxAllInBudget).toBeUndefined();
  });

  it('FAQ phí gửi xe: số liệu từ fee_configs, không gọi matchmaker/Gemini', async () => {
    const mm = fakeMatchmaker();
    const f = geminiReply('x');
    const res = await ask(withGemini(makeService({}, mm), f), 'phí gửi xe máy bao nhiêu?');
    expect(res).toMatchObject({ kind: 'faq', source: 'knowledge', recommendations: [], degraded: false });
    expect(res.reply).toContain('150.000đ/xe/tháng');
    expect(res.reply).toContain('9.500đ/m²');
    expect(mm.findTopRecommendations).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it('FAQ khi fee_configs lỗi: vẫn trả quy trình, không có dòng biểu phí', async () => {
    const prisma = { feeConfig: { findMany: jest.fn(async () => Promise.reject(new Error('down'))) } };
    const res = await ask(makeService({}, fakeMatchmaker(), prisma), 'phí gửi xe máy bao nhiêu?');
    expect(res.kind).toBe('faq');
    expect(res.reply).not.toContain('Biểu phí hiện hành');
  });

  it('câu có ngân sách + câu hỏi phí ⇒ ưu tiên tìm căn', async () => {
    const res = await ask(makeService(), 'căn 2pn dưới 12 triệu phí gửi xe bao nhiêu');
    expect(res.kind).toBe('search');
  });

  it('ngoài phạm vi ⇒ từ chối 1 câu, không gọi gì', async () => {
    const mm = fakeMatchmaker();
    const res = await ask(makeService({}, mm), 'viết code python giúp mình');
    expect(res).toMatchObject({ kind: 'refusal', recommendations: [], source: 'rule' });
    expect(mm.findTopRecommendations).not.toHaveBeenCalled();
  });

  it('câu mơ hồ ⇒ hỏi lại; giữ conversationId client gửi', async () => {
    const res = await svcAsk('ừm', 'conv-12345678');
    expect(res).toMatchObject({ kind: 'clarify', conversationId: 'conv-12345678' });
    async function svcAsk(message: string, conversationId: string) {
      return makeService().chat({ message, conversationId } as any);
    }
  });

  it('cấu hình sai ⇒ dừng khởi động', () => {
    expect(() => makeService({ GEMINI_TIMEOUT_MS: 'abc' })).toThrow(/GEMINI_TIMEOUT_MS/);
    expect(() => makeService({ GEMINI_MAX_OUTPUT_TOKENS: '4000' })).toThrow(/GEMINI_MAX_OUTPUT_TOKENS/);
    expect(intEnv(undefined, 'X', 15, 0, 100)).toBe(15);
  });
});

describe('POST /chat (HTTP)', () => {
  let app: INestApplication;

  async function boot(env: Record<string, string> = {}, session = false) {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
      controllers: [ChatController],
      providers: [
        ChatService,
        { provide: ConfigService, useValue: { get: (k: string) => ({ CHAT_KNOWLEDGE_DIR: KNOWLEDGE_DIR, ...env })[k] } },
        { provide: PrismaService, useValue: fakePrisma() },
        { provide: MatchmakerService, useValue: fakeMatchmaker() },
        { provide: SessionCookieService, useValue: { readAccessToken: () => (session ? 'tok' : null) } },
        { provide: AuthSessionService, useValue: { authenticate: async () => ({ id: 'u1' }) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    return app;
  }

  afterEach(async () => app?.close());

  it('200 + envelope + contract', async () => {
    await boot();
    const res = await request(app.getHttpServer())
      .post('/chat')
      .send({ message: 'Studio dưới 8 triệu', context: { household: { persons: 1, motorbikes: 1, cars: 0 }, foo: 'bỏ qua' } })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.data).sort()).toEqual(
      // Vinny v1 (2026-10-15) THÊM messageId (👍/👎) + promptVersion; các khoá cũ giữ nguyên.
      ['conversationId', 'criteria', 'degraded', 'degradedReason', 'kind', 'messageId', 'promptVersion', 'recommendations', 'reply', 'scan', 'source'].sort(),
    );
    expect(res.body.data.promptVersion).toBe('v2');
    expect(res.body.data.recommendations[0]).toMatchObject({ id: 'VHOP-S1.02-0701', rank: 1, score: 14 });
  });

  it('400 khi message rỗng / quá 250 ký tự / context sai kiểu', async () => {
    await boot();
    await request(app.getHttpServer()).post('/chat').send({ message: '   ' }).expect(400);
    await request(app.getHttpServer()).post('/chat').send({ message: 'a'.repeat(251) }).expect(400);
    await request(app.getHttpServer()).post('/chat').send({ message: 'studio', context: { zones: ['hanoi'] } }).expect(400);
  });

  it('401 LOGIN_REQUIRED khi khách vãng lai hết lượt; có phiên thì không giới hạn', async () => {
    await boot({ CHAT_GUEST_TURNS: '2' });
    const server = app.getHttpServer();
    await request(server).post('/chat').send({ message: 'chào' }).expect(200);
    await request(server).post('/chat').send({ message: 'chào' }).expect(200);
    const res = await request(server).post('/chat').send({ message: 'chào' }).expect(401);
    expect(res.body.code).toBe('LOGIN_REQUIRED');
    await app.close();
    await boot({ CHAT_GUEST_TURNS: '0' }, true);
    await request(app.getHttpServer()).post('/chat').send({ message: 'chào' }).expect(200);
  });

  it('429 sau 8 lượt/phút', async () => {
    await boot({ CHAT_GUEST_TURNS: '1000' });
    const server = app.getHttpServer();
    for (let i = 0; i < 8; i++) await request(server).post('/chat').send({ message: 'chào' }).expect(200);
    const res = await request(server).post('/chat').send({ message: 'chào' }).expect(429);
    expect(res.body.code).toBe('rate_limited');
  });
});
