'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createReturnRequest } from '@/server/services/returns.service';
import { verifyInvoiceToken } from '@/server/invoice/token';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { getOrderForInvoice } from '@/server/services/checkout.service';
import { AppError } from '@/server/errors';

const schema = z.object({
  orderNumber: z.string().min(3),
  orderItemId: z.string().min(3),
  token: z.string().optional(),
  kind: z.enum(['REFUND', 'EXCHANGE']),
  reason: z.enum([
    'SIZE_TOO_SMALL',
    'SIZE_TOO_LARGE',
    'FIT_NOT_AS_EXPECTED',
    'DEFECTIVE',
    'WRONG_ITEM',
    'CHANGED_MIND',
    'OTHER',
  ]),
  note: z.string().trim().max(500).optional(),
  qty: z.coerce.number().int().min(1).max(20),
  requestedVariantId: z.string().optional(),
});

/**
 * Customer return/exchange request.
 *
 * Authorisation mirrors the order page: a signed order token (guest) or the signed-in
 * owner. The token is re-verified here — a form field is not proof of anything.
 */
export async function requestReturnAction(formData: FormData): Promise<never> {
  const raw = {
    orderNumber: String(formData.get('orderNumber') ?? ''),
    orderItemId: String(formData.get('orderItemId') ?? ''),
    token: formData.get('token') ? String(formData.get('token')) : undefined,
    kind: String(formData.get('kind') ?? ''),
    reason: String(formData.get('reason') ?? ''),
    note: formData.get('note') ? String(formData.get('note')) : undefined,
    qty: formData.get('qty') ?? 1,
    requestedVariantId: formData.get('requestedVariantId')
      ? String(formData.get('requestedVariantId'))
      : undefined,
  };

  const parsed = schema.safeParse(raw);
  const backTo = `/order/${raw.orderNumber}${raw.token ? `?token=${raw.token}` : ''}`;

  if (!parsed.success) {
    redirect(`${backTo}&returnError=${encodeURIComponent('Please check the request details.')}`);
  }

  const input = parsed.data;

  const order = await getOrderForInvoice(input.orderNumber);
  if (!order) redirect(`${backTo}&returnError=${encodeURIComponent('Order not found.')}`);

  let authorised = input.token ? verifyInvoiceToken(input.orderNumber, input.token) : false;
  if (!authorised) {
    const session = await getCurrentSession();
    authorised = Boolean(session && order.userId && session.sub === order.userId);
  }
  if (!authorised) {
    redirect(`${backTo}&returnError=${encodeURIComponent('Please sign in to request a return.')}`);
  }

  try {
    await createReturnRequest({
      orderNumber: input.orderNumber,
      orderItemId: input.orderItemId,
      kind: input.kind,
      reason: input.reason,
      note: input.note,
      qty: input.qty,
      requestedVariantId: input.requestedVariantId,
    });
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Could not create the request.';
    if (!(error instanceof AppError)) console.error('[returns] request failed', error);
    redirect(`${backTo}&returnError=${encodeURIComponent(message)}`);
  }

  redirect(`${backTo}&returnOk=1`);
}
