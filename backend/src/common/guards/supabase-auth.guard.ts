import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { HOST_ROLES_KEY } from '../decorators/host-roles.decorator';
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
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: AuthSessionService,
    private readonly cookies: SessionCookieService,
  ) {}

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
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
    // `@HostRoles(...)` đứng một mình ngầm hiểu là chỉ Field Host (xem RolesGuard).
    const hostRoles = this.reflector.getAllAndOverride<string[]>(HOST_ROLES_KEY, targets);
    const required = roles.length ? roles : hostRoles?.length ? ['field_host'] : [];
    const present = this.cookies.portalsWithCookie(request as never);
    // FE nói rõ đang ở cổng nào ⇒ chỉ cookie của cổng đó (không có ⇒ 401).
    if (isPortal(header)) return present.includes(header) ? header : undefined;
    // Ưu tiên cổng của @Roles; không có thì vẫn xác thực bằng cookie khác để RolesGuard trả 403 (đã đăng nhập, sai vai)
    // thay vì 401. An toàn vì token luôn bị kiểm claim `portal` theo đúng cookie chứa nó.
    const preferred = required.length ? present.filter((p) => required.some((role) => portalForRole(role) === p)) : [];
    return preferred[0] ?? present[0];
  }
}
