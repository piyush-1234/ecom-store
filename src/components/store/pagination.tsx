import Link from 'next/link';
import { buildFilterQuery } from '@/lib/validators/catalog';
import { cn } from '@/lib/utils/cn';

interface PaginationProps {
  basePath: string;
  current: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
}

/** Link-based pagination: crawlable and JS-free. */
export function Pagination({ basePath, current, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (candidate) =>
      candidate === 1 ||
      candidate === totalPages ||
      Math.abs(candidate - page) <= 1,
  );

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link
          href={`${basePath}${buildFilterQuery(current, { page: String(page - 1) })}`}
          className="rounded border border-border px-3 py-2 text-sm hover:bg-secondary"
          rel="prev"
        >
          Previous
        </Link>
      ) : null}

      {pages.map((candidate, index) => {
        const previous = pages[index - 1];
        const gap = previous !== undefined && candidate - previous > 1;

        return (
          <span key={candidate} className="flex items-center gap-1">
            {gap ? <span className="px-1 text-muted-foreground">…</span> : null}
            <Link
              href={`${basePath}${buildFilterQuery(current, { page: String(candidate) })}`}
              aria-current={candidate === page ? 'page' : undefined}
              className={cn(
                'rounded border px-3 py-2 text-sm',
                candidate === page
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-secondary',
              )}
            >
              {candidate}
            </Link>
          </span>
        );
      })}

      {page < totalPages ? (
        <Link
          href={`${basePath}${buildFilterQuery(current, { page: String(page + 1) })}`}
          className="rounded border border-border px-3 py-2 text-sm hover:bg-secondary"
          rel="next"
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}
