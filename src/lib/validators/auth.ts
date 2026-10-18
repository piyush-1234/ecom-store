import { z } from 'zod';

/**
 * Auth input schemas — shared by React forms and API route handlers (ADR-012),
 * so the client can never submit something the server silently rejects.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Enter a valid email address')
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

/**
 * Indian mobile numbers.
 * Accepts "9876543210", "+919876543210", "09876543210", "91 98765 43210"
 * and normalises to E.164 (+91XXXXXXXXXX).
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s\-()]/g, ''))
  .transform((value) => {
    if (value.startsWith('+91')) return value.slice(3);
    if (value.startsWith('0091')) return value.slice(4);
    if (value.startsWith('91') && value.length === 12) return value.slice(2);
    if (value.startsWith('0') && value.length === 11) return value.slice(1);
    return value;
  })
  .refine((digits) => /^[6-9]\d{9}$/.test(digits), {
    message: 'Enter a valid 10-digit Indian mobile number',
  })
  .transform((digits) => `+91${digits}`);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((value) => /[A-Za-z]/.test(value), 'Include at least one letter')
  .refine((value) => /\d/.test(value), 'Include at least one number');

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  /** Optional: lets a customer register with email while adding a phone later. */
  phone: phoneSchema.optional(),
  marketingOptIn: z.boolean().default(false),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(80).optional(),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  name: z.string().trim().min(2).max(80).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
