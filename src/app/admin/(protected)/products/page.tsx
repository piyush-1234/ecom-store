import type { Metadata } from 'next';
import Link from 'next/link';
import { listProductsAdmin } from '@/server/services/admin-products.service';
import { toggleProductAction } from '@/server/actions/admin-catalog';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Products · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { q?: string; page?: string; ok?: string; error?: string };
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const q = searchParams.q?.trim() || undefined;
  const page = Number(searchParams.page ?? 1) || 1;
  const { products, total, totalPages } = await listProductsAdmin({ q, page });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} products</p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          New product
        </Link>
      </div>

      {searchParams.ok ? (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Saved.</p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <form method="get" className="flex items-end gap-3 rounded-lg border border-border bg-background p-3">
        <div>
          <label htmlFor="q" className="block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Name or slug"
            className="mt-1 h-9 w-64 rounded border border-input bg-background px-2 text-sm"
          />
        </div>
        <button type="submit" className="h-9 rounded bg-primary px-4 text-sm font-medium text-primary-foreground">
          Search
        </button>
        {q ? (
          <Link href="/admin/products" className="text-sm text-accent underline-offset-4 hover:underline">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-2 font-medium">Product</th>
              <th scope="col" className="px-4 py-2 font-medium">Category</th>
              <th scope="col" className="px-4 py-2 font-medium">Fit</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Variants</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Stock</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/products/${product.slug}`} className="font-medium text-accent hover:underline">
                    {product.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{product.slug}</p>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{product.categoryName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{product.fit}</td>
                <td className="px-4 py-2.5 text-right">{formatINR(product.basePricePaise)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{product.variantCount}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={product.totalStock === 0 ? 'font-medium text-destructive' : ''}>
                    {product.totalStock}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <form action={toggleProductAction}>
                    <input type="hidden" name="slug" value={product.slug} />
                    <input type="hidden" name="activate" value={product.isActive ? '0' : '1'} />
                    <button
                      type="submit"
                      className={
                        product.isActive
                          ? 'rounded bg-accent/15 px-2 py-1 text-xs font-medium text-accent'
                          : 'rounded bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {product.isActive ? 'Active — deactivate' : 'Inactive — activate'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <Link
              key={pageNumber}
              href={`/admin/products?${new URLSearchParams({
                ...(q ? { q } : {}),
                page: String(pageNumber),
              }).toString()}`}
              className={
                pageNumber === page
                  ? 'rounded border border-primary bg-primary px-3 py-1 text-primary-foreground'
                  : 'rounded border border-border px-3 py-1 hover:bg-secondary'
              }
            >
              {pageNumber}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
