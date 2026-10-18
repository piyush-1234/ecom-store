import type { OrderStatus } from '@prisma/client';

/**
 * Return / exchange eligibility and refund maths.
 *
 * Pure functions only — no database, no clock side effects. The window logic is the
 * part customers argue about, so it is isolated and unit-tested rather than buried
 * in a route handler.
 *
 * Policy encoded here:
 *  - only DELIVERED orders are returnable
 *  - exchanges get a longer window than refunds (more generous, because a size swap
 *    keeps the revenue and is the behaviour we want to encourage)
 *  - one open request per order item at a time
 *  - shipping and COD fees are NOT refunded; only the goods are
 */

export type ReturnKind = 'REFUND' | 'EXCHANGE';

export interface EligibilityInput {
  orderStatus: OrderStatus;
  deliveredAt: Date | null;
  now: Date;
  kind: ReturnKind;
  returnWindowDays: number;
  exchangeWindowDays: number;
  /** Quantity of this order item. */
  itemQty: number;
  /** Quantity already consumed by other (open or completed) requests. */
  alreadyRequestedQty: number;
  /** Quantity this request covers. */
  requestedQty: number;
  /** True when an open request already exists for this item. */
  hasOpenReturnForItem: boolean;
  /** EXCHANGE only: whether the requested replacement variant has stock. */
  replacementInStock?: boolean;
  /** EXCHANGE only: whether a replacement variant was chosen at all. */
  hasReplacementVariant?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Machine-readable code for the UI/tests. */
  code?:
    | 'OK'
    | 'NOT_DELIVERED'
    | 'NO_DELIVERY_DATE'
    | 'WINDOW_EXPIRED'
    | 'INVALID_QTY'
    | 'QTY_EXCEEDED'
    | 'OPEN_REQUEST_EXISTS'
    | 'REPLACEMENT_REQUIRED'
    | 'REPLACEMENT_OUT_OF_STOCK';
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between delivery and now (never negative). */
export function daysSince(deliveredAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - deliveredAt.getTime()) / DAY_MS));
}

export function windowDaysFor(kind: ReturnKind, returnWindowDays: number, exchangeWindowDays: number): number {
  return kind === 'EXCHANGE' ? exchangeWindowDays : returnWindowDays;
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  if (input.orderStatus !== 'DELIVERED') {
    return {
      eligible: false,
      code: 'NOT_DELIVERED',
      message: 'Returns and exchanges open once your order has been delivered.',
    };
  }

  if (!input.deliveredAt) {
    return {
      eligible: false,
      code: 'NO_DELIVERY_DATE',
      message: 'We have no delivery date on file for this order. Please contact support.',
    };
  }

  const windowDays = windowDaysFor(input.kind, input.returnWindowDays, input.exchangeWindowDays);
  const elapsed = daysSince(input.deliveredAt, input.now);

  if (elapsed > windowDays) {
    return {
      eligible: false,
      code: 'WINDOW_EXPIRED',
      message: `The ${input.kind === 'EXCHANGE' ? 'exchange' : 'return'} window (${windowDays} days) has closed.`,
    };
  }

  if (!Number.isInteger(input.requestedQty) || input.requestedQty < 1) {
    return { eligible: false, code: 'INVALID_QTY', message: 'Choose at least one item.' };
  }

  const remaining = input.itemQty - input.alreadyRequestedQty;
  if (input.requestedQty > remaining) {
    return {
      eligible: false,
      code: 'QTY_EXCEEDED',
      message:
        remaining <= 0
          ? 'This item has already been returned or exchanged.'
          : `Only ${remaining} of this item can still be returned.`,
    };
  }

  if (input.hasOpenReturnForItem) {
    return {
      eligible: false,
      code: 'OPEN_REQUEST_EXISTS',
      message: 'You already have an open request for this item.',
    };
  }

  if (input.kind === 'EXCHANGE') {
    if (!input.hasReplacementVariant) {
      return {
        eligible: false,
        code: 'REPLACEMENT_REQUIRED',
        message: 'Choose the size you want instead.',
      };
    }
    if (!input.replacementInStock) {
      return {
        eligible: false,
        code: 'REPLACEMENT_OUT_OF_STOCK',
        message: 'That size is out of stock. Please choose another or request a refund.',
      };
    }
  }

  return { eligible: true, code: 'OK' };
}

/**
 * Refund for part of a line.
 *
 * `lineTotalPaise` is the amount actually paid for the line (it already has its share
 * of any discount applied). Refunding a fraction of quantity is pro-rata, rounded to
 * the paisa. Shipping and COD fees are excluded by policy.
 */
export function computeRefundPaise(params: {
  lineTotalPaise: number;
  itemQty: number;
  refundQty: number;
}): number {
  const { lineTotalPaise, itemQty, refundQty } = params;

  if (itemQty <= 0) throw new RangeError('computeRefundPaise: itemQty must be positive');
  if (!Number.isInteger(refundQty) || refundQty < 1 || refundQty > itemQty) {
    throw new RangeError('computeRefundPaise: refundQty out of range');
  }
  if (refundQty === itemQty) return lineTotalPaise;

  return Math.round((lineTotalPaise * refundQty) / itemQty);
}

/** Statuses at which a request still occupies its item and/or reserved stock. */
export function isOpenStatus(status: string): boolean {
  return [
    'REQUESTED',
    'APPROVED',
    'PICKUP_SCHEDULED',
    'RECEIVED',
    'REPLACEMENT_SHIPPED',
  ].includes(status);
}

/** Statuses that mean the customer's request is finished, one way or another. */
export function isClosedStatus(status: string): boolean {
  return ['COMPLETED', 'REFUNDED', 'CANCELLED', 'REJECTED'].includes(status);
}
