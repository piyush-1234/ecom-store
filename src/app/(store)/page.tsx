import type { Metadata } from 'next';
import Link from 'next/link';
import { getFeaturedProducts, listCategories } from '@/server/services/catalog.service';
import { ProductCard } from '@/components/store/product-card';
import { siteConfig } from '@/lib/config/site';

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [categories, featured] = await Promise.all([listCategories(), getFeaturedProducts(4)]);

  return (
    <>
      <section className="container-page py-14 sm:py-20">
        <p className="mb-4 inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
          Made for Indian bodies
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Tees and denim,
          <br />
          <span className="text-olive-600">built to actually fit.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {siteConfig.description}
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/t-shirts"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Shop T-Shirts
          </Link>
          <Link
            href="/jeans"
            className="rounded-md border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Shop Jeans
          </Link>
        </div>
      </section>

      <section className="container-page grid gap-4 pb-4 sm:grid-cols-2" aria-label="Categories">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/${category.slug}`}
            className="rounded-lg border border-border bg-card p-8 transition-shadow hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">{category.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{category.description}</p>
            <span className="mt-4 inline-block text-sm font-medium text-accent">
              {category.productCount} styles &rarr;
            </span>
          </Link>
        ))}
      </section>

      {featured.length > 0 ? (
        <section className="container-page py-12" aria-labelledby="featured-heading">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 id="featured-heading" className="text-xl font-semibold tracking-tight">
              Featured
            </h2>
            <Link href="/t-shirts" className="text-sm text-accent underline-offset-4 hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-y border-border bg-secondary/60" aria-label="Why shop with us">
        <div className="container-page grid gap-6 py-10 sm:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold">Free size exchange</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Wrong size? We swap it, and we pay the return shipping.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Published specs</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              GSM, shrinkage and wash data on every product. No vague claims.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Ships in 24 hours</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              GST invoice included. Track your order end to end.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
