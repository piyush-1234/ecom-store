import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { getProfileSummary } from '@/server/services/auth.service';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const profile = await getProfileSummary(session.sub);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile.name ? `Hi, ${profile.name.split(' ')[0]}` : 'Your account'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your details, addresses and orders.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Addresses
          </dt>
          <dd className="mt-1 text-2xl font-semibold">{profile.addressCount}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Orders
          </dt>
          <dd className="mt-1 text-2xl font-semibold">{profile.orderCount}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Member since
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {new Date(profile.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </dd>
        </div>
      </dl>

      <section className="rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Contact details</h2>
        <dl className="divide-y divide-border text-sm">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{profile.email ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="font-medium">{profile.phone ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/account/addresses"
          className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Manage addresses
        </Link>
        <Link
          href="/t-shirts"
          className="rounded-md border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
