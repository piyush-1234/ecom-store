import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Phone OTP generation and verification.
 *
 * The code is NEVER stored in plaintext — only an HMAC-SHA256 of the code bound to
 * the phone number, keyed with AUTH_SECRET. HMAC (rather than bcrypt) is deliberate:
 * a 6-digit code has only 10^6 possibilities, so the real protection is the attempt
 * cap + short TTL, and bcrypt would add ~300 ms to every verification for no
 * meaningful gain against an attacker who already holds the database hash.
 *
 * Defence in depth: `attempts` is incremented on every failure and the token is
 * invalidated after OTP_MAX_ATTEMPTS or expiry.
 */

const OTP_DIGITS = 6;
const OTP_MIN = 100_000;
const OTP_MAX = 999_999;

export function generateOtp(): string {
  // randomInt is cryptographically secure; Math.random is not.
  return String(randomInt(OTP_MIN, OTP_MAX + 1));
}

export function hashOtp(phone: string, code: string): string {
  const secret = serverEnv().AUTH_SECRET;
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function verifyOtpHash(phone: string, code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOtp(phone, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function otpExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + serverEnv().OTP_TTL_MINUTES * 60 * 1000);
}

/**
 * SMS delivery adapter.
 *
 * `console` prints to the server log — the only provider usable before real
 * credentials are supplied (approval gate #1). Real providers slot in behind the
 * same interface without touching callers.
 */
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    // Intentionally obvious in logs; this provider must never be used in production.
    console.log(`[otp:dev] ${phone} -> ${code} (valid ${serverEnv().OTP_TTL_MINUTES}m)`);
  }
}

export function getSmsProvider(): SmsProvider {
  const provider = serverEnv().OTP_PROVIDER;

  if (provider !== 'console') {
    // Fail loudly rather than silently pretending an SMS was sent.
    throw new Error(
      `OTP_PROVIDER="${provider}" is not implemented yet. Use "console" in development.`,
    );
  }

  return new ConsoleSmsProvider();
}
