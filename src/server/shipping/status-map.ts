import type { OrderStatus, ShipmentStatus } from '@prisma/client';

/**
 * Shiprocket status → internal status mapping.
 *
 * Shiprocket reports many overlapping, human-readable status strings, and they add
 * new ones over time. Mapping by normalised keyword (rather than an exhaustive
 * allowlist) keeps us working when a new variant of "Delivered" appears, while
 * returning `null` for anything we genuinely do not recognise — never guessing.
 */

export function normalizeStatus(raw: string): string {
  return raw.replace(/[\s_]+/g, ' ').trim().toUpperCase();
}

export function mapShiprocketStatus(raw: string): ShipmentStatus | null {
  const status = normalizeStatus(raw);
  if (!status) return null;

  // Ordering matters. Substring checks must run most-specific-first:
  //   "RTO DELIVERED" contains "DELIVERED"
  //   "UNDELIVERED"   contains "DELIVERED"      <-- caught by a unit test
  // Getting this wrong marks failed deliveries as successful, so it is asserted.
  if (status.includes('RTO DELIVERED') || status.includes('RTO COMPLETE')) {
    return 'RTO_DELIVERED';
  }
  if (status.includes('RTO')) return 'RTO_INITIATED';

  // Exceptions BEFORE the positive "delivered" check.
  if (
    status.includes('UNDELIVERED') ||
    status.includes('NDR') ||
    status.includes('EXCEPTION') ||
    status.includes('FAILED') ||
    status.includes('REFUSED')
  ) {
    return 'EXCEPTION';
  }

  if (status.includes('CANCEL')) return 'CANCELLED';

  if (status.includes('DELIVERED')) return 'DELIVERED';
  if (status.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY';
  if (status.includes('IN TRANSIT') || status.includes('REACHED DESTINATION')) {
    return 'IN_TRANSIT';
  }
  if (status.includes('PICKED UP') || status.includes('SHIPPED')) return 'PICKED_UP';
  if (status.includes('PICKUP')) return 'PENDING';

  return null;
}

/** Order status implied by a shipment status, or null to leave the order alone. */
export function orderStatusForShipment(status: ShipmentStatus): OrderStatus | null {
  switch (status) {
    case 'PENDING':
      return null;
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'SHIPPED';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'RTO_INITIATED':
      // Goods are still moving; the order stays shipped until they arrive back.
      return null;
    case 'RTO_DELIVERED':
      return 'RTO';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'EXCEPTION':
      return null;
    default:
      return null;
  }
}

/**
 * Statuses that mean the goods are back with us and inventory must be restored.
 * EXCEPTION and RTO_INITIATED are excluded — the parcel is still in transit.
 */
export function restocksGoods(status: ShipmentStatus): boolean {
  return status === 'RTO_DELIVERED' || status === 'CANCELLED';
}

/** Terminal states — no further meaningful transitions. */
export function isTerminalShipment(status: ShipmentStatus): boolean {
  return status === 'DELIVERED' || status === 'RTO_DELIVERED' || status === 'CANCELLED';
}

/**
 * Order status progression, used to prevent a late webhook from moving an order
 * backwards (e.g. a stale "in transit" arriving after "delivered").
 */
const ORDER_RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PAID: 1,
  PACKED: 2,
  SHIPPED: 3,
  DELIVERED: 4,
  RTO: 5,
  RETURNED: 5,
  CANCELLED: 6,
  REFUNDED: 6,
};

export function shouldAdvanceOrder(current: OrderStatus, next: OrderStatus): boolean {
  if (current === next) return false;

  // Cancellation is always allowed to win.
  if (next === 'CANCELLED') return true;

  // Never resurrect a cancelled/refunded order from a shipment webhook.
  if (current === 'CANCELLED' || current === 'REFUNDED') return false;

  return ORDER_RANK[next] > ORDER_RANK[current];
}
