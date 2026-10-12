import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { authError } from '../../modules/auth/auth.errors';
import { isPortal, Portal, portalForRole } from '../../modules/auth/auth.constants';
import { AuthSessionService } from '../../modules/auth/session/auth-session.service';
import { SessionCookieService } from '../../modules/auth/session/session-cookies.service';

/**
 * Xác thực mọi route không đánh dấu @Public(): lấy access token từ `Authorization: Bearer` hoặc cookie RIÊNG của một
 * cổng (`vs_access_<portal>`), kiểm tra JWT do backend ký (claim `portal` phải trùng cổng của cookie), nạp vai trò từ
 * DB và gắn `request.user`.
 *
 * Trình duyệt có thể đang đăng nhập nhiều cổng cùng lúc ⇒ chọn cookie theo thứ tự: header `x-portal` (FE gửi theo
 * trang đang mở, chỉ cookie cổng đó) → cookie của cổng thuộc `@Roles(...)` → cookie đầu tiên có. Không bao giờ dùng token của
 * cổng này cho cookie của cổng khác.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly demoMode: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: AuthSessionService,
    private readonly cookies: SessionCookieService,
    config: ConfigService,
  ) {
    // Header x-demo-role bỏ qua xác thực hoàn toàn — chỉ tồn tại khi bật tường minh và không phải production.
    this.demoMode = config.get('AUTH_DEMO_MODE') === 'true' && config.get('NODE_ENV') !== 'production';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const bearer = this.cookies.readBearer(request);
    const portal = bearer ? undefined : this.pickPortal(context, request);
    const token = bearer ?? (portal ? this.cookies.readAccessToken(request, portal) : undefined);

    if (!token) {
      const demoRole = this.demoMode ? request.headers['x-demo-role'] : undefined;
      if (demoRole) {
        request.user = {
          id: request.headers['x-demo-userid'] || '00000000-0000-0000-0000-000000000001',
          email: `${demoRole}@vinstay.ai`,
          fullName: 'Demo User',
          role: demoRole,
          portal: portalForRole(demoRole),
          isPhoneVerified: true,
          isHostVerified: true,
        };
        return true;
      }
      throw authError('unauthorized');
    }

    const user = await this.sessions.authenticate(token, portal);
    if (!user) throw authError('unauthorized');
    request.user = user;
    return true;
  }

  /** Cổng có cookie phiên được dùng cho request này; undefined = không có cookie phù hợp. */
  private pickPortal(context: ExecutionContext, request: { headers?: Record<string, unknown>; cookies?: Record<string, string> }): Portal | undefined {
    const header = request.headers?.['x-portal'];
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const present = this.cookies.portalsWithCookie(request as never);
    // FE nói rõ đang ở cổng nào ⇒ chỉ cookie của cổng đó (không có ⇒ 401).
    if (isPortal(header)) return present.includes(header) ? header : undefined;
    // Ưu tiên cổng của @Roles; không có thì vẫn xác thực bằng cookie khác để RolesGuard trả 403 (đã đăng nhập, sai vai)
    // thay vì 401. An toàn vì token luôn bị kiểm claim `portal` theo đúng cookie chứa nó.
    const preferred = roles?.length ? present.filter((p) => roles.some((role) => portalForRole(role) === p)) : [];
    return preferred[0] ?? present[0];
  }
}
