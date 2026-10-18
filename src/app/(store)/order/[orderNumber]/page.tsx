import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getOrderSummary } from '@/server/services/checkout.service';
import { getOrderForInvoice } from '@/server/services/checkout.service';
import { verifyInvoiceToken, invoicePath } from '@/server/invoice/token';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { orderNumber: string };
  searchParams: { token?: string };
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

  const invoiceLink = tokenValid ? invoicePath(orderNumber) : null;

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

        {summary.paymentMethod === 'COD' ? (
          <p className="mt-4 rounded-md bg-secondary px-4 py-3 text-sm">
            Please keep {formatINR(summary.totalPaise)} ready to pay the courier on delivery.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {invoiceLink ? (
            <a
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
          A confirmation email is on its way to {summary.email}. Free size exchange within 7
          days — just reply to that email.
        </p>
      </div>
    </div>
  );
}
