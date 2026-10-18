import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';
import { SESSION_COOKIE, signSession, verifySession, type SessionPayload } from './session';

/**
 * Cookie plumbing for sessions. Kept separate from `session.ts` so that the JWT
 * logic stays pure and unit-testable (see tests/unit/session.test.ts).
 */

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(user: { id: string; email: string }): Promise<void> {
  const token = await signSession({ sub: user.id, email: user.email });
  const ttlSeconds = serverEnv().SESSION_TTL_HOURS * 60 * 60;

  cookies().set({ name: SESSION_COOKIE, value: token, ...cookieOptions(ttlSeconds) });
}

export async function destroySession(): Promise<void> {
  cookies().set({ name: SESSION_COOKIE, value: '', ...cookieOptions(0) });
}

/** Read + verify the current customer session, or null when anonymous. */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
