/**
 * GST engine for apparel (India).
 *
 * ⚠️  IMPORTANT — READ ADR-004 BEFORE CHANGING ANYTHING HERE.
 *
 * The project brief specified "5% under ₹1000, 12% above". That is the PRE-2025
 * law. The 56th GST Council removed the 12% apparel slab; effective
 * 22 September 2025 the rates are:
 *
 *     apparel ≤ ₹2,500 per piece  ->  5%
 *     apparel > ₹2,500 per piece  ->  18%
 *
 * Source: Ministry of Finance reply, Lok Sabha Unstarred Q. No. 2509 (15 Dec 2025).
 *
 * The rules are DATA, not `if` statements, so a rate change (or a switch back to
 * the legacy slabs) is a one-line table edit. Because rates are per-piece, tax
 * MUST be computed per line item on the UNIT price — never on the order subtotal.
 */

/** A versioned GST rate band for apparel. */
export interface GstRule {
  /** Stable identifier, also written to audit logs. */
  id: string;
  /** Inclusive date this rule takes effect (ISO yyyy-mm-dd). */
  effectiveFrom: string;
  /** Per-piece price ceiling for the concessional rate, in paise. */
  apparelThresholdPaise: number;
  /** Rate (%) applied when unit price <= threshold. */
  rateAtOrBelow: number;
  /** Rate (%) applied when unit price > threshold. */
  rateAbove: number;
  description: string;
}

/**
 * Rate table, newest first. `resolveGstRule` picks the newest rule that is
 * already in effect.
 */
export const GST_RULES: readonly GstRule[] = [
  {
    id: 'gst-2.0-2025-09-22',
    effectiveFrom: '2025-09-22',
    apparelThresholdPaise: 250_000, // ₹2,500 per piece
    rateAtOrBelow: 5,
    rateAbove: 18,
    description:
      'Post-56th GST Council: 5% up to ₹2,500/piece, 18% above. 12% slab removed.',
  },
  {
    id: 'legacy-2017-07-01',
    effectiveFrom: '2017-07-01',
    apparelThresholdPaise: 100_000, // ₹1,000 per piece
    rateAtOrBelow: 5,
    rateAbove: 12,
    description: 'Legacy pre-2025 slabs (5% / 12% at ₹1,000). Retained for historical data only.',
  },
] as const;

/**
 * Select the rule in effect at a given date.
 * Throws if the date predates every known rule, rather than silently guessing.
 */
export function resolveGstRule(
  asOf: Date = new Date(),
  rules: readonly GstRule[] = GST_RULES,
): GstRule {
  const time = asOf.getTime();
  const applicable = rules
    .filter((rule) => new Date(`${rule.effectiveFrom}T00:00:00Z`).getTime() <= time)
    .sort(
      (a, b) =>
        new Date(`${b.effectiveFrom}T00:00:00Z`).getTime() -
        new Date(`${a.effectiveFrom}T00:00:00Z`).getTime(),
    );

  const [newest] = applicable;
  if (!newest) {
    throw new Error(`No GST rule in effect for ${asOf.toISOString()}`);
  }
  return newest;
}

/**
 * The GST rate for a single garment at a given unit price.
 * The threshold compares the PER-PIECE price, which is why qty must never
 * influence this decision.
 */
export function gstRateForUnitPrice(unitPricePaise: number, rule: GstRule): number {
  if (!Number.isInteger(unitPricePaise) || unitPricePaise < 0) {
    throw new TypeError(`gstRateForUnitPrice: invalid unit price ${unitPricePaise}`);
  }
  return unitPricePaise <= rule.apparelThresholdPaise ? rule.rateAtOrBelow : rule.rateAbove;
}

export interface LineTaxInput {
  /** Tax-inclusive selling price of ONE unit, in paise. */
  unitPricePaise: number;
  qty: number;
  /** Line-level discount, in paise (reduces taxable value). */
  discountPaise?: number;
  rule?: GstRule;
}

export interface LineTaxResult {
  ruleId: string;
  ratePct: number;
  /** Gross line amount after discount, incl. tax. */
  grossPaise: number;
  /** Net-of-tax value that goes on the invoice. */
  taxableValuePaise: number;
  taxPaise: number;
  /** CGST/SGST split for intra-state; IGST for inter-state. */
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  /** True when the line was taxed at the higher (above-threshold) rate. */
  aboveThreshold: boolean;
}

/**
 * Compute GST for a single order line.
 *
 * Prices are tax-INCLUSIVE, so the net value is derived by dividing out the tax:
 *   taxable = gross / (1 + rate/100)
 *
 * Rounding strategy: round the PER-UNIT taxable value once, then multiply by qty.
 * This guarantees `sum(line.taxable) + sum(line.tax) === sum(line.gross)` exactly,
 * and keeps a 2-piece line of ₹2,499 tees at 5% (each piece is under the ceiling).
 */
export function computeLineTax(input: LineTaxInput): LineTaxResult {
  const { unitPricePaise, qty } = input;
  const discountPaise = input.discountPaise ?? 0;
  const rule = input.rule ?? resolveGstRule();

  if (!Number.isInteger(qty) || qty < 1) {
    throw new TypeError(`computeLineTax: qty must be a positive integer, got ${qty}`);
  }
  if (!Number.isInteger(discountPaise) || discountPaise < 0) {
    throw new TypeError(`computeLineTax: invalid discount ${discountPaise}`);
  }

  const grossBeforeDiscount = unitPricePaise * qty;
  if (discountPaise > grossBeforeDiscount) {
    throw new RangeError('computeLineTax: discount exceeds line value');
  }
  const grossPaise = grossBeforeDiscount - discountPaise;

  const ratePct = gstRateForUnitPrice(unitPricePaise, rule);

  // Derive the per-unit net value, then scale by quantity.
  const unitNetPaise = Math.round(unitPricePaise / (1 + ratePct / 100));
  const taxableValueBeforeDiscount = unitNetPaise * qty;

  // Apply the discount to net-of-tax value proportionally, so tax follows it.
  const taxableValuePaise =
    discountPaise === 0
      ? taxableValueBeforeDiscount
      : Math.round((taxableValueBeforeDiscount * grossPaise) / grossBeforeDiscount);

  const taxPaise = grossPaise - taxableValuePaise;

  // Intra-state split. Whether a sale is inter-state is decided by the seller's
  // state vs the shipping state — resolved by the caller in `splitTax`.
  const half = Math.floor(taxPaise / 2);
  const cgstPaise = half;
  const sgstPaise = taxPaise - half;

  return {
    ruleId: rule.id,
    ratePct,
    grossPaise,
    taxableValuePaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    igstPaise: 0,
    aboveThreshold: unitPricePaise > rule.apparelThresholdPaise,
  };
}

/**
 * Convert a CGST/SGST split into an IGST split when the delivery state differs
 * from the seller's state. IGST is the full amount; CGST and SGST become zero.
 */
export function splitTax(params: {
  taxPaise: number;
  sellerStateCode: string;
  shipStateCode: string;
}): { cgstPaise: number; sgstPaise: number; igstPaise: number } {
  if (params.sellerStateCode === params.shipStateCode) {
    const half = Math.floor(params.taxPaise / 2);
    return { cgstPaise: half, sgstPaise: params.taxPaise - half, igstPaise: 0 };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: params.taxPaise };
}

/**
 * HSN codes required on Indian tax invoices.
 * 6109 = knitted t-shirts/vests; 6203 = men's woven trousers (jeans).
 */
export const HSN = {
  T_SHIRTS: '6109',
  JEANS: '6203',
} as const;

export type HsnCode = (typeof HSN)[keyof typeof HSN];

/** Fallback HSN by category slug, used when a category row has no HSN. */
export function hsnForCategorySlug(slug: string): HsnCode {
  if (slug.includes('jean') || slug.includes('denim') || slug.includes('trouser')) {
    return HSN.JEANS;
  }
  return HSN.T_SHIRTS;
}
