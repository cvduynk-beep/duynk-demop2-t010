import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import {
  accessCookieName,
  GOOGLE_HINT_COOKIE,
  GOOGLE_HINT_MAX_AGE_MS,
  LEGACY_ACCESS_COOKIE,
  LEGACY_REFRESH_COOKIE,
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_MS,
  Portal,
  PORTALS,
} from '../auth.constants';

export interface SessionTokens {
  accessToken: string;
  /** Số giây access token còn hiệu lực. */
  expiresIn: number;
}

/**
 * Cookie phiên httpOnly RIÊNG từng cổng (`vs_access_<portal>`). SameSite=Lax (Strict cho admin) cũng là lớp chống
 * CSRF cho POST/PUT/DELETE. Path `/` bắt buộc: proxy của Next chuyển tiếp cookie của trang (vd. /admin/dashboard)
 * lên backend. Không còn cookie dùng chung `vs_access` — chỉ xoá nó để dọn trình duyệt của bản cũ.
 */
@Injectable()
export class SessionCookieService {
  private readonly secure: boolean;
  private readonly domain?: string;

  constructor(config: ConfigService) {
    const explicit = config.get<string>('COOKIE_SECURE');
    this.secure = explicit ? explicit === 'true' : config.get('NODE_ENV') === 'production';
    this.domain = config.get<string>('COOKIE_DOMAIN') || undefined;
  }

  private base(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/', domain: this.domain };
  }

  /** Admin: Strict — không gửi cookie khi điều hướng từ site khác (Admin không đăng nhập Google nên không cần Lax). */
  private sessionOptions(portal: Portal): CookieOptions {
    return { ...this.base(), sameSite: portal === 'admin' ? 'strict' : 'lax' };
  }

  set(res: Response, tokens: SessionTokens, portal: Portal): void {
    res.cookie(accessCookieName(portal), tokens.accessToken, { ...this.sessionOptions(portal), maxAge: tokens.expiresIn * 1000 });
    this.clearLegacy(res);
  }

  /** Chỉ xoá cookie của đúng cổng `portal`; phiên các cổng khác giữ nguyên. */
  clear(res: Response, portal: Portal): void {
    res.clearCookie(accessCookieName(portal), this.sessionOptions(portal));
    this.clearLegacy(res);
  }

  private clearLegacy(res: Response): void {
    res.clearCookie(LEGACY_ACCESS_COOKIE, this.base());
    res.clearCookie(LEGACY_REFRESH_COOKIE, this.base());
  }

  /** Nhớ tài khoản Google vừa đăng nhập trên thiết bị này (FE đọc để hiện "Tiếp tục bằng tên …"). Không httpOnly có chủ đích. */
  setGoogleHint(res: Response, hint: { name: string | null; email: string }): void {
    res.cookie(GOOGLE_HINT_COOKIE, JSON.stringify({ name: hint.name, email: hint.email }), {
      ...this.base(),
      httpOnly: false,
      maxAge: GOOGLE_HINT_MAX_AGE_MS,
    });
  }

  setOAuthState(res: Response, value: string): void {
    res.cookie(OAUTH_COOKIE, value, { ...this.base(), maxAge: OAUTH_COOKIE_MAX_AGE_MS });
  }

  clearOAuthState(res: Response): void {
    res.clearCookie(OAUTH_COOKIE, this.base());
  }

  readOAuthState(req: Request): string | undefined {
    return req.cookies?.[OAUTH_COOKIE];
  }

  /** `Authorization: Bearer` (API client / Swagger) — token mang claim `portal` riêng. */
  readBearer(req: Request): string | undefined {
    const header = req.headers?.authorization;
    if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
    return header.slice(7).trim() || undefined;
  }

  /** Token của đúng cổng `portal`: Bearer ưu tiên, nếu không thì CHỈ cookie `vs_access_<portal>` (không rơi sang cổng khác). */
  readAccessToken(req: Request, portal: Portal): string | undefined {
    return this.readBearer(req) ?? req.cookies?.[accessCookieName(portal)];
  }

  /** Các cổng đang có cookie phiên trên request (theo thứ tự PORTALS). */
  portalsWithCookie(req: Request): Portal[] {
    return PORTALS.filter((portal) => Boolean(req.cookies?.[accessCookieName(portal)]));
  }
}
