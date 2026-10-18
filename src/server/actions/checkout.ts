'use server';

import { redirect } from 'next/navigation';
import { checkoutSchema } from '@/lib/validators/checkout';
import { placeOrder } from '@/server/services/checkout.service';
import { getOrderSummary } from '@/server/services/checkout.service';
import { sendOrderConfirmation } from '@/server/email/order-emails';
import { readCartToken } from '@/server/cart/identity';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { isRazorpayEnabled } from '@/server/payments/razorpay';
import { AppError } from '@/server/errors';

export interface CheckoutState {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
}

function readForm(formData: FormData) {
  const value = (key: string): string => String(formData.get(key) ?? '');

  return {
    email: value('email'),
    phone: value('phone'),
    paymentMethod: value('paymentMethod'),
    couponCode: value('couponCode') || undefined,
    idempotencyKey: value('idempotencyKey') || undefined,
    acceptTerms: value('acceptTerms'),
    address: {
      fullName: value('fullName'),
      phone: value('phone'),
      line1: value('line1'),
      line2: value('line2') || undefined,
      landmark: value('landmark') || undefined,
      city: value('city'),
      state: value('state'),
      pincode: value('pincode'),
    },
  };
}

export async function placeOrderAction(
  _prev: CheckoutState | null,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return { ok: false, message: 'Please check the highlighted fields.', fields };
  }

  const input = parsed.data;

  // Online payment is gated until Razorpay test keys are configured (gate #1).
  if (input.paymentMethod === 'PREPAID' && !isRazorpayEnabled()) {
    return {
      ok: false,
      message: 'Online payment is not enabled yet. Please choose cash on delivery.',
    };
  }

  const cartToken = readCartToken();
  if (!cartToken) {
    return { ok: false, message: 'Your cart is empty.' };
  }

  const session = await getCurrentSession();

  let placed;
  try {
    placed = await placeOrder({
      cartToken,
      userId: session?.sub ?? null,
      email: input.email,
      phone: input.phone,
      address: {
        fullName: input.address.fullName,
        phone: input.address.phone,
        line1: input.address.line1,
        line2: input.address.line2,
        landmark: input.address.landmark,
        city: input.address.city,
        state: input.address.state,
        pincode: input.address.pincode,
      },
      paymentMethod: input.paymentMethod,
      couponCode: input.couponCode,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, message: error.message };
    }
    console.error('[checkout] placeOrder failed', error);
    return { ok: false, message: 'We could not place your order. Please try again.' };
  }

  // Email failure must never lose the order — log and continue.
  try {
    const summary = await getOrderSummary(placed.orderNumber);
    if (summary) await sendOrderConfirmation(summary);
  } catch (error) {
    console.error('[checkout] confirmation email failed', error);
  }

  // Best effort: create the shipment now for COD orders. Non-fatal by design.
  if (input.paymentMethod === 'COD') {
    try {
      const { maybeCreateShipmentForOrder } = await import('@/server/services/shipping.service');
      const result = await maybeCreateShipmentForOrder(placed.id);
      if (!result.created) {
        console.log(`[checkout] shipment not created for ${placed.orderNumber}: ${result.reason}`);
      }
    } catch (error) {
      console.error('[checkout] shipment creation threw', error);
    }
  }

  redirect(`/order/${placed.orderNumber}?token=${placed.invoiceToken}`);
}
