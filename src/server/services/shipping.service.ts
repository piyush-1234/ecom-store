import type { OrderStatus, ShipmentStatus } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import {
  isTerminalShipment,
  mapShiprocketStatus,
  orderStatusForShipment,
  restocksGoods,
  shouldAdvanceOrder,
} from '@/server/shipping/status-map';

/**
 * Shipment lifecycle.
 *
 * Webhooks are the source of truth, they arrive out of order, and they retry. This
 * module therefore:
 *  - never moves an order backwards (see `shouldAdvanceOrder`)
 *  - restocks exactly once, guarded by `Shipment.restockedAt`
 *  - treats an unknown shipment or unknown status as "not handled" instead of guessing
 */

export interface ShipmentEventInput {
  awb?: string | null;
  providerShipmentId?: string | null;
  orderNumber?: string | null;
  rawStatus: string;
  courierName?: string | null;
  trackingUrl?: string | null;
  occurredAt?: Date;
}

export interface ApplyEventResult {
  handled: boolean;
  reason?: string;
  orderNumber?: string;
  shipmentStatus?: ShipmentStatus;
  orderStatus?: OrderStatus | null;
  restocked?: boolean;
}

async function findShipment(input: ShipmentEventInput) {
  if (input.awb) {
    const byAwb = await prisma.shipment.findFirst({
      where: { awb: input.awb },
      include: { order: { include: { items: true, payments: true } } },
    });
    if (byAwb) return byAwb;
  }

  if (input.providerShipmentId) {
    const byProvider = await prisma.shipment.findFirst({
      where: { providerShipmentId: input.providerShipmentId },
      include: { order: { include: { items: true, payments: true } } },
    });
    if (byProvider) return byProvider;
  }

  if (input.orderNumber) {
    const order = await prisma.order.findUnique({
      where: { orderNumber: input.orderNumber },
      include: { items: true, payments: true, shipments: true },
    });
    if (order && order.shipments.length > 0) {
      return await prisma.shipment.findFirstOrThrow({
        where: { id: order.shipments[0]!.id },
        include: { order: { include: { items: true, payments: true } } },
      });
    }
  }

  return null;
}

export async function applyShipmentEvent(input: ShipmentEventInput): Promise<ApplyEventResult> {
  const shipment = await findShipment(input);
  if (!shipment) return { handled: false, reason: 'unknown_shipment' };

  const status = mapShiprocketStatus(input.rawStatus);
  if (!status) {
    // Recorded for ops visibility, but we do not invent a state for it.
    return { handled: false, reason: 'unmapped_status', orderNumber: shipment.order.orderNumber };
  }

  const occurredAt = input.occurredAt ?? new Date();
  const alreadyTerminal = isTerminalShipment(shipment.status);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Shipment row.
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status,
        lastSyncedAt: new Date(),
        courierName: input.courierName ?? shipment.courierName,
        trackingUrl: input.trackingUrl ?? shipment.trackingUrl,
        ...(status === 'PICKED_UP' && !shipment.shippedAt ? { shippedAt: occurredAt } : {}),
        ...(status === 'DELIVERED' ? { deliveredAt: occurredAt } : {}),
      },
    });

    // 2. Order status — forward only.
    const nextOrderStatus = orderStatusForShipment(status);
    let appliedOrderStatus: OrderStatus | null = null;

    if (nextOrderStatus && shouldAdvanceOrder(shipment.order.status, nextOrderStatus)) {
      await tx.order.update({
        where: { id: shipment.orderId },
        data: {
          status: nextOrderStatus,
          ...(nextOrderStatus === 'SHIPPED' && !shipment.order.shippedAt
            ? { shippedAt: occurredAt }
            : {}),
          ...(nextOrderStatus === 'DELIVERED' ? { deliveredAt: occurredAt } : {}),
          ...(nextOrderStatus === 'CANCELLED' ? { cancelledAt: occurredAt } : {}),
        },
      });
      appliedOrderStatus = nextOrderStatus;

      // COD is only actually collected on delivery.
      if (nextOrderStatus === 'DELIVERED' && shipment.order.paymentMethod === 'COD') {
        await tx.payment.updateMany({
          where: { orderId: shipment.orderId, method: 'COD', status: { not: 'CAPTURED' } },
          data: { status: 'CAPTURED' },
        });
      }
    }

    // 3. Restock exactly once.
    let restocked = false;
    if (restocksGoods(status) && !shipment.restockedAt) {
      for (const item of shipment.order.items) {
        if (!item.variantId) continue;
        await tx.variant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.qty } },
        });
      }
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { restockedAt: new Date() },
      });
      restocked = true;
    }

    return { appliedOrderStatus, restocked };
  });

  return {
    handled: true,
    orderNumber: shipment.order.orderNumber,
    shipmentStatus: status,
    orderStatus: result.appliedOrderStatus,
    restocked: result.restocked,
    ...(alreadyTerminal ? { reason: 'terminal_state' } : {}),
  };
}

/** Create (or update) the shipment record for an order. Used by ops/admin and tests. */
export async function createShipmentRecord(
  orderId: string,
  data: {
    awb?: string | null;
    courierName?: string | null;
    trackingUrl?: string | null;
    providerShipmentId?: string | null;
    weightGrams?: number;
    codPaise?: number;
  } = {},
): Promise<{ id: string; awb: string | null }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.', 404);

  const weightGrams =
    data.weightGrams ?? order.items.reduce((sum, item) => sum + item.weightGrams * item.qty, 0);

  const existing = await prisma.shipment.findFirst({ where: { orderId } });

  const shipment = existing
    ? await prisma.shipment.update({
        where: { id: existing.id },
        data: {
          awb: data.awb ?? existing.awb,
          courierName: data.courierName ?? existing.courierName,
          trackingUrl: data.trackingUrl ?? existing.trackingUrl,
          providerShipmentId: data.providerShipmentId ?? existing.providerShipmentId,
          weightGrams,
        },
      })
    : await prisma.shipment.create({
        data: {
          orderId,
          status: 'PENDING',
          awb: data.awb ?? null,
          courierName: data.courierName ?? null,
          trackingUrl: data.trackingUrl ?? null,
          providerShipmentId: data.providerShipmentId ?? null,
          weightGrams,
          codPaise: data.codPaise ?? (order.paymentMethod === 'COD' ? order.totalPaise : 0),
        },
      });

  return { id: shipment.id, awb: shipment.awb };
}

export interface TrackingView {
  awb: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  restockedAt: Date | null;
}

/**
 * Best-effort shipment creation after an order is placed.
 *
 * Deliberately non-fatal: a shipping provider outage must never lose a paid order.
 * Returns a reason instead of throwing so the caller can log it.
 */
export async function maybeCreateShipmentForOrder(orderId: string): Promise<{
  created: boolean;
  awb?: string | null;
  reason?: string;
}> {
  const { createShipment, isShiprocketEnabled } = await import('@/server/shipping/shiprocket');
  if (!isShiprocketEnabled()) return { created: false, reason: 'disabled' };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { created: false, reason: 'order_not_found' };

  const address = order.shippingAddress as unknown as {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
  };

  try {
    const weightGrams = order.items.reduce(
      (sum, item) => sum + item.weightGrams * item.qty,
      0,
    );

    const shipment = await createShipment({
      orderNumber: order.orderNumber,
      orderDate: order.placedAt.toISOString().slice(0, 10),
      billing: {
        name: address.fullName,
        address: [address.line1, address.line2, address.landmark].filter(Boolean).join(', '),
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        phone: address.phone,
        email: order.email,
      },
      items: order.items.map((item) => ({
        name: item.productName,
        sku: item.sku,
        units: item.qty,
        sellingPricePaise: item.unitPricePaise,
      })),
      weightKg: Math.max(0.2, weightGrams / 1000),
      isCod: order.paymentMethod === 'COD',
      codAmountPaise: order.paymentMethod === 'COD' ? order.totalPaise : 0,
      subTotalPaise: order.subtotalPaise,
    });

    await createShipmentRecord(orderId, {
      awb: shipment.awb,
      courierName: shipment.courierName,
      trackingUrl: shipment.trackingUrl,
      providerShipmentId: shipment.shipmentId,
      weightGrams,
    });

    return { created: true, awb: shipment.awb };
  } catch (error) {
    console.error('[shipping] shipment creation failed', error);
    return { created: false, reason: 'provider_error' };
  }
}

export async function getTrackingForOrder(orderNumber: string): Promise<TrackingView | null> {
  const shipment = await prisma.shipment.findFirst({
    where: { order: { orderNumber } },
    orderBy: { createdAt: 'desc' },
  });
  if (!shipment) return null;

  return {
    awb: shipment.awb,
    courierName: shipment.courierName,
    trackingUrl: shipment.trackingUrl,
    status: shipment.status,
    shippedAt: shipment.shippedAt,
    deliveredAt: shipment.deliveredAt,
    restockedAt: shipment.restockedAt,
  };
}
