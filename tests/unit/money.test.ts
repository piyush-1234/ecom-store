import { describe, it, expect } from 'vitest';
import { discountPercent, formatINR, fromPaise, sumPaise, toPaise } from '@/lib/utils/money';

describe('toPaise / fromPaise', () => {
  it('converts whole rupees', () => {
    expect(toPaise(899)).toBe(89_900);
    expect(toPaise(2_499)).toBe(249_900);
  });

  it('rounds fractional rupees to the nearest paisa', () => {
    expect(toPaise(42.8095)).toBe(4_281);
    expect(toPaise(0.005)).toBe(1);
  });

  it('round-trips cleanly', () => {
    for (const rupees of [0, 1, 99, 899, 2_499, 1_00_000]) {
      expect(fromPaise(toPaise(rupees))).toBe(rupees);
    }
  });

  it('rejects non-finite input', () => {
    expect(() => toPaise(Number.NaN)).toThrow(TypeError);
    expect(() => toPaise(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('rejects non-integer paise on the way out', () => {
    expect(() => fromPaise(1.5)).toThrow(TypeError);
  });
});

describe('sumPaise', () => {
  it('sums without drift', () => {
    expect(sumPaise([89_900, 249_900, 79_900])).toBe(419_700);
  });

  it('rejects non-integer paise', () => {
    expect(() => sumPaise([100, 1.2])).toThrow(TypeError);
  });
});

describe('formatINR', () => {
  it('formats Indian grouping without decimals by default', () => {
    // en-IN uses lakh grouping: 1,00,000 not 100,000
    expect(formatINR(1_00_00_000)).toContain('1,00,000');
    expect(formatINR(89_900)).toContain('899');
  });

  it('can include paise when asked', () => {
    expect(formatINR(89_950, { withPaise: true })).toContain('899.50');
  });
});

describe('discountPercent', () => {
  it('computes the MRP discount', () => {
    expect(discountPercent(1_29_900, 89_900)).toBe(31);
  });

  it('returns 0 when there is no discount', () => {
    expect(discountPercent(89_900, 89_900)).toBe(0);
    expect(discountPercent(0, 89_900)).toBe(0);
  });
});
