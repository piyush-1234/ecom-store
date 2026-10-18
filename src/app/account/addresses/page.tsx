import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/session-cookie';
import { listAddresses } from '@/server/services/address.service';
import { AddressBook } from '@/components/account/address-book';

export const metadata: Metadata = {
  title: 'Addresses',
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const addresses = await listAddresses(session.sub);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Addresses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved addresses speed up checkout and help us get your delivery estimate right.
        </p>
      </div>
      <AddressBook initialAddresses={addresses} />
    </div>
  );
}
