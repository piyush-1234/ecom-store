import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { siteConfig } from '@/lib/config/site';
import { LogoutButton } from './logout-button';

/**
 * Authenticated area guard.
 *
 * The check runs here (server-side, per request) rather than in middleware, so it
 * verifies the JWT signature instead of merely checking that a cookie exists.
 * `redirect()` on failure means no account content is ever rendered for an
 * expired or forged session.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link href="/" className="shrink-0 text-base font-semibold tracking-tight sm:text-lg">
            {siteConfig.name}
          </Link>
          <nav aria-label="Account" className="flex items-center gap-3 text-sm sm:gap-6">
            <Link href="/account" className="whitespace-nowrap hover:text-accent">
              Account
            </Link>
            <Link href="/account/addresses" className="whitespace-nowrap hover:text-accent">
              Addresses
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1 py-10 sm:py-14">
        <div className="container-page max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
