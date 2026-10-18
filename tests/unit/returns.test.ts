import { describe, expect, it } from 'vitest';
import {
  checkEligibility,
  computeRefundPaise,
  daysSince,
  isClosedStatus,
  isOpenStatus,
  windowDaysFor,
} from '@/server/services/returns.rules';

const NOW = new Date('2026-06-20T10:00:00Z');
const deliveredToday = new Date('2026-06-20T09:00:00Z');
const delivered5DaysAgo = new Date('2026-06-15T10:00:00Z');
const delivered20DaysAgo = new Date('2026-05-31T10:00:00Z');

const base = {
  orderStatus: 'DELIVERED' as const,
  deliveredAt: deliveredToday,
  now: NOW,
  kind: 'REFUND' as const,
  returnWindowDays: 7,
  exchangeWindowDays: 15,
  itemQty: 1,
  alreadyRequestedQty: 0,
  requestedQty: 1,
  hasOpenReturnForItem: false,
};

describe('daysSince', () => {
  it('counts whole days', () => {
    expect(daysSince(delivered5DaysAgo, NOW)).toBe(5);
  });

  it('never returns negative', () => {
    expect(daysSince(new Date('2026-06-21T00:00:00Z'), NOW)).toBe(0);
  });
});

describe('windowDaysFor', () => {
  it('gives exchanges a longer window than refunds', () => {
    expect(windowDaysFor('REFUND', 7, 15)).toBe(7);
    expect(windowDaysFor('EXCHANGE', 7, 15)).toBe(15);
  });
});

describe('checkEligibility — order state', () => {
  it('rejects an order that is not delivered', () => {
    const result = checkEligibility({ ...base, orderStatus: 'SHIPPED' });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('NOT_DELIVERED');
  });

  it('rejects when there is no delivery date', () => {
    const result = checkEligibility({ ...base, deliveredAt: null });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('NO_DELIVERY_DATE');
  });

  it('accepts a delivered order inside the window', () => {
    expect(checkEligibility(base).eligible).toBe(true);
  });
});

describe('checkEligibility — windows', () => {
  it('allows a refund on day 5 of a 7-day window', () => {
    const result = checkEligibility({ ...base, deliveredAt: delivered5DaysAgo });
    expect(result.eligible).toBe(true);
  });

  it('allows a refund on the last day of the window', () => {
    const exactly7 = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(checkEligibility({ ...base, deliveredAt: exactly7 }).eligible).toBe(true);
  });

  it('rejects a refund one day past the window', () => {
    const result = checkEligibility({ ...base, deliveredAt: delivered20DaysAgo });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('WINDOW_EXPIRED');
  });

  it('still allows an exchange on day 20 when the exchange window is 30', () => {
    const result = checkEligibility({
      ...base,
      deliveredAt: delivered20DaysAgo,
      kind: 'EXCHANGE',
      exchangeWindowDays: 30,
      hasReplacementVariant: true,
      replacementInStock: true,
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects an exchange once the exchange window has passed', () => {
    const result = checkEligibility({
      ...base,
      deliveredAt: delivered20DaysAgo,
      kind: 'EXCHANGE',
      exchangeWindowDays: 15,
      hasReplacementVariant: true,
      replacementInStock: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('WINDOW_EXPIRED');
  });
});

describe('checkEligibility — quantities', () => {
  it('rejects a zero quantity', () => {
    expect(checkEligibility({ ...base, requestedQty: 0 }).code).toBe('INVALID_QTY');
  });

  it('rejects a fractional quantity', () => {
    expect(checkEligibility({ ...base, requestedQty: 1.5 }).code).toBe('INVALID_QTY');
  });

  it('allows refunding part of a multi-quantity line', () => {
    const result = checkEligibility({ ...base, itemQty: 3, requestedQty: 2 });
    expect(result.eligible).toBe(true);
  });

  it('rejects more than remains', () => {
    const result = checkEligibility({ ...base, itemQty: 2, alreadyRequestedQty: 1, requestedQty: 2 });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('QTY_EXCEEDED');
    expect(result.message).toContain('Only 1');
  });

  it('rejects when the item is fully consumed', () => {
    const result = checkEligibility({ ...base, itemQty: 1, alreadyRequestedQty: 1, requestedQty: 1 });
    expect(result.code).toBe('QTY_EXCEEDED');
    expect(result.message).toContain('already been returned');
  });

  it('rejects when an open request exists for the item', () => {
    const result = checkEligibility({ ...base, hasOpenReturnForItem: true });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('OPEN_REQUEST_EXISTS');
  });
});

describe('checkEligibility — exchanges', () => {
  const exchangeBase = {
    ...base,
    kind: 'EXCHANGE' as const,
    hasReplacementVariant: true,
    replacementInStock: true,
  };

  it('accepts an exchange with an in-stock replacement', () => {
    expect(checkEligibility(exchangeBase).eligible).toBe(true);
  });

  it('requires a replacement size', () => {
    const result = checkEligibility({ ...exchangeBase, hasReplacementVariant: false });
    expect(result.code).toBe('REPLACEMENT_REQUIRED');
  });

  it('rejects an out-of-stock replacement', () => {
    const result = checkEligibility({ ...exchangeBase, replacementInStock: false });
    expect(result.code).toBe('REPLACEMENT_OUT_OF_STOCK');
  });
});

describe('computeRefundPaise', () => {
  it('refunds the full line for the full quantity', () => {
    expect(computeRefundPaise({ lineTotalPaise: 89_900, itemQty: 2, refundQty: 2 })).toBe(89_900);
  });

  it('refunds pro-rata for part of a line', () => {
    expect(computeRefundPaise({ lineTotalPaise: 89_900, itemQty: 2, refundQty: 1 })).toBe(44_950);
  });

  it('rounds to the nearest paisa without drifting', () => {
    // 3 items, refund 1 → 89900/3 = 29966.67 → 29967
    expect(computeRefundPaise({ lineTotalPaise: 89_900, itemQty: 3, refundQty: 1 })).toBe(29_967);
  });

  it('never exceeds the line total', () => {
    const total = 10_001;
    for (const qty of [1, 2, 4]) {
      for (let refund = 1; refund <= qty; refund += 1) {
        expect(computeRefundPaise({ lineTotalPaise: total, itemQty: qty, refundQty: refund })).toBeLessThanOrEqual(total);
      }
    }
  });

  it('rejects invalid quantities', () => {
    expect(() => computeRefundPaise({ lineTotalPaise: 100, itemQty: 0, refundQty: 0 })).toThrow(RangeError);
    expect(() => computeRefundPaise({ lineTotalPaise: 100, itemQty: 2, refundQty: 3 })).toThrow(RangeError);
  });
});

describe('status helpers', () => {
  it('treats in-progress requests as open', () => {
    expect(isOpenStatus('REQUESTED')).toBe(true);
    expect(isOpenStatus('RECEIVED')).toBe(true);
  });

  it('treats finished requests as closed', () => {
    expect(isClosedStatus('COMPLETED')).toBe(true);
    expect(isClosedStatus('REFUNDED')).toBe(true);
    expect(isClosedStatus('REJECTED')).toBe(true);
  });

  it('does not treat a shipped replacement as closed', () => {
    expect(isOpenStatus('REPLACEMENT_SHIPPED')).toBe(true);
    expect(isClosedStatus('REPLACEMENT_SHIPPED')).toBe(false);
  });
});
