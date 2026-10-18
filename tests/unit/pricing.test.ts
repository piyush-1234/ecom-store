import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused?schema=public';
process.env.AUTH_SECRET = 'unit-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.FREE_SHIPPING_THRESHOLD_PAISE = '149900';
process.env.DEFAULT_SHIPPING_FEE_PAISE = '4900';
process.env.COD_FEE_PAISE = '4900';
process.env.PREPAID_DISCOUNT_PAISE = '5000';
process.env.COD_MAX_AMOUNT_PAISE = '150000';

const { allocateDiscount, computeOrderTotals, inclusiveTax, isCodAllowed } = await import(
  '@/server/services/pricing.service'
);

const baseOptions = {
  sellerStateCode: '27', // Maharashtra
  shipStateCode: '27',
  paymentMethod: 'PREPAID' as const,
  shippingFeePaise: 4900,
  freeShippingThresholdPaise: 149900,
  codFeePaise: 4900,
  prepaidDiscountPaise: 5000,
};

const tee = { unitPricePaise: 89_900, qty: 1, hsnCode: '6109' };
const jean = { unitPricePaise: 229_900, qty: 1, hsnCode: '6203' };

describe('allocateDiscount', () => {
  it('returns zeros when there is no discount', () => {
    expect(allocateDiscount([1000, 2000], 0)).toEqual([0, 0]);
  });

  it('splits proportionally', () => {
    const parts = allocateDiscount([1000, 3000], 400);
    expect(parts).toEqual([100, 300]);
  });

  it('always sums exactly to the discount (largest remainder)', () => {
    for (const discount of [1, 7, 99, 101, 333]) {
      const parts = allocateDiscount([1000, 1000, 1000], discount);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(discount);
    }
  });

  it('never allocates more than a line is worth', () => {
    const parts = allocateDiscount([100, 900], 1000);
    expect(parts).toEqual([100, 900]);
  });
});

describe('inclusiveTax', () => {
  it('extracts 18% GST from an inclusive amount', () => {
    // 118 inclusive contains 18 tax
    expect(inclusiveTax(11_800, 18)).toBe(1_800);
  });

  it('returns 0 for a zero amount', () => {
    expect(inclusiveTax(0, 18)).toBe(0);
  });
});

describe('computeOrderTotals', () => {
  it('prices a single ₹899 tee with free-shipping not met', () => {
    const totals = computeOrderTotals([tee], baseOptions);

    expect(totals.subtotalPaise).toBe(89_900);
    // Below ₹1,499 → shipping charged
    expect(totals.shippingPaise).toBe(4_900);
    expect(totals.codFeePaise).toBe(0);
    // Prepaid incentive applies
    expect(totals.discountPaise).toBe(5_000);
    expect(totals.totalPaise).toBe(89_900 - 5_000 + 4_900);
  });

  it('gives free shipping above the threshold', () => {
    const totals = computeOrderTotals([jean], baseOptions);
    expect(totals.shippingPaise).toBe(0);
  });

  it('applies the COD fee and no prepaid discount for COD', () => {
    const totals = computeOrderTotals([tee], { ...baseOptions, paymentMethod: 'COD' });
    expect(totals.codFeePaise).toBe(4_900);
    expect(totals.discountPaise).toBe(0);
    expect(totals.totalPaise).toBe(89_900 + 4_900 + 4_900);
  });

  it('keeps a ₹2,499 jean at 5% and a ₹2,599 jean at 18%', () => {
    const atCeiling = computeOrderTotals([{ unitPricePaise: 249_900, qty: 1, hsnCode: '6203' }], baseOptions);
    const above = computeOrderTotals([{ unitPricePaise: 259_900, qty: 1, hsnCode: '6203' }], baseOptions);

    expect(atCeiling.lines[0]!.ratePct).toBe(5);
    expect(above.lines[0]!.ratePct).toBe(18);
    // Higher sticker price, higher tax — the GST cliff
    expect(above.lines[0]!.taxPaise).toBeGreaterThan(atCeiling.lines[0]!.taxPaise);
  });

  it('taxes each line on its own unit price, not the order total', () => {
    // 2 x ₹2,499 = ₹4,998 order total, but each piece is under the ₹2,500 ceiling
    const totals = computeOrderTotals([{ unitPricePaise: 249_900, qty: 2, hsnCode: '6203' }], {
      ...baseOptions,
      paymentMethod: 'COD',
    });
    expect(totals.lines[0]!.ratePct).toBe(5);
  });

  it('splits CGST/SGST intra-state and IGST inter-state', () => {
    const intra = computeOrderTotals([tee], baseOptions);
    expect(intra.lines[0]!.igstPaise).toBe(0);
    expect(intra.lines[0]!.cgstPaise + intra.lines[0]!.sgstPaise).toBe(intra.lines[0]!.taxPaise);

    const inter = computeOrderTotals([tee], { ...baseOptions, shipStateCode: '29' });
    expect(inter.lines[0]!.igstPaise).toBe(inter.lines[0]!.taxPaise);
    expect(inter.lines[0]!.cgstPaise).toBe(0);
    expect(inter.lines[0]!.sgstPaise).toBe(0);
  });

  it('total equals the sum of its components (no drift)', () => {
    const totals = computeOrderTotals([tee, jean], {
      ...baseOptions,
      paymentMethod: 'COD',
      discountPaise: 3_333,
    });

    const componentSum =
      totals.subtotalPaise - totals.discountPaise + totals.shippingPaise + totals.codFeePaise;
    expect(totals.totalPaise).toBe(componentSum);
  });

  it('allocates discount exactly across lines before tax', () => {
    // prepaidDiscountPaise is zeroed so the only discount is the explicit one.
    const totals = computeOrderTotals([tee, jean], {
      ...baseOptions,
      prepaidDiscountPaise: 0,
      discountPaise: 10_001,
    });
    const allocated = totals.lines.reduce((sum, line) => sum + line.discountPaise, 0);
    expect(allocated).toBe(10_001);
    expect(totals.discountPaise).toBe(10_001);
  });

  it('stacks an explicit discount on top of the prepaid incentive', () => {
    const totals = computeOrderTotals([tee, jean], { ...baseOptions, discountPaise: 10_001 });
    const allocated = totals.lines.reduce((sum, line) => sum + line.discountPaise, 0);
    // 10,001 explicit + 5,000 prepaid incentive
    expect(totals.discountPaise).toBe(15_001);
    expect(allocated).toBe(15_001);
  });

  it('reduces taxable value when a discount is applied', () => {
    const noDiscount = computeOrderTotals([tee], { ...baseOptions, prepaidDiscountPaise: 0 });
    const discounted = computeOrderTotals([tee], baseOptions);
    expect(discounted.lines[0]!.taxableValuePaise).toBeLessThan(noDiscount.lines[0]!.taxableValuePaise);
    expect(discounted.lines[0]!.taxPaise).toBeLessThan(noDiscount.lines[0]!.taxPaise);
  });

  it('includes service GST on shipping', () => {
    const totals = computeOrderTotals([tee], baseOptions);
    expect(totals.shippingTaxPaise).toBeGreaterThan(0);
    // 18% of 4900 inclusive = 747
    expect(totals.shippingTaxPaise).toBe(747);
  });

  it('reports the GST rule used', () => {
    const totals = computeOrderTotals([tee], baseOptions);
    expect(totals.ruleId).toBe('gst-2.0-2025-09-22');
  });

  it('rejects an empty order', () => {
    expect(() => computeOrderTotals([], baseOptions)).toThrow(/no lines/);
  });

  it('rejects a discount larger than the order', () => {
    expect(() =>
      computeOrderTotals([tee], { ...baseOptions, discountPaise: 999_999 }),
    ).toThrow(/discount exceeds/);
  });
});

describe('isCodAllowed', () => {
  it('allows COD under the cap in an allowed pincode', () => {
    expect(isCodAllowed({ totalPaise: 100_000, codMaxAmountPaise: 150_000, pincodeAllowsCod: true })).toBe(true);
  });

  it('blocks COD above the cap', () => {
    expect(isCodAllowed({ totalPaise: 200_000, codMaxAmountPaise: 150_000, pincodeAllowsCod: true })).toBe(false);
  });

  it('blocks COD where the pincode disallows it', () => {
    expect(isCodAllowed({ totalPaise: 50_000, codMaxAmountPaise: 150_000, pincodeAllowsCod: false })).toBe(false);
  });
});
