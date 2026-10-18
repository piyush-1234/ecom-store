import { z } from 'zod';
import { emailSchema, phoneSchema } from './auth';
import { addressSchema } from './address';

/**
 * Checkout input.
 *
 * Reuses the address schema so a saved address and a checkout address can never
 * diverge in what they accept (PIN format, state list, phone normalisation).
 */

export const checkoutAddressSchema = addressSchema.omit({
  label: true,
  type: true,
  isDefault: true,
});

export const paymentMethodSchema = z.enum(['PREPAID', 'COD']);

export const checkoutSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  address: checkoutAddressSchema,
  paymentMethod: paymentMethodSchema,
  /** Client-generated; makes a double submit return the same order. */
  idempotencyKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid idempotency key')
    .optional(),
  acceptTerms: z
    .union([z.boolean(), z.literal('on'), z.literal('true')])
    .transform((value) => value === true || value === 'on' || value === 'true')
    .refine((value) => value, { message: 'Please accept the terms to continue' }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Pincode lookup request for the checkout form. */
export const pincodeCheckSchema = z.object({
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
});
