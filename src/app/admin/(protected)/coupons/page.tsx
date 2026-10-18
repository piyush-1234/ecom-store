import type { Metadata } from 'next';
import { listCoupons } from '@/server/services/admin-coupons.service';
import { createCouponAction, toggleCouponAction } from '@/server/actions/admin-catalog';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Coupons · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const inputClass =
  'mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function valueLabel(type: string, value: number): string {
  if (type === 'PERCENT') return `${value}% off`;
  if (type === 'FLAT') return `${formatINR(value)} off`;
  return 'Free shipping';
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const coupons = await listCoupons();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Coupons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {coupons.length} coupon{coupons.length === 1 ? '' : 's'}. Redemption is enforced at
          checkout, including per-customer limits and the global usage cap.
        </p>
      </div>

      {searchParams.ok ? (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Saved.</p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <form action={createCouponAction} className="space-y-4 rounded-lg border border-border bg-background p-5">
        <h2 className="text-sm font-semibold">New coupon</h2>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="code" className="text-xs font-medium">Code</label>
            <input id="code" name="code" required placeholder="WELCOME10" className={inputClass} />
          </div>
          <div>
            <label htmlFor="type" className="text-xs font-medium">Type</label>
            <select id="type" name="type" className={inputClass} defaultValue="PERCENT">
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Flat amount off</option>
              <option value="FREE_SHIPPING">Free shipping</option>
            </select>
          </div>
          <div>
            <label htmlFor="value" className="text-xs font-medium">Value (% or Rs.)</label>
            <input id="value" name="value" type="number" min={0} step="1" defaultValue={10} className={inputClass} />
          </div>
          <div>
            <label htmlFor="minOrderRupees" className="text-xs font-medium">Min order (Rs.)</label>
            <input id="minOrderRupees" name="minOrderRupees" type="number" min={0} defaultValue={0} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="maxDiscountRupees" className="text-xs font-medium">Max discount (Rs.)</label>
            <input id="maxDiscountRupees" name="maxDiscountRupees" type="number" min={0} className={inputClass} />
          </div>
          <div>
            <label htmlFor="usageLimit" className="text-xs font-medium">Total uses</label>
            <input id="usageLimit" name="usageLimit" type="number" min={1} className={inputClass} />
          </div>
          <div>
            <label htmlFor="perUserLimit" className="text-xs font-medium">Uses per customer</label>
            <input id="perUserLimit" name="perUserLimit" type="number" min={0} defaultValue={1} className={inputClass} />
          </div>
          <div>
            <label htmlFor="expiresAt" className="text-xs font-medium">Expires</label>
            <input id="expiresAt" name="expiresAt" type="date" className={inputClass} />
          </div>
        </div>

        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Create coupon
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-2 font-medium">Code</th>
              <th scope="col" className="px-4 py-2 font-medium">Offer</th>
              <th scope="col" className="px-4 py-2 font-medium">Min order</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Used</th>
              <th scope="col" className="px-4 py-2 font-medium">Window</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium">{coupon.code}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {valueLabel(coupon.type, coupon.value)}
                  {coupon.maxDiscountPaise ? ` (max ${formatINR(coupon.maxDiscountPaise)})` : ''}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatINR(coupon.minOrderPaise)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {coupon.usedCount}
                  {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ''}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {coupon.startsAt
                    ? new Date(coupon.startsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                    : '—'}
                  {' → '}
                  {coupon.expiresAt
                    ? new Date(coupon.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                    : 'no expiry'}
                </td>
                <td className="px-4 py-2.5">
                  <form action={toggleCouponAction}>
                    <input type="hidden" name="couponId" value={coupon.id} />
                    <input type="hidden" name="activate" value={coupon.isActive ? '0' : '1'} />
                    <button
                      type="submit"
                      className={
                        coupon.isActive
                          ? 'rounded bg-accent/15 px-2 py-1 text-xs font-medium text-accent'
                          : 'rounded bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {coupon.isActive ? 'Enabled' : 'Disabled'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
