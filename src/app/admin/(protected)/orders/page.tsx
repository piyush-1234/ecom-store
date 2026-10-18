import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrderStatus } from '@prisma/client';
import { listOrders, getOrderStats } from '@/server/services/admin-orders.service';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Orders · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RTO',
  'RETURNED',
  'REFUNDED',
];

interface PageProps {
  searchParams: { status?: string; q?: string; page?: string };
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const status = STATUSES.includes(searchParams.status as OrderStatus)
    ? (searchParams.status as OrderStatus)
    : undefined;
  const q = searchParams.q?.trim() || undefined;
  const page = Number(searchParams.page ?? 1) || 1;

  const [{ orders, total, totalPages }, stats] = await Promise.all([
    listOrders({ status, q, page }),
    getOrderStats(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} total</p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Orders', value: String(stats.totalOrders) },
          { label: 'Revenue', value: formatINR(stats.revenuePaise) },
          { label: 'To fulfil', value: String(stats.pendingFulfilment) },
          { label: 'Open returns', value: String(stats.openReturns) },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-background p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{card.value}</dd>
          </div>
        ))}
      </dl>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3">
        <div>
          <label htmlFor="q" className="block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Order no, email, pincode"
            className="mt-1 h-9 w-64 rounded border border-input bg-background px-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="mt-1 h-9 rounded border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
        {status || q ? (
          <Link href="/admin/orders" className="text-sm text-accent underline-offset-4 hover:underline">
            Clear
          </Link>
        ) : null}
      </form>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          No orders match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-4 py-2 font-medium">Order</th>
                <th scope="col" className="px-4 py-2 font-medium">Placed</th>
                <th scope="col" className="px-4 py-2 font-medium">Customer</th>
                <th scope="col" className="px-4 py-2 font-medium">Ship to</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.orderNumber} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium text-accent hover:underline">
                      {order.orderNumber}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(order.placedAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{order.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {order.shipCity}, {order.shipState}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatINR(order.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <Link
              key={pageNumber}
              href={`/admin/orders?${new URLSearchParams({
                ...(status ? { status } : {}),
                ...(q ? { q } : {}),
                page: String(pageNumber),
              }).toString()}`}
              className={
                pageNumber === page
                  ? 'rounded border border-primary bg-primary px-3 py-1 text-primary-foreground'
                  : 'rounded border border-border px-3 py-1 hover:bg-secondary'
              }
            >
              {pageNumber}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
