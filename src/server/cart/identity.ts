import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Guest cart identity.
 *
 * The cart is identified by an unguessable 32-byte token stored in an httpOnly
 * cookie. The token *is* the bearer secret — there is nothing to sign, because a
 * forged value cannot be produced without guessing 256 bits.
 *
 * Cookie writes are only legal in Server Actions and Route Handlers, so
 * `setCartToken` must never be called from a Server Component render.
 */

export const CART_COOKIE = 'es_cart';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function generateCartToken(): string {
  return randomBytes(32).toString('base64url');
}

export function readCartToken(): string | null {
  const value = cookies().get(CART_COOKIE)?.value;
  return value && value.length >= 20 ? value : null;
}

export function setCartToken(token: string): void {
  cookies().set({
    name: CART_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearCartToken(): void {
  cookies().set({
    name: CART_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
