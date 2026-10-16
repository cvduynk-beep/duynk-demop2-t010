import { vnd } from './chat-knowledge';

/**
 * Câu trả lời dự phòng TẤT ĐỊNH khi Gemini lỗi / quá giờ nhưng công cụ chỉ đọc đã trả dữ liệu thật (0 token).
 * Chỉ in lại đúng số liệu công cụ — không suy luận, không so sánh "nên chọn căn nào". Không có dữ liệu ⇒ `null`
 * (caller dùng câu "chưa chắc chắn" chung).
 */

type Json = Record<string, any>;

const money = (n: unknown) => (typeof n === 'number' && n > 0 ? `${vnd(n)}đ` : null);

/** Nhãn của `BookingStatusWeb` (tenant.types). */
const BOOKING_STATUS: Record<string, [string, string]> = {
  pending: ['chờ Host xác nhận', 'waiting for Host confirmation'],
  confirmed: ['đã xác nhận', 'confirmed'],
  lobby: ['đã có mặt tại sảnh', 'at the lobby'],
  receiving: ['Host đang đón', 'Host is picking you up'],
  viewing: ['đang xem căn', 'viewing'],
  closing: ['đang chốt cọc', 'closing'],
  holding: ['đang giữ căn', 'unit on hold'],
  leased: ['đã thuê', 'leased'],
  completed: ['đã xem xong', 'completed'],
  no_show: ['vắng mặt', 'no-show'],
  cancelled: ['đã huỷ', 'cancelled'],
  rejected: ['bị từ chối', 'rejected'],
};

function unitLine(u: Json, en: boolean): string {
  const rent = money(u.rent);
  const dep = money(u.securityDeposit);
  const parts = en
    ? [
        `${u.code}: ${u.layout}${u.areaM2 ? `, ${u.areaM2}m²` : ''}${u.floor ? `, floor ${u.floor}` : ''}`,
        rent ? `rent ${rent}/month` : null,
        dep ? `security deposit ${dep}` : null,
        typeof u.holdHours === 'number' ? `held ${u.holdHours}h after the deposit arrives` : null,
        u.fastDeposit?.available ? 'fast deposit available' : null,
      ]
    : [
        `${u.code}: ${u.layout}${u.areaM2 ? `, ${u.areaM2}m²` : ''}${u.floor ? `, tầng ${u.floor}` : ''}`,
        rent ? `thuê ${rent}/tháng` : null,
        dep ? `cọc bảo đảm ${dep}` : null,
        typeof u.holdHours === 'number' ? `giữ căn ${u.holdHours} giờ sau khi tiền về` : null,
        u.fastDeposit?.available ? 'có Chốt cọc nhanh' : null,
      ];
  return `• ${parts.filter(Boolean).join(', ')} — ${u.link ?? `/units/${u.code}`}`;
}

export function renderToolFallback(results: unknown[] = [], en = false): string | null {
  const lines: string[] = [];
  let notFound = false;
  const seen = new Set<string>();
  const addUnit = (u: Json) => {
    if (!u || typeof u !== 'object') return;
    if (u.found === false) {
      notFound = true;
      return;
    }
    if (u.found === true && u.code && !seen.has(u.code)) {
      seen.add(u.code);
      lines.push(unitLine(u, en));
    }
  };

  for (const r of results as Json[]) {
    if (!r || typeof r !== 'object' || 'error' in r) continue;
    // get_unit / compare_units. `knowledge_lookup` trượt trả `{found:false, topics:[]}` ⇒ không tính là "không thấy căn".
    if (Array.isArray(r.units)) r.units.forEach(addUnit);
    else if (r.found === true && r.code) addUnit(r);
    else if (r.found === false && !('topics' in r)) notFound = true;
    if (typeof r.holdHours === 'number' && 'convertedToSecurityDeposit' in r) {
      const dep = money(r.deposit);
      const fast = r.fastDeposit?.available ? money(r.fastDeposit.amountToPay) : null;
      lines.push(
        en
          ? `• ${r.unitCode ? `${r.unitCode}: ` : ''}${dep ? `deposit ${dep}, ` : ''}unit held ${r.holdHours} hours after payment; it becomes the security deposit and is never deducted from the first month's rent${fast ? `; fast deposit ${fast} if paid within ${r.fastDeposit.payWithinHours}h` : ''}.`
          : `• ${r.unitCode ? `Căn ${r.unitCode}: ` : ''}${dep ? `cọc ${dep}, ` : ''}giữ căn ${r.holdHours} giờ sau khi tiền về; khoản này chuyển thành Tiền cọc bảo đảm, không trừ vào tiền thuê tháng đầu${fast ? `; chốt cọc nhanh còn ${fast} nếu chuyển trong ${r.fastDeposit.payWithinHours} giờ` : ''}.`,
      );
    }
    if (Array.isArray(r.bookings)) {
      if (!r.bookings.length) lines.push(en ? '• You have no viewings yet.' : '• Bạn chưa có lịch xem nào.');
      for (const b of r.bookings.slice(0, 3)) {
        const st = BOOKING_STATUS[b.status]?.[en ? 1 : 0] ?? b.status;
        lines.push(`• ${b.ref}${b.unitCode ? ` (${b.unitCode})` : ''}: ${st} — ${b.link}`);
      }
    }
    if (Array.isArray(r.contracts)) {
      if (!r.contracts.length) lines.push(en ? '• You have no lease contracts yet.' : '• Bạn chưa có hợp đồng thuê nào.');
      for (const c of r.contracts.slice(0, 3)) {
        const rent = money(c.monthlyRent);
        lines.push(
          en
            ? `• ${c.contractNumber}${c.unitCode ? ` (${c.unitCode})` : ''}: ${c.startDate ?? '?'} → ${c.endDate ?? '?'}${rent ? `, rent ${rent}/month` : ''}`
            : `• ${c.contractNumber}${c.unitCode ? ` (${c.unitCode})` : ''}: ${c.startDate ?? '?'} → ${c.endDate ?? '?'}${rent ? `, thuê ${rent}/tháng` : ''}`,
        );
      }
    }
  }

  if (!lines.length) {
    if (!notFound) return null;
    return en
      ? "I couldn't find this unit among the units currently for rent (it may be rented already or the code is wrong). Tell me your budget and I'll filter other units."
      : 'Mình chưa thấy căn này trong danh sách đang cho thuê (có thể căn đã có người thuê hoặc mã chưa đúng). Bạn cho mình ngân sách để lọc căn khác nhé.';
  }
  const head = en ? 'Here is the data from the system:' : 'Mình gửi bạn số liệu từ hệ thống:';
  const tail = en ? 'Open the link for details and next steps.' : 'Bạn mở đường dẫn để xem chi tiết và làm bước tiếp theo nhé.';
  return [head, ...lines.slice(0, 5), tail].join('\n');
}

export const AGENT_FALLBACK_REPLY_EN =
  "I'm not sure about this one and don't want to guess. Could you ask again more specifically (unit code, budget), or tap \"Gặp nhân viên\" to reach VinStay staff?";
