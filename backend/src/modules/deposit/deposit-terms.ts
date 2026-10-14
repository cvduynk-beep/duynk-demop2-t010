import { DepositTermsDoc } from '../tenant/tenant.types';
import { clampHoldHours, HOLD_HOURS_DEFAULT } from './hold-policy';

/** v2 (2026-10-14): chuyển thẳng Tiền cọc bảo đảm thay cọc giữ chỗ 2.000.000đ; khách đã tick v1 phải tick lại. */
export const DEPOSIT_TERMS_VERSION = 'DEP-2026.10-v2';

export const HOUSE_RULES = [
  {
    id: 'no_sublease',
    title: 'Không cho thuê lại',
    body: 'Chỉ dùng để ở cho những người đã đăng ký; cấm cho thuê lại theo ngày/giờ, homestay, Airbnb hay chuyển nhượng quyền thuê.',
    source: 'legal/04 §2.6 · legal/02 Điều 5.1',
  },
  {
    id: 'structure',
    title: 'Giữ nguyên kết cấu',
    body: 'Không khoan đục tường chịu lực, đập tường ngăn, đổi màu sơn hay can thiệp điện âm, ống nước ngầm. Khoan treo đồ nhỏ phải được chủ nhà đồng ý và trám trả nguyên trạng khi trả nhà.',
    source: 'legal/04 §2.5 · legal/02 Điều 5.2',
  },
  {
    id: 'ev_charging',
    title: 'Không sạc xe điện trong căn',
    body: 'Cấm mang xe máy điện, xe đạp điện, pin lithium hay ắc-quy xe điện vào căn để sạc; chỉ sạc tại trạm sạc dưới hầm/nhà xe của khu đô thị.',
    source: 'legal/04 §2.3 · legal/02 Điều 5.3',
  },
  {
    id: 'fire_cooking',
    title: 'An toàn cháy nổ',
    body: 'Cấm bếp than, củi, gas công nghiệp hoặc gas mini; cấm đốt vàng mã trong căn, hành lang, ban công; không thắp hương vòng qua đêm khi vắng nhà; không đấu thêm thiết bị vượt công suất aptomat tổng.',
    source: 'legal/04 §2.3 · legal/02 Điều 5.3',
  },
  {
    id: 'quiet_pets',
    title: 'Giờ yên tĩnh & thú cưng',
    body: 'Giữ yên tĩnh từ 22:00 đến 06:00 (BQL phạt 500.000–2.000.000đ/lần). Chỉ nuôi thú cưng khi căn và phân khu cho phép; ra khu chung phải xích, rọ mõm với chó và dọn vệ sinh ngay.',
    source: 'legal/04 §2.1–2.2',
  },
  {
    id: 'bql_fines',
    title: 'Phạt BQL trừ vào cọc',
    body: 'Mọi khoản phạt BQL do lỗi của bạn được trừ thẳng vào Tiền cọc bảo đảm; bạn nộp bù phần thiếu trong 03 ngày làm việc.',
    source: 'legal/04 §3.2–3.3 · legal/02 Điều 5.4',
  },
] as const;

const fmt = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)} VNĐ`;

/**
 * Biên bản điều khoản cọc khách đọc trước khi tick. `amount` = Tiền cọc bảo đảm của căn (0 khi chưa chọn căn ⇒ câu chữ
 * chung). Chốt nhanh hiển thị ở modal riêng; điều khoản ở đây nêu quy tắc chung để mọi khoản cọc đều cùng một văn bản.
 */
export function buildDepositTerms(holdHours: number = HOLD_HOURS_DEFAULT, amount = 0): DepositTermsDoc {
  const clampedHoldHours = clampHoldHours(holdHours);
  const money = amount > 0 ? fmt(amount) : 'Tiền cọc bảo đảm của căn (chủ nhà quy định; chưa quy định thì bằng 01 tháng tiền thuê)';

  return {
    version: DEPOSIT_TERMS_VERSION,
    amount,
    holdHours: clampedHoldHours,
    items: [
      {
        id: 'amount',
        text: `Bên B chốt căn bằng cách chuyển ${money} — chính là Tiền cọc bảo đảm tài sản & nội thất — qua mã VietQR động vào tài khoản định danh của nền tảng VinStay AI, nội dung COC <mã căn> <mã lịch>; không chuyển cho Field Host hay chủ nhà.`,
        source: 'legal/02 Điều 2.1–2.2 · tenant/02 §2.2',
      },
      {
        id: 'hold',
        text: `Căn được khoá trạng thái giữ chỗ ${clampedHoldHours} giờ tính từ lúc hệ thống ghi nhận tiền vào tài khoản; trong thời gian này căn từ chối lịch xem và cọc của khách khác. Thời lượng do Quản trị viên cài cho từng căn (12–72 giờ).`,
        source: 'AGENTS.md Chủ nhà #1 · legal/02 Điều 2.3–2.4',
      },
      {
        id: 'obligation',
        text: `Trong ${clampedHoldHours} giờ, Bên B hoàn tất xác minh danh tính eKYC (CCCD gắn chip) và ký Hợp đồng thuê trên ứng dụng.`,
        source: 'legal/02 Điều 3',
      },
      {
        id: 'fast_close',
        text: 'Chốt nhanh (chỉ khi chủ nhà ủy quyền): Bên B cam kết chu kỳ thanh toán 1/3/6 tháng để được giảm giá thuê (không thấp hơn giá sàn chủ nhà đặt) và giảm khoảng 5% tiền cọc; ưu đãi chỉ giữ khi tiền cọc về trong 24 giờ, quá hạn hệ thống hoàn lại khoản đã chuyển và Bên B đặt cọc lại theo giá thường. Hợp đồng thuê bắt buộc đúng chu kỳ và giá đã chốt.',
        source: 'AGENTS.md Chủ nhà #1 (Giá sàn an toàn) · legal/02 Điều 2.6',
      },
      {
        id: 'move_in',
        text: 'Ngày dọn vào sớm nhất là 02 ngày sau khi cọc về (BQL duyệt cư dân, thẻ thang máy, Field Host kiểm định). Miễn phí chờ dọn vào tối đa 07 ngày kể từ khi cọc về; chọn ngày sau đó (tối đa 30 ngày) thì Hợp đồng và tiền thuê bắt đầu tính từ ngày thứ 08.',
        source: 'legal/02 Điều 2.5 · legal/06 Điều 2.4 (Smart Move-in Window Protocol)',
      },
      {
        id: 'forfeit',
        text: `Quá ${clampedHoldHours} giờ mà Bên B không hoàn tất, hoặc tự huỷ không do bất khả kháng: Bên B mất khoản cọc theo Điều 328 BLDS 2015; 50% bù chủ nhà, 50% chi phí vận hành nền tảng; căn mở lại.`,
        source: 'legal/02 Điều 6.1',
      },
      {
        id: 'landlord_breach',
        text: `Chủ nhà đổi giá, đổi hiện trạng hoặc từ chối cho thuê trong thời hạn giữ chỗ: hoàn 100% cọc và phạt cọc bằng đúng số tiền cọc (Điều 328 BLDS 2015)${amount > 0 ? ` — tổng ${fmt(amount * 2)}` : ''}. Bất khả kháng: hoàn 100%, không phạt.`,
        source: 'legal/02 Điều 6.2–6.3',
      },
      {
        id: 'convert',
        text: 'Khi ký Hợp đồng thuê, khoản đã chuyển trở thành 100% Tiền cọc bảo đảm tài sản & nội thất, giữ suốt kỳ thuê (không thu bù); tuyệt đối không trừ vào tiền thuê tháng đầu.',
        source: 'AGENTS.md · legal/02 Điều 4',
      },
    ],
    houseRules: HOUSE_RULES.map((r) => ({ ...r })),
    consentLabel:
      'Tôi đã đọc và đồng ý điều khoản đặt Tiền cọc bảo đảm và nội quy căn hộ theo Điều 328 Bộ luật Dân sự 2015, và cho phép VinStay AI xử lý dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.',
  };
}
