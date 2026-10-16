import { createHmac, randomBytes } from 'node:crypto';

/** Eval artifacts only. Grade original values in memory; persist a redacted copy. */
const salt = randomBytes(32);
const sensitiveKey = /^(full_?name|first_?name|last_?name|name|phone|phoneNumber|email|address|streetAddress|otp|password|passwordHash|accessToken|refreshToken|apiKey|landlordNote)$/i;
const aliases = new Map<string, string>();
const alias = (value: string) => {
  if (!aliases.has(value)) aliases.set(value, `[REF_${createHmac('sha256', salt).update(value).digest('hex').slice(0, 12)}]`);
  return aliases.get(value)!;
};

export function redactEvalText(value: string): string {
  return value
    .replace(/\bVSA-[A-Z0-9][A-Z0-9.\/-]{3,}/gi, alias)
    .replace(/\bVS-[A-Z0-9]{4,}\b/gi, alias)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?<![\d-])(?:\+?84|0)[35789](?:[ .-]?\d){8}(?!\d)/g, '[PHONE]')
    .replace(/\b(?:otp|mã xác thực|mã otp)(\s*(?:là|:|=)?\s*)\d{4,8}\b/gi, 'OTP [REDACTED]')
    .replace(/\b\d{12}\b/g, '[IDENTITY]');
}

export function redactEvalArtifact<T>(value: T): T {
  const known: string[] = [];
  const collect = (v: unknown, key = '') => {
    if (sensitiveKey.test(key) && (typeof v === 'string' || typeof v === 'number')) {
      if (String(v).length >= 4) known.push(String(v));
    } else if (Array.isArray(v)) v.forEach((x) => collect(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => collect(x, k));
  };
  collect(value);
  const walk = (v: unknown, key = ''): unknown => {
    if (sensitiveKey.test(key)) return '[REDACTED]';
    if (typeof v === 'string') {
      if (/^(ref|bookingRef|contractNumber)$/i.test(key)) return alias(v);
      return redactEvalText(known.reduce((text, secret) => text.split(secret).join('[REDACTED]'), v));
    }
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}
