import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyWebhookSignature } from '@/server/payments/razorpay';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook.
 *
 * This is the reliable path: the browser callback can be lost (tab closed, network
 * drop), so a captured payment is reconciled from the webhook.
 *
 * The signature covers the RAW body, so the body is read as text before parsing.
 * Every handler is idempotent — Razorpay retries.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  if (!verifyWebhookSignature({ rawBody, signature })) {
    // 400, never 200: an unsigned webhook must not be silently accepted.
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    if (event.event === 'payment.captured') {
      const entity = event.payload?.payment?.entity;
      const providerOrderId = entity?.order_id;
      const paymentId = entity?.id;

      if (providerOrderId && paymentId) {
        const payment = await prisma.payment.findFirst({
          where: { providerOrderId },
          include: { order: true },
        });

        if (payment && payment.status !== 'CAPTURED') {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data: { status: 'CAPTURED', providerPaymentId: paymentId },
            }),
            prisma.order.update({
              where: { id: payment.orderId },
              data: { status: 'PAID', confirmedAt: new Date() },
            }),
          ]);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Return 500 so Razorpay retries — a transient DB failure must not lose a payment.
    console.error('[razorpay webhook] handler failed', error);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
