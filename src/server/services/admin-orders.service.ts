import type { OrderStatus } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';

/**
 * Admin order management.
 *
 * Cancelling an order must return its stock — and must not do so twice. The guard is
 * `restockedAt` on the shipment plus an explicit order-status check, mirroring the
 * shipping webhook path so both routes into "cancelled" behave identically.
 */

export interface AdminOrderRow {
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: string;
  totalPaise: number;
  itemCount: number;
  email: string;
  placedAt: Date;
  shipCity: string;
  shipState: string;
}

export async function listOrders(params: {
  status?: OrderStatus;
  q?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<{ orders: AdminOrderRow[]; total: number; page: number; totalPages: number }> {
  const perPage = params.perPage ?? 25;
  const page = Math.max(1, params.page ?? 1);

  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.q
      ? {
          OR: [
            { orderNumber: { contains: params.q, mode: 'insensitive' as const } },
            { email: { contains: params.q, mode: 'insensitive' as const } },
            { shipPincode: { contains: params.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return {
    orders: rows.map((row) => ({
      orderNumber: row.orderNumber,
      status: row.status,
      paymentMethod: row.paymentMethod,
      totalPaise: row.totalPaise,
      itemCount: row._count.items,
      email: row.email,
      placedAt: row.placedAt,
      shipCity: row.shipCity,
      shipState: row.shipState,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getAdminOrder(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      payments: true,
      shipments: true,
      returns: { include: { orderItem: true } },
    },
  });
}

/** Mark a confirmed/paid order as packed. Forward-only. */
export async function markOrderPacked(orderNumber: string, adminId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.', 404);

  if (!['CONFIRMED', 'PAID'].includes(order.status)) {
    throw new AppError('CONFLICT', `Cannot pack an order that is ${order.status}.`, 409);
  }

  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: 'PACKED' } }),
    prisma.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        adminId,
        action: 'order.packed',
        entity: 'Order',
        entityId: order.id,
      },
    }),
  ]);
}

/**
 * Cancel an unshipped order and restore stock.
 * Refuses once the parcel is with the courier — that is an RTO, handled by the
 * shipping webhook, and doing both would double-restock.
 */
export async function cancelOrder(orderNumber: string, adminId: string): Promise<{ restocked: boolean }> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true, shipments: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.', 404);

  if (['SHIPPED', 'DELIVERED', 'RTO', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
    throw new AppError(
      'CONFLICT',
      order.status === 'SHIPPED'
        ? 'This order has shipped. Cancel it with the courier (RTO) instead.'
        : `Cannot cancel an order that is ${order.status}.`,
      409,
    );
  }

  const alreadyRestocked = order.shipments.some((shipment) => shipment.restockedAt !== null);

  const restocked = await prisma.$transaction(async (tx) => {
    let didRestock = false;

    if (!alreadyRestocked) {
      for (const item of order.items) {
        if (!item.variantId) continue;
        await tx.variant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.qty } },
        });
      }
      didRestock = true;

      // Mark every shipment as restocked so the webhook path stays consistent.
      await tx.shipment.updateMany({
        where: { orderId: order.id, restockedAt: null },
        data: { restockedAt: new Date() },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        adminId,
        action: 'order.cancelled',
        entity: 'Order',
        entityId: order.id,
        meta: { restocked: didRestock } as never,
      },
    });

    return didRestock;
  });

  return { restocked };
}

export async function getOrderStats(): Promise<{
  totalOrders: number;
  openReturns: number;
  revenuePaise: number;
  pendingFulfilment: number;
}> {
  const [totalOrders, openReturns, revenue, pendingFulfilment] = await Promise.all([
    prisma.order.count(),
    prisma.return.count({
      where: { status: { in: ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED'] } },
    }),
    prisma.order.aggregate({
      where: { status: { notIn: ['CANCELLED', 'RTO'] } },
      _sum: { totalPaise: true },
    }),
    prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PAID', 'PACKED'] } } }),
  ]);

  return {
    totalOrders,
    openReturns,
    revenuePaise: revenue._sum.totalPaise ?? 0,
    pendingFulfilment,
  };
}
