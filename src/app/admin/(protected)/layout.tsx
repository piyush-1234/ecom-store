import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/server/auth/admin-session';
import { logoutAdminAction } from '@/server/actions/admin';

/**
 * Admin guard.
 *
 * Lives in a route group so `/admin/login` can render without it — a guard in
 * `app/admin/layout.tsx` would redirect the login page to itself forever.
 *
 * The header wraps deliberately: with six nav items plus the account block it
 * overflows a phone viewport, and an overflowing flex row overlaps neighbouring
 * items so they stop receiving clicks. That was a real bug found by the Playwright
 * suite, not a theoretical one.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  return (
    <div className="flex min-h-dvh flex-col bg-secondary/40">
      <header className="border-b border-border bg-background">
        <div className="container-page flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/admin" className="shrink-0 text-sm font-semibold tracking-tight">
              ecomerce-store · admin
            </Link>
            <nav aria-label="Admin" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Link href="/admin" className="hover:text-accent">
                Dashboard
              </Link>
              <Link href="/admin/orders" className="hover:text-accent">
                Orders
              </Link>
              <Link href="/admin/returns" className="hover:text-accent">
                Returns
              </Link>
              <Link href="/admin/products" className="hover:text-accent">
                Products
              </Link>
              <Link href="/admin/inventory" className="hover:text-accent">
                Inventory
              </Link>
              <Link href="/admin/coupons" className="hover:text-accent">
                Coupons
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {/* Hidden on small screens so the action stays reachable. */}
            <span className="hidden text-muted-foreground sm:inline">
              {admin.email} · {admin.role}
            </span>
            <form action={logoutAdminAction}>
              <button type="submit" className="whitespace-nowrap text-muted-foreground hover:text-accent">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 py-8">
        <div className="container-page">{children}</div>
      </main>
    </div>
  );
}
