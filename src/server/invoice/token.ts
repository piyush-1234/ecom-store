import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Signed tokens for downloading an invoice.
 *
 * Guest orders have no account to authenticate against, so the order confirmation
 * carries a short HMAC token in its URL. The token is bound to the order number and
 * cannot be transferred to another order.
 */

const LENGTH = 32; // hex chars = 128 bits

function sign(orderNumber: string): string {
  return createHmac('sha256', serverEnv().AUTH_SECRET)
    .update(`invoice:${orderNumber}`)
    .digest('hex')
    .slice(0, LENGTH);
}

export function createInvoiceToken(orderNumber: string): string {
  return sign(orderNumber);
}

export function verifyInvoiceToken(orderNumber: string, token: string): boolean {
  if (typeof token !== 'string' || token.length !== LENGTH) return false;

  const expected = Buffer.from(sign(orderNumber), 'hex');
  const actual = Buffer.from(token, 'hex');

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Build the shareable invoice path for an order. */
export function invoicePath(orderNumber: string): string {
  return `/api/orders/${encodeURIComponent(orderNumber)}/invoice?token=${createInvoiceToken(orderNumber)}`;
}
