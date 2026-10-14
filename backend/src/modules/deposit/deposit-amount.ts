/**
 * Cọc v2 (quyết định 2026-10-14, thay cọc giữ chỗ cố định 2.000.000đ): khách chốt căn bằng cách chuyển thẳng
 * TIỀN CỌC BẢO ĐẢM TÀI SẢN & NỘI THẤT của căn qua VietQR. Nguồn duy nhất của số tiền (server tính, CẤM nhận từ client):
 * `units.security_deposit` do chủ nhà đặt (trong khoảng deposit-policy của Admin); chưa đặt ⇒ bằng 1 tháng tiền thuê.
 * Khi ký Hợp đồng thuê, khoản này chuyển 100% thành Tiền cọc bảo đảm (không thu bù, không trừ tiền thuê tháng đầu).
 */
export interface DepositUnit {
  securityDeposit?: unknown;
  baseRentPrice?: unknown;
}

const vnd = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function securityDepositAmount(unit: DepositUnit | null | undefined): number {
  return vnd(unit?.securityDeposit) ?? vnd(unit?.baseRentPrice) ?? 0;
}
