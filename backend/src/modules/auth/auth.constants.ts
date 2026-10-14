/**
 * "Portal" là cổng đăng nhập ở FE (4 màn hình), còn "role" là mã vai trò trong bảng `roles`
 * (SAD v2 §9). Portal `host` ↔ role `field_host`, portal `admin` ↔ role `ops_admin`.
 */
export const PORTALS = ['tenant', 'landlord', 'host', 'admin'] as const;
export type Portal = (typeof PORTALS)[number];

export const PORTAL_ROLE: Record<Portal, string> = {
  tenant: 'tenant',
  landlord: 'landlord',
  host: 'field_host',
  admin: 'ops_admin',
};

export const ROLE_PORTAL: Record<string, Portal> = Object.fromEntries(
  Object.entries(PORTAL_ROLE).map(([portal, role]) => [role, portal as Portal]),
);

export const ROLE_NAMES: Record<string, string> = {
  tenant: 'Khách thuê',
  landlord: 'Chủ nhà',
  field_host: 'Field Host',
  ops_admin: 'Ops Admin',
};

export function portalForRole(role?: string | null): Portal | null {
  return (role && ROLE_PORTAL[role]) || null;
}

/** Trang đích (đường dẫn FE) sau khi đăng nhập thành công ở từng cổng. */
export const PORTAL_HOME: Record<Portal, string> = {
  tenant: '/',
  landlord: '/landlord/dashboard',
  host: '/host/dispatch',
  admin: '/admin/dashboard',
};

/** Host và Admin dùng chung màn hình đăng nhập nội bộ. */
export function loginPathForPortal(portal: Portal): string {
  return portal === 'host' || portal === 'admin' ? '/admin/login' : '/login';
}

export function isPortal(value: unknown): value is Portal {
  return typeof value === 'string' && (PORTALS as readonly string[]).includes(value);
}

/**
 * Cookie phiên (httpOnly) RIÊNG từng cổng: `vs_access_<portal>` = JWT do backend ký (SessionTokenService) mang claim
 * `portal`. Mỗi cổng chỉ set/đọc cookie của mình ⇒ đăng nhập nhiều cổng cùng trình duyệt không ghi đè nhau.
 */
export const ACCESS_COOKIE_PREFIX = 'vs_access_';
export const accessCookieName = (portal: Portal) => `${ACCESS_COOKIE_PREFIX}${portal}`;
/** Cookie phiên dùng chung của bản cũ. Không còn đọc; chỉ xoá khi đăng nhập/đăng xuất để dọn trình duyệt. */
export const LEGACY_ACCESS_COOKIE = 'vs_access';
/** Cookie của phiên cũ (Supabase refresh token). Không còn dùng; chỉ xoá khi gặp để dọn trình duyệt. */
export const LEGACY_REFRESH_COOKIE = 'vs_refresh';
/**
 * Cookie KHÔNG httpOnly để màn đăng nhập hiện "Tiếp tục bằng tên …" cho tài khoản Google đã dùng trên thiết bị này.
 * Chỉ chứa tên + email của chính người dùng; không phải thông tin phiên, đăng xuất không xoá.
 */
export const GOOGLE_HINT_COOKIE = 'vs_google_hint';
export const GOOGLE_HINT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
/** Cookie tạm giữ nonce chống CSRF (khớp với `state`) trong lúc đi vòng qua Google. */
export const OAUTH_COOKIE = 'vs_oauth';

/** Phiên mặc định sống 7 ngày; hết hạn thì đăng nhập lại (không có refresh token). Env: `SESSION_TTL_SECONDS`. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Phiên Admin ngắn hơn (8 giờ — một ca làm việc) vì quyền rộng nhất. Env: `SESSION_TTL_ADMIN_SECONDS`. */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Số giây phiên sống theo cổng; giá trị env không phải số nguyên dương ⇒ dùng mặc định. */
export function sessionTtlByPortal(env: { get(key: string): string | undefined }): Record<Portal, number> {
  const seconds = (key: string, fallback: number) => {
    const value = Number(env.get(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  const standard = seconds('SESSION_TTL_SECONDS', SESSION_TTL_SECONDS);
  return { tenant: standard, landlord: standard, host: standard, admin: seconds('SESSION_TTL_ADMIN_SECONDS', ADMIN_SESSION_TTL_SECONDS) };
}

/** Khoá đăng nhập theo email sau nhiều lần sai mật khẩu liên tiếp (chống dò mật khẩu phân tán nhiều IP). */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCKOUT_SECONDS = 15 * 60;

export const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
