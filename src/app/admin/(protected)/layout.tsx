import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/server/auth/admin-session';
import { logoutAdminAction } from '@/server/actions/admin';

/**
 * Admin guard.
 *
 * Lives in a route group so `/admin/login` can render without it — a guard in
 * `app/admin/layout.tsx` would redirect the login page to itself forever.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  return (
    <div className="flex min-h-dvh flex-col bg-secondary/40">
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/admin/orders" className="text-sm font-semibold tracking-tight">
              ecomerce-store · admin
            </Link>
            <nav aria-label="Admin" className="flex items-center gap-4 text-sm">
              <Link href="/admin/orders" className="hover:text-accent">
                Orders
              </Link>
              <Link href="/admin/returns" className="hover:text-accent">
                Returns
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {admin.email} · {admin.role}
            </span>
            <form action={logoutAdminAction}>
              <button type="submit" className="text-muted-foreground hover:text-accent">
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
