import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getCategoryBySlug,
  getFacets,
  listProducts,
} from '@/server/services/catalog.service';
import { parseCatalogueFilters, buildFilterQuery, SORT_OPTIONS } from '@/lib/validators/catalog';
import { ProductCard } from '@/components/store/product-card';
import { FilterRail } from '@/components/store/filter-rail';
import { Pagination } from '@/components/store/pagination';
import { siteConfig } from '@/lib/config/site';

/** Only these two categories exist in v1 — anything else 404s rather than querying. */
const CATEGORY_SLUGS = ['t-shirts', 'jeans'] as const;
type CategorySlug = (typeof CATEGORY_SLUGS)[number];

function isCategorySlug(value: string): value is CategorySlug {
  return (CATEGORY_SLUGS as readonly string[]).includes(value);
}

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  featured: 'Featured',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

interface PageProps {
  params: { category: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isCategorySlug(params.category)) return {};
  const category = await getCategoryBySlug(params.category);
  if (!category) return {};

  return {
    title: `${category.name} — buy online in India`,
    description:
      category.description ??
      `Shop ${category.name.toLowerCase()} at ${siteConfig.name}. Free size exchange, GST invoice, ships in 24 hours.`,
    alternates: { canonical: `/${category.slug}` },
    openGraph: {
      title: `${category.name} | ${siteConfig.name}`,
      description: category.description ?? undefined,
      url: `/${category.slug}`,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  if (!isCategorySlug(params.category)) notFound();

  const category = await getCategoryBySlug(params.category);
  if (!category) notFound();

  const filters = parseCatalogueFilters(searchParams);
  const [result, facets] = await Promise.all([
    listProducts(category.slug, filters),
    getFacets(category.slug),
  ]);

  const basePath = `/${category.slug}`;

  return (
    <div className="container-page py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {category.name}
          </li>
        </ol>
      </nav>

      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{category.name}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {category.description}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.total} {result.total === 1 ? 'style' : 'styles'}
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <div>
          {/* Mobile: filters collapse. Desktop: always visible. */}
          <details className="lg:hidden">
            <summary className="cursor-pointer rounded border border-border px-4 py-2 text-sm font-medium">
              Filters
            </summary>
            <div className="mt-4">
              <FilterRail basePath={basePath} facets={facets} current={searchParams} />
            </div>
          </details>

          <div className="hidden lg:block">
            <FilterRail basePath={basePath} facets={facets} current={searchParams} />
          </div>
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 text-sm">
            <span className="font-medium">Sort</span>
            {SORT_OPTIONS.map((option) => {
              const active = filters.sort === option;
              return (
                <Link
                  key={option}
                  href={`${basePath}${buildFilterQuery(searchParams, { sort: option, page: undefined })}`}
                  aria-current={active ? 'true' : undefined}
                  className={
                    active
                      ? 'font-medium text-accent'
                      : 'text-muted-foreground hover:text-accent'
                  }
                >
                  {SORT_LABELS[option]}
                </Link>
              );
            })}
          </div>

          {result.products.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <h2 className="text-base font-semibold">No products match those filters</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Try removing a filter, or browse everything in {category.name.toLowerCase()}.
              </p>
              <Link
                href={basePath}
                className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
              {result.products.map((product, index) => (
                <ProductCard key={product.id} product={product} priority={index < 3} />
              ))}
            </div>
          )}

          <Pagination
            basePath={basePath}
            current={searchParams}
            page={result.page}
            totalPages={result.totalPages}
          />
        </div>
      </div>
    </div>
  );
}
