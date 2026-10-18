import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';
import type { AdminRole } from '@prisma/client';

/**
 * Admin sessions.
 *
 * Deliberately a SEPARATE cookie, issuer and audience from customer sessions, so a
 * customer token can never be replayed as an admin token (or vice versa) even though
 * both are signed with the same secret.
 */

export const ADMIN_COOKIE = 'es_admin';

const ISSUER = 'ecomerce-store';
const AUDIENCE = 'ecomerce-store:admin';

export interface AdminPayload extends JWTPayload {
  sub: string;
  email: string;
  role: AdminRole;
  kind: 'admin';
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv().AUTH_SECRET);
}

export async function signAdminSession(payload: {
  sub: string;
  email: string;
  role: AdminRole;
}): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role, kind: 'admin' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    // Admin sessions are deliberately short-lived.
    .setExpirationTime('12h')
    .sign(secretKey());
}

export async function verifyAdminSession(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    if (payload.kind !== 'admin') return null;
    if (payload.role !== 'ADMIN' && payload.role !== 'OPS') return null;

    return payload as AdminPayload;
  } catch {
    return null;
  }
}

export async function createAdminSession(admin: {
  id: string;
  email: string;
  role: AdminRole;
}): Promise<void> {
  const token = await signAdminSession({ sub: admin.id, email: admin.email, role: admin.role });
  cookies().set({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60,
  });
}

export async function destroyAdminSession(): Promise<void> {
  cookies().set({
    name: ADMIN_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

export async function getCurrentAdmin(): Promise<AdminPayload | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}
