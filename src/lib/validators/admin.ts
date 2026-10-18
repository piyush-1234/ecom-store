import { z } from 'zod';

/**
 * Coupon administration input.
 *
 * Matches the fields `coupons.rules` evaluates, so a coupon created here can never
 * be structurally different from one the checkout understands.
 */

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'Code must be at least 3 characters')
      .max(24, 'Code is too long')
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphen or underscore')
      .transform((value) => value.toUpperCase()),
    type: z.enum(['PERCENT', 'FLAT', 'FREE_SHIPPING']),
    /** Percent for PERCENT; rupees for FLAT; ignored for FREE_SHIPPING. */
    value: z.coerce.number().nonnegative(),
    minOrderRupees: z.coerce.number().nonnegative().default(0),
    maxDiscountRupees: z.coerce.number().nonnegative().optional(),
    usageLimit: z.coerce.number().int().positive().optional(),
    perUserLimit: z.coerce.number().int().min(0).max(20).default(1),
    startsAt: z.string().optional(),
    expiresAt: z.string().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT' && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage must be between 1 and 100',
      });
    }
    if (data.type === 'FLAT' && data.value < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Enter a discount amount',
      });
    }
    if (data.startsAt && data.expiresAt && new Date(data.startsAt) >= new Date(data.expiresAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Expiry must be after the start date',
      });
    }
  });

export type CouponInput = z.infer<typeof couponInputSchema>;

export const productInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter a product name').max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers and hyphens only')
    .optional(),
  categoryId: z.string().min(1, 'Choose a category'),
  fit: z.string().trim().min(2, 'Enter a fit'),
  shortDesc: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  fabric: z.string().trim().max(80).optional(),
  gsm: z.coerce.number().int().positive().max(600).optional(),
  wash: z.string().trim().max(80).optional(),
  careNotes: z.string().trim().max(500).optional(),
  priceRupees: z.coerce.number().positive('Enter a price'),
  mrpRupees: z.coerce.number().positive().optional(),
  isActive: z.boolean().default(true),
});
