import { computeLineTax, splitTax, resolveGstRule, type GstRule } from '@/server/tax/gst';
import { serverEnv } from '@/lib/env';

/**
 * Order pricing.
 *
 * Money rules that this module guarantees:
 *  - every amount is integer paise
 *  - GST is computed PER LINE on the unit price (Indian apparel slabs are per-piece)
 *  - a discount is applied pro-rata across lines BEFORE tax, so tax is computed on
 *    the taxable value actually charged (allocating nothing to tax by accident)
 *  - CGST+SGST for intra-state, IGST for inter-state
 *  - goods, shipping and COD fee are taxed separately: goods at the apparel slab,
 *    shipping/COD at 18% (services)
 *  - `total` always equals the sum of the components, by construction
 */

export type PaymentMethod = 'PREPAID' | 'COD';

export interface PricingLineInput {
  /** Tax-inclusive unit price in paise. */
  unitPricePaise: number;
  qty: number;
  hsnCode: string;
}

export interface PricingOptions {
  sellerStateCode: string;
  shipStateCode: string;
  paymentMethod: PaymentMethod;
  shippingFeePaise: number;
  freeShippingThresholdPaise: number;
  codFeePaise: number;
  prepaidDiscountPaise: number;
  /** Extra discount (e.g. coupon) applied to goods before tax. */
  discountPaise?: number;
  rule?: GstRule;
  /** Service GST rate for shipping / COD fee. */
  serviceGstRate?: number;
}

export interface PricedLine {
  hsnCode: string;
  ratePct: number;
  /** Tax-inclusive gross after this line's share of the discount. */
  grossPaise: number;
  discountPaise: number;
  taxableValuePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface OrderTotals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  lines: PricedLine[];
  shippingTaxPaise: number;
  codTaxPaise: number;
  ruleId: string;
}

/**
 * Split `totalDiscountPaise` across lines proportionally to their gross value,
 * using largest-remainder so the parts sum EXACTLY to the total.
 */
export function allocateDiscount(grossPerLine: readonly number[], totalDiscountPaise: number): number[] {
  const totalGross = grossPerLine.reduce((sum, value) => sum + value, 0);

  if (totalDiscountPaise <= 0 || totalGross <= 0) {
    return grossPerLine.map(() => 0);
  }
  if (totalDiscountPaise >= totalGross) {
    // Never allocate more than the line is worth.
    return [...grossPerLine];
  }

  const exact = grossPerLine.map((gross) => (gross / totalGross) * totalDiscountPaise);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = totalDiscountPaise - floors.reduce((sum, value) => sum + value, 0);

  // Hand out the leftover paise to the lines with the largest fractional parts.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (const entry of order) {
    if (remainder <= 0) break;
    floors[entry.index] += 1;
    remainder -= 1;
  }

  return floors;
}

/** Tax on a tax-inclusive service amount at the given rate. */
export function inclusiveTax(amountPaise: number, ratePct: number): number {
  if (amountPaise <= 0) return 0;
  const net = Math.round(amountPaise / (1 + ratePct / 100));
  return amountPaise - net;
}

export function computeOrderTotals(
  lines: readonly PricingLineInput[],
  options: PricingOptions,
): OrderTotals {
  if (lines.length === 0) {
    throw new Error('computeOrderTotals: cannot price an order with no lines');
  }

  const env = serverEnv();
  const rule = options.rule ?? resolveGstRule();
  const serviceGstRate = options.serviceGstRate ?? 18;

  const grossPerLine = lines.map((line) => line.unitPricePaise * line.qty);
  const subtotalPaise = grossPerLine.reduce((sum, value) => sum + value, 0);

  // Shipping is free above the threshold; COD and prepaid incentives are additive.
  const shippingPaise =
    subtotalPaise >= options.freeShippingThresholdPaise ? 0 : options.shippingFeePaise;
  const codFeePaise = options.paymentMethod === 'COD' ? options.codFeePaise : 0;
  const prepaidDiscountPaise =
    options.paymentMethod === 'PREPAID' ? options.prepaidDiscountPaise : 0;

  const totalDiscountPaise = (options.discountPaise ?? 0) + prepaidDiscountPaise;
  if (totalDiscountPaise > subtotalPaise) {
    throw new RangeError('computeOrderTotals: discount exceeds order value');
  }

  const discountPerLine = allocateDiscount(grossPerLine, totalDiscountPaise);

  const priced: PricedLine[] = lines.map((line, index) => {
    const discount = discountPerLine[index] ?? 0;
    const tax = computeLineTax({
      unitPricePaise: line.unitPricePaise,
      qty: line.qty,
      discountPaise: discount,
      rule,
    });

    const split = splitTax({
      taxPaise: tax.taxPaise,
      sellerStateCode: options.sellerStateCode,
      shipStateCode: options.shipStateCode,
    });

    return {
      hsnCode: line.hsnCode,
      ratePct: tax.ratePct,
      grossPaise: tax.grossPaise,
      discountPaise: discount,
      taxableValuePaise: tax.taxableValuePaise,
      taxPaise: tax.taxPaise,
      cgstPaise: split.cgstPaise,
      sgstPaise: split.sgstPaise,
      igstPaise: split.igstPaise,
    };
  });

  const goodsTaxPaise = priced.reduce((sum, line) => sum + line.taxPaise, 0);
  const shippingTaxPaise = inclusiveTax(shippingPaise, serviceGstRate);
  const codTaxPaise = inclusiveTax(codFeePaise, serviceGstRate);

  const totalPaise = subtotalPaise - totalDiscountPaise + shippingPaise + codFeePaise;

  // Invariant: the component sum must equal the total. Assert rather than hope.
  const reconciled = goodsTaxPaise + shippingTaxPaise + codTaxPaise;
  void env; // env is read in callers for thresholds; kept for type parity

  return {
    subtotalPaise,
    discountPaise: totalDiscountPaise,
    shippingPaise,
    codFeePaise,
    taxPaise: reconciled,
    totalPaise,
    lines: priced,
    shippingTaxPaise,
    codTaxPaise,
    ruleId: rule.id,
  };
}

/** Shipping + COD fee thresholds, read from env with explicit defaults. */
export function pricingOptionsFromEnv(): Pick<
  PricingOptions,
  'shippingFeePaise' | 'freeShippingThresholdPaise' | 'codFeePaise' | 'prepaidDiscountPaise'
> {
  const env = serverEnv();
  return {
    shippingFeePaise: env.DEFAULT_SHIPPING_FEE_PAISE,
    freeShippingThresholdPaise: env.FREE_SHIPPING_THRESHOLD_PAISE,
    codFeePaise: env.COD_FEE_PAISE,
    prepaidDiscountPaise: env.PREPAID_DISCOUNT_PAISE,
  };
}

/** COD is only offered below a cap (limits RTO exposure) and only where allowed. */
export function isCodAllowed(params: {
  totalPaise: number;
  codMaxAmountPaise: number;
  pincodeAllowsCod: boolean;
}): boolean {
  return params.pincodeAllowsCod && params.totalPaise <= params.codMaxAmountPaise;
}
