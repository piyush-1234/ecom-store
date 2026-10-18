'use client';

import { useState } from 'react';
import { requestReturnAction } from '@/server/actions/returns';

interface ReplacementOption {
  id: string;
  size: string;
  color: string;
  stock: number;
}

const REASONS: { value: string; label: string }[] = [
  { value: 'SIZE_TOO_SMALL', label: 'Size too small' },
  { value: 'SIZE_TOO_LARGE', label: 'Size too large' },
  { value: 'FIT_NOT_AS_EXPECTED', label: 'Fit not as expected' },
  { value: 'DEFECTIVE', label: 'Defective / damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong item received' },
  { value: 'CHANGED_MIND', label: 'Changed my mind' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * Size exchange is the primary action, not a buried option — it keeps the sale and
 * is the behaviour we want customers to choose. Refund is the secondary path.
 */
export function ReturnRequestForm({
  orderNumber,
  orderItemId,
  token,
  productName,
  variantLabel,
  maxQty,
  replacements,
}: {
  orderNumber: string;
  orderItemId: string;
  token?: string;
  productName: string;
  variantLabel: string;
  maxQty: number;
  replacements: ReplacementOption[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'EXCHANGE' | 'REFUND'>(
    replacements.some((option) => option.stock > 0) ? 'EXCHANGE' : 'REFUND',
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
      >
        Exchange or return
      </button>
    );
  }

  return (
    <form action={requestReturnAction} className="mt-3 space-y-3 rounded-md border border-border p-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <input type="hidden" name="orderItemId" value={orderItemId} />
      {token ? <input type="hidden" name="token" value={token} /> : null}

      <p className="text-xs text-muted-foreground">
        {productName} · {variantLabel}
      </p>

      <div className="flex flex-wrap gap-2">
        <label className={`flex-1 cursor-pointer rounded border p-2 text-xs ${kind === 'EXCHANGE' ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
          <input
            type="radio"
            name="kind"
            value="EXCHANGE"
            checked={kind === 'EXCHANGE'}
            onChange={() => setKind('EXCHANGE')}
            className="mr-1.5"
          />
          Exchange for another size
        </label>
        <label className={`flex-1 cursor-pointer rounded border p-2 text-xs ${kind === 'REFUND' ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
          <input
            type="radio"
            name="kind"
            value="REFUND"
            checked={kind === 'REFUND'}
            onChange={() => setKind('REFUND')}
            className="mr-1.5"
          />
          Refund
        </label>
      </div>

      {kind === 'EXCHANGE' ? (
        <div>
          <label htmlFor={`replacement-${orderItemId}`} className="block text-xs font-medium">
            Replacement size
          </label>
          <select
            id={`replacement-${orderItemId}`}
            name="requestedVariantId"
            required
            className="mt-1 h-9 w-full rounded border border-input bg-card px-2 text-sm"
          >
            <option value="">Choose a size</option>
            {replacements.map((option) => (
              <option key={option.id} value={option.id} disabled={option.stock < 1}>
                {option.color} / {option.size}
                {option.stock < 1 ? ' — out of stock' : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor={`reason-${orderItemId}`} className="block text-xs font-medium">
            Reason
          </label>
          <select
            id={`reason-${orderItemId}`}
            name="reason"
            required
            className="mt-1 h-9 w-full rounded border border-input bg-card px-2 text-sm"
          >
            {REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label htmlFor={`qty-${orderItemId}`} className="block text-xs font-medium">
            Qty
          </label>
          <input
            id={`qty-${orderItemId}`}
            name="qty"
            type="number"
            min={1}
            max={maxQty}
            defaultValue={1}
            className="mt-1 h-9 w-full rounded border border-input bg-card px-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="h-9 rounded bg-primary px-4 text-xs font-medium text-primary-foreground">
          Submit request
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded border border-border px-4 text-xs font-medium hover:bg-secondary"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Exchanges are free — we arrange the pickup. Refunds exclude shipping and COD fees.
      </p>
    </form>
  );
}
