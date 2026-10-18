import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductForEdit, listCategoriesForAdmin } from '@/server/services/admin-products.service';
import { updateProductAction } from '@/server/actions/admin-catalog';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Edit product · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const inputClass =
  'mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { ok?: string; error?: string };
}) {
  const [product, categories] = await Promise.all([
    getProductForEdit(params.slug),
    listCategoriesForAdmin(),
  ]);
  if (!product) notFound();

  const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-accent underline-offset-4 hover:underline">
          &larr; Products
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          <span className="text-xs text-muted-foreground">
            {product.slug} · {product.variants.length} variants · {totalStock} in stock
          </span>
        </div>
      </div>

      {searchParams.ok ? (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Saved.</p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <form action={updateProductAction} className="space-y-5 rounded-lg border border-border bg-background p-5">
        <input type="hidden" name="slug" value={product.slug} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="text-xs font-medium">Name</label>
            <input id="name" name="name" defaultValue={product.name} required className={inputClass} />
          </div>
          <div>
            <label htmlFor="categoryId" className="text-xs font-medium">Category</label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={product.categoryId}
              required
              className={inputClass}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="fit" className="text-xs font-medium">Fit</label>
            <input id="fit" name="fit" defaultValue={product.fit} className={inputClass} />
          </div>
          <div>
            <label htmlFor="fabric" className="text-xs font-medium">Fabric</label>
            <input id="fabric" name="fabric" defaultValue={product.fabric ?? ''} className={inputClass} />
          </div>
          <div>
            <label htmlFor="gsm" className="text-xs font-medium">GSM</label>
            <input id="gsm" name="gsm" type="number" defaultValue={product.gsm ?? ''} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="priceRupees" className="text-xs font-medium">Price (Rs.)</label>
            <input
              id="priceRupees"
              name="priceRupees"
              type="number"
              step="1"
              defaultValue={product.basePricePaise / 100}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="mrpRupees" className="text-xs font-medium">MRP (Rs.)</label>
            <input
              id="mrpRupees"
              name="mrpRupees"
              type="number"
              step="1"
              defaultValue={product.mrpPaise ? product.mrpPaise / 100 : ''}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wash" className="text-xs font-medium">Wash</label>
            <input id="wash" name="wash" defaultValue={product.wash ?? ''} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="shortDesc" className="text-xs font-medium">Short description</label>
          <input id="shortDesc" name="shortDesc" defaultValue={product.shortDesc ?? ''} className={inputClass} />
        </div>

        <div>
          <label htmlFor="description" className="text-xs font-medium">Description</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={product.description ?? ''}
            className={`${inputClass} h-auto py-2`}
          />
        </div>

        <div>
          <label htmlFor="careNotes" className="text-xs font-medium">Care notes</label>
          <input id="careNotes" name="careNotes" defaultValue={product.careNotes ?? ''} className={inputClass} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={product.isActive} />
          Active (visible in the store)
        </label>

        <section>
          <h2 className="text-sm font-semibold">Variants</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stock is set to an absolute value, not added. Deactivating a size hides it without
            deleting order history.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-3 py-2 font-medium">SKU</th>
                  <th scope="col" className="px-3 py-2 font-medium">Size / colour</th>
                  <th scope="col" className="px-3 py-2 font-medium">Price (Rs.)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Stock</th>
                  <th scope="col" className="px-3 py-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant) => (
                  <tr key={variant.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{variant.sku}</td>
                    <td className="px-3 py-2">
                      {variant.size} / {variant.color}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`price_${variant.id}`}
                        type="number"
                        step="1"
                        defaultValue={variant.pricePaise / 100}
                        className="h-8 w-24 rounded border border-input bg-background px-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`stock_${variant.id}`}
                        type="number"
                        min={0}
                        defaultValue={variant.stock}
                        className={`h-8 w-20 rounded border border-input bg-background px-2 text-sm ${
                          variant.stock === 0 ? 'text-destructive' : ''
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" name={`active_${variant.id}`} defaultChecked={variant.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Current price shown: {formatINR(product.basePricePaise)}
          </p>
        </section>

        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Save changes
        </button>
      </form>
    </div>
  );
}
