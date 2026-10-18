import Link from 'next/link';
import type { Facets } from '@/server/services/catalog.service';
import { buildFilterQuery } from '@/lib/validators/catalog';
import { formatINR } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

/**
 * Filter rail.
 *
 * Implemented as plain links rather than a client-side widget: every filter state
 * is a URL, so it is shareable, crawlable, and works with JavaScript disabled.
 */

interface FilterRailProps {
  basePath: string;
  facets: Facets;
  current: Record<string, string | string[] | undefined>;
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(',').filter(Boolean);
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function hrefFor(basePath: string, current: Record<string, string | string[] | undefined>, patch: Record<string, string | undefined>) {
  return `${basePath}${buildFilterQuery(current, patch)}`;
}

function PriceBand({
  basePath,
  current,
  min,
  max,
}: {
  basePath: string;
  current: Record<string, string | string[] | undefined>;
  min: number;
  max: number;
}) {
  const bands = [
    { label: `Under ${formatINR(min + 20000)}`, min: undefined, max: String(Math.round((min + 20000) / 100)) },
    { label: `${formatINR(min + 20000)}–${formatINR(max)}`, min: String(Math.round((min + 20000) / 100)), max: String(Math.round(max / 100)) },
  ];

  return (
    <div className="space-y-2">
      {bands.map((band) => {
        const active = current.min === band.min && current.max === band.max;
        return (
          <Link
            key={band.label}
            href={hrefFor(basePath, current, active ? { min: undefined, max: undefined } : { min: band.min, max: band.max })}
            className={cn(
              'block text-sm transition-colors hover:text-accent',
              active ? 'font-medium text-accent' : 'text-muted-foreground',
            )}
          >
            {band.label}
          </Link>
        );
      })}
    </div>
  );
}

export function FilterRail({ basePath, facets, current }: FilterRailProps) {
  const activeSizes = toList(current.size);
  const activeColors = toList(current.color);
  const activeFits = toList(current.fit);
  const activeCount = activeSizes.length + activeColors.length + activeFits.length + (current.min ? 1 : 0);

  return (
    <aside aria-label="Filters" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {activeCount > 0 ? (
          <Link href={basePath} className="text-xs text-accent underline-offset-4 hover:underline">
            Clear all
          </Link>
        ) : null}
      </div>

      {facets.sizes.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Size
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {facets.sizes.map((size) => {
              const active = activeSizes.includes(size);
              return (
                <li key={size}>
                  <Link
                    href={hrefFor(basePath, current, { size: toggle(activeSizes, size).join(',') || undefined })}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-9 min-w-9 items-center justify-center rounded border px-2 text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-secondary',
                    )}
                  >
                    {size}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {facets.colors.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Colour
          </h3>
          <ul className="mt-2 space-y-1.5">
            {facets.colors.map((colour) => {
              const active = activeColors.includes(colour.name);
              return (
                <li key={colour.name}>
                  <Link
                    href={hrefFor(basePath, current, {
                      color: toggle(activeColors, colour.name).join(',') || undefined,
                    })}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-2 text-sm transition-colors hover:text-accent',
                      active ? 'font-medium text-accent' : 'text-muted-foreground',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-3.5 w-3.5 rounded-full border border-border"
                      style={{ backgroundColor: colour.hex }}
                    />
                    {colour.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {facets.fits.length > 1 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fit</h3>
          <ul className="mt-2 space-y-1.5">
            {facets.fits.map((fit) => {
              const active = activeFits.includes(fit);
              return (
                <li key={fit}>
                  <Link
                    href={hrefFor(basePath, current, {
                      fit: toggle(activeFits, fit).join(',') || undefined,
                    })}
                    aria-pressed={active}
                    className={cn(
                      'text-sm transition-colors hover:text-accent',
                      active ? 'font-medium text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {fit}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {facets.priceRangePaise.max > facets.priceRangePaise.min ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</h3>
          <div className="mt-2">
            <PriceBand basePath={basePath} current={current} min={facets.priceRangePaise.min} max={facets.priceRangePaise.max} />
          </div>
        </section>
      ) : null}
    </aside>
  );
}
