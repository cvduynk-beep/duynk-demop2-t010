import { Portal } from './auth.constants';

/**
 * Tài khoản demo do `npm run seed:auth -- --demo` tạo trong DB. Không có đường đăng nhập riêng: dùng form đăng nhập
 * bình thường bằng email + mật khẩu (`DEMO_PASSWORD`).
 */
export const DEMO_ACCOUNTS: Record<Portal, { email: string; fullName: string }> = {
  tenant: { email: 'khachthue.demo@vinstay.vn', fullName: 'Khách thuê Demo' },
  landlord: { email: 'chunha.oceanpark@vinstay.vn', fullName: 'Chủ nhà Demo' },
  host: { email: 'host.oceanpark@vinstay.vn', fullName: 'Field Host Demo' },
  admin: { email: 'admin@vinstay.vn', fullName: 'Admin Demo' },
};

export const DEFAULT_DEMO_PASSWORD = 'vinstay-demo-pass';
export const DEMO_HOST_RFID = 'RFID-DEMO-0001';

