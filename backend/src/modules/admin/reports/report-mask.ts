/** Che PII trong báo cáo (màn hình lẫn file xuất): báo cáo chỉ cần nhận diện, không cần thông tin liên lạc đầy đủ. */

/** "Nguyễn Văn An" ⇒ "Nguyễn V. A." — giữ họ, các phần sau chỉ còn chữ cái đầu. */
export function maskName(name: string | null | undefined): string | null {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return `${[...parts[0]][0]}.`;
  return [parts[0], ...parts.slice(1).map((p) => `${[...p][0].toUpperCase()}.`)].join(' ');
}

/** "0912345678" ⇒ "09•• ••• 678" (cùng dạng che SĐT của cổng Host / điều phối). */
export function maskPhone(local: string | null | undefined): string | null {
  const digits = (local ?? '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  return `${digits.slice(0, 2)}•• ••• ${digits.slice(-3)}`;
}
