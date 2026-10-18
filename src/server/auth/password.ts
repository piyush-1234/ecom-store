import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * bcryptjs (pure JS) is used instead of native bcrypt/argon2 to avoid requiring
 * MSVC build tools on Windows and native rebuilds in CI (ADR-007).
 *
 * Cost 12 ≈ 250–400 ms per hash on commodity hardware — deliberately slow enough
 * to make offline guessing expensive, but acceptable for an interactive login
 * that is additionally rate-limited.
 */

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error('hashPassword: refusing to hash a password shorter than 8 characters');
  }
  return bcrypt.hash(plain, COST);
}

/**
 * Constant-time-ish verification. bcrypt.compare handles the timing concern;
 * this wrapper only guards against malformed hashes so a corrupt row cannot
 * throw a 500 on the login path.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    // Still burn comparable CPU so a missing password does not leak timing info.
    await bcrypt.compare(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return false;
  }
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
