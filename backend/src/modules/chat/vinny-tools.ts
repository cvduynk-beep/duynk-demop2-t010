import { NotFoundException } from '@nestjs/common';
import { AccountService } from '../account/account.service';
import { DepositService } from '../deposit/deposit.service';
import { MatchmakerRequestDto } from '../matchmaker/dto/matchmaker-request.dto';
import { MatchmakerService } from '../matchmaker/matchmaker.service';
import { PropertyService } from '../property/property.service';
import { ChatRecommendation } from './chat.types';
import { MATCH_FLOORS, MATCH_FURNISHINGS, MATCH_LAYOUTS, MATCH_ZONES } from '../matchmaker/dto/matchmaker-request.dto';

/**
 * Công cụ CHỈ ĐỌC của Vinny (Gemini function calling). Gọi service ngay trong backend, không qua HTTP.
 * - Danh tính khách lấy từ phiên (`ctx.userId`), KHÔNG BAO GIỜ từ tham số model / client ⇒ không đọc được dữ liệu người khác.
 * - Kết quả đã chiếu bớt: không SĐT, tên, nội dung chuyển khoản, giá sàn, hoa hồng, điểm xếp hạng.
 * - Văn bản chủ nhà nhập bọc trong `<du_lieu_khong_tin_cay>` (dữ liệu, không phải lệnh).
 * - Lỗi hạ tầng ⇒ `{ error: 'unavailable' }`; không tìm thấy ⇒ `{ found: false }`. Model không được tự điền.
 */

export const UNTRUSTED_OPEN = '<du_lieu_khong_tin_cay>';
export const UNTRUSTED_CLOSE = '</du_lieu_khong_tin_cay>';
export const MAX_TOOL_RESULT_CHARS = 6000;

export interface ToolContext {
  /** Profile id của khách `tenant` đã đăng nhập (đọc từ cookie phiên); null = khách vãng lai. */
  userId: string | null;
  /** Danh sách xếp hạng của lần `search_units` cuối trong lượt ⇒ thành `recommendations` của response. */
  recommendations?: ChatRecommendation[];
  scan?: { scanned: number; matched: number };
}

export interface KnowledgeHit {
  topic: string;
  title: string;
  text: string;
}

export interface ToolDeps {
  matchmaker: MatchmakerService;
  property: PropertyService;
  deposit: DepositService;
  account: AccountService;
  /** Tìm trong kho tri thức đã duyệt (đã thay số từ fee_configs); rỗng ⇒ không có đoạn đủ liên quan. */
  knowledge: (query: string) => Promise<KnowledgeHit[]>;
}

type Json = Record<string, unknown>;

/** Khai báo theo schema OpenAPI của Gemini. Tham số chặt, giới hạn rõ ràng. */
export const TOOL_DECLARATIONS = [
  {
    name: 'search_units',
    description: 'Tìm căn đang mở theo tiêu chí. Danh sách trả về đã được hệ thống xếp hạng; giữ nguyên thứ tự rank.',
    parameters: {
      type: 'OBJECT',
      properties: {
        max_all_in_budget: { type: 'INTEGER', description: 'Ngân sách trần All-in VNĐ/tháng (3.000.000–200.000.000)' },
        layouts: { type: 'ARRAY', items: { type: 'STRING', enum: [...MATCH_LAYOUTS] } },
        zones: { type: 'ARRAY', items: { type: 'STRING', enum: [...MATCH_ZONES] } },
        floor: { type: 'STRING', enum: [...MATCH_FLOORS] },
        furnishing: { type: 'STRING', enum: [...MATCH_FURNISHINGS] },
        pets: { type: 'BOOLEAN' },
        persons: { type: 'INTEGER', description: 'Số người ở (1–10)' },
        motorbikes: { type: 'INTEGER', description: 'Số xe máy (0–10)' },
        cars: { type: 'INTEGER', description: 'Số ô tô (0–5)' },
      },
    },
  },
  {
    name: 'get_unit',
    description: 'Chi tiết một căn theo mã: giá, phí, Tiền cọc bảo đảm, nội thất, trạng thái, chốt cọc nhanh.',
    parameters: { type: 'OBJECT', properties: { unit_code: { type: 'STRING', description: 'Mã căn, vd VHOP-S1.02-0701' } }, required: ['unit_code'] },
  },
  {
    name: 'compare_units',
    description: 'So sánh 2–3 căn theo mã.',
    parameters: {
      type: 'OBJECT',
      properties: { unit_codes: { type: 'ARRAY', items: { type: 'STRING' }, description: '2 đến 3 mã căn' } },
      required: ['unit_codes'],
    },
  },
  {
    name: 'deposit_policy',
    description: 'Tiền cọc, số giờ giữ căn, ưu đãi chốt cọc nhanh. Có unit_code ⇒ số liệu của căn đó; không có ⇒ quy định chung.',
    parameters: { type: 'OBJECT', properties: { unit_code: { type: 'STRING' } } },
  },
  {
    name: 'knowledge_lookup',
    description: 'Tra quy trình và quy định đã duyệt của VinStay (xem nhà, cọc, hợp đồng, nội quy BQL, sửa chữa, trả phòng, bảo mật, All-in).',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Câu hỏi ngắn' } }, required: ['query'] },
  },
  {
    name: 'my_bookings',
    description: 'Lịch xem / cọc của CHÍNH khách đang chat (cần đăng nhập).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'my_contracts',
    description: 'Hợp đồng thuê của CHÍNH khách đang chat (cần đăng nhập).',
    parameters: { type: 'OBJECT', properties: {} },
  },
] as const;

export type ToolName = (typeof TOOL_DECLARATIONS)[number]['name'];
const NAMES = new Set<string>(TOOL_DECLARATIONS.map((t) => t.name));

const CODE_RE = /^[A-Z0-9][A-Z0-9.\-]{2,30}$/i;
const intIn = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x)))] : [];
const untrusted = (lines: string[] | null | undefined) =>
  lines && lines.length ? `${UNTRUSTED_OPEN}${lines.slice(0, 5).join(' | ').slice(0, 400)}${UNTRUSTED_CLOSE}` : null;

export class VinnyTools {
  constructor(private readonly deps: ToolDeps) {}

  /** Chạy một công cụ. Không bao giờ ném: lỗi trả về dưới dạng dữ liệu cho model. */
  async run(name: string, rawArgs: unknown, ctx: ToolContext): Promise<Json> {
    if (!NAMES.has(name)) return { error: 'unknown_tool' };
    const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? (rawArgs as Json) : {};
    try {
      switch (name as ToolName) {
        case 'search_units':
          return await this.searchUnits(args, ctx);
        case 'get_unit':
          return await this.getUnit(args.unit_code);
        case 'compare_units': {
          const codes = Array.isArray(args.unit_codes) ? [...new Set(args.unit_codes.filter((c) => typeof c === 'string'))].slice(0, 3) : [];
          if (codes.length < 2) return { error: 'bad_arguments', hint: 'cần 2–3 mã căn' };
          // So sánh chỉ cần số liệu quyết định ⇒ bỏ danh sách nội thất từng món (giảm token cho vòng trả lời).
          const units = await Promise.all(codes.map((c) => this.getUnit(c)));
          return { units: units.map((u) => (u && typeof u === 'object' && 'inventory' in u ? { ...u, inventory: undefined, inventoryItems: (u.inventory as unknown[]).length } : u)) };
        }
        case 'deposit_policy':
          return await this.depositPolicy(args.unit_code);
        case 'knowledge_lookup': {
          const q = typeof args.query === 'string' ? args.query.slice(0, 200) : '';
          if (!q.trim()) return { error: 'bad_arguments' };
          const hits = await this.deps.knowledge(q);
          return hits.length ? { found: true, topics: hits } : { found: false, topics: [] };
        }
        case 'my_bookings':
          return await this.myBookings(ctx);
        case 'my_contracts':
          return await this.myContracts(ctx);
      }
    } catch (err) {
      if (err instanceof NotFoundException) return { found: false };
      return { error: 'unavailable' };
    }
    return { error: 'unknown_tool' };
  }

  private async searchUnits(a: Json, ctx: ToolContext): Promise<Json> {
    const dto = Object.assign(new MatchmakerRequestDto(), {
      maxAllInBudget: intIn(a.max_all_in_budget, 3_000_000, 200_000_000),
      layouts: pick(a.layouts, MATCH_LAYOUTS).length ? pick(a.layouts, MATCH_LAYOUTS) : undefined,
      zones: pick(a.zones, MATCH_ZONES).length ? pick(a.zones, MATCH_ZONES) : undefined,
      floor: pick([a.floor], MATCH_FLOORS)[0],
      furnishing: pick([a.furnishing], MATCH_FURNISHINGS)[0],
      pets: a.pets === true ? true : undefined,
      occupants: intIn(a.persons, 1, 10) ?? 1,
      motorbikes: intIn(a.motorbikes, 0, 10) ?? 1,
      cars: intIn(a.cars, 0, 5) ?? 0,
      limit: 3,
    });
    const res = await this.deps.matchmaker.findTopRecommendations(dto);
    const recs: ChatRecommendation[] = res.topRecommendations.map((r: any) => ({
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
    }));
    ctx.recommendations = recs;
    ctx.scan = { scanned: res.scanSummary.totalScannedUnits, matched: res.scanSummary.totalMatched };
    return {
      totalMatched: ctx.scan.matched,
      scanned: ctx.scan.scanned,
      units: recs.map((r) => ({
        rank: r.rank,
        code: r.unitCode,
        building: r.buildingCode,
        zone: r.zoneName ?? null,
        layout: r.layout,
        areaM2: r.areaM2,
        floor: r.floor ?? null,
        rent: r.allInCost.baseRent,
        managementFee: r.allInCost.managementFee,
        parkingFee: r.allInCost.parkingFee,
        utilityEstimate: r.allInCost.utilityCost,
        allInTotal: r.allInCost.allInTotal,
        savingPercent: r.comparison.savingPercentage,
        bargain: r.comparison.isBargain,
      })),
    };
  }

  private async getUnit(rawCode: unknown): Promise<Json> {
    if (typeof rawCode !== 'string' || !CODE_RE.test(rawCode.trim())) return { found: false };
    try {
      const u = await this.deps.property.getUnitByCode(rawCode.trim());
      return {
        found: true,
        code: u.code,
        building: u.building,
        zone: u.zoneName ?? null,
        floor: u.floor,
        layout: u.layout,
        areaM2: u.areaM2,
        direction: u.direction,
        view: u.view,
        status: u.status,
        rent: u.rent,
        managementFee: u.managementFee,
        parkingFeeEstimate: u.parkingFeeEstimate,
        utilityEstimate: u.utilityCostEstimate,
        securityDeposit: u.securityDeposit,
        depositToLock: u.holdingDeposit,
        holdHours: u.holdHours,
        minMonths: u.minMonths,
        petFriendly: u.petFriendly,
        doorLock: u.lock === 'smart' ? 'khóa điện tử (mã cấp trong app khi Host xác nhận xem)' : 'chìa cơ do nhân sự phân khu giữ',
        furnishing: u.furnishing,
        fastDeposit: u.fastDeposit ? { available: true, depositDiscount: u.fastDeposit.depositDiscount } : { available: false },
        inventory: (u.inventory ?? []).slice(0, 10).map((i) => ({ name: i.name, qty: i.qty, conditionPct: i.conditionPct })),
        landlordNote: untrusted(u.highlights),
        link: `/units/${u.code}`,
      };
    } catch (err) {
      if (err instanceof NotFoundException) return { found: false, code: rawCode.trim() };
      throw err;
    }
  }

  private async depositPolicy(rawCode: unknown): Promise<Json> {
    const code = typeof rawCode === 'string' && CODE_RE.test(rawCode.trim()) ? rawCode.trim() : undefined;
    try {
      const terms = await this.deps.deposit.getPublicDepositTerms(code);
      const out: Json = {
        holdHours: terms.holdHours,
        convertedToSecurityDeposit: true,
        deductedFromFirstMonthRent: false,
        ...(code ? { unitCode: code, deposit: terms.amount } : { deposit: 'theo từng căn (mặc định 1 tháng tiền thuê)' }),
      };
      if (code) {
        const fast = await this.deps.deposit.getPublicFastDeposit(code);
        out.fastDeposit = fast.eligible
          ? { available: true, depositDiscount: fast.depositDiscount, amountToPay: fast.amount, payWithinHours: fast.quoteHours }
          : { available: false };
      }
      return out;
    } catch (err) {
      if (err instanceof NotFoundException) return { found: false, unitCode: code ?? null };
      throw err;
    }
  }

  private async myBookings(ctx: ToolContext): Promise<Json> {
    if (!ctx.userId) return { error: 'login_required' };
    const list = (await this.deps.account.getBookings(ctx.userId)) as any[];
    return {
      bookings: list.slice(0, 5).map((b) => ({
        ref: b.ref,
        status: b.status,
        unitCode: b.unit?.code ?? null,
        slot: b.slot,
        deposit: b.deposit ? { amount: b.deposit.amount, outcome: b.deposit.outcome, expiresAt: b.deposit.expiresAt ?? null } : null,
        link: `/booking/${b.ref}`,
      })),
    };
  }

  private async myContracts(ctx: ToolContext): Promise<Json> {
    if (!ctx.userId) return { error: 'login_required' };
    const list = await this.deps.account.getContracts(ctx.userId);
    return {
      contracts: list.slice(0, 5).map((c) => ({
        contractNumber: c.contractNumber,
        unitCode: c.unit?.code ?? null,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        monthlyRent: c.monthlyRent,
        securityDeposit: c.securityDeposit,
        paymentCycle: c.paymentCycle,
      })),
    };
  }
}

/** Mọi "dữ kiện" trong kết quả công cụ (mã căn, mã lịch/hợp đồng, số tiền) — dùng để kiểm câu trả lời không bịa. */
export function collectFacts(results: unknown[]): { codes: Set<string>; refs: Set<string>; numbers: Set<number> } {
  const codes = new Set<string>();
  const refs = new Set<string>();
  const numbers = new Set<number>();
  const walk = (v: unknown, key = '') => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === 'number' && Number.isFinite(v)) numbers.add(v);
    else if (typeof v === 'string') {
      if (/code$/i.test(key)) codes.add(v.toUpperCase().replace(/^VHOP-/, ''));
      if (key === 'ref' || key === 'contractNumber') refs.add(v.toUpperCase());
    }
  };
  results.forEach((r) => walk(r));
  return { codes, refs, numbers };
}

/** Rút gọn kết quả trước khi gửi lại cho model (chặn tràn ngữ cảnh). */
export function clampResult(r: Json): Json {
  const s = JSON.stringify(r);
  return s.length <= MAX_TOOL_RESULT_CHARS ? r : { truncated: true, data: s.slice(0, MAX_TOOL_RESULT_CHARS) };
}

