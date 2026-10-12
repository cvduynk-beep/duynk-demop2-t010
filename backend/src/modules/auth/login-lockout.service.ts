import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOGIN_LOCKOUT_SECONDS, LOGIN_MAX_FAILURES } from './auth.constants';
import { authError } from './auth.errors';

const MAX_TRACKED_EMAILS = 10_000;

interface Attempts {
  failures: number;
  /** Hết cửa sổ đếm (lần sai đầu + LOGIN_LOCKOUT_SECONDS) thì đếm lại từ 0. */
  windowEndsAt: number;
  lockedUntil?: number;
}

/**
 * Khoá tạm đăng nhập mật khẩu theo email: sai `LOGIN_MAX_FAILURES` lần trong `LOGIN_LOCKOUT_SECONDS` ⇒ 429 `login_locked`
 * suốt `LOGIN_LOCKOUT_SECONDS`. Bổ sung cho throttle theo IP (kẻ dò mật khẩu đổi IP vẫn bị chặn theo email).
 * Email không tồn tại cũng bị đếm và khoá như email có thật ⇒ không lộ email nào có tài khoản.
 * Bộ nhớ trong tiến trình (như ThrottlerModule): chạy nhiều instance thì mỗi instance đếm riêng.
 */
@Injectable()
export class LoginLockoutService {
  private readonly maxFailures: number;
  private readonly lockoutMs: number;
  private readonly attempts = new Map<string, Attempts>();

  constructor(config: ConfigService) {
    const positive = (key: string, fallback: number) => {
      const value = Number(config.get<string>(key));
      return Number.isInteger(value) && value > 0 ? value : fallback;
    };
    this.maxFailures = positive('LOGIN_MAX_FAILURES', LOGIN_MAX_FAILURES);
    this.lockoutMs = positive('LOGIN_LOCKOUT_SECONDS', LOGIN_LOCKOUT_SECONDS) * 1000;
  }

  /** Ném 429 `login_locked` (kèm `retryAfterSeconds`) nếu email đang bị khoá. Gọi TRƯỚC khi kiểm tra mật khẩu. */
  assertNotLocked(email: string): void {
    const entry = this.attempts.get(email);
    const now = Date.now();
    if (entry?.lockedUntil && entry.lockedUntil > now) {
      throw authError('login_locked', { retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) });
    }
  }

  recordFailure(email: string): void {
    const now = Date.now();
    let entry = this.attempts.get(email);
    if (!entry || entry.windowEndsAt <= now || (entry.lockedUntil && entry.lockedUntil <= now)) {
      entry = { failures: 0, windowEndsAt: now + this.lockoutMs };
    }
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) entry.lockedUntil = now + this.lockoutMs;

    this.attempts.delete(email); // đưa xuống cuối để xoá theo thứ tự cũ nhất khi đầy
    if (this.attempts.size >= MAX_TRACKED_EMAILS) this.attempts.delete(this.attempts.keys().next().value);
    this.attempts.set(email, entry);
  }

  /** Đăng nhập đúng mật khẩu ⇒ xoá bộ đếm. */
  reset(email: string): void {
    this.attempts.delete(email);
  }
}
