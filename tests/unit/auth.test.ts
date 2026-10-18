import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Auth primitives. These run without a database or HTTP layer.
 * AUTH_SECRET must exist before `serverEnv()` is first called, so it is set at the
 * top of the file and the env cache is cleared in beforeAll.
 */
process.env.AUTH_SECRET = 'unit-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused?schema=public';
process.env.OTP_MAX_ATTEMPTS = '5';
process.env.OTP_TTL_MINUTES = '10';

const { hashPassword, verifyPassword } = await import('@/server/auth/password');
const { generateOtp, hashOtp, otpExpiry, verifyOtpHash } = await import('@/server/auth/otp');
const { signSession, verifySession } = await import('@/server/auth/session');

beforeAll(async () => {
  const { resetServerEnvCache } = await import('@/lib/env');
  resetServerEnvCache();
});

describe('password hashing', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-9');
    expect(hash).not.toContain('correct-horse-9');
    expect(await verifyPassword('correct-horse-9', hash)).toBe(true);
  }, 20_000);

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-9');
    expect(await verifyPassword('wrong-password-1', hash)).toBe(false);
  }, 20_000);

  it('returns false (not throw) when the user has no password set', async () => {
    expect(await verifyPassword('anything1', null)).toBe(false);
  }, 20_000);

  it('returns false for a corrupted hash instead of throwing', async () => {
    expect(await verifyPassword('anything1', 'not-a-bcrypt-hash')).toBe(false);
  });

  it('refuses to hash an unusually short password', async () => {
    await expect(hashPassword('abc')).rejects.toThrow(/shorter than 8/);
  });
});

describe('OTP', () => {
  it('generates a 6-digit numeric code', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it('verifies the correct code for the correct phone', () => {
    const hash = hashOtp('+919876543210', '123456');
    expect(verifyOtpHash('+919876543210', '123456', hash)).toBe(true);
  });

  it('rejects the correct code for a different phone', () => {
    const hash = hashOtp('+919876543210', '123456');
    expect(verifyOtpHash('+919999999999', '123456', hash)).toBe(false);
  });

  it('rejects a wrong code', () => {
    const hash = hashOtp('+919876543210', '123456');
    expect(verifyOtpHash('+919876543210', '654321', hash)).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    expect(verifyOtpHash('+919876543210', '123456', 'zzzz')).toBe(false);
  });

  it('expires the code ~10 minutes ahead', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiry = otpExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });
});

describe('session tokens', () => {
  it('signs and verifies a round-trip', async () => {
    const token = await signSession({ sub: 'user_123', email: 'a@b.com' });
    const payload = await verifySession(token);

    expect(payload?.sub).toBe('user_123');
    expect(payload?.email).toBe('a@b.com');
    expect(payload?.kind).toBe('customer');
    expect(payload?.iss).toBe('ecomerce-store');
  });

  it('rejects a tampered token', async () => {
    const token = await signSession({ sub: 'user_123', email: 'a@b.com' });
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat(43)}`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession({ sub: 'user_123', email: 'a@b.com' });

    const { resetServerEnvCache } = await import('@/lib/env');
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'a-completely-different-secret-value-1234567890';
    resetServerEnvCache();

    try {
      expect(await verifySession(token)).toBeNull();
    } finally {
      process.env.AUTH_SECRET = original;
      resetServerEnvCache();
    }
  });

  it('rejects garbage input', async () => {
    expect(await verifySession('not.a.jwt')).toBeNull();
    expect(await verifySession('')).toBeNull();
  });
});
