import { generateOtpCode, hashOtpCode, otpHashesEqual } from './otp-crypto';

describe('otp-crypto', () => {
  it('sinh mã 4 chữ số có đệm số 0', () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{4}$/);
  });

  it('hash ổn định với cùng pepper, khác nhau với pepper khác', () => {
    expect(hashOtpCode('1234', 'pepper')).toBe(hashOtpCode('1234', 'pepper'));
    expect(hashOtpCode('1234', 'pepper-a')).not.toBe(hashOtpCode('1234', 'pepper-b'));
  });

  it('otpHashesEqual khớp hash bằng nhau và loại hash khác', () => {
    const hash = hashOtpCode('1234', 'pepper');
    expect(otpHashesEqual(hash, hashOtpCode('1234', 'pepper'))).toBe(true);
    expect(otpHashesEqual(hash, hashOtpCode('9999', 'pepper'))).toBe(false);
    expect(otpHashesEqual(hash, 'abcd')).toBe(false);
  });
});

describe('containsValue (hàm kiểm "không lộ mã" của test)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { containsValue } = require('../testing/contains-value');
  it('bắt mã nằm ở bất kỳ độ sâu nào, kể cả dạng số', () => {
    expect(containsValue({ a: { b: ['x', '1234'] } }, '1234')).toBe(true);
    expect(containsValue({ code: 1234 }, '1234')).toBe(true);
  });
  it('KHÔNG báo nhầm khi mã chỉ là chuỗi con của hash/uuid/timestamp (nguồn gốc test chập chờn)', () => {
    expect(containsValue({ codeHash: 'ab12340f', id: '0a1234bc-…', createdAt: new Date('2026-01-01'), ts: '2026-10-13T16:09:51Z' }, '1234')).toBe(false);
    expect(containsValue({ ts: '2026-10-13T16:09:51Z' }, '2026')).toBe(false);
  });
});
