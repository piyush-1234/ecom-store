import type { NextRequest } from 'next/server';
import type { ZodType, ZodTypeDef } from 'zod';
import { AppError, ValidationError } from './errors';
import { getCurrentSession } from './auth/session-cookie';
import type { SessionPayload } from './auth/session';

/**
 * Small HTTP helpers shared by route handlers.
 */

/**
 * Parse and validate a JSON body.
 * Throws ValidationError (422) on malformed JSON or schema failure, so handlers
 * never deal with raw parsing.
 */
export async function parseJson<S extends ZodType<unknown, ZodTypeDef, unknown>>(
  request: NextRequest,
  schema: S,
): Promise<ReturnType<S['parse']>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400);
  }

  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError(result.error);
  return result.data as ReturnType<S['parse']>;
}

/** Require an authenticated customer, or throw 401. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session) {
    throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
  }
  return session;
}

/** Basic in-process guard for OTP/login endpoints (per-IP, per-process). */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryIn = Math.ceil((bucket.resetAt - now) / 1000);
    throw new AppError(
      'RATE_LIMITED',
      `Too many attempts. Try again in ${retryIn} seconds.`,
      429,
      { retryAfterSeconds: retryIn },
    );
  }
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
