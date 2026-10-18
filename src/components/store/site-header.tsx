import Link from 'next/link';
import { getCartItemCount } from '@/server/services/cart.service';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { siteConfig } from '@/lib/config/site';

/**
 * Store header.
 *
 * Reads the cart count and session on the server so the header is correct on
 * first paint (no layout shift, no client fetch). This makes store routes
 * dynamic — an acceptable trade for a per-user header.
 */
export async function SiteHeader() {
  const [cartCount, session] = await Promise.all([getCartItemCount(), getCurrentSession()]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0 text-base font-semibold tracking-tight sm:text-lg">
          {siteConfig.name}
        </Link>

        <nav aria-label="Main" className="flex items-center gap-3 text-sm sm:gap-6">
          <Link href="/t-shirts" className="whitespace-nowrap transition-colors hover:text-accent">
            T-Shirts
          </Link>
          <Link href="/jeans" className="whitespace-nowrap transition-colors hover:text-accent">
            Jeans
          </Link>
          <Link
            href="/cart"
            className="whitespace-nowrap transition-colors hover:text-accent"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
          >
            Cart
            {cartCount > 0 ? (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {cartCount}
              </span>
            ) : null}
          </Link>
          <Link
            href={session ? '/account' : '/login'}
            className="whitespace-nowrap transition-colors hover:text-accent"
          >
            {session ? 'Account' : 'Sign in'}
          </Link>
        </nav>
      </div>
    </header>
  );
}
