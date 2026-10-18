import { fold } from './chat-criteria';
import { affirmed, ANY_VHOP_CODE_RE, CODE_RE, FORBIDDEN, INTERNAL_LABEL_RE, moneyMatches, moneyMentions, REPLY_MAX_CHARS, stripEchoedLabels } from './chat-reply';

/**
 * Guardrail của Vinny (tất định, 0 token):
 * - `detectHandoff`: câu cần nhân viên thật ⇒ không để LLM tự xử lý.
 * - `detectProbe`: injection / đòi lộ prompt, công cụ, giá sàn, hoa hồng, dữ liệu người khác ⇒ từ chối, không gọi LLM.
 * - `redactPii`: che SĐT, email, số CCCD, mã OTP trong mọi văn bản lưu lại hoặc trả ra.
 * - `checkAgentAnswer`: câu trả lời có công cụ chỉ được nhắc mã căn / mã lịch / số tiền có trong kết quả công cụ.
 */

export type HandoffCategory = 'complaint' | 'deposit_dispute' | 'payment' | 'contract' | 'damage' | 'human_request';

const HANDOFF: [HandoffCategory, RegExp][] = [
  ['human_request', /gap (nhan vien|nguoi that|tu van vien|admin|quan ly)|noi chuyen voi (nguoi|nhan vien)|chuyen (cho )?nhan vien|talk to (a )?(human|person|agent|staff)|real person|goi (lai )?cho (minh|toi|em)/],
  ['deposit_dispute', /(tru|mat|giu|khong tra|chua tra|doi) (lai )?coc|hoan coc (cham|chua|khong)|tranh chap|bat coc|lua dao|scam|deposit (refund|dispute)/],
  ['payment', /(chuyen khoan|thanh toan|quet qr|vietqr).{0,30}(loi|sai|nham|chua (nhan|gach|ve)|khong (nhan|gach|ve)|bi tru)|bi tru tien|tru tien 2 lan|double charge|payment (failed|issue)/],
  ['contract', /(huy|cham dut|pha|sua|doi) hop dong|hop dong (sai|loi|chua ky|bi)|thanh ly (som|truoc han)|kien|khoi kien|luat su/],
  ['damage', /(chu nha|host|nhan vien).{0,25}(khong giao|khong mo|lam hong|vo trach nhiem|bom|lua)|khong giao nha|khong ban giao/],
  ['complaint', /khieu nai|phan nan|to cao|(rat|qua|that) (buc|that vong|te|kem)|buc minh|lam an (kieu gi|te)|complain|terrible|angry/],
];

export function detectHandoff(text: string): HandoffCategory | null {
  const t = fold(text);
  return HANDOFF.find(([, rx]) => rx.test(t))?.[0] ?? null;
}

export type ProbeKind = 'injection' | 'internal' | 'other_people';

const PROBES: [ProbeKind, RegExp][] = [
  ['injection', /(bo qua|quen|ignore|disregard|forget).{0,25}(huong dan|chi dan|quy tac|luat|instruction|rule|prompt)|system prompt|prompt he thong|in (ra )?(huong dan|prompt|cau lenh)|developer mode|che do (nha phat trien|dev|admin)|jailbreak|\bdan\b mode|act as|dong vai (la )?(admin|he thong|developer)|ban (bay gio )?la (admin|chatgpt|mot ai khac)|reveal (your|the) (prompt|instructions)|(print|repeat|show|output|reveal|display) (me )?(the |all |everything |your )*(text|words|instructions|messages?|content)? ?(above|before this|at the (start|beginning))|initial (prompt|instructions)|(in|chep|nhac) lai (doan|phan|noi dung) (o )?(tren|truoc|dau)/],
  ['internal', /gia san|floor price|(?<!dieu )hoa hong|commission|(thuat toan|cong thuc|quy tac|diem) xep hang|ranking (rule|score)|ten (cac )?cong cu|tool name|api key|ma nguon|source code|database|co so du lieu/],
  ['other_people', /(sdt|so dien thoai|so dt|cccd|email|dia chi|thong tin|ten).{0,20}(cua )?(chu nha|host|khach khac|nguoi khac|nguoi thue khac|nguoi dang xem|khach dang (xem|coc|thue)|khach (da|truoc) (xem|coc|thue))|(chu nha|host).{0,15}(sdt|so dien thoai|so dt|zalo)|ai (dang|da) (coc|thue|xem) can/],
];

export function detectProbe(text: string): ProbeKind | null {
  const t = fold(text);
  return PROBES.find(([, rx]) => rx.test(t))?.[0] ?? null;
}

/**
 * Mặc cả / xin giữ căn ngoài chính sách ⇒ câu cố định (0 token), không để LLM tự "linh động". Chỉ bắt câu NHỜ VINNY làm
 * (giảm cho mình, bớt 500k, giữ miễn phí 3 ngày); câu hỏi thông tin ("cọc nhanh được giảm bao nhiêu") vẫn đi FAQ/agent.
 */
const NEGOTIATE_RE =
  /(giam|bot|ha) (gia |tien )?(cho (minh|toi|em|anh|chi|tui)|\d+([.,]\d+)? ?(k|trieu|tr|nghin|ngan|tram)\b|(chut|it|mot chut|xiu|ti)\b)|mac ca|thuong luong|tra gia|chiet khau (them|cho)|giu (can|cho)( nay| giup| cho (minh|toi|em))? (mien phi|free|khong (can )?coc|chua coc|(them |trong |toi |den )?\d+ ?(ngay|tuan|thang)|them|lau hon)|(give|get) (me )?(a )?discount|(cheaper|lower (the )?price) (for me|please)|negotiat|hold (it|the unit|this unit) (for )?(free|\d+ (days|weeks))/;

export function detectNegotiation(text: string): boolean {
  return NEGOTIATE_RE.test(fold(text));
}

export const NEGOTIATE_REPLY =
  'Mình không thương lượng giá hay tự gia hạn giữ căn được. Giá thuê, ưu đãi chốt cọc nhanh (nếu chủ nhà đã ủy quyền) và thời gian giữ căn đều hiển thị công khai trên trang căn, áp dụng như nhau cho mọi khách. Bạn muốn mình lọc căn hợp ngân sách hơn không?';

/** Câu tiếng Anh (không dấu tiếng Việt + có từ tiếng Anh thông dụng) ⇒ bỏ FAQ tiếng Việt, nhắc model trả lời tiếng Anh. */
const VI_MARKS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const EN_WORDS =
  /\b(the|is|are|what|how|can|could|do|does|i|i'm|my|me|you|your|apartment|unit|rent|deposit|price|looking|want|need|please|hello|hi|which|where|when|with|for|and|of|about|held|after|before)\b/gi;

export function isEnglish(text: string): boolean {
  if (VI_MARKS.test(text)) return false;
  return (text.match(EN_WORDS) ?? []).length >= 2;
}

export const PROBE_REPLY: Record<ProbeKind, string> = {
  injection: 'Mình không chia sẻ hay thay đổi được cách mình hoạt động. Mình giúp bạn tìm căn hoặc giải thích quy trình thuê ở Ocean Park 1 nhé?',
  internal:
    'Phần đó là thông tin nội bộ nên mình không chia sẻ được. Giá và ưu đãi bạn được hưởng luôn hiển thị công khai trên trang căn. Bạn muốn mình lọc căn theo ngân sách không?',
  other_people:
    'Mình không chia sẻ thông tin của chủ nhà hay khách khác. Mọi liên hệ đi qua VinStay: bạn đặt lịch xem trên trang căn, Field Host sẽ đón bạn tại sảnh.',
};

export const HANDOFF_REPLY: Record<HandoffCategory, string> = {
  human_request: 'Được bạn. Bạn bấm "Gặp nhân viên", mình chuyển kèm tóm tắt để nhân viên VinStay liên hệ lại trong khoảng 2 giờ làm việc.',
  deposit_dispute:
    'Việc liên quan tiền cọc cần nhân viên VinStay kiểm tra trực tiếp. Bạn bấm "Gặp nhân viên", mình chuyển kèm tóm tắt để bạn không phải kể lại; nhân viên phản hồi trong khoảng 2 giờ làm việc.',
  payment:
    'Sự cố thanh toán cần nhân viên đối soát với ngân hàng. Bạn bấm "Gặp nhân viên" để mình chuyển yêu cầu; bạn không cần chuyển thêm tiền trong lúc chờ nhé.',
  contract:
    'Việc về hợp đồng cần nhân viên VinStay xác nhận, mình không tự xác nhận được. Bạn bấm "Gặp nhân viên", nhân viên phản hồi trong khoảng 2 giờ làm việc.',
  damage:
    'Mình rất tiếc về chuyện này. Việc cần nhân viên VinStay xử lý trực tiếp với chủ nhà / Field Host. Bạn bấm "Gặp nhân viên" để mình chuyển kèm tóm tắt nhé.',
  complaint:
    'Mình xin lỗi vì trải nghiệm chưa tốt. Bạn bấm "Gặp nhân viên" để mình chuyển phản ánh kèm tóm tắt; nhân viên VinStay phản hồi trong khoảng 2 giờ làm việc.',
};

// Không bắt đầu ngay sau chữ / số / "." / "-": mã căn, mã HĐ ("S1.08-2611-2026-0004") không bị coi là SĐT (eval 2026-10-16).
const PHONE_RE = /(?<![\w.-])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?![\d-])/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CCCD_RE = /(?<!\d)\d{12}(?!\d)/g;
const OTP_RE = /\b(?:(?:mã|ma)\s+)?(?:otp|mã|ma|code)\s*(?:là|la|:)?\s*\d{4,6}\b/gi;

/** Che PII. Áp cho câu trả lời trả ra và mọi tóm tắt lưu xuống DB (yêu cầu hỗ trợ). */
export function redactPii(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(CCCD_RE, '[cccd]').replace(PHONE_RE, '[sđt]').replace(OTP_RE, '[mã]');
}

export function hasPii(text: string): boolean {
  return redactPii(text) !== text;
}

/** Tên công cụ / cụm nội bộ không được lộ trong câu trả lời. */
const LEAK_RE = /search_units|get_unit|compare_units|deposit_policy|knowledge_lookup|my_bookings|my_contracts|du_lieu_khong_tin_cay|system prompt|hướng dẫn hệ thống|giá sàn\s*(là|:)?\s*\d|hoa hồng\s*(là|:)?\s*\d/i;
const BOOKING_REF_RE = /\bVS-[A-Z0-9]{4,8}\b/gi;
const CONTRACT_RE = /\bVSA-LEASE-[A-Z0-9.-]+\b/gi;

export type AgentCheck = { ok: true; text: string } | { ok: false; why: 'empty' | 'length' | 'unknown_unit' | 'unknown_ref' | 'money' | 'policy' | 'leak' };

/**
 * `facts` = dữ kiện từ kết quả công cụ trong lượt; `userNumbers` = số tiền khách tự nêu (được phép nhắc lại).
 * Không qua ⇒ caller KHÔNG trả câu của model, dùng câu dự phòng + log cảnh báo.
 */
export function checkAgentAnswer(
  raw: string,
  facts: { codes: Set<string>; refs: Set<string>; numbers: Set<number> },
  userNumbers: number[] = [],
  /** Câu của khách lượt này: mã căn / mã lịch / mã HĐ khách tự gõ không phải bịa. */
  userText = '',
): AgentCheck {
  const text = stripEchoedLabels(raw.replace(/^#+\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/^\s*\*\s+/gm, '• ').trim());
  if (!text) return { ok: false, why: 'empty' };
  if (text.length > REPLY_MAX_CHARS) return { ok: false, why: 'length' };
  if (LEAK_RE.test(text) || INTERNAL_LABEL_RE.test(text)) return { ok: false, why: 'leak' };
  const mineCodes = new Set([...userText.matchAll(CODE_RE), ...userText.matchAll(ANY_VHOP_CODE_RE)].map((m) => m[1].toUpperCase()));
  const mineRefs = new Set([BOOKING_REF_RE, CONTRACT_RE].flatMap((rx) => [...userText.matchAll(rx)].map((m) => m[0].toUpperCase())));
  for (const m of [...text.matchAll(CODE_RE), ...text.matchAll(ANY_VHOP_CODE_RE)]) {
    const code = m[1].toUpperCase();
    if (!facts.codes.has(code) && !mineCodes.has(code)) return { ok: false, why: 'unknown_unit' };
  }
  for (const rx of [BOOKING_REF_RE, CONTRACT_RE]) {
    for (const m of text.matchAll(rx)) {
      const ref = m[0].toUpperCase();
      if (!facts.refs.has(ref) && !mineRefs.has(ref)) return { ok: false, why: 'unknown_ref' };
    }
  }
  const allowed = [...[...facts.numbers].filter((n) => n >= 10_000), ...userNumbers];
  if (moneyMentions(text).some((n) => !moneyMatches(n, allowed))) return { ok: false, why: 'money' };
  if (FORBIDDEN.some((rx) => affirmed(rx, text))) return { ok: false, why: 'policy' };
  return { ok: true, text: redactPii(text) };
}
