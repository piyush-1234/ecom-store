import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { verifyPaymentSignature } from '@/server/payments/razorpay';
import { errorResponse, AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  orderNumber: z.string().min(3),
  razorpayOrderId: z.string().min(3),
  razorpayPaymentId: z.string().min(3),
  signature: z.string().min(10),
});

/**
 * Verify a completed Razorpay checkout and mark the order paid.
 *
 * The signature is the only proof that the payment is genuine — a client can post
 * arbitrary ids, so nothing is trusted before `verifyPaymentSignature` passes.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid payment payload.', 422);
    }

    const { orderNumber, razorpayOrderId, razorpayPaymentId, signature } = parsed.data;

    if (!verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
      throw new AppError('FORBIDDEN', 'Payment signature verification failed.', 400);
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { payments: true },
    });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found.', 404);

    if (order.status === 'PAID') {
      return NextResponse.json({ data: { status: 'already_paid' } });
    }

    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { orderId: order.id, provider: 'RAZORPAY' },
        data: {
          status: 'CAPTURED',
          providerOrderId: razorpayOrderId,
          providerPaymentId: razorpayPaymentId,
          providerSignature: signature,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { status: 'PAID', confirmedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ data: { status: 'paid' } });
  } catch (error) {
    return errorResponse(error);
  }
}
