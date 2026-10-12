/** Tài khoản thụ hưởng của chủ nhà: số TK lưu mã hoá, chỉ trả ra API dạng che (Nghị định 13/2023). */
export interface PayoutAccountView {
  bankName: string;
  bankAccountMasked: string;
  bankAccountHolder: string;
}

export const PAYOUT_ACCOUNT_PATTERN = /^\d{6,20}$/;

/** `19036...6789` ⇒ `190****6789`; quá ngắn thì chỉ giữ 2 số cuối. */
export function maskBankAccount(account: string): string {
  if (account.length <= 7) return `****${account.slice(-2)}`;
  return `${account.slice(0, 3)}****${account.slice(-4)}`;
}

/** Dựng bản che từ bộ 3 trường đã lưu; thiếu trường hoặc giải mã lỗi ⇒ null (không làm hỏng màn hình). */
export function toPayoutView(
  row: { bankName?: string | null; accountEnc?: string | null; holder?: string | null },
  decrypt: (enc: string) => string,
): PayoutAccountView | null {
  if (!row.bankName || !row.accountEnc || !row.holder) return null;
  try {
    return { bankName: row.bankName, bankAccountMasked: maskBankAccount(decrypt(row.accountEnc)), bankAccountHolder: row.holder };
  } catch {
    return null;
  }
}
