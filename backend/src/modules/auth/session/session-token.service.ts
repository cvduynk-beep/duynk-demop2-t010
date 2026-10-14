import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isPortal, Portal, sessionTtlByPortal } from '../auth.constants';

/** `iss` của JWT phiên do backend ký. */
export const SESSION_TOKEN_ISSUER = 'vinstay-backend';

export interface SessionTokenClaims {
  /** Id Profile. */
  sub: string;
  email?: string;
  /** Mã vai trò lúc đăng nhập (chỉ để tham khảo — vai trò hiện hành luôn đọc lại từ DB). */
  role?: string;
  /** Cổng đã đăng nhập = cookie `vs_access_<portal>` chứa token này. AuthSessionService bắt buộc khớp. */
  portal: Portal;
}

/**
 * JWT phiên do chính backend ký, dùng cho mọi cách đăng nhập (email + mật khẩu, Google). Claim: `sub`, `email`,
 * `role`, `portal`, `iat`, `exp`, `iss`. Vai trò/trạng thái khoá luôn đọc lại từ DB ở AuthSessionService.
 */
@Injectable()
export class SessionTokenService {
  private readonly ttl: Record<Portal, number>;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.ttl = sessionTtlByPortal(config);
  }

  sign(profileId: string, email: string, portal: Portal, role?: string | null): { accessToken: string; expiresIn: number } {
    const expiresIn = this.ttl[portal];
    const accessToken = this.jwt.sign({ sub: profileId, email, portal, ...(role ? { role } : {}) }, { expiresIn });
    return { accessToken, expiresIn };
  }

  /** null nếu sai chữ ký, sai issuer (vd. JWT Supabase cũ), hết hạn hoặc thiếu/sai claim `portal` (token bản cũ). */
  verify(token: string): SessionTokenClaims | null {
    try {
      const claims = this.jwt.verify<SessionTokenClaims>(token);
      return typeof claims?.sub === 'string' && isPortal(claims.portal) ? claims : null;
    } catch {
      return null;
    }
  }
}
