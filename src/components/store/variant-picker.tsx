'use client';

import { useMemo, useState } from 'react';
import type { VariantDto } from '@/server/services/catalog.service';
import { addToCartAndGoAction } from '@/server/actions/cart';
import { formatINR } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

/**
 * Size × colour picker.
 *
 * The form posts directly to a Server Action, so "add to cart" works without
 * client-side fetch logic. Selection state is the only thing that needs JS;
 * a sensible default variant is preselected so the no-JS path still works.
 */
/**
 * Size preference for the default selection.
 * Opening on XS (alphabetically/first-in-stock) is a poor default: most Indian
 * shoppers land on M or L, so preselect the size that matches the size curve.
 */
const PREFERRED_SIZES = ['M', 'L', 'XL', 'S', 'XXL', 'XS'];

function pickDefault<T extends { size: string; inStock: boolean }>(options: T[]): T | undefined {
  for (const size of PREFERRED_SIZES) {
    const match = options.find((option) => option.size === size && option.inStock);
    if (match) return match;
  }
  return options.find((option) => option.inStock) ?? options[0];
}

export function VariantPicker({ variants }: { variants: VariantDto[] }) {
  const colours = useMemo(() => {
    const seen = new Map<string, string>();
    for (const variant of variants) {
      if (!seen.has(variant.color)) seen.set(variant.color, variant.colorHex);
    }
    return [...seen.entries()].map(([name, hex]) => ({ name, hex }));
  }, [variants]);

  const firstAvailable = pickDefault(variants) ?? variants[0];

  const [color, setColor] = useState(firstAvailable?.color ?? '');
  const [size, setSize] = useState(firstAvailable?.size ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const sizesForColor = useMemo(
    () => variants.filter((variant) => variant.color === color),
    [variants, color],
  );

  const selected = variants.find((variant) => variant.color === color && variant.size === size);

  function pickColor(nextColor: string) {
    setColor(nextColor);
    setMessage(null);

    // Keep the current size if it exists in the new colour, else fall back to the
    // preferred size so the customer is never left on a dead combination.
    const sameSize = variants.find((v) => v.color === nextColor && v.size === size);
    if (!sameSize) {
      const fallback = pickDefault(variants.filter((v) => v.color === nextColor));
      if (fallback) setSize(fallback.size);
    }
  }

  const outOfStock = !selected || !selected.inStock;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Colour</h2>
          <span className="text-sm text-muted-foreground">{color}</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {colours.map((option) => {
            const active = option.name === color;
            return (
              <li key={option.name}>
                <button
                  type="button"
                  onClick={() => pickColor(option.name)}
                  aria-pressed={active}
                  aria-label={option.name}
                  className={cn(
                    'flex h-9 items-center gap-2 rounded border px-2.5 text-sm transition-colors',
                    active ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-secondary',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded-full border border-border"
                    style={{ backgroundColor: option.hex }}
                  />
                  {option.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Size</h2>
          <a href="/size-chart" className="text-xs text-accent underline-offset-4 hover:underline">
            Size chart
          </a>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {sizesForColor.map((variant) => {
            const active = variant.size === size;
            return (
              <li key={variant.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSize(variant.size);
                    setMessage(null);
                  }}
                  disabled={!variant.inStock}
                  aria-pressed={active}
                  className={cn(
                    'h-11 min-w-11 rounded border px-3 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-secondary',
                    !variant.inStock && 'cursor-not-allowed opacity-40 line-through',
                  )}
                >
                  {variant.size}
                </button>
              </li>
            );
          })}
        </ul>
        {selected && selected.inStock && selected.stock <= 5 ? (
          <p className="mt-2 text-xs text-accent">Only {selected.stock} left in this size.</p>
        ) : null}
      </div>

      <form action={addToCartAndGoAction} className="space-y-3">
        <input type="hidden" name="variantId" value={selected?.id ?? ''} />
        <input type="hidden" name="qty" value="1" />

        <button
          type="submit"
          disabled={outOfStock}
          onClick={() => {
            if (outOfStock) setMessage('Choose an available size to continue.');
          }}
          className={cn(
            'h-12 w-full rounded-md text-sm font-medium transition-colors',
            outOfStock
              ? 'cursor-not-allowed bg-secondary text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {outOfStock ? 'Out of stock' : `Add to cart · ${formatINR(selected?.pricePaise ?? 0)}`}
        </button>
      </form>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <ul className="space-y-1.5 text-xs text-muted-foreground">
        <li>Free size exchange — we pay the return shipping.</li>
        <li>Ships in 24 hours. GST invoice included.</li>
      </ul>
    </div>
  );
}
