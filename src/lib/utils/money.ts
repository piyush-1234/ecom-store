/**
 * Money utilities.
 *
 * RULE (ADR-005): money is ALWAYS an integer number of paise (1 rupee = 100 paise).
 * Floats are only ever used for *display*.
 *
 *   ₹899.00  ->  89900
 *   ₹2,499.00 -> 249900
 */

export const PAISE_PER_RUPEE = 100;

/** Convert a rupee amount (may be fractional) to integer paise. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new TypeError(`toPaise: invalid amount ${rupees}`);
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/** Convert integer paise back to a rupee amount for display/legacy APIs. */
export function fromPaise(paise: number): number {
  if (!Number.isInteger(paise)) throw new TypeError(`fromPaise: paise must be an integer, got ${paise}`);
  return paise / PAISE_PER_RUPEE;
}

/** Sum a list of paise values, guarding against non-integers. */
export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => {
    if (!Number.isInteger(value)) throw new TypeError(`sumPaise: non-integer paise ${value}`);
    return total + value;
  }, 0);
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const inrFormatterWithPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format paise as an INR string.
 * Default drops the decimals — Indian retail pricing is whole rupees
 * (₹899, not ₹899.00) and it reads cleaner on product cards.
 */
export function formatINR(paise: number, options: { withPaise?: boolean } = {}): string {
  const rupees = paise / PAISE_PER_RUPEE;
  return options.withPaise ? inrFormatterWithPaise.format(rupees) : inrFormatter.format(rupees);
}

/** Percentage discount from MRP to selling price, rounded to a whole number. */
export function discountPercent(mrpPaise: number, pricePaise: number): number {
  if (mrpPaise <= 0 || pricePaise >= mrpPaise) return 0;
  return Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
}
