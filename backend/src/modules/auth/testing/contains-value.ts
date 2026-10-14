/**
 * Có giá trị nào (ở bất kỳ độ sâu nào) BẰNG `needle` không — dùng để kiểm "không lưu / không trả mã OTP".
 * KHÔNG dùng `JSON.stringify(x).includes(code)`: mã 4 chữ số ngẫu nhiên vô tình là chuỗi con của hash hex / uuid /
 * timestamp (đo được ≈0,17% mỗi lần) ⇒ test chập chờn dù code đúng.
 */
export function containsValue(value: unknown, needle: string, seen = new Set<unknown>()): boolean {
  if (value === needle) return true;
  if (typeof value === 'number' && String(value) === needle) return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (value instanceof Date) return false;
  return Object.values(value as Record<string, unknown>).some((v) => containsValue(v, needle, seen));
}
