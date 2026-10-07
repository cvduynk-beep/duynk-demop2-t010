import { Portal, PORTAL_ROLE } from './auth.constants';
import { AuthenticatedUser } from './session/authenticated-user';

/**
 * Tài khoản demo (1-click ở màn hình đăng nhập). Chỉ tồn tại khi chạy `npm run seed:auth` và chỉ
 * đăng nhập được khi AUTH_DEMO_MODE=true — bản chất vẫn là đăng nhập thật bằng email + mật khẩu.
 */
export const DEMO_ACCOUNTS: Record<Portal, { email: string; fullName: string }> = {
  tenant: { email: 'khachthue.demo@vinstay.vn', fullName: 'Khách thuê Demo' },
  landlord: { email: 'chunha.oceanpark@vinstay.vn', fullName: 'Chủ nhà Demo' },
  host: { email: 'host.oceanpark@vinstay.vn', fullName: 'Field Host Demo' },
  admin: { email: 'admin@vinstay.vn', fullName: 'Admin Demo' },
};

export const DEFAULT_DEMO_PASSWORD = 'vinstay-demo-pass';
export const DEMO_HOST_RFID = 'RFID-DEMO-0001';

export const DEMO_USERS: Record<Portal, AuthenticatedUser> = {
  tenant: {
    id: '290d0228-7480-4aa1-82ae-b8f9ba479f65',
    email: 'khachthue.demo@vinstay.vn',
    fullName: 'Khách thuê Demo',
    role: PORTAL_ROLE.tenant,
    portal: 'tenant',
    isPhoneVerified: true,
    isHostVerified: false,
  },
  landlord: {
    id: 'c4408e21-5c78-4eef-8a44-b3a18904b308',
    email: 'chunha.oceanpark@vinstay.vn',
    fullName: 'Chủ nhà Demo',
    role: PORTAL_ROLE.landlord,
    portal: 'landlord',
    isPhoneVerified: true,
    isHostVerified: false,
  },
  host: {
    id: '4ee066da-6ebd-453f-bdb5-8648a0986f3f',
    email: 'host.oceanpark@vinstay.vn',
    fullName: 'Field Host Demo',
    role: PORTAL_ROLE.host,
    portal: 'host',
    isPhoneVerified: true,
    isHostVerified: true,
  },
  admin: {
    id: 'b151c2f1-aceb-452d-a1c0-7de52937fc88',
    email: 'admin@vinstay.vn',
    fullName: 'Admin Demo',
    role: PORTAL_ROLE.admin,
    portal: 'admin',
    isPhoneVerified: true,
    isHostVerified: false,
  },
};

