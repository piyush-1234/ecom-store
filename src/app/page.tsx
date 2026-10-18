import Link from 'next/link';
import { siteConfig } from '@/lib/config/site';

/**
 * PHASE 1 SCAFFOLD HOME PAGE.
 * Intentionally minimal: it proves the stack renders, Tailwind tokens resolve,
 * and the brand palette is applied. Replaced by the real merchandised
 * storefront in Phase 3 (catalogue + PDP + cart).
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <span className="shrink-0 text-base font-semibold tracking-tight sm:text-lg">
            {siteConfig.name}
          </span>
          <nav aria-label="Main" className="flex items-center gap-3 text-sm sm:gap-6">
            <Link href="/t-shirts" className="whitespace-nowrap transition-colors hover:text-accent">
              T-Shirts
            </Link>
            <Link href="/jeans" className="whitespace-nowrap transition-colors hover:text-accent">
              Jeans
            </Link>
            <Link href="/cart" className="whitespace-nowrap transition-colors hover:text-accent">
              Cart
            </Link>
            <Link href="/account" className="whitespace-nowrap transition-colors hover:text-accent">
              Account
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="container-page py-16 sm:py-24">
          <p className="mb-4 inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            Phase 1 · scaffold online
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Tees and denim,
            <br />
            <span className="text-olive-600">built to actually fit.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {siteConfig.description}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/t-shirts"
              className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Shop T-Shirts
            </Link>
            <Link
              href="/jeans"
              className="rounded-md border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              Shop Jeans
            </Link>
          </div>
        </section>

        <section className="container-page grid gap-4 pb-16 sm:grid-cols-2">
          <Link
            href="/t-shirts"
            className="group rounded-lg border border-border bg-card p-8 transition-shadow hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">T-Shirts</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              220 GSM combed cotton. Pre-shrunk. Collar that survives the wash.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-accent">
              Browse tees &rarr;
            </span>
          </Link>
          <Link
            href="/jeans"
            className="group rounded-lg border border-border bg-card p-8 transition-shadow hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">Jeans</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Straight, relaxed and wide fits graded for Indian bodies. Free hemming.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-accent">
              Browse jeans &rarr;
            </span>
          </Link>
        </section>

        <section className="border-y border-border bg-secondary/60">
          <div className="container-page grid gap-6 py-10 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold">Free size exchange</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Wrong size? We swap it, and we pay the return shipping.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Published specs</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                GSM, shrinkage and wash data on every product. No vague claims.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Ships in 24 hours</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                GST invoice included. Track your order end to end.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}. All prices in INR, inclusive of
            GST.
          </p>
          <p>
            Support:{' '}
            <a className="underline hover:text-accent" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
