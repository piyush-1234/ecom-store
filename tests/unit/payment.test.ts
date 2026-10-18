import { beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';

process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused?schema=public';
process.env.AUTH_SECRET = 'unit-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_do_not_use';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';

const { verifyPaymentSignature, verifyWebhookSignature, isRazorpayEnabled, createRazorpayOrder } =
  await import('@/server/payments/razorpay');
const { createInvoiceToken, verifyInvoiceToken, invoicePath } = await import(
  '@/server/invoice/token'
);
const { assertPincode, formatEta } = await import('@/server/services/pincode.service');

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Razorpay payment signature', () => {
  const orderId = 'order_TEST123';
  const paymentId = 'pay_TEST456';
  const validSignature = sign(`${orderId}|${paymentId}`, 'test_key_secret_do_not_use');

  it('accepts a correctly signed payment', () => {
    expect(
      verifyPaymentSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: validSignature,
      }),
    ).toBe(true);
  });

  it('rejects a forged signature', () => {
    expect(
      verifyPaymentSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: 'a'.repeat(64),
      }),
    ).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const wrong = sign(`${orderId}|${paymentId}`, 'some_other_secret');
    expect(
      verifyPaymentSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: wrong,
      }),
    ).toBe(false);
  });

  it('rejects a signature for a different payment id', () => {
    const other = sign(`${orderId}|pay_OTHER`, 'test_key_secret_do_not_use');
    expect(
      verifyPaymentSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: other,
      }),
    ).toBe(false);
  });
});

describe('Razorpay webhook signature', () => {
  const body = JSON.stringify({ event: 'payment.captured' });
  const signature = sign(body, 'test_webhook_secret');

  it('accepts a correctly signed webhook body', () => {
    expect(verifyWebhookSignature({ rawBody: body, signature })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = JSON.stringify({ event: 'payment.captured', extra: 1 });
    expect(verifyWebhookSignature({ rawBody: tampered, signature })).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyWebhookSignature({ rawBody: body, signature: '' })).toBe(false);
  });
});

describe('Razorpay gating (approval gate #1)', () => {
  beforeEach(() => {
    delete process.env.RAZORPAY_ENABLED;
  });

  it('is disabled by default', () => {
    expect(isRazorpayEnabled()).toBe(false);
  });

  it('refuses to create an order when disabled', async () => {
    await expect(
      createRazorpayOrder({ amountPaise: 1000, receipt: 'r1' }),
    ).rejects.toThrow(/not enabled/i);
  });
});

describe('invoice token', () => {
  it('verifies a token it created', () => {
    const token = createInvoiceToken('ES-260101-ABC123');
    expect(verifyInvoiceToken('ES-260101-ABC123', token)).toBe(true);
  });

  it('rejects the token for a different order', () => {
    const token = createInvoiceToken('ES-260101-ABC123');
    expect(verifyInvoiceToken('ES-260101-XXXXXX', token)).toBe(false);
  });

  it('rejects a tampered token', () => {
    const token = createInvoiceToken('ES-260101-ABC123');
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(verifyInvoiceToken('ES-260101-ABC123', tampered)).toBe(false);
  });

  it('rejects garbage tokens without throwing', () => {
    expect(verifyInvoiceToken('ES-1', '')).toBe(false);
    expect(verifyInvoiceToken('ES-1', 'not-a-token')).toBe(false);
  });

  it('builds an invoice path containing the token', () => {
    const path = invoicePath('ES-260101-ABC123');
    expect(path).toMatch(/^\/api\/orders\/ES-260101-ABC123\/invoice\?token=[0-9a-f]{32}$/);
  });
});

describe('pincode validation', () => {
  it('accepts a valid PIN', () => {
    expect(assertPincode('411001')).toBe('411001');
  });

  it.each(['012345', '41100', '4110011', 'ABCDEF', ''])('rejects %s', (value) => {
    expect(() => assertPincode(value)).toThrow(/6-digit PIN/);
  });

  it('formats an ETA range', () => {
    expect(formatEta({ etaDaysMin: 3, etaDaysMax: 5 })).toBe('3–5 business days');
    expect(formatEta({ etaDaysMin: 4, etaDaysMax: 4 })).toBe('4 business days');
  });
});
