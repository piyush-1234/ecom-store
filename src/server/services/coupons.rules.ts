import type { CouponType } from '@prisma/client';

/**
 * Coupon evaluation.
 *
 * Pure: the caller supplies the coupon row, the cart subtotal, the current time and
 * the redemption counts. That keeps the "why was my code rejected?" logic testable
 * without a database, and means the same rules apply at every call site.
 *
 * A coupon can discount goods OR shipping, never both:
 *  - PERCENT / FLAT reduce the goods value (and therefore the GST on it)
 *  - FREE_SHIPPING zeroes the shipping charge (and its service GST)
 */

export type CouponRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'ALREADY_USED'
  | 'MIN_ORDER';

export interface CouponLike {
  code: string;
  type: CouponType;
  /** PERCENT → percent (1-100); FLAT / FREE_SHIPPING → paise. */
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

export interface CouponContext {
  subtotalPaise: number;
  shippingPaise: number;
  now: Date;
  /** Redemptions by this customer (or this email for guests). */
  userRedemptions: number;
}

export interface CouponApplied {
  valid: true;
  code: string;
  goodsDiscountPaise: number;
  shippingDiscountPaise: number;
  /** Human explanation, useful in the UI. */
  label: string;
}

export interface CouponRejected {
  valid: false;
  code: CouponRejection;
  message: string;
}

export type CouponResult = CouponApplied | CouponRejected;

function reject(code: CouponRejection, message: string): CouponRejected {
  return { valid: false, code, message };
}

export function evaluateCoupon(coupon: CouponLike, ctx: CouponContext): CouponResult {
  if (!coupon.isActive) {
    return reject('INACTIVE', 'This coupon is no longer available.');
  }

  if (coupon.startsAt && ctx.now < coupon.startsAt) {
    return reject('NOT_STARTED', 'This coupon is not active yet.');
  }

  if (coupon.expiresAt && ctx.now > coupon.expiresAt) {
    return reject('EXPIRED', 'This coupon has expired.');
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return reject('EXHAUSTED', 'This coupon has been fully redeemed.');
  }

  if (coupon.perUserLimit > 0 && ctx.userRedemptions >= coupon.perUserLimit) {
    return reject(
      'ALREADY_USED',
      coupon.perUserLimit === 1
        ? 'You have already used this coupon.'
        : `This coupon can be used ${coupon.perUserLimit} times per customer.`,
    );
  }

  if (ctx.subtotalPaise < coupon.minOrderPaise) {
    const shortfall = coupon.minOrderPaise - ctx.subtotalPaise;
    return reject(
      'MIN_ORDER',
      `Add Rs. ${(shortfall / 100).toFixed(0)} more to use this coupon.`,
    );
  }

  if (coupon.type === 'FREE_SHIPPING') {
    if (ctx.shippingPaise <= 0) {
      // Nothing to discount — accept it but make the outcome explicit.
      return {
        valid: true,
        code: coupon.code,
        goodsDiscountPaise: 0,
        shippingDiscountPaise: 0,
        label: 'Free shipping (order already qualifies)',
      };
    }

    return {
      valid: true,
      code: coupon.code,
      goodsDiscountPaise: 0,
      shippingDiscountPaise: ctx.shippingPaise,
      label: 'Free shipping',
    };
  }

  if (coupon.type === 'PERCENT') {
    const percent = Math.min(100, Math.max(0, coupon.value));
    const raw = Math.round((ctx.subtotalPaise * percent) / 100);
    const capped = coupon.maxDiscountPaise !== null ? Math.min(raw, coupon.maxDiscountPaise) : raw;
    const discount = Math.min(capped, ctx.subtotalPaise);

    return {
      valid: true,
      code: coupon.code,
      goodsDiscountPaise: discount,
      shippingDiscountPaise: 0,
      label: `${percent}% off`,
    };
  }

  // FLAT
  const discount = Math.min(Math.max(0, coupon.value), ctx.subtotalPaise);
  return {
    valid: true,
    code: coupon.code,
    goodsDiscountPaise: discount,
    shippingDiscountPaise: 0,
    label: `Rs. ${(discount / 100).toFixed(0)} off`,
  };
}

/** Normalise a user-typed code. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}
