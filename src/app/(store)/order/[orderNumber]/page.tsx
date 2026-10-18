import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getOrderSummary } from '@/server/services/checkout.service';
import { getOrderForInvoice } from '@/server/services/checkout.service';
import { getTrackingForOrder } from '@/server/services/shipping.service';
import { getReplacementOptions, listReturnsForOrder } from '@/server/services/returns.service';
import { ReturnRequestForm } from '@/components/store/return-request-form';
import { verifyInvoiceToken, invoicePath } from '@/server/invoice/token';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { formatINR } from '@/lib/utils/money';

const TRACKING_STEPS = ['Confirmed', 'Shipped', 'Out for delivery', 'Delivered'] as const;

/** Index of the last completed step, or -1 for states outside the happy path. */
function trackingStepIndex(status: string): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return 1;
    case 'OUT_FOR_DELIVERY':
      return 2;
    case 'DELIVERED':
      return 3;
    default:
      return -1;
  }
}

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { orderNumber: string };
  searchParams: { token?: string; returnOk?: string; returnError?: string };
}

export default async function OrderPage({ params, searchParams }: PageProps) {
  const orderNumber = params.orderNumber;

  // Authorise: a valid signed token (guest) OR the signed-in owner.
  const token = searchParams.token ?? '';
  const tokenValid = token ? verifyInvoiceToken(orderNumber, token) : false;

  const owner = await getOrderForInvoice(orderNumber);
  if (!owner) notFound();

  let authorised = tokenValid;
  if (!authorised) {
    const session = await getCurrentSession();
    authorised = Boolean(session && owner.userId && session.sub === owner.userId);
  }

  if (!authorised) notFound();

  const summary = await getOrderSummary(orderNumber);
  if (!summary) notFound();

  const tracking = await getTrackingForOrder(orderNumber);

  const invoiceLink = tokenValid ? invoicePath(orderNumber) : null;

  // Returns are only offered on delivered orders to an authorised viewer.
  const existingReturns = await listReturnsForOrder(orderNumber);
  const canRequestReturn = summary.status === 'DELIVERED' && tokenValid;

  const replacementOptions = new Map<string, { id: string; size: string; color: string; stock: number }[]>();
  if (canRequestReturn) {
    for (const item of summary.items) {
      replacementOptions.set(item.id, await getReplacementOptions(item.id));
    }
  }

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <p className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          Order placed
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
          Thank you — your order is confirmed
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground">{summary.orderNumber}</span> ·{' '}
          {new Date(summary.placedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>

        {searchParams.returnOk ? (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            Request received. We&apos;ll email you the next steps.
          </p>
        ) : null}
        {searchParams.returnError ? (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {searchParams.returnError}
          </p>
        ) : null}

        <div className="mt-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Status</span>
            <span className="text-sm font-medium">{summary.status}</span>
          </div>

          <ul className="divide-y divide-border">
            {summary.items.map((item, index) => (
              <li key={`${item.productName}-${index}`} className="flex items-center gap-3 px-4 py-3">
                <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded border border-border bg-secondary">
                  <Image
                    src={item.imageUrl ?? '/placeholders/tee.svg'}
                    alt={item.productName}
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized={(item.imageUrl ?? '').endsWith('.svg')}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.variantLabel} · Qty {item.qty}
                  </p>
                </div>
                <p className="text-sm">{formatINR(item.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-border px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatINR(summary.subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>{summary.shippingPaise === 0 ? 'Free' : formatINR(summary.shippingPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GST included</dt>
              <dd>{formatINR(summary.taxPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <dt>Total</dt>
              <dd>{formatINR(summary.totalPaise)}</dd>
            </div>
          </dl>
        </div>

        {summary.paymentMethod === 'COD' &&
        !['DELIVERED', 'CANCELLED', 'RTO', 'REFUNDED'].includes(summary.status) ? (
          <p className="mt-4 rounded-md bg-secondary px-4 py-3 text-sm">
            Please keep {formatINR(summary.totalPaise)} ready to pay the courier on delivery.
          </p>
        ) : null}

        {tracking ? (
          <section className="mt-6 rounded-lg border border-border bg-card p-4" aria-labelledby="tracking-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="tracking-heading" className="text-sm font-semibold">
                Delivery
              </h2>
              {tracking.awb ? (
                <p className="text-xs text-muted-foreground">
                  AWB {tracking.awb}
                  {tracking.courierName ? ` · ${tracking.courierName}` : ''}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Awaiting pickup</p>
              )}
            </div>

            {tracking.status.startsWith('RTO') ? (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This parcel is returning to us. We will refund or re-ship it — no action needed
                from you.
              </p>
            ) : tracking.status === 'CANCELLED' ? (
              <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm">
                This shipment was cancelled.
              </p>
            ) : (
              <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                {TRACKING_STEPS.map((step, index) => {
                  const active = index <= trackingStepIndex(tracking.status);
                  return (
                    <li key={step} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={
                          active
                            ? 'inline-block h-2.5 w-2.5 rounded-full bg-accent'
                            : 'inline-block h-2.5 w-2.5 rounded-full border border-border'
                        }
                      />
                      <span className={active ? 'font-medium' : 'text-muted-foreground'}>
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {tracking.trackingUrl ? (
              <a
                href={tracking.trackingUrl}
                className="mt-3 inline-block text-xs text-accent underline-offset-4 hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                Track with the courier
              </a>
            ) : null}
          </section>
        ) : null}

        {existingReturns.length > 0 || canRequestReturn ? (
          <section
            className="mt-6 rounded-lg border border-border bg-card p-4"
            aria-labelledby="returns-heading"
          >
            <h2 id="returns-heading" className="text-sm font-semibold">
              Returns &amp; exchanges
            </h2>

            {existingReturns.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {existingReturns.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {row.kind} · {row.productName} · qty {row.qty}
                    </span>
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {canRequestReturn ? (
              <div className="mt-3">
                {summary.items.map((item) => (
                  <ReturnRequestForm
                    key={item.id}
                    orderNumber={summary.orderNumber}
                    orderItemId={item.id}
                    token={searchParams.token}
                    productName={item.productName}
                    variantLabel={item.variantLabel}
                    maxQty={item.qty}
                    replacements={replacementOptions.get(item.id) ?? []}
                  />
                ))}
              </div>
            ) : null}

            <p className="mt-3 text-xs text-muted-foreground">
              Free size exchange within 15 days of delivery. Refunds (goods only) within 7 days.
            </p>
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {invoiceLink ? (            <a
              href={invoiceLink}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Download GST invoice
            </a>
          ) : null}
          <Link
            href="/"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Continue shopping
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          A confirmation email is on its way to {summary.email}. Free size exchange within 15
          days — just reply to that email.
        </p>
      </div>
    </div>
  );
}
