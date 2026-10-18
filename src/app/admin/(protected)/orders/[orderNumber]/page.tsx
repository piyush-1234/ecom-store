import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminOrder } from '@/server/services/admin-orders.service';
import { markPackedAction, cancelOrderAction } from '@/server/actions/admin';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Order · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { orderNumber: string };
  searchParams: { ok?: string; error?: string };
}

export default async function AdminOrderDetailPage({ params, searchParams }: PageProps) {
  const order = await getAdminOrder(params.orderNumber);
  if (!order) notFound();

  const address = order.shippingAddress as unknown as {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
  };

  const canPack = ['CONFIRMED', 'PAID'].includes(order.status);
  const canCancel = !['SHIPPED', 'DELIVERED', 'RTO', 'CANCELLED', 'REFUNDED'].includes(order.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="text-sm text-accent underline-offset-4 hover:underline">
          &larr; Orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{order.orderNumber}</h1>
          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">{order.status}</span>
          <span className="text-xs text-muted-foreground">
            {order.paymentMethod} · placed{' '}
            {new Date(order.placedAt).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {searchParams.ok ? (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Action completed.</p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-background">
            <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">Items</h2>
            <ul className="divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variantLabel} · {item.sku} · HSN {item.hsnCode} · qty {item.qty}
                    </p>
                  </div>
                  <p className="font-medium">{formatINR(item.lineTotalPaise)}</p>
                </li>
              ))}
            </ul>
          </section>

          {order.returns.length > 0 ? (
            <section className="rounded-lg border border-border bg-background">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
                Returns / exchanges
              </h2>
              <ul className="divide-y divide-border text-sm">
                {order.returns.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="font-medium">
                        {row.kind} · {row.status}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.orderItem.productName} · qty {row.qty} · {row.reason}
                      </p>
                    </div>
                    <Link href="/admin/returns" className="text-xs text-accent underline-offset-4 hover:underline">
                      Manage
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-sm font-semibold">Actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {canPack ? (
                <form action={markPackedAction}>
                  <input type="hidden" name="orderNumber" value={order.orderNumber} />
                  <button type="submit" className="h-9 rounded bg-primary px-4 text-sm font-medium text-primary-foreground">
                    Mark packed
                  </button>
                </form>
              ) : null}

              {canCancel ? (
                <form action={cancelOrderAction}>
                  <input type="hidden" name="orderNumber" value={order.orderNumber} />
                  <button type="submit" className="h-9 rounded border border-destructive px-4 text-sm font-medium text-destructive hover:bg-destructive/10">
                    Cancel &amp; restock
                  </button>
                </form>
              ) : null}

              <a
                href={`/api/orders/${order.orderNumber}/invoice`}
                className="h-9 rounded border border-border px-4 text-sm font-medium leading-9 hover:bg-secondary"
              >
                Invoice (owner session)
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Cancelling restores stock and is refused once the parcel has shipped — use RTO for that.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-background p-4 text-sm">
            <h2 className="font-semibold">Customer</h2>
            <p className="mt-2">{address.fullName}</p>
            <p className="text-muted-foreground">{order.email}</p>
            <p className="text-muted-foreground">{order.phone}</p>
            <p className="mt-2 text-muted-foreground">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
            </p>
            <p className="text-muted-foreground">
              {order.shipCity}, {order.shipState} — {order.shipPincode}
            </p>
          </section>

          <section className="rounded-lg border border-border bg-background p-4 text-sm">
            <h2 className="font-semibold">Payment</h2>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatINR(order.subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd>-{formatINR(order.discountPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>{formatINR(order.shippingPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">COD fee</dt>
                <dd>{formatINR(order.codFeePaise)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatINR(order.totalPaise)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              {order.payments[0]?.provider ?? '—'} · {order.payments[0]?.status ?? 'no payment'}
              {order.payments[0]?.refundedPaise ? ` · refunded ${formatINR(order.payments[0].refundedPaise)}` : ''}
            </p>
          </section>

          <section className="rounded-lg border border-border bg-background p-4 text-sm">
            <h2 className="font-semibold">Shipment</h2>
            {order.shipments.length === 0 ? (
              <p className="mt-2 text-muted-foreground">Not created yet.</p>
            ) : (
              order.shipments.map((shipment) => (
                <div key={shipment.id} className="mt-2">
                  <p className="font-medium">{shipment.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {shipment.awb ?? 'no AWB'} · {shipment.courierName ?? 'courier TBD'}
                  </p>
                  {shipment.restockedAt ? (
                    <p className="text-xs text-accent">Restocked {new Date(shipment.restockedAt).toLocaleDateString('en-IN')}</p>
                  ) : null}
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
