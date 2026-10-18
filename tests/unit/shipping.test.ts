import { describe, expect, it } from 'vitest';

process.env.SHIPROCKET_WEBHOOK_TOKEN = 'test-webhook-token';
process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused?schema=public';
process.env.AUTH_SECRET = 'unit-test-secret-0123456789abcdefghijklmnopqrstuvwxyz';

const {
  mapShiprocketStatus,
  normalizeStatus,
  orderStatusForShipment,
  restocksGoods,
  shouldAdvanceOrder,
  isTerminalShipment,
} = await import('@/server/shipping/status-map');
const { verifyWebhookToken, isShiprocketEnabled } = await import('@/server/shipping/shiprocket');

describe('normalizeStatus', () => {
  it('uppercases and collapses whitespace/underscores', () => {
    expect(normalizeStatus('  out_for   delivery ')).toBe('OUT FOR DELIVERY');
  });
});

describe('mapShiprocketStatus', () => {
  it.each([
    ['DELIVERED', 'DELIVERED'],
    ['Delivered', 'DELIVERED'],
    ['IN TRANSIT', 'IN_TRANSIT'],
    ['Out For Delivery', 'OUT_FOR_DELIVERY'],
    ['PICKED UP', 'PICKED_UP'],
    ['SHIPPED', 'PICKED_UP'],
    ['CANCELED', 'CANCELLED'],
    ['UNDELIVERED', 'EXCEPTION'],
    ['NDR', 'EXCEPTION'],
    ['PICKUP SCHEDULED', 'PENDING'],
    ['PICKUP GENERATED', 'PENDING'],
  ])('maps %s -> %s', (input, expected) => {
    expect(mapShiprocketStatus(input)).toBe(expected);
  });

  it('maps RTO DELIVERED to RTO_DELIVERED, not DELIVERED', () => {
    // The most important ordering rule: "RTO DELIVERED" contains "DELIVERED".
    expect(mapShiprocketStatus('RTO DELIVERED')).toBe('RTO_DELIVERED');
    expect(mapShiprocketStatus('RTO IN TRANSIT')).toBe('RTO_INITIATED');
  });

  it('returns null for unknown statuses rather than guessing', () => {
    expect(mapShiprocketStatus('SOMETHING NEW')).toBeNull();
    expect(mapShiprocketStatus('')).toBeNull();
  });
});

describe('orderStatusForShipment', () => {
  it.each([
    ['PICKED_UP', 'SHIPPED'],
    ['IN_TRANSIT', 'SHIPPED'],
    ['OUT_FOR_DELIVERY', 'SHIPPED'],
    ['DELIVERED', 'DELIVERED'],
    ['RTO_DELIVERED', 'RTO'],
    ['CANCELLED', 'CANCELLED'],
  ])('%s -> order %s', (shipment, expected) => {
    expect(orderStatusForShipment(shipment as never)).toBe(expected);
  });

  it('leaves the order alone for in-flight RTO and exceptions', () => {
    expect(orderStatusForShipment('RTO_INITIATED')).toBeNull();
    expect(orderStatusForShipment('EXCEPTION')).toBeNull();
    expect(orderStatusForShipment('PENDING')).toBeNull();
  });
});

describe('restocksGoods', () => {
  it('restocks only when the goods are actually back or cancelled', () => {
    expect(restocksGoods('RTO_DELIVERED')).toBe(true);
    expect(restocksGoods('CANCELLED')).toBe(true);
  });

  it('does not restock while the parcel is still moving', () => {
    expect(restocksGoods('RTO_INITIATED')).toBe(false);
    expect(restocksGoods('IN_TRANSIT')).toBe(false);
    expect(restocksGoods('DELIVERED')).toBe(false);
    expect(restocksGoods('EXCEPTION')).toBe(false);
  });
});

describe('shouldAdvanceOrder', () => {
  it('advances forward', () => {
    expect(shouldAdvanceOrder('SHIPPED', 'DELIVERED')).toBe(true);
    expect(shouldAdvanceOrder('CONFIRMED', 'SHIPPED')).toBe(true);
    expect(shouldAdvanceOrder('PAID', 'SHIPPED')).toBe(true);
  });

  it('never regresses', () => {
    expect(shouldAdvanceOrder('DELIVERED', 'SHIPPED')).toBe(false);
    expect(shouldAdvanceOrder('SHIPPED', 'CONFIRMED')).toBe(false);
    expect(shouldAdvanceOrder('DELIVERED', 'DELIVERED')).toBe(false);
  });

  it('lets a cancellation win', () => {
    expect(shouldAdvanceOrder('SHIPPED', 'CANCELLED')).toBe(true);
  });

  it('does not resurrect a cancelled or refunded order', () => {
    expect(shouldAdvanceOrder('CANCELLED', 'SHIPPED')).toBe(false);
    expect(shouldAdvanceOrder('REFUNDED', 'DELIVERED')).toBe(false);
  });
});

describe('isTerminalShipment', () => {
  it('treats delivered, RTO-delivered and cancelled as terminal', () => {
    expect(isTerminalShipment('DELIVERED')).toBe(true);
    expect(isTerminalShipment('RTO_DELIVERED')).toBe(true);
    expect(isTerminalShipment('CANCELLED')).toBe(true);
    expect(isTerminalShipment('IN_TRANSIT')).toBe(false);
  });
});

describe('Shiprocket webhook token', () => {
  it('accepts the configured token', () => {
    expect(verifyWebhookToken('test-webhook-token')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyWebhookToken('wrong')).toBe(false);
  });

  it('rejects missing tokens', () => {
    expect(verifyWebhookToken(null)).toBe(false);
    expect(verifyWebhookToken(undefined)).toBe(false);
    expect(verifyWebhookToken('')).toBe(false);
  });

  it('is disabled by default', () => {
    expect(isShiprocketEnabled()).toBe(false);
  });
});
