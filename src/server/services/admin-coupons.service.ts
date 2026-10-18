import type { CouponType } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import type { CouponInput } from '@/lib/validators/admin';

/** Admin coupon management. */

export interface AdminCouponRow {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export async function listCoupons(): Promise<AdminCouponRow[]> {
  return prisma.coupon.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createCoupon(input: CouponInput): Promise<{ code: string }> {
  const existing = await prisma.coupon.findUnique({ where: { code: input.code } });
  if (existing) throw new AppError('CONFLICT', 'A coupon with that code already exists.', 409);

  const createdAt = new Date();

  await prisma.coupon.create({
    data: {
      code: input.code,
      type: input.type,
      // PERCENT stores a percentage; FLAT/FREE_SHIPPING store paise.
      value:
        input.type === 'PERCENT'
          ? Math.round(input.value)
          : input.type === 'FLAT'
            ? Math.round(input.value * 100)
            : 0,
      minOrderPaise: Math.round(input.minOrderRupees * 100),
      maxDiscountPaise:
        input.type === 'PERCENT' && input.maxDiscountRupees !== undefined
          ? Math.round(input.maxDiscountRupees * 100)
          : null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      isActive: input.isActive,
      createdAt,
    },
  });

  return { code: input.code };
}

export async function setCouponActive(couponId: string, isActive: boolean): Promise<void> {
  await prisma.coupon.update({ where: { id: couponId }, data: { isActive } });
}
