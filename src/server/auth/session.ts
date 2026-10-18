import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { serverEnv } from '@/lib/env';

/**
 * Stateless JWT session tokens (ADR-006).
 *
 * This module is intentionally PURE — no `next/headers`, no cookies — so the
 * signing/verification logic can be unit-tested without a request context.
 * Cookie plumbing lives in `session-cookie.ts`.
 */

export const SESSION_COOKIE = 'es_session';

const ISSUER = 'ecomerce-store';
const AUDIENCE = 'ecomerce-store:customer';

export interface SessionPayload extends JWTPayload {
  /** User id. */
  sub: string;
  email: string;
  /** Distinguishes customer sessions from admin sessions. */
  kind: 'customer';
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv().AUTH_SECRET);
}

export async function signSession(payload: { sub: string; email: string }): Promise<string> {
  const ttlHours = serverEnv().SESSION_TTL_HOURS;

  return new SignJWT({ email: payload.email, kind: 'customer' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ttlHours}h`)
    .sign(secretKey());
}

/** Verify a raw token. Returns null on any failure (expired, tampered, wrong aud). */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    if (payload.kind !== 'customer') return null;

    return payload as SessionPayload;
  } catch {
    return null;
  }
}
