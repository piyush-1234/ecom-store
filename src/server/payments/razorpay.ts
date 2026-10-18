import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/server/errors';

/**
 * Razorpay adapter.
 *
 * Implemented against the documented REST API with `fetch` rather than the SDK, so
 * there is one less dependency and the networking surface is explicit.
 *
 * Everything is gated on RAZORPAY_ENABLED. With it off, prepaid checkout refuses
 * with a clear message instead of appearing to work (approval gate #1: no real keys
 * until the user supplies test credentials).
 *
 * Signature verification is pure and unit-tested with a local secret.
 */

const API_BASE = 'https://api.razorpay.com/v1';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

export function isRazorpayEnabled(): boolean {
  return process.env.RAZORPAY_ENABLED === 'true';
}

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay is enabled but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing');
  }
  return { keyId, keySecret };
}

function authHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!isRazorpayEnabled()) {
    throw new AppError(
      'CONFLICT',
      'Online payment is not enabled yet. Please choose cash on delivery.',
      409,
    );
  }

  const { keyId, keySecret } = credentials();

  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(keyId, keySecret),
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes ?? {},
      payment_capture: 1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as RazorpayOrder;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify the checkout callback signature.
 * Razorpay signs `"{razorpay_order_id}|{razorpay_payment_id}"` with the key secret.
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  keySecret?: string;
}): boolean {
  const secret = params.keySecret ?? process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = createHmac('sha256', secret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');

  return safeEqualHex(expected, params.signature);
}

/**
 * Verify a webhook payload.
 * The signature is an HMAC of the RAW request body, so the body must be read as
 * text before any JSON parsing.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string;
  webhookSecret?: string;
}): boolean {
  const secret = params.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = createHmac('sha256', secret).update(params.rawBody).digest('hex');
  return safeEqualHex(expected, params.signature);
}
