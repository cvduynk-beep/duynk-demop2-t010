import { JwtService } from '@nestjs/jwt';
import { AuthAuditService } from './auth-audit.service';
import { ADMIN_SESSION_TTL_SECONDS, portalForRole, SESSION_TTL_SECONDS } from './auth.constants';
import { AuthException } from './auth.errors';
import { AuthService } from './auth.service';
import { GoogleIdentity } from './google/google.strategy';
import { LoginLockoutService } from './login-lockout.service';
import { hashPassword } from './password-hasher';
import { AuthSessionService } from './session/auth-session.service';
import { ProfileProvisioningService } from './session/profile-provisioning.service';
import { RoleIdService } from './session/role-ids.service';
import { fakeConfig } from './testing/fake-config';
import { createFakePrisma, seedProfile } from './testing/fake-prisma';
import { createSessionTokens } from './testing/fake-session-token';

const CTX = { ipAddress: '203.0.113.7', userAgent: 'jest' };
const JWT_SECRET = 'a-test-jwt-secret-of-at-least-32-chars';

function setup(env: Record<string, string> = {}) {
  const prisma = createFakePrisma();
  const sessionTokens = createSessionTokens(undefined, env);
  const sessions = new AuthSessionService(prisma as any, sessionTokens);
  const config = fakeConfig({ WEB_APP_URL: 'http://localhost:3000/', API_PREFIX: 'api/v1', ...env });
  const service = new AuthService(
    prisma as any,
    sessions,
    new ProfileProvisioningService(prisma as any, new RoleIdService(prisma as any)),
    new AuthAuditService(prisma as any),
    sessionTokens,
    config,
    new LoginLockoutService(config),
  );
  return { prisma, service, sessions, sessionTokens };
}

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'no-error';
  } catch (err) {
    return err instanceof AuthException ? err.code : `unexpected:${(err as Error).message}`;
  }
};

/** Seed một tài khoản đã có mật khẩu (băm scrypt thật) như sau khi đăng ký. */
const seedWithPassword = async (
  prisma: ReturnType<typeof createFakePrisma>,
  params: { email: string; roleCode: string; password: string; isActive?: boolean; withFieldHost?: boolean; hostRoles?: string[] },
) => seedProfile(prisma, { ...params, passwordHash: await hashPassword(params.password) });

describe('AuthService', () => {
  describe('login', () => {
    it('thành công: trả JWT backend cho controller đặt cookie, KHÔNG có token trong user', async () => {
      const { service, prisma, sessionTokens } = setup();
      const profile = await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'landlord', password: 'Matkhau-123' });

      const outcome = await service.login({ email: ' A@Example.com ', password: 'Matkhau-123', portal: 'landlord' }, CTX);

      expect(outcome.tokens.expiresIn).toBe(SESSION_TTL_SECONDS);
      expect(sessionTokens.verify(outcome.tokens.accessToken)).toMatchObject({ sub: profile.id, email: 'a@example.com' });
      expect('refreshToken' in outcome.tokens).toBe(false);
      expect(outcome.user).toMatchObject({ id: profile.id, role: 'landlord', portal: 'landlord', email: 'a@example.com' });
      expect(JSON.stringify(outcome.user)).not.toContain(outcome.tokens.accessToken);
      expect(JSON.stringify(outcome.user)).not.toContain('scrypt$');
      expect(prisma.authAuditLog.rows.map((r: any) => r.event)).toContain('login_succeeded');
    });

    it('sai mật khẩu → invalid_credentials + audit login_failed, không tạo/đổi gì', async () => {
      const { service, prisma } = setup();
      await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Matkhau-123' });

      expect(await codeOf(service.login({ email: 'a@example.com', password: 'sai-mat-khau', portal: 'tenant' }, CTX))).toBe('invalid_credentials');
      expect(prisma.authAuditLog.rows.map((r: any) => r.event)).toEqual(['login_failed']);
      expect(prisma.profile.rows).toHaveLength(1);
    });

    it('email không tồn tại → invalid_credentials (giống sai mật khẩu, không lộ email nào có tài khoản) + audit login_failed', async () => {
      const { service, prisma } = setup();
      expect(await codeOf(service.login({ email: 'khong-co@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX))).toBe('invalid_credentials');
      expect(prisma.authAuditLog.rows.map((r: any) => r.event)).toEqual(['login_failed']);
      expect(prisma.profile.rows).toHaveLength(0);
    });

    it('tài khoản Google chưa có mật khẩu → invalid_credentials như sai mật khẩu (không lộ email có tài khoản); lý do chỉ ở audit', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'g@example.com', roleCode: 'tenant' });

      expect(await codeOf(service.login({ email: 'g@example.com', password: 'bat-ky-123', portal: 'tenant' }, CTX))).toBe('invalid_credentials');
      const failed = prisma.authAuditLog.rows.find((r: any) => r.event === 'login_failed');
      expect(failed.metadata).toMatchObject({ portal: 'tenant', method: 'password', reason: 'password_not_set' });
    });

    it('đúng mật khẩu nhưng sai cổng → wrong_portal, ghi login_rejected, không phát token', async () => {
      const { service, prisma } = setup();
      await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Matkhau-123' });

      expect(await codeOf(service.login({ email: 'a@example.com', password: 'Matkhau-123', portal: 'landlord' }, CTX))).toBe('wrong_portal');
      const rejected = prisma.authAuditLog.rows.find((r: any) => r.event === 'login_rejected');
      expect(rejected.metadata).toMatchObject({ portal: 'landlord', method: 'password', reason: 'wrong_portal' });
    });

    it('tài khoản bị khoá → account_suspended', async () => {
      const { service, prisma } = setup();
      await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Matkhau-123', isActive: false });
      expect(await codeOf(service.login({ email: 'a@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX))).toBe('account_suspended');
    });

    it('JWT mang claim portal của cổng đăng nhập; Admin sống ADMIN_SESSION_TTL_SECONDS (ngắn hơn cổng khác)', async () => {
      const { service, prisma, sessionTokens } = setup();
      await seedWithPassword(prisma, { email: 'ad@example.com', roleCode: 'ops_admin', password: 'Matkhau-123' });
      await seedWithPassword(prisma, { email: 't@example.com', roleCode: 'tenant', password: 'Matkhau-123' });

      const admin = await service.login({ email: 'ad@example.com', password: 'Matkhau-123', portal: 'admin' }, CTX);
      const tenant = await service.login({ email: 't@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX);

      expect(sessionTokens.verify(admin.tokens.accessToken)).toMatchObject({ portal: 'admin' });
      expect(sessionTokens.verify(tenant.tokens.accessToken)).toMatchObject({ portal: 'tenant' });
      expect(admin.tokens.expiresIn).toBe(ADMIN_SESSION_TTL_SECONDS);
      expect(tenant.tokens.expiresIn).toBe(SESSION_TTL_SECONDS);
      expect(ADMIN_SESSION_TTL_SECONDS).toBeLessThan(SESSION_TTL_SECONDS);
    });

    it('TTL đọc từ env SESSION_TTL_SECONDS / SESSION_TTL_ADMIN_SECONDS; giá trị rác ⇒ mặc định', async () => {
      const custom = setup({ SESSION_TTL_SECONDS: '3600', SESSION_TTL_ADMIN_SECONDS: '600' });
      await seedWithPassword(custom.prisma, { email: 'ad@example.com', roleCode: 'ops_admin', password: 'Matkhau-123' });
      await seedWithPassword(custom.prisma, { email: 'l@example.com', roleCode: 'landlord', password: 'Matkhau-123' });
      expect((await custom.service.login({ email: 'ad@example.com', password: 'Matkhau-123', portal: 'admin' }, CTX)).tokens.expiresIn).toBe(600);
      expect((await custom.service.login({ email: 'l@example.com', password: 'Matkhau-123', portal: 'landlord' }, CTX)).tokens.expiresIn).toBe(3600);

      const junk = setup({ SESSION_TTL_SECONDS: 'abc', SESSION_TTL_ADMIN_SECONDS: '-5' });
      await seedWithPassword(junk.prisma, { email: 'ad@example.com', roleCode: 'ops_admin', password: 'Matkhau-123' });
      expect((await junk.service.login({ email: 'ad@example.com', password: 'Matkhau-123', portal: 'admin' }, CTX)).tokens.expiresIn).toBe(ADMIN_SESSION_TTL_SECONDS);
    });

    describe('khoá theo email sau nhiều lần sai', () => {
      afterEach(() => jest.restoreAllMocks());

      const failTimes = async (service: AuthService, email: string, n: number) => {
        const codes: string[] = [];
        for (let i = 0; i < n; i++) codes.push(await codeOf(service.login({ email, password: 'sai-mat-khau', portal: 'tenant' }, CTX)));
        return codes;
      };

      it('sai 5 lần ⇒ lần 6 trả login_locked (429) dù đúng mật khẩu, không kiểm tra mật khẩu, có retryAfterSeconds', async () => {
        const { service, prisma } = setup();
        await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Matkhau-123' });

        expect(await failTimes(service, 'a@example.com', 5)).toEqual(Array(5).fill('invalid_credentials'));
        prisma.profile.findUnique.mockClear();
        const err = await service.login({ email: ' A@example.com ', password: 'Matkhau-123', portal: 'tenant' }, CTX).catch((e) => e);
        expect(err).toBeInstanceOf(AuthException);
        expect(err.code).toBe('login_locked');
        expect(err.getStatus()).toBe(429);
        expect(err.getResponse().errors.retryAfterSeconds).toBeGreaterThan(0);
        expect(prisma.profile.findUnique).not.toHaveBeenCalled();
        expect(prisma.authAuditLog.rows.at(-1).metadata).toMatchObject({ reason: 'locked' });
      });

      it('email không tồn tại cũng bị khoá như email có thật (không lộ email nào có tài khoản)', async () => {
        const { service } = setup();
        expect(await failTimes(service, 'khong-co@example.com', 6)).toEqual([...Array(5).fill('invalid_credentials'), 'login_locked']);
      });

      it('khoá theo từng email: email khác vẫn đăng nhập được', async () => {
        const { service, prisma } = setup();
        await seedWithPassword(prisma, { email: 'b@example.com', roleCode: 'tenant', password: 'Matkhau-123' });
        await failTimes(service, 'a@example.com', 5);
        expect(await service.login({ email: 'b@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX)).toMatchObject({ user: { portal: 'tenant' } });
      });

      it('đăng nhập đúng trước ngưỡng ⇒ xoá bộ đếm', async () => {
        const { service, prisma } = setup();
        await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Matkhau-123' });
        await failTimes(service, 'a@example.com', 4);
        await service.login({ email: 'a@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX);
        expect(await failTimes(service, 'a@example.com', 4)).toEqual(Array(4).fill('invalid_credentials'));
      });

      it('hết LOGIN_LOCKOUT_SECONDS ⇒ mở khoá; ngưỡng/thời gian chỉnh qua env', async () => {
        const { service, prisma } = setup({ LOGIN_MAX_FAILURES: '2', LOGIN_LOCKOUT_SECONDS: '60' });
        await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Matkhau-123' });
        const start = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(start);
        expect(await failTimes(service, 'a@example.com', 3)).toEqual(['invalid_credentials', 'invalid_credentials', 'login_locked']);

        jest.spyOn(Date, 'now').mockReturnValue(start + 59_000);
        expect(await codeOf(service.login({ email: 'a@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX))).toBe('login_locked');
        jest.spyOn(Date, 'now').mockReturnValue(start + 61_000);
        expect(await service.login({ email: 'a@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX)).toMatchObject({ user: { portal: 'tenant' } });
      });
    });

    it('Host có hồ sơ Field Host: đăng nhập thẳng, user mang hostRoles đúng thứ tự (sale trước)', async () => {
      const { service, prisma } = setup();
      await seedWithPassword(prisma, { email: 'h@example.com', roleCode: 'field_host', password: 'Matkhau-123', withFieldHost: true, hostRoles: ['INSPECTOR', 'SALE'] });
      const outcome = await service.login({ email: 'h@example.com', password: 'Matkhau-123', portal: 'host' }, CTX);
      expect(outcome.user).toMatchObject({ isHostVerified: true, hostRoles: ['sale', 'inspector'] });
      expect('needsRfidVerification' in outcome).toBe(false);
    });

    it('Profile field_host chưa có hồ sơ Field Host (vd. chỉnh role_id bằng tay) → host_not_provisioned, không tạo gì', async () => {
      const { service, prisma } = setup();
      await seedWithPassword(prisma, { email: 'h@example.com', roleCode: 'field_host', password: 'Matkhau-123' });
      expect(await codeOf(service.login({ email: 'h@example.com', password: 'Matkhau-123', portal: 'host' }, CTX))).toBe('host_not_provisioned');
      expect(prisma.fieldHost.rows).toHaveLength(0);
    });

    it('tenant đăng nhập cổng host → wrong_portal; Host khoá → account_suspended', async () => {
      const { service, prisma } = setup();
      await seedWithPassword(prisma, { email: 't@example.com', roleCode: 'tenant', password: 'Matkhau-123' });
      expect(await codeOf(service.login({ email: 't@example.com', password: 'Matkhau-123', portal: 'host' }, CTX))).toBe('wrong_portal');
      await seedWithPassword(prisma, { email: 'h@example.com', roleCode: 'field_host', password: 'Matkhau-123', withFieldHost: true, isActive: false });
      expect(await codeOf(service.login({ email: 'h@example.com', password: 'Matkhau-123', portal: 'host' }, CTX))).toBe('account_suspended');
    });
  });

  describe('signup', () => {
    it('admin không có đăng ký', async () => {
      const { service, prisma } = setup();
      expect(await codeOf(service.signup({ email: 'a@example.com', password: '12345678', fullName: 'A', portal: 'admin' }, CTX))).toBe('signup_not_allowed');
      expect(prisma.profile.rows).toHaveLength(0);
    });

    it('host không có đăng ký (Admin tạo) → signup_not_allowed, không tạo Profile', async () => {
      const { service, prisma } = setup();
      expect(await codeOf(service.signup({ email: 'x@example.com', password: '12345678', fullName: 'X', portal: 'host' }, CTX))).toBe('signup_not_allowed');
      expect(prisma.profile.rows).toHaveLength(0);
    });


    it('thành công: tạo Profile với passwordHash scrypt (không phải mật khẩu thô), đúng vai trò, fullName đã trim, trả token + user luôn', async () => {
      const { service, prisma, sessionTokens } = setup();
      const outcome = await service.signup({ email: ' A@Example.com ', password: 'Matkhau-123', fullName: ' An ', portal: 'landlord' }, CTX);

      const profile = prisma.profile.rows[0];
      expect(profile).toMatchObject({ email: 'a@example.com', fullName: 'An' });
      expect(profile.passwordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
      expect(profile.passwordHash).not.toBe('Matkhau-123');
      expect(prisma.role.rows.find((r: any) => r.id === profile.roleId).code).toBe('landlord');

      expect(outcome).toMatchObject({ user: { id: profile.id, portal: 'landlord', role: 'landlord', fullName: 'An' } });
      expect('needsEmailConfirmation' in outcome).toBe(false);
      expect(sessionTokens.verify(outcome.tokens.accessToken)).toMatchObject({ sub: profile.id, email: 'a@example.com' });
      expect(JSON.stringify(outcome.user)).not.toContain('scrypt$');
      expect(prisma.authAuditLog.rows.find((r: any) => r.event === 'login_succeeded').metadata).toMatchObject({ method: 'signup' });
    });

    it('đăng nhập lại được bằng đúng mật khẩu vừa đăng ký, sai mật khẩu thì không', async () => {
      const { service } = setup();
      await service.signup({ email: 'a@example.com', password: 'Matkhau-123', fullName: 'An', portal: 'tenant' }, CTX);

      expect(await service.login({ email: 'a@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX)).toMatchObject({ user: { portal: 'tenant' } });
      expect(await codeOf(service.login({ email: 'a@example.com', password: 'Matkhau-124', portal: 'tenant' }, CTX))).toBe('invalid_credentials');
    });


    it('email đã có Profile có mật khẩu → email_already_registered, mật khẩu cũ giữ nguyên', async () => {
      const { service, prisma } = setup();
      const profile = await seedWithPassword(prisma, { email: 'a@example.com', roleCode: 'tenant', password: 'Mat-khau-cu-1' });
      const before = profile.passwordHash;

      expect(await codeOf(service.signup({ email: 'A@example.com', password: 'Mat-khau-moi-2', fullName: 'Kẻ lạ', portal: 'tenant' }, CTX))).toBe('email_already_registered');
      expect(prisma.profile.rows).toHaveLength(1);
      expect(prisma.profile.rows[0].passwordHash).toBe(before);
      expect(await service.login({ email: 'a@example.com', password: 'Mat-khau-cu-1', portal: 'tenant' }, CTX)).toMatchObject({ user: { id: profile.id } });
    });

    it('email đã có Profile Google (không có passwordHash) → email_already_registered, KHÔNG gắn mật khẩu (chống chiếm tài khoản)', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'g@example.com', roleCode: 'tenant' });

      expect(await codeOf(service.signup({ email: 'g@example.com', password: 'Mat-khau-moi-2', fullName: 'Kẻ lạ', portal: 'tenant' }, CTX))).toBe('email_already_registered');
      expect(prisma.profile.rows[0].passwordHash).toBeNull();
      expect(await codeOf(service.login({ email: 'g@example.com', password: 'Mat-khau-moi-2', portal: 'tenant' }, CTX))).toBe('invalid_credentials');
    });

    it('đăng ký đồng thời hai lần cùng email: chỉ một Profile, không 500', async () => {
      const { service, prisma } = setup();
      const dto = { email: 'a@example.com', password: 'Matkhau-123', fullName: 'An', portal: 'tenant' as const };
      const codes = await Promise.all([codeOf(service.signup(dto, CTX)), codeOf(service.signup(dto, CTX))]);

      expect(prisma.profile.rows).toHaveLength(1);
      expect(codes.every((c) => c === 'no-error' || c === 'email_already_registered' || c === 'account_conflict')).toBe(true);
    });
  });

  describe.skip('demoLogin', () => {
    it('tắt mặc định → demo_disabled', async () => {
      const { service } = setup();
      expect(await codeOf((service as any).demoLogin('tenant', CTX))).toBe('demo_disabled');
    });

    it('không bao giờ bật ở production dù có cờ', async () => {
      const { service } = setup({ AUTH_DEMO_MODE: 'true', NODE_ENV: 'production' });
      expect(await codeOf((service as any).demoLogin('tenant', CTX))).toBe('demo_disabled');
    });

    it('bật → đăng nhập thật (qua login) bằng tài khoản demo đã seed', async () => {
      const { service, prisma } = setup({ AUTH_DEMO_MODE: 'true', DEMO_PASSWORD: 'demo-pw' });
      await seedWithPassword(prisma, { email: 'khachthue.demo@vinstay.vn', roleCode: 'tenant', password: 'demo-pw' });

      const outcome = await (service as any).demoLogin('tenant', CTX);
      expect(outcome.user).toMatchObject({ portal: 'tenant', email: 'khachthue.demo@vinstay.vn' });
      expect(prisma.authAuditLog.rows.find((r: any) => r.event === 'login_succeeded').metadata).toMatchObject({ method: 'password' });
    });

    it('bật nhưng chưa seed tài khoản demo (hoặc sai DEMO_PASSWORD) → invalid_credentials', async () => {
      const { service } = setup({ AUTH_DEMO_MODE: 'true', DEMO_PASSWORD: 'demo-pw' });
      expect(await codeOf((service as any).demoLogin('tenant', CTX))).toBe('invalid_credentials');
    });
  });

  describe('Google (Passport)', () => {
    const google = (overrides: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
      googleId: 'g-1',
      email: 'g@example.com',
      emailVerified: true,
      fullName: 'Nguyễn Văn An',
      ...overrides,
    });
    /** Mô phỏng vòng đi–về: nonce nằm trong cookie, state đi qua Google rồi quay lại query. */
    const roundTrip = (service: AuthService, portal: 'tenant' | 'landlord' | 'host' = 'tenant') => {
      const { state, nonce } = service.beginGoogle(portal);
      return { state, nonce };
    };

    it('state = <portal>.<nonce>, mỗi lần bắt đầu dùng nonce khác nhau', () => {
      const { service } = setup();
      const a = service.beginGoogle('host');
      expect(a.state).toBe(`host.${a.nonce}`);
      expect(service.beginGoogle('host').nonce).not.toBe(a.nonce);
    });

    it('portal không hợp lệ → invalid_request; admin không đăng nhập được bằng Google', () => {
      const { service } = setup();
      expect(() => service.beginGoogle('root')).toThrow(expect.objectContaining({ code: 'invalid_request' }));
      expect(() => service.beginGoogle(undefined)).toThrow(expect.objectContaining({ code: 'invalid_request' }));
      expect(() => service.beginGoogle('admin')).toThrow(expect.objectContaining({ code: 'signup_not_allowed' }));
    });

    it('thiếu/sai state hoặc nonce không khớp cookie → về màn đăng nhập tenant với oauth_failed', async () => {
      const { service } = setup();
      const { state, nonce } = roundTrip(service, 'host');
      const tenantFailure = { ok: false, redirectUrl: 'http://localhost:3000/login?error=oauth_failed&tab=tenant' };

      expect(await service.completeGoogle({ identity: google(), state: undefined, nonce }, CTX)).toEqual(tenantFailure);
      expect(await service.completeGoogle({ identity: google(), state, nonce: undefined }, CTX)).toEqual(tenantFailure);
      expect(await service.completeGoogle({ identity: google(), state: 'garbage', nonce }, CTX)).toEqual(tenantFailure);
      expect(await service.completeGoogle({ identity: google(), state, nonce: 'khac-nonce-hoan-toan' }, CTX)).toEqual(tenantFailure);
    });

    it('state mang cổng admin (dù nonce đúng) → bị từ chối, không tạo Profile', async () => {
      const { service, prisma } = setup();
      const nonce = 'nonce-hop-le-nhung-portal-admin';
      expect(await service.completeGoogle({ identity: google(), state: `admin.${nonce}`, nonce }, CTX)).toEqual({
        ok: false,
        redirectUrl: 'http://localhost:3000/admin/login?error=oauth_failed&tab=admin',
      });
      expect(prisma.profile.rows).toHaveLength(0);
    });

    it('Google không trả hồ sơ (người dùng từ chối / code sai) → oauth_failed đúng màn của cổng', async () => {
      const { service } = setup();
      const { state, nonce } = roundTrip(service, 'host');
      expect(await service.completeGoogle({ identity: null, state, nonce }, CTX)).toEqual({
        ok: false,
        redirectUrl: 'http://localhost:3000/admin/login?error=oauth_failed&tab=host',
      });
    });

    it('email Google chưa xác minh → email_not_verified, không tạo Profile', async () => {
      const { service, prisma } = setup();
      const { state, nonce } = roundTrip(service);
      expect(await service.completeGoogle({ identity: google({ emailVerified: false }), state, nonce }, CTX)).toEqual({
        ok: false,
        redirectUrl: 'http://localhost:3000/login?error=email_not_verified&tab=tenant',
      });
      expect(prisma.profile.rows).toHaveLength(0);
    });

    it('lần đầu: tạo Profile, ký JWT phiên (không có refresh token), redirect trang chủ cổng', async () => {
      const { service, prisma, sessionTokens } = setup();
      const { state, nonce } = roundTrip(service, 'landlord');

      const result = await service.completeGoogle({ identity: google(), state, nonce }, CTX);

      expect(result).toMatchObject({ ok: true, redirectUrl: 'http://localhost:3000/landlord/dashboard' });
      if (!result.ok) return;
      const profile = prisma.profile.rows[0];
      expect(profile).toMatchObject({ email: 'g@example.com', fullName: 'Nguyễn Văn An' });
      expect(result.outcome.user).toMatchObject({ id: profile.id, role: 'landlord', portal: 'landlord' });
      expect('refreshToken' in result.outcome.tokens).toBe(false);
      expect(result.outcome.tokens.expiresIn).toBe(SESSION_TTL_SECONDS);
      expect(sessionTokens.verify(result.outcome.tokens.accessToken)).toMatchObject({ sub: profile.id, email: 'g@example.com' });
      expect(prisma.authAuditLog.rows.find((r: any) => r.event === 'login_succeeded').metadata).toMatchObject({ method: 'google' });
    });

    it('email đã có Profile (vd. đăng ký mật khẩu trước) → dùng chung Profile, không tạo bản thứ hai', async () => {
      const { service, prisma, sessionTokens } = setup();
      const existing = seedProfile(prisma, { id: '00000000-0000-4000-8000-0000000000aa', email: 'g@example.com', roleCode: 'tenant' });
      const { state, nonce } = roundTrip(service);

      const result = await service.completeGoogle({ identity: google({ email: 'G@Example.com' }), state, nonce }, CTX);

      expect(result).toMatchObject({ ok: true, redirectUrl: 'http://localhost:3000/' });
      if (!result.ok) return;
      expect(prisma.profile.rows).toHaveLength(1);
      expect(sessionTokens.verify(result.outcome.tokens.accessToken)?.sub).toBe(existing.id);
    });

    it('Google chung Profile với tài khoản mật khẩu: không đổi passwordHash, mật khẩu cũ vẫn đăng nhập được', async () => {
      const { service, prisma } = setup();
      await service.signup({ email: 'g@example.com', password: 'Matkhau-123', fullName: 'An', portal: 'tenant' }, CTX);
      const before = prisma.profile.rows[0].passwordHash;
      const { state, nonce } = roundTrip(service);

      const result = await service.completeGoogle({ identity: google(), state, nonce }, CTX);

      expect(result.ok).toBe(true);
      expect(prisma.profile.rows).toHaveLength(1);
      expect(prisma.profile.rows[0].passwordHash).toBe(before);
      expect(await service.login({ email: 'g@example.com', password: 'Matkhau-123', portal: 'tenant' }, CTX)).toMatchObject({ user: { portal: 'tenant' } });
    });

    it('Google tạo Profile mới: không có passwordHash, nên đăng nhập mật khẩu báo invalid_credentials', async () => {
      const { service, prisma } = setup();
      const { state, nonce } = roundTrip(service);
      await service.completeGoogle({ identity: google(), state, nonce }, CTX);

      expect(prisma.profile.rows[0].passwordHash).toBeNull();
      expect(await codeOf(service.login({ email: 'g@example.com', password: 'bat-ky-123', portal: 'tenant' }, CTX))).toBe('invalid_credentials');
    });

    it('Host có hồ sơ Field Host chỉ vai Thẩm định → redirect /host/inspections', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'h@example.com', roleCode: 'field_host', withFieldHost: true, hostRoles: ['INSPECTOR'] });
      const { state, nonce } = roundTrip(service, 'host');

      const result = await service.completeGoogle({ identity: google({ email: 'h@example.com' }), state, nonce }, CTX);
      expect(result).toMatchObject({ ok: true, redirectUrl: 'http://localhost:3000/host/inspections' });
    });

    it('Host có cả hai vai → redirect /host/dispatch', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'h@example.com', roleCode: 'field_host', withFieldHost: true, hostRoles: ['SALE', 'INSPECTOR'] });
      const { state, nonce } = roundTrip(service, 'host');
      const result = await service.completeGoogle({ identity: google({ email: 'h@example.com' }), state, nonce }, CTX);
      expect(result).toMatchObject({ ok: true, redirectUrl: 'http://localhost:3000/host/dispatch' });
    });

    it('Profile field_host chưa có hồ sơ Field Host (lỗi chủ tịch gặp) → host_not_provisioned, không có phiên', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'h@example.com', roleCode: 'field_host' });
      const { state, nonce } = roundTrip(service, 'host');
      expect(await service.completeGoogle({ identity: google({ email: 'h@example.com' }), state, nonce }, CTX)).toEqual({
        ok: false,
        redirectUrl: 'http://localhost:3000/admin/login?error=host_not_provisioned&tab=host',
      });
    });

    it('Google cổng host với email chưa có tài khoản → not_authorized và KHÔNG tạo Profile (Host chỉ do Admin tạo)', async () => {
      const { service, prisma } = setup();
      const { state, nonce } = roundTrip(service, 'host');
      expect(await service.completeGoogle({ identity: google(), state, nonce }, CTX)).toEqual({
        ok: false,
        redirectUrl: 'http://localhost:3000/admin/login?error=not_authorized&tab=host',
      });
      expect(prisma.profile.rows).toHaveLength(0);
      expect(prisma.profile.create).not.toHaveBeenCalled();
    });

    it('sai cổng → redirect lỗi wrong_portal, không có phiên', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'g@example.com', roleCode: 'landlord' });
      const { state, nonce } = roundTrip(service, 'tenant');

      expect(await service.completeGoogle({ identity: google(), state, nonce }, CTX)).toEqual({
        ok: false,
        redirectUrl: 'http://localhost:3000/login?error=wrong_portal&tab=tenant',
      });
      expect(prisma.authAuditLog.rows.find((r: any) => r.event === 'login_rejected').metadata).toMatchObject({ reason: 'wrong_portal' });
    });

    it('tài khoản bị khoá → account_suspended', async () => {
      const { service, prisma } = setup();
      seedProfile(prisma, { email: 'g@example.com', roleCode: 'tenant', isActive: false });
      const { state, nonce } = roundTrip(service);
      expect(await service.completeGoogle({ identity: google(), state, nonce }, CTX)).toMatchObject({
        ok: false,
        redirectUrl: 'http://localhost:3000/login?error=account_suspended&tab=tenant',
      });
    });
  });

  describe('phiên do backend ký', () => {
    const signedIn = (ctx: ReturnType<typeof setup>, roleCode = 'tenant') => {
      const profile = seedProfile(ctx.prisma, { email: 'g@example.com', roleCode });
      return { profile, token: ctx.sessionTokens.sign(profile.id, 'g@example.com', portalForRole(roleCode)).accessToken };
    };
    const expiredToken = (sub: string) =>
      new JwtService({ secret: JWT_SECRET }).sign({ sub }, { issuer: 'vinstay-backend', expiresIn: -10 });

    it('authenticate: token backend hợp lệ → user lấy vai trò từ DB', async () => {
      const ctx = setup();
      const { profile, token } = signedIn(ctx, 'landlord');
      expect(await ctx.sessions.authenticate(token)).toMatchObject({ id: profile.id, role: 'landlord', portal: 'landlord' });
    });

    it('authenticate: Profile không tồn tại (bị xoá) → null', async () => {
      const ctx = setup();
      const { token } = signedIn(ctx);
      ctx.prisma.profile.rows.splice(0);
      expect(await ctx.sessions.authenticate(token)).toBeNull();
    });

    it('authenticate: Profile bị khoá → account_suspended', async () => {
      const ctx = setup();
      const { profile, token } = signedIn(ctx);
      ctx.prisma.profile.rows.find((r: any) => r.id === profile.id).isActive = false;
      expect(await codeOf(ctx.sessions.authenticate(token))).toBe('account_suspended');
    });

    it('authenticate: khóa khác / thiếu issuer / hết hạn / JWT kiểu Supabase / rác → null, không truy vấn DB', async () => {
      const ctx = setup();
      const profile = seedProfile(ctx.prisma, { email: 'g@example.com', roleCode: 'tenant' });
      const forged = createSessionTokens('another-secret-of-at-least-32-characters').sign(profile.id, 'g@example.com', 'tenant').accessToken;
      const noIssuer = new JwtService({ secret: JWT_SECRET }).sign({ sub: profile.id });
      const supabaseLike = new JwtService({ secret: JWT_SECRET }).sign({ sub: profile.id, aud: 'authenticated', role: 'authenticated' }, { issuer: 'https://x.supabase.co/auth/v1' });

      for (const token of [forged, noIssuer, expiredToken(profile.id), supabaseLike, 'not-a-jwt']) {
        expect(ctx.sessionTokens.verify(token)).toBeNull();
        expect(await ctx.sessions.authenticate(token)).toBeNull();
      }
      expect(ctx.prisma.profile.findUnique).not.toHaveBeenCalled();
    });

    it('authenticate: token của cổng A không dùng được khi vai trò thuộc cổng B (token giả mạo cổng / đổi vai) → null', async () => {
      const ctx = setup();
      const profile = seedProfile(ctx.prisma, { email: 'g@example.com', roleCode: 'tenant' });
      for (const portal of ['admin', 'landlord', 'host'] as const) {
        expect(await ctx.sessions.authenticate(ctx.sessionTokens.sign(profile.id, 'g@example.com', portal).accessToken)).toBeNull();
      }

      const token = ctx.sessionTokens.sign(profile.id, 'g@example.com', 'tenant').accessToken;
      expect(await ctx.sessions.authenticate(token)).toMatchObject({ portal: 'tenant' });
      ctx.prisma.role.rows.push({ id: 'role-landlord', code: 'landlord', name: 'landlord' });
      ctx.prisma.profile.rows[0].roleId = 'role-landlord'; // Admin đổi vai tenant → landlord
      ctx.sessions.invalidate(profile.id);
      expect(await ctx.service.resolveSession(token)).toEqual({ user: null, clear: true });
    });

    it('authenticate: JWT cũ không có claim portal / portal lạ → null', async () => {
      const ctx = setup();
      const profile = seedProfile(ctx.prisma, { email: 'g@example.com', roleCode: 'tenant' });
      const jwt = new JwtService({ secret: JWT_SECRET });
      const legacy = jwt.sign({ sub: profile.id, email: 'g@example.com' }, { issuer: 'vinstay-backend', expiresIn: 60 });
      const bogus = jwt.sign({ sub: profile.id, portal: 'superuser' }, { issuer: 'vinstay-backend', expiresIn: 60 });
      for (const token of [legacy, bogus]) {
        expect(ctx.sessionTokens.verify(token)).toBeNull();
        expect(await ctx.sessions.authenticate(token)).toBeNull();
      }
    });

    it('resolveSession: token hợp lệ → user (không có clear)', async () => {
      const ctx = setup();
      const { profile, token } = signedIn(ctx);
      const result = await ctx.service.resolveSession(token);
      expect(result.user).toMatchObject({ id: profile.id, portal: 'tenant' });
      expect(result.clear).toBeUndefined();
    });

    it('resolveSession: token hết hạn / hỏng → user null và báo xoá cookie', async () => {
      const ctx = setup();
      const profile = seedProfile(ctx.prisma, { email: 'g@example.com', roleCode: 'tenant' });
      expect(await ctx.service.resolveSession(expiredToken(profile.id))).toEqual({ user: null, clear: true });
      expect(await ctx.service.resolveSession('bad')).toEqual({ user: null, clear: true });
    });

    it('resolveSession: không có cookie → user null, không cần xoá', async () => {
      const { service } = setup();
      expect(await service.resolveSession(undefined)).toEqual({ user: null, clear: false });
    });

    it('resolveSession: tài khoản bị khoá hoặc đã bị xoá → coi như không có phiên, xoá cookie', async () => {
      const ctx = setup();
      const { profile, token } = signedIn(ctx);
      ctx.prisma.profile.rows.find((r: any) => r.id === profile.id).isActive = false;
      expect(await ctx.service.resolveSession(token)).toEqual({ user: null, clear: true });
    });

    it('resolveSession: Host có hồ sơ → hostRoles từ DB; tenant → []; session JSON không có số thẻ/pendingHostId', async () => {
      const ctx = setup();
      const profile = seedProfile(ctx.prisma, { email: 'h@example.com', roleCode: 'field_host', withFieldHost: true, hostRoles: ['INSPECTOR', 'SALE'] });
      ctx.prisma.fieldHost.rows[0].rfidCardNumber = 'SECRET-CARD-0001'; // cột cũ còn trong DB, không được lộ
      const token = ctx.sessionTokens.sign(profile.id, 'h@example.com', 'host').accessToken;

      const { user } = await ctx.service.resolveSession(token);
      expect(user).toMatchObject({ isHostVerified: true, hostRoles: ['sale', 'inspector'] });
      expect(JSON.stringify(user)).not.toMatch(/SECRET-CARD|rfid|pendingHostId|needsRfid/i);

      const tenant = seedProfile(ctx.prisma, { email: 't@example.com', roleCode: 'tenant' });
      const t = await ctx.service.resolveSession(ctx.sessionTokens.sign(tenant.id, 't@example.com', 'tenant').accessToken);
      expect(t.user).toMatchObject({ hostRoles: [] });
    });

    it('đổi vai Host → request kế tiếp đọc lại ngay sau invalidate (không đợi cache 30 giây)', async () => {
      const ctx = setup();
      const profile = seedProfile(ctx.prisma, { email: 'h@example.com', roleCode: 'field_host', withFieldHost: true, hostRoles: ['SALE'] });
      const token = ctx.sessionTokens.sign(profile.id, 'h@example.com', 'host').accessToken;
      expect((await ctx.service.resolveSession(token)).user).toMatchObject({ hostRoles: ['sale'] });

      ctx.prisma.fieldHost.rows[0].roles = ['INSPECTOR'];
      expect((await ctx.service.resolveSession(token)).user).toMatchObject({ hostRoles: ['sale'] }); // cache
      ctx.sessions.invalidate(profile.id);
      expect((await ctx.service.resolveSession(token)).user).toMatchObject({ hostRoles: ['inspector'] });
    });
  });
});
