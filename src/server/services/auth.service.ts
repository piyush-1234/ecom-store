import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { generateOtp, getSmsProvider, hashOtp, otpExpiry, verifyOtpHash } from '@/server/auth/otp';
import { serverEnv } from '@/lib/env';
import type {
  LoginInput,
  OtpRequestInput,
  OtpVerifyInput,
  RegisterInput,
} from '@/lib/validators/auth';

/**
 * Authentication service.
 *
 * Rules enforced here (not in route handlers, so they hold for every caller):
 *  - login failures are indistinguishable (unknown email vs wrong password)
 *  - OTP codes are single-use, expire, and are attempt-capped
 *  - a phone-only signup creates a user with no email and no password
 */

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  marketingOptIn: boolean;
  createdAt: string;
}

function toPublicUser(user: {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  marketingOptIn: boolean;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    marketingOptIn: user.marketingOptIn,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
  }

  if (input.phone) {
    const phoneOwner = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (phoneOwner) {
      throw new AppError('PHONE_TAKEN', 'This phone number is already in use.', 409);
    }
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone ?? null,
      marketingOptIn: input.marketingOptIn,
    },
  });

  return toPublicUser(user);
}

export async function loginUser(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Verify against a dummy hash when the user is absent, so response timing does
  // not reveal whether the email exists.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? null);

  if (!user || !passwordOk || !user.isActive) {
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.', 401);
  }

  return toPublicUser(user);
}

export async function requestOtp(input: OtpRequestInput): Promise<{ expiresInSeconds: number }> {
  const now = new Date();

  // Throttle: refuse to issue a second code within 30 seconds.
  const recent = await prisma.otpToken.findFirst({
    where: { identifier: input.phone, purpose: 'LOGIN', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (recent && now.getTime() - recent.createdAt.getTime() < 30_000) {
    throw new AppError('RATE_LIMITED', 'Please wait before requesting another code.', 429);
  }

  const code = generateOtp();
  const expiresAt = otpExpiry(now);

  await prisma.otpToken.create({
    data: {
      identifier: input.phone,
      codeHash: hashOtp(input.phone, code),
      purpose: 'LOGIN',
      expiresAt,
    },
  });

  await getSmsProvider().sendOtp(input.phone, code);

  return { expiresInSeconds: Math.round((expiresAt.getTime() - now.getTime()) / 1000) };
}

export async function verifyOtp(input: OtpVerifyInput): Promise<PublicUser> {
  const now = new Date();
  const maxAttempts = serverEnv().OTP_MAX_ATTEMPTS;

  const token = await prisma.otpToken.findFirst({
    where: {
      identifier: input.phone,
      purpose: 'LOGIN',
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!token) {
    throw new AppError('INVALID_OTP', 'That code is invalid or has expired. Request a new one.', 400);
  }

  if (token.attempts >= maxAttempts) {
    throw new AppError('RATE_LIMITED', 'Too many incorrect attempts. Request a new code.', 429);
  }

  if (!verifyOtpHash(input.phone, input.code, token.codeHash)) {
    await prisma.otpToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError('INVALID_OTP', 'That code is invalid or has expired. Request a new one.', 400);
  }

  // Burn the token before touching the user, so a replay cannot succeed.
  await prisma.otpToken.update({
    where: { id: token.id },
    data: { consumedAt: now },
  });

  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (existing) {
    if (!existing.isActive) {
      throw new AppError('FORBIDDEN', 'This account has been disabled.', 403);
    }
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { phoneVerifiedAt: now, ...(input.name && !existing.name ? { name: input.name } : {}) },
    });
    return toPublicUser(updated);
  }

  const created = await prisma.user.create({
    data: {
      phone: input.phone,
      phoneVerifiedAt: now,
      name: input.name ?? null,
    },
  });

  return toPublicUser(created);
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new AppError('UNAUTHENTICATED', 'Session is no longer valid.', 401);
  }
  return toPublicUser(user);
}

export interface ProfileSummary extends PublicUser {
  addressCount: number;
  orderCount: number;
}

export async function getProfileSummary(userId: string): Promise<ProfileSummary> {
  const user = await getUserById(userId);

  const [addressCount, orderCount] = await Promise.all([
    prisma.address.count({ where: { userId } }),
    prisma.order.count({ where: { userId } }),
  ]);

  return { ...user, addressCount, orderCount };
}
