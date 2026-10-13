/** Luật họ tên dùng chung FE (server kiểm lại): 2–100 ký tự. Trả câu lỗi hoặc null. */
export function validateFullName(fullName: string): string | null {
  const v = fullName.trim().replace(/\s+/g, " ");
  return v.length < 2 || v.length > 100 ? "Họ tên phải từ 2 đến 100 ký tự." : null;
}
