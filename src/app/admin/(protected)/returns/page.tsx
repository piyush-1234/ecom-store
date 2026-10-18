import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReturnStatus } from '@prisma/client';
import { listReturnRequests } from '@/server/services/returns.service';
import {
  approveReturnAction,
  cancelReturnAction,
  completeExchangeAction,
  receivedReturnAction,
  refundReturnAction,
  rejectReturnAction,
  shipReplacementAction,
} from '@/server/actions/admin';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Returns · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'PICKUP_SCHEDULED',
  'RECEIVED',
  'REPLACEMENT_SHIPPED',
  'COMPLETED',
  'REFUNDED',
  'REJECTED',
  'CANCELLED',
];

interface PageProps {
  searchParams: { status?: string; ok?: string; error?: string };
}

function ActionButton({
  children,
  variant = 'primary',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'outline' | 'danger';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-primary text-primary-foreground'
      : variant === 'danger'
        ? 'border border-destructive text-destructive hover:bg-destructive/10'
        : 'border border-border hover:bg-secondary';
  return <button type="submit" className={`h-8 rounded px-3 text-xs font-medium ${styles}`}>{children}</button>;
}

export default async function AdminReturnsPage({ searchParams }: PageProps) {
  const status = STATUSES.includes(searchParams.status as ReturnStatus)
    ? (searchParams.status as ReturnStatus)
    : undefined;

  const requests = await listReturnRequests(status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Returns &amp; exchanges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {requests.length} request{requests.length === 1 ? '' : 's'}
          {status ? ` in ${status}` : ''}
        </p>
      </div>

      {searchParams.ok ? (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Action completed.</p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/admin/returns"
          className={!status ? 'rounded bg-primary px-3 py-1.5 text-primary-foreground' : 'rounded border border-border px-3 py-1.5 hover:bg-secondary'}
        >
          All
        </Link>
        {STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/returns?status=${value}`}
            className={
              status === value
                ? 'rounded bg-primary px-3 py-1.5 text-primary-foreground'
                : 'rounded border border-border px-3 py-1.5 hover:bg-secondary'
            }
          >
            {value}
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          Nothing in this queue.
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {request.kind} · qty {request.qty} ·{' '}
                    <Link
                      href={`/admin/orders/${request.orderNumber}`}
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      {request.orderNumber}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {request.productName} · {request.variantLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {request.reason}
                    {request.refundAmountPaise !== null
                      ? ` · refund ${formatINR(request.refundAmountPaise)}`
                      : ''}
                    {' · '}
                    {new Date(request.requestedAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </p>
                </div>
                <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                  {request.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {request.status === 'REQUESTED' ? (
                  <>
                    <form action={approveReturnAction}>
                      <input type="hidden" name="returnId" value={request.id} />
                      <ActionButton>Approve</ActionButton>
                    </form>
                    <form action={rejectReturnAction}>
                      <input type="hidden" name="returnId" value={request.id} />
                      <ActionButton variant="danger">Reject</ActionButton>
                    </form>
                  </>
                ) : null}

                {['APPROVED', 'PICKUP_SCHEDULED'].includes(request.status) ? (
                  <form action={receivedReturnAction}>
                    <input type="hidden" name="returnId" value={request.id} />
                    <ActionButton>Mark received (restock)</ActionButton>
                  </form>
                ) : null}

                {request.kind === 'REFUND' && request.status === 'RECEIVED' ? (
                  <form action={refundReturnAction}>
                    <input type="hidden" name="returnId" value={request.id} />
                    <ActionButton>Refund {request.refundAmountPaise ? formatINR(request.refundAmountPaise) : ''}</ActionButton>
                  </form>
                ) : null}

                {request.kind === 'EXCHANGE' && request.status === 'RECEIVED' ? (
                  <form action={shipReplacementAction}>
                    <input type="hidden" name="returnId" value={request.id} />
                    <ActionButton>Ship replacement</ActionButton>
                  </form>
                ) : null}

                {request.kind === 'EXCHANGE' && request.status === 'REPLACEMENT_SHIPPED' ? (
                  <form action={completeExchangeAction}>
                    <input type="hidden" name="returnId" value={request.id} />
                    <ActionButton>Complete</ActionButton>
                  </form>
                ) : null}

                {['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'].includes(request.status) ? (
                  <form action={cancelReturnAction}>
                    <input type="hidden" name="returnId" value={request.id} />
                    <ActionButton variant="outline">Cancel</ActionButton>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
