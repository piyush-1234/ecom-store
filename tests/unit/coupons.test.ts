import { describe, expect, it } from 'vitest';
import { evaluateCoupon, normalizeCouponCode, type CouponLike } from '@/server/services/coupons.rules';

const NOW = new Date('2026-06-15T12:00:00Z');

const base: CouponLike = {
  code: 'WELCOME10',
  type: 'PERCENT',
  value: 10,
  minOrderPaise: 0,
  maxDiscountPaise: null,
  usageLimit: null,
  usedCount: 0,
  perUserLimit: 1,
  startsAt: null,
  expiresAt: null,
  isActive: true,
};

const ctx = { subtotalPaise: 100_000, shippingPaise: 4_900, now: NOW, userRedemptions: 0 };

describe('normalizeCouponCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCouponCode('  welcome10 ')).toBe('WELCOME10');
  });
});

describe('evaluateCoupon — availability', () => {
  it('rejects an inactive coupon', () => {
    const result = evaluateCoupon({ ...base, isActive: false }, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe('INACTIVE');
  });

  it('rejects before the start date', () => {
    const result = evaluateCoupon({ ...base, startsAt: new Date('2026-07-01') }, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe('NOT_STARTED');
  });

  it('rejects after the expiry date', () => {
    const result = evaluateCoupon({ ...base, expiresAt: new Date('2026-06-01') }, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe('EXPIRED');
  });

  it('accepts inside the window', () => {
    const result = evaluateCoupon(
      { ...base, startsAt: new Date('2026-06-01'), expiresAt: new Date('2026-06-30') },
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects when the global usage limit is reached', () => {
    const result = evaluateCoupon({ ...base, usageLimit: 100, usedCount: 100 }, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe('EXHAUSTED');
  });

  it('rejects a second use by the same customer', () => {
    const result = evaluateCoupon(base, { ...ctx, userRedemptions: 1 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe('ALREADY_USED');
  });

  it('allows repeat use when perUserLimit is higher', () => {
    const result = evaluateCoupon({ ...base, perUserLimit: 3 }, { ...ctx, userRedemptions: 2 });
    expect(result.valid).toBe(true);
  });

  it('rejects below the minimum order value and says how much is missing', () => {
    const result = evaluateCoupon({ ...base, minOrderPaise: 150_000 }, ctx);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('MIN_ORDER');
      expect(result.message).toContain('500');
    }
  });
});

describe('evaluateCoupon — discounts', () => {
  it('applies a percentage to the subtotal', () => {
    const result = evaluateCoupon(base, ctx);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.goodsDiscountPaise).toBe(10_000);
  });

  it('caps a percentage at maxDiscountPaise', () => {
    const result = evaluateCoupon({ ...base, value: 50, maxDiscountPaise: 20_000 }, ctx);
    if (result.valid) expect(result.goodsDiscountPaise).toBe(20_000);
  });

  it('never discounts more than the subtotal', () => {
    const result = evaluateCoupon({ ...base, type: 'FLAT', value: 999_999 }, ctx);
    if (result.valid) expect(result.goodsDiscountPaise).toBe(ctx.subtotalPaise);
  });

  it('applies a flat discount', () => {
    const result = evaluateCoupon({ ...base, type: 'FLAT', value: 20_000 }, ctx);
    if (result.valid) {
      expect(result.goodsDiscountPaise).toBe(20_000);
      expect(result.shippingDiscountPaise).toBe(0);
    }
  });

  it('applies free shipping to the shipping charge, not the goods', () => {
    const result = evaluateCoupon({ ...base, type: 'FREE_SHIPPING', value: 0 }, ctx);
    if (result.valid) {
      expect(result.goodsDiscountPaise).toBe(0);
      expect(result.shippingDiscountPaise).toBe(4_900);
    }
  });

  it('handles free shipping when shipping is already zero', () => {
    const result = evaluateCoupon({ ...base, type: 'FREE_SHIPPING', value: 0 }, {
      ...ctx,
      shippingPaise: 0,
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.shippingDiscountPaise).toBe(0);
  });

  it('clamps a percentage above 100', () => {
    const result = evaluateCoupon({ ...base, value: 150 }, ctx);
    if (result.valid) expect(result.goodsDiscountPaise).toBe(ctx.subtotalPaise);
  });
});
