import type { Metadata } from 'next';
import Link from 'next/link';
import { listProducts } from '@/server/services/catalog.service';
import { parseCatalogueFilters } from '@/lib/validators/catalog';
import { ProductCard } from '@/components/store/product-card';

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const q = typeof searchParams.q === 'string' ? searchParams.q : '';
  return {
    title: q ? `Search: ${q}` : 'Search',
    // Search result pages are not useful in an index.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const rawQuery = typeof searchParams.q === 'string' ? searchParams.q : '';
  const q = rawQuery.trim();

  const filters = parseCatalogueFilters(searchParams);
  const result = q
    ? await listProducts(null, { ...filters, q })
    : { products: [], total: 0, page: 1, perPage: 12, totalPages: 1 };

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Search</h1>

      <form action="/search" method="get" role="search" className="mt-4 flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">
          Search products
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search tees, jeans, fits…"
          className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          Search
        </button>
      </form>

      {q ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {result.total} {result.total === 1 ? 'result' : 'results'} for{' '}
          <span className="font-medium text-foreground">“{q}”</span>
        </p>
      ) : null}

      {q && result.products.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-card p-10 text-center">
          <h2 className="text-base font-semibold">Nothing matched that search</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a broader term like “oversized tee”, “straight jeans” or “black”.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/t-shirts" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
              T-Shirts
            </Link>
            <Link href="/jeans" className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary">
              Jeans
            </Link>
          </div>
        </div>
      ) : null}

      {result.products.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
          {result.products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
