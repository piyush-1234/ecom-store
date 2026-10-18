import { prisma } from '@/server/db/client';

/**
 * Admin analytics.
 *
 * Deliberately simple aggregates over the order table rather than a metrics pipeline:
 * at this scale a handful of SQL aggregates is correct and debuggable. Revenue excludes
 * cancelled and RTO orders, because counting them overstates the business.
 */

export interface DashboardData {
  revenuePaise: number;
  orderCount: number;
  averageOrderPaise: number;
  openReturns: number;
  pendingFulfilment: number;
  lowStockCount: number;
  topProducts: { name: string; units: number; revenuePaise: number }[];
  recentOrders: {
    orderNumber: string;
    status: string;
    totalPaise: number;
    placedAt: Date;
    email: string;
  }[];
}

const EXCLUDED_STATUSES = ['CANCELLED', 'RTO'] as const;

export async function getDashboard(): Promise<DashboardData> {
  const [revenueAgg, orderCount, openReturns, pendingFulfilment, lowStockCount, recentOrders] =
    await Promise.all([
      prisma.order.aggregate({
        where: { status: { notIn: [...EXCLUDED_STATUSES] } },
        _sum: { totalPaise: true },
        _count: true,
      }),
      prisma.order.count({ where: { status: { notIn: [...EXCLUDED_STATUSES] } } }),
      prisma.return.count({
        where: { status: { in: ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED'] } },
      }),
      prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PAID', 'PACKED'] } } }),
      prisma.variant.count({ where: { isActive: true, stock: { lte: 5 } } }),
      prisma.order.findMany({
        orderBy: { placedAt: 'desc' },
        take: 8,
        select: {
          orderNumber: true,
          status: true,
          totalPaise: true,
          placedAt: true,
          email: true,
        },
      }),
    ]);

  const revenuePaise = revenueAgg._sum.totalPaise ?? 0;

  // Top products by units sold, on non-cancelled orders.
  const grouped = await prisma.orderItem.groupBy({
    by: ['productName'],
    where: { order: { status: { notIn: [...EXCLUDED_STATUSES] } } },
    _sum: { qty: true, lineTotalPaise: true },
    orderBy: { _sum: { qty: 'desc' } },
    take: 5,
  });

  return {
    revenuePaise,
    orderCount,
    averageOrderPaise: orderCount > 0 ? Math.round(revenuePaise / orderCount) : 0,
    openReturns,
    pendingFulfilment,
    lowStockCount,
    topProducts: grouped.map((row) => ({
      name: row.productName,
      units: row._sum.qty ?? 0,
      revenuePaise: row._sum.lineTotalPaise ?? 0,
    })),
    recentOrders,
  };
}
