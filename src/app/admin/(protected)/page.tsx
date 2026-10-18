import type { Metadata } from 'next';
import Link from 'next/link';
import { getDashboard } from '@/server/services/admin-analytics.service';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Dashboard · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const data = await getDashboard();

  const cards = [
    { label: 'Revenue', value: formatINR(data.revenuePaise), href: '/admin/orders' },
    { label: 'Orders', value: String(data.orderCount), href: '/admin/orders' },
    { label: 'Avg order value', value: formatINR(data.averageOrderPaise), href: '/admin/orders' },
    { label: 'To fulfil', value: String(data.pendingFulfilment), href: '/admin/orders?status=PACKED' },
    { label: 'Open returns', value: String(data.openReturns), href: '/admin/returns' },
    { label: 'Low stock', value: String(data.lowStockCount), href: '/admin/inventory' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live figures from the store. Revenue excludes cancelled and RTO orders.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-border bg-background p-4 transition-shadow hover:shadow-sm"
          >
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{card.value}</dd>
          </Link>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-background">
          <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Top products by units
          </h2>
          {data.topProducts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.topProducts.map((product) => (
                <li key={product.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="truncate">{product.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {product.units} units · {formatINR(product.revenuePaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background">
          <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.recentOrders.map((order) => (
                <li key={order.orderNumber} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{order.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium">{formatINR(order.totalPaise)}</p>
                    <p className="text-xs text-muted-foreground">{order.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
