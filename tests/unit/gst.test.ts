import { describe, it, expect } from 'vitest';
import {
  GST_RULES,
  HSN,
  computeLineTax,
  gstRateForUnitPrice,
  hsnForCategorySlug,
  resolveGstRule,
  splitTax,
} from '@/server/tax/gst';

describe('resolveGstRule', () => {
  it('selects the post-2025 rule for a current date', () => {
    const rule = resolveGstRule(new Date('2026-01-15T00:00:00Z'));
    expect(rule.id).toBe('gst-2.0-2025-09-22');
    expect(rule.apparelThresholdPaise).toBe(250_000);
    expect(rule.rateAtOrBelow).toBe(5);
    expect(rule.rateAbove).toBe(18);
  });

  it('selects the legacy rule for a date before 22 Sep 2025', () => {
    const rule = resolveGstRule(new Date('2024-06-01T00:00:00Z'));
    expect(rule.id).toBe('legacy-2017-07-01');
    expect(rule.rateAbove).toBe(12);
  });

  it('switches exactly on the effective date', () => {
    expect(resolveGstRule(new Date('2025-09-21T23:59:59Z')).id).toBe('legacy-2017-07-01');
    expect(resolveGstRule(new Date('2025-09-22T00:00:00Z')).id).toBe('gst-2.0-2025-09-22');
  });

  it('throws when the date predates every known rule', () => {
    expect(() => resolveGstRule(new Date('2016-01-01T00:00:00Z'))).toThrow(/No GST rule/);
  });
});

describe('gstRateForUnitPrice — current law (5% <= 2500, 18% > 2500)', () => {
  const rule = GST_RULES[0]!;

  it.each([
    [79_900, 5], // ₹799 tee
    [89_900, 5], // ₹899 tee
    [229_900, 5], // ₹2,299 jean
    [249_900, 5], // ₹2,499 jean — exactly at the ceiling
    [250_000, 5], // ₹2,500 — at the threshold, still concessional
    [250_100, 18], // ₹2,501 — one rupee over
    [259_900, 18], // ₹2,599 jean
  ])('unit price %i paise -> %i%%', (unitPrice, expected) => {
    expect(gstRateForUnitPrice(unitPrice, rule)).toBe(expected);
  });
});

describe('gstRateForUnitPrice — legacy law, for regression', () => {
  const legacy = GST_RULES[1]!;
  it('applies 5% up to ₹1,000 and 12% above', () => {
    expect(gstRateForUnitPrice(99_900, legacy)).toBe(5);
    expect(gstRateForUnitPrice(100_000, legacy)).toBe(5);
    expect(gstRateForUnitPrice(100_100, legacy)).toBe(12);
  });
});

describe('computeLineTax', () => {
  const rule = GST_RULES[0]!;

  it('derives net value and tax from a tax-inclusive ₹899 tee', () => {
    const line = computeLineTax({ unitPricePaise: 89_900, qty: 1, rule });
    expect(line.ratePct).toBe(5);
    expect(line.grossPaise).toBe(89_900);
    // 89900 / 1.05 = 85619.04... -> 85619
    expect(line.taxableValuePaise).toBe(85_619);
    expect(line.taxPaise).toBe(4_281);
    // invariant: net + tax === gross
    expect(line.taxableValuePaise + line.taxPaise).toBe(line.grossPaise);
  });

  it('keeps a 2-piece line of ₹2,499 jeans at 5% (per-piece rule, not per-order)', () => {
    const line = computeLineTax({ unitPricePaise: 249_900, qty: 2, rule });
    expect(line.ratePct).toBe(5);
    expect(line.aboveThreshold).toBe(false);
    expect(line.grossPaise).toBe(499_800);
    expect(line.taxableValuePaise + line.taxPaise).toBe(line.grossPaise);
  });

  it('taxes a ₹2,599 jean at 18%, not 5%', () => {
    const line = computeLineTax({ unitPricePaise: 259_900, qty: 1, rule });
    expect(line.ratePct).toBe(18);
    expect(line.aboveThreshold).toBe(true);
    expect(line.taxableValuePaise + line.taxPaise).toBe(line.grossPaise);
  });

  it('demonstrates the GST-cliff margin effect (₹2,499 nets more than ₹2,599)', () => {
    const atCeiling = computeLineTax({ unitPricePaise: 249_900, qty: 1, rule });
    const aboveCeiling = computeLineTax({ unitPricePaise: 259_900, qty: 1, rule });
    // Higher sticker price, lower net revenue after tax.
    expect(aboveCeiling.grossPaise).toBeGreaterThan(atCeiling.grossPaise);
    expect(aboveCeiling.taxableValuePaise).toBeLessThan(atCeiling.taxableValuePaise);
  });

  it('reduces taxable value when a discount is applied', () => {
    const gross = computeLineTax({ unitPricePaise: 89_900, qty: 2, rule });
    const discounted = computeLineTax({ unitPricePaise: 89_900, qty: 2, discountPaise: 10_000, rule });
    expect(discounted.grossPaise).toBe(gross.grossPaise - 10_000);
    expect(discounted.taxableValuePaise).toBeLessThan(gross.taxableValuePaise);
    expect(discounted.taxableValuePaise + discounted.taxPaise).toBe(discounted.grossPaise);
  });

  it('rejects a discount larger than the line value', () => {
    expect(() =>
      computeLineTax({ unitPricePaise: 89_900, qty: 1, discountPaise: 90_000, rule }),
    ).toThrow(RangeError);
  });

  it('rejects non-positive quantities', () => {
    expect(() => computeLineTax({ unitPricePaise: 89_900, qty: 0, rule })).toThrow(TypeError);
  });

  it('sums line totals exactly across a mixed order (no rounding drift)', () => {
    const lines = [
      computeLineTax({ unitPricePaise: 89_900, qty: 1, rule }), // tee
      computeLineTax({ unitPricePaise: 249_900, qty: 1, rule }), // jean
      computeLineTax({ unitPricePaise: 79_900, qty: 3, rule }), // 3 tees
    ];
    const totalGross = lines.reduce((s, l) => s + l.grossPaise, 0);
    const totalNet = lines.reduce((s, l) => s + l.taxableValuePaise, 0);
    const totalTax = lines.reduce((s, l) => s + l.taxPaise, 0);
    expect(totalNet + totalTax).toBe(totalGross);
  });
});

describe('splitTax', () => {
  it('splits CGST/SGST for an intra-state sale', () => {
    const split = splitTax({ taxPaise: 4_281, sellerStateCode: '27', shipStateCode: '27' });
    expect(split.cgstPaise + split.sgstPaise).toBe(4_281);
    expect(split.igstPaise).toBe(0);
  });

  it('uses IGST for an inter-state sale', () => {
    const split = splitTax({ taxPaise: 4_281, sellerStateCode: '27', shipStateCode: '29' });
    expect(split.igstPaise).toBe(4_281);
    expect(split.cgstPaise).toBe(0);
    expect(split.sgstPaise).toBe(0);
  });

  it('handles an odd paise total without losing a paisa', () => {
    const split = splitTax({ taxPaise: 4_281, sellerStateCode: '27', shipStateCode: '27' });
    expect(split.cgstPaise + split.sgstPaise).toBe(4_281);
  });
});

describe('HSN mapping', () => {
  it('maps t-shirts to 6109 and jeans to 6203', () => {
    expect(hsnForCategorySlug('t-shirts')).toBe(HSN.T_SHIRTS);
    expect(hsnForCategorySlug('jeans')).toBe(HSN.JEANS);
    expect(hsnForCategorySlug('denim')).toBe(HSN.JEANS);
  });
});
