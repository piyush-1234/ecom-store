import type { ReturnKind, ReturnReason, ReturnStatus } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import { serverEnv } from '@/lib/env';
import {
  checkEligibility,
  computeRefundPaise,
  isOpenStatus,
} from '@/server/services/returns.rules';

/**
 * Returns and exchanges.
 *
 * Stock rules (the part that silently breaks in most stores):
 *  - an EXCHANGE reserves the replacement at APPROVAL, not at request time
 *  - the returned item is restocked when the parcel is RECEIVED, and only then
 *  - cancelling an approved exchange releases the reservation
 *  - every stock movement is a conditional update, so a race cannot go negative
 */

export interface CreateReturnInput {
  orderNumber: string;
  orderItemId: string;
  kind: ReturnKind;
  reason: ReturnReason;
  note?: string;
  qty: number;
  /** EXCHANGE only. */
  requestedVariantId?: string;
}

export interface ReturnView {
  id: string;
  kind: ReturnKind;
  reason: ReturnReason;
  status: ReturnStatus;
  qty: number;
  refundAmountPaise: number | null;
  requestedVariantId: string | null;
  requestedAt: Date;
  orderNumber: string;
  productName: string;
  variantLabel: string;
}

const INCLUDE_ORDER = {
  order: { include: { items: true } },
  orderItem: true,
  requestedVariant: { select: { id: true, size: true, color: true, stock: true, productId: true } },
} as const;

type ReturnRow = NonNullable<Awaited<ReturnType<typeof findReturn>>>;

function findReturn(id: string) {
  return prisma.return.findUnique({ where: { id }, include: {
    order: { include: { items: true } },
    orderItem: true,
    requestedVariant: { select: { id: true, size: true, color: true, stock: true, productId: true } },
  } });
}

function toView(row: ReturnRow): ReturnView {
  return {
    id: row.id,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    qty: row.qty,
    refundAmountPaise: row.refundAmountPaise,
    requestedVariantId: row.requestedVariantId,
    requestedAt: row.requestedAt,
    orderNumber: row.order.orderNumber,
    productName: row.orderItem.productName,
    variantLabel: row.orderItem.variantLabel,
  };
}

/**
 * Create a customer request.
 * Authorisation (owner or signed order token) is the caller's responsibility.
 */
export async function createReturnRequest(input: CreateReturnInput): Promise<ReturnView> {
  const env = serverEnv();

  const order = await prisma.order.findUnique({
    where: { orderNumber: input.orderNumber },
    include: { items: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.', 404);

  const item = order.items.find((row) => row.id === input.orderItemId);
  if (!item) throw new AppError('NOT_FOUND', 'That item is not part of this order.', 404);

  const existing = await prisma.return.findMany({
    where: { orderItemId: item.id },
    select: { qty: true, status: true },
  });

  const alreadyRequestedQty = existing
    .filter((row) => row.status !== 'CANCELLED' && row.status !== 'REJECTED')
    .reduce((sum, row) => sum + row.qty, 0);

  const hasOpen = existing.some((row) => isOpenStatus(row.status));

  let replacementVariant: { id: string; stock: number; productId: string; size: string } | null = null;
  if (input.kind === 'EXCHANGE' && input.requestedVariantId) {
    replacementVariant = await prisma.variant.findUnique({
      where: { id: input.requestedVariantId },
      select: { id: true, stock: true, productId: true, size: true },
    });

    if (replacementVariant && replacementVariant.productId !== item.productId) {
      throw new AppError('VALIDATION_ERROR', 'The replacement must be the same product.', 422);
    }
  }

  const eligibility = checkEligibility({
    orderStatus: order.status,
    deliveredAt: order.deliveredAt,
    now: new Date(),
    kind: input.kind,
    returnWindowDays: env.RETURN_WINDOW_DAYS,
    exchangeWindowDays: env.EXCHANGE_WINDOW_DAYS,
    itemQty: item.qty,
    alreadyRequestedQty,
    requestedQty: input.qty,
    hasOpenReturnForItem: hasOpen,
    hasReplacementVariant: Boolean(input.requestedVariantId),
    replacementInStock: replacementVariant ? replacementVariant.stock >= input.qty : false,
  });

  if (!eligibility.eligible) {
    throw new AppError('CONFLICT', eligibility.message ?? 'Not eligible for return.', 409, {
      code: eligibility.code,
    });
  }

  const refundAmountPaise =
    input.kind === 'REFUND'
      ? computeRefundPaise({ lineTotalPaise: item.lineTotalPaise, itemQty: item.qty, refundQty: input.qty })
      : null;

  const created = await prisma.return.create({
    data: {
      orderId: order.id,
      orderItemId: item.id,
      userId: order.userId,
      kind: input.kind,
      reason: input.reason,
      note: input.note ?? null,
      status: 'REQUESTED',
      qty: input.qty,
      requestedVariantId: input.kind === 'EXCHANGE' ? (input.requestedVariantId ?? null) : null,
      refundAmountPaise,
    },
    include: INCLUDE_ORDER,
  });

  return toView(created);
}

// ---------------------------------------------------------------------------
// Admin transitions
// ---------------------------------------------------------------------------

const ALLOWED_FROM: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [],
  APPROVED: ['REQUESTED'],
  REJECTED: ['REQUESTED'],
  PICKUP_SCHEDULED: ['APPROVED'],
  RECEIVED: ['APPROVED', 'PICKUP_SCHEDULED'],
  REPLACEMENT_SHIPPED: ['RECEIVED'],
  COMPLETED: ['REPLACEMENT_SHIPPED'],
  REFUNDED: ['RECEIVED'],
  CANCELLED: ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'],
};

async function audit(params: {
  adminId: string;
  action: string;
  returnId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: 'ADMIN',
      actorId: params.adminId,
      adminId: params.adminId,
      action: params.action,
      entity: 'Return',
      entityId: params.returnId,
      meta: params.meta ? (params.meta as never) : undefined,
    },
  });
}

export async function approveReturn(returnId: string, adminId: string): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (!ALLOWED_FROM.APPROVED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot approve a request that is ${row.status}.`, 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Reserve the replacement so it cannot be sold twice.
    if (row.kind === 'EXCHANGE' && row.requestedVariantId) {
      const reserved = await tx.variant.updateMany({
        where: { id: row.requestedVariantId, stock: { gte: row.qty } },
        data: { stock: { decrement: row.qty } },
      });
      if (reserved.count !== 1) {
        throw new AppError('CONFLICT', 'The replacement size is now out of stock.', 409);
      }
    }

    return tx.return.update({
      where: { id: returnId },
      data: { status: 'APPROVED', approvedAt: new Date() },
      include: INCLUDE_ORDER,
    });
  });

  await audit({ adminId, action: 'return.approve', returnId });
  return toView(updated);
}

export async function rejectReturn(
  returnId: string,
  adminId: string,
  reason?: string,
): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (!ALLOWED_FROM.REJECTED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot reject a request that is ${row.status}.`, 409);
  }

  const updated = await prisma.return.update({
    where: { id: returnId },
    data: { status: 'REJECTED', adminNote: reason ?? null, resolvedAt: new Date() },
    include: INCLUDE_ORDER,
  });

  await audit({ adminId, action: 'return.reject', returnId, meta: { reason } });
  return toView(updated);
}

export async function cancelReturn(returnId: string, adminId: string): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (!ALLOWED_FROM.CANCELLED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot cancel a request that is ${row.status}.`, 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Release the reservation made at approval.
    if (row.kind === 'EXCHANGE' && row.requestedVariantId && row.status !== 'REQUESTED') {
      await tx.variant.update({
        where: { id: row.requestedVariantId },
        data: { stock: { increment: row.qty } },
      });
    }

    return tx.return.update({
      where: { id: returnId },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
      include: INCLUDE_ORDER,
    });
  });

  await audit({ adminId, action: 'return.cancel', returnId });
  return toView(updated);
}

/** Mark the parcel as received: restock the returned item exactly once. */
export async function markReturnReceived(returnId: string, adminId: string): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (!ALLOWED_FROM.RECEIVED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot mark received a request that is ${row.status}.`, 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (!row.orderItem.variantId) {
      throw new AppError('CONFLICT', 'This line has no variant to restock.', 409);
    }

    await tx.variant.update({
      where: { id: row.orderItem.variantId },
      data: { stock: { increment: row.qty } },
    });

    return tx.return.update({
      where: { id: returnId },
      data: { status: 'RECEIVED', receivedAt: new Date() },
      include: INCLUDE_ORDER,
    });
  });

  await audit({ adminId, action: 'return.received', returnId });
  return toView(updated);
}

/** Send the replacement for an approved exchange. */
export async function shipReplacement(returnId: string, adminId: string): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (row.kind !== 'EXCHANGE') {
    throw new AppError('CONFLICT', 'Only exchange requests have a replacement.', 409);
  }
  if (!ALLOWED_FROM.REPLACEMENT_SHIPPED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot ship a replacement for a request that is ${row.status}.`, 409);
  }

  const updated = await prisma.return.update({
    where: { id: returnId },
    data: { status: 'REPLACEMENT_SHIPPED' },
    include: INCLUDE_ORDER,
  });

  await audit({ adminId, action: 'return.replacement_shipped', returnId });
  return toView(updated);
}

/** Close out a refund once the money has been returned. */
export async function completeRefund(returnId: string, adminId: string): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (row.kind !== 'REFUND') {
    throw new AppError('CONFLICT', 'Only refund requests can be refunded.', 409);
  }
  if (!ALLOWED_FROM.REFUNDED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot refund a request that is ${row.status}.`, 409);
  }

  const amount = row.refundAmountPaise ?? 0;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { orderId: row.orderId },
      data: { refundedPaise: { increment: amount }, status: 'PARTIALLY_REFUNDED' },
    });

    return tx.return.update({
      where: { id: returnId },
      data: { status: 'REFUNDED', resolvedAt: new Date() },
      include: INCLUDE_ORDER,
    });
  });

  await audit({ adminId, action: 'return.refunded', returnId, meta: { amount } });
  return toView(updated);
}

/** Close out an exchange. */
export async function completeExchange(returnId: string, adminId: string): Promise<ReturnView> {
  const row = await findReturn(returnId);
  if (!row) throw new AppError('NOT_FOUND', 'Return not found.', 404);
  if (!ALLOWED_FROM.COMPLETED.includes(row.status)) {
    throw new AppError('CONFLICT', `Cannot complete a request that is ${row.status}.`, 409);
  }

  const updated = await prisma.return.update({
    where: { id: returnId },
    data: { status: 'COMPLETED', resolvedAt: new Date() },
    include: INCLUDE_ORDER,
  });

  await audit({ adminId, action: 'return.completed', returnId });
  return toView(updated);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listReturnsForOrder(orderNumber: string): Promise<ReturnView[]> {
  const rows = await prisma.return.findMany({
    where: { order: { orderNumber } },
    include: INCLUDE_ORDER,
    orderBy: { requestedAt: 'desc' },
  });
  return rows.map(toView);
}

export async function listReturnRequests(status?: ReturnStatus): Promise<ReturnView[]> {
  const rows = await prisma.return.findMany({
    where: status ? { status } : {},
    include: INCLUDE_ORDER,
    orderBy: [{ status: 'asc' }, { requestedAt: 'asc' }],
  });
  return rows.map(toView);
}

export async function getReturn(returnId: string): Promise<ReturnView | null> {
  const row = await findReturn(returnId);
  return row ? toView(row) : null;
}

/** Replacement options for an order item (same product, other sizes). */
export async function getReplacementOptions(orderItemId: string): Promise<
  { id: string; size: string; color: string; stock: number }[]
> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { productId: true, variantId: true, sku: true },
  });
  if (!item?.productId) return [];

  const variants = await prisma.variant.findMany({
    where: { productId: item.productId, isActive: true, id: { not: item.variantId ?? undefined } },
    orderBy: [{ colorOrder: 'asc' }, { sizeOrder: 'asc' }],
    select: { id: true, size: true, color: true, stock: true },
  });

  return variants;
}
