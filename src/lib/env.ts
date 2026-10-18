import { z } from 'zod';

/**
 * Server environment validation.
 *
 * Parsed lazily (not at module load) so that `next build` does not require a live
 * environment, and so a missing variable produces one clear error listing *all*
 * missing keys instead of an `undefined` blowing up deep in a request.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Session signing key. Must be long enough to be meaningful; generated with
  // `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters'),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(720),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Commerce rules (paise)
  COD_MAX_AMOUNT_PAISE: z.coerce.number().int().nonnegative().default(150000),
  COD_FEE_PAISE: z.coerce.number().int().nonnegative().default(4900),
  PREPAID_DISCOUNT_PAISE: z.coerce.number().int().nonnegative().default(5000),
  FREE_SHIPPING_THRESHOLD_PAISE: z.coerce.number().int().nonnegative().default(149900),
  DEFAULT_SHIPPING_FEE_PAISE: z.coerce.number().int().nonnegative().default(4900),
  RETURN_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  EXCHANGE_WINDOW_DAYS: z.coerce.number().int().positive().default(15),

  // Seller identity for GST invoices (placeholders until registration).
  GST_LEGAL_ENTITY_NAME: z.string().default('[LEGAL_ENTITY_NAME]'),
  GST_GSTIN: z.string().default('[GSTIN]'),
  GST_SELLER_STATE: z.string().default('Maharashtra'),
  GST_SELLER_STATE_CODE: z.string().length(2).default('27'),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test helper — clears the memoised env. */
export function resetServerEnvCache(): void {
  cached = null;
}
