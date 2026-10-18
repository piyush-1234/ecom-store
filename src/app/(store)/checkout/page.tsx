import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getCart } from '@/server/services/cart.service';
import { isRazorpayEnabled } from '@/server/payments/razorpay';
import { CheckoutForm } from '@/components/store/checkout-form';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const cart = await getCart();

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Add something to your cart before checking out.
        </p>
        <Link
          href="/t-shirts"
          className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
        >
          Shop T-Shirts
        </Link>
      </div>
    );
  }

  const razorpayEnabled = isRazorpayEnabled();

  return (
    <div className="container-page py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/cart" className="hover:text-accent">
              Cart
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            Checkout
          </li>
        </ol>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Checkout</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <CheckoutForm razorpayEnabled={razorpayEnabled} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Order summary</h2>

            <ul className="mt-4 space-y-3">
              {cart.items.map((line) => (
                <li key={line.id} className="flex items-center gap-3">
                  <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded border border-border bg-secondary">
                    <Image
                      src={line.imageUrl}
                      alt={line.productName}
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized={line.imageUrl.endsWith('.svg')}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.variantLabel} · Qty {line.qty}
                    </p>
                  </div>
                  <p className="text-sm">{formatINR(line.lineTotalPaise)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium">{formatINR(cart.subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping &amp; fees</dt>
                <dd className="text-muted-foreground">Calculated on submit</dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-muted-foreground">
              Prices include GST. A GST invoice is issued with every order.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
