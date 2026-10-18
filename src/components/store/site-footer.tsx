import Link from 'next/link';
import { siteConfig } from '@/lib/config/site';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-base font-semibold tracking-tight">{siteConfig.name}</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tees and denim built for Indian bodies. Honest specs, free size exchange.
          </p>
        </div>

        <nav aria-label="Shop">
          <h2 className="text-sm font-semibold">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/t-shirts" className="hover:text-accent">T-Shirts</Link></li>
            <li><Link href="/jeans" className="hover:text-accent">Jeans</Link></li>
            <li><Link href="/size-chart" className="hover:text-accent">Size chart</Link></li>
          </ul>
        </nav>

        <nav aria-label="Help">
          <h2 className="text-sm font-semibold">Help</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/account" className="hover:text-accent">Your account</Link></li>
            <li><Link href="/cart" className="hover:text-accent">Cart</Link></li>
            <li>
              <a href={`mailto:${siteConfig.supportEmail}`} className="hover:text-accent">
                Contact
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold">Policies</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Free size exchange within 15 days</li>
            <li>All prices include GST</li>
            <li>Made in India</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}. All prices in INR, inclusive of GST.
          </p>
          <p>
            Support:{' '}
            <a className="underline hover:text-accent" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
