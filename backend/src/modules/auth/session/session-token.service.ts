import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Portal, PORTALS, sessionTtlByPortal } from '../auth.constants';

/** `iss` của JWT phiên do backend ký. */
export const SESSION_TOKEN_ISSUER = 'vinstay-backend';

export interface SessionTokenClaims {
  /** Id Profile. */
  sub: string;
  email?: string;
  /** Cổng đã đăng nhập. AuthSessionService bắt buộc khớp cổng của vai trò hiện tại trong DB. */
  portal: Portal;
}

/**
 * JWT phiên do chính backend ký, dùng cho mọi cách đăng nhập (email + mật khẩu, Google). Token chỉ chứa
 * id + email + cổng; vai trò/trạng thái khoá luôn đọc lại từ DB ở AuthSessionService.
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

  sign(profileId: string, email: string, portal: Portal): { accessToken: string; expiresIn: number } {
    const expiresIn = this.ttl[portal];
    const accessToken = this.jwt.sign({ sub: profileId, email, portal }, { expiresIn });
    return { accessToken, expiresIn };
  }

  /** null nếu sai chữ ký, sai issuer (vd. JWT Supabase của phiên cũ), hết hạn hoặc thiếu/sai claim `portal` (token cũ). */
  verify(token: string): SessionTokenClaims | null {
    try {
      const claims = this.jwt.verify<SessionTokenClaims>(token);
      return typeof claims?.sub === 'string' && PORTALS.includes(claims.portal) ? claims : null;
    } catch {
      return null;
    }
  }
}
