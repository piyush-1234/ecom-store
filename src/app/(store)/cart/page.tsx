import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getCart } from '@/server/services/cart.service';
import { removeItemAction, updateQtyAction } from '@/server/actions/cart';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Your cart',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const cart = await getCart();

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Once you add a tee or a pair of jeans it will show up here.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/t-shirts"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Shop T-Shirts
          </Link>
          <Link
            href="/jeans"
            className="rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-secondary"
          >
            Shop Jeans
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
      </p>

      {cart.hasStockIssue ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Some items in your cart are out of stock or exceed available quantity. Please update them
          before checking out.
        </p>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-border border-y border-border">
          {cart.items.map((line) => (
            <li key={line.id} className="flex gap-4 py-5">
              <Link
                href={`/product/${line.productSlug}`}
                className="relative h-28 w-24 shrink-0 overflow-hidden rounded border border-border bg-secondary"
              >
                <Image
                  src={line.imageUrl}
                  alt={line.productName}
                  fill
                  sizes="96px"
                  className="object-cover"
                  unoptimized={line.imageUrl.endsWith('.svg')}
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div>
                  <Link href={`/product/${line.productSlug}`} className="text-sm font-medium hover:text-accent">
                    {line.productName}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{line.variantLabel}</p>
                  {!line.inStock ? (
                    <p className="mt-1 text-xs font-medium text-destructive">Out of stock</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <form action={updateQtyAction} className="flex items-center gap-1">
                    <input type="hidden" name="itemId" value={line.id} />
                    <label htmlFor={`qty-${line.id}`} className="sr-only">
                      Quantity for {line.productName}
                    </label>
                    <input
                      id={`qty-${line.id}`}
                      name="qty"
                      type="number"
                      min={1}
                      max={Math.max(line.stock, 1)}
                      defaultValue={line.qty}
                      className="h-9 w-16 rounded border border-input bg-card px-2 text-sm"
                    />
                    <button type="submit" className="h-9 rounded border border-border px-3 text-xs hover:bg-secondary">
                      Update
                    </button>
                  </form>

                  <form action={removeItemAction}>
                    <input type="hidden" name="itemId" value={line.id} />
                    <button type="submit" className="text-xs text-muted-foreground underline-offset-4 hover:text-accent hover:underline">
                      Remove
                    </button>
                  </form>
                </div>
              </div>

              <div className="text-right text-sm">
                <p className="font-semibold">{formatINR(line.lineTotalPaise)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatINR(line.unitPricePaise)} each
                </p>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Order summary</h2>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium">{formatINR(cart.subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="text-muted-foreground">Calculated at checkout</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="font-medium">Total</dt>
                <dd className="font-semibold">{formatINR(cart.subtotalPaise)}</dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-muted-foreground">
              All prices include GST. A tax invoice is issued for every order.
            </p>

            <button
              type="button"
              disabled
              title="Checkout is enabled in the next release"
              className="mt-5 h-12 w-full cursor-not-allowed rounded-md bg-secondary text-sm font-medium text-muted-foreground"
            >
              Checkout coming next
            </button>

            <Link
              href="/t-shirts"
              className="mt-3 block text-center text-sm text-accent underline-offset-4 hover:underline"
            >
              Continue shopping
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
