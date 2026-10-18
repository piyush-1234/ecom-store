import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';

/**
 * Pincode serviceability.
 *
 * Resolution order: exact pincode rule → 3-digit prefix rule → default.
 * The default is *serviceable*, because blocking a pincode we have no rule for
 * loses real orders; exceptions are modelled explicitly in PincodeRule.
 *
 * Shiprocket's live serviceability API is wired in Phase 5; this database-backed
 * check is the source of truth for COD eligibility and ETA estimates until then.
 */

export interface Serviceability {
  pincode: string;
  serviceable: boolean;
  codAllowed: boolean;
  etaDaysMin: number;
  etaDaysMax: number;
  courier: string | null;
  state: string | null;
  source: 'exact' | 'prefix' | 'default';
}

const DEFAULT_ETA_MIN = 4;
const DEFAULT_ETA_MAX = 7;

export const PINCODE_REGEX = /^[1-9]\d{5}$/;

export function assertPincode(raw: string): string {
  const pincode = raw.trim();
  if (!PINCODE_REGEX.test(pincode)) {
    throw new AppError('VALIDATION_ERROR', 'Enter a valid 6-digit PIN code.', 422);
  }
  return pincode;
}

type RuleRow = {
  serviceable: boolean;
  codAllowed: boolean;
  etaDaysMin: number;
  etaDaysMax: number;
  courier: string | null;
  state: string | null;
};

function toResult(
  pincode: string,
  rule: RuleRow,
  source: Serviceability['source'],
): Serviceability {
  return {
    pincode,
    serviceable: rule.serviceable,
    codAllowed: rule.codAllowed,
    etaDaysMin: rule.etaDaysMin,
    etaDaysMax: rule.etaDaysMax,
    courier: rule.courier,
    state: rule.state,
    source,
  };
}

export async function checkServiceability(rawPincode: string): Promise<Serviceability> {
  const pincode = assertPincode(rawPincode);

  const exact = await prisma.pincodeRule.findFirst({
    where: { pincode, isActive: true },
  });
  if (exact) return toResult(pincode, exact, 'exact');

  const byPrefix = await prisma.pincodeRule.findFirst({
    where: { prefix: pincode.slice(0, 3), isActive: true },
  });
  if (byPrefix) return toResult(pincode, byPrefix, 'prefix');

  return {
    pincode,
    serviceable: true,
    codAllowed: true,
    etaDaysMin: DEFAULT_ETA_MIN,
    etaDaysMax: DEFAULT_ETA_MAX,
    courier: null,
    state: null,
    source: 'default',
  };
}

/** Delivery estimate as a human string, e.g. "3–5 business days". */
export function formatEta(result: Pick<Serviceability, 'etaDaysMin' | 'etaDaysMax'>): string {
  if (result.etaDaysMin === result.etaDaysMax) {
    return `${result.etaDaysMin} business days`;
  }
  return `${result.etaDaysMin}–${result.etaDaysMax} business days`;
}
