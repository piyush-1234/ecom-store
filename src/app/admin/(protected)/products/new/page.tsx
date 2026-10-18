import type { Metadata } from 'next';
import Link from 'next/link';
import { listCategoriesForAdmin } from '@/server/services/admin-products.service';
import { createProductAction } from '@/server/actions/admin-catalog';

export const metadata: Metadata = {
  title: 'New product · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const inputClass =
  'mt-1 h-9 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const categories = await listCategoriesForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-accent underline-offset-4 hover:underline">
          &larr; Products
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">New product</h1>
      </div>

      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <form
        action={createProductAction}
        className="space-y-5 rounded-lg border border-border bg-background p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="text-xs font-medium">Name</label>
            <input id="name" name="name" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="slug" className="text-xs font-medium">Slug (optional)</label>
            <input id="slug" name="slug" placeholder="auto from name" className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="categoryId" className="text-xs font-medium">Category</label>
            <select id="categoryId" name="categoryId" required className={inputClass}>
              <option value="">Select</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fit" className="text-xs font-medium">Fit</label>
            <input id="fit" name="fit" required placeholder="Oversized" className={inputClass} />
          </div>
          <div>
            <label htmlFor="fabric" className="text-xs font-medium">Fabric</label>
            <input id="fabric" name="fabric" placeholder="100% Combed Cotton" className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="shortDesc" className="text-xs font-medium">Short description</label>
          <input id="shortDesc" name="shortDesc" className={inputClass} />
        </div>

        <div>
          <label htmlFor="description" className="text-xs font-medium">Description</label>
          <textarea id="description" name="description" rows={4} className={`${inputClass} h-auto py-2`} />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="priceRupees" className="text-xs font-medium">Price (Rs.)</label>
            <input id="priceRupees" name="priceRupees" type="number" min={1} step="1" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="mrpRupees" className="text-xs font-medium">MRP (Rs.)</label>
            <input id="mrpRupees" name="mrpRupees" type="number" min={0} step="1" className={inputClass} />
          </div>
          <div>
            <label htmlFor="gsm" className="text-xs font-medium">GSM</label>
            <input id="gsm" name="gsm" type="number" min={0} className={inputClass} />
          </div>
          <div>
            <label htmlFor="wash" className="text-xs font-medium">Wash (denim)</label>
            <input id="wash" name="wash" className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="sizes" className="text-xs font-medium">Sizes (comma separated)</label>
            <input id="sizes" name="sizes" defaultValue="S,M,L,XL" required className={inputClass} />
            <p className="mt-1 text-xs text-muted-foreground">Letter sizes or waists, e.g. 28,30,32</p>
          </div>
          <div>
            <label htmlFor="colors" className="text-xs font-medium">Colours (name:hex)</label>
            <input id="colors" name="colors" defaultValue="Black:#0B0B0B" className={inputClass} />
            <p className="mt-1 text-xs text-muted-foreground">One variant per size × colour</p>
          </div>
          <div>
            <label htmlFor="stock" className="text-xs font-medium">Opening stock per variant</label>
            <input id="stock" name="stock" type="number" min={0} defaultValue={10} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="weightGrams" className="text-xs font-medium">Weight per unit (g)</label>
            <input id="weightGrams" name="weightGrams" type="number" min={100} defaultValue={400} className={inputClass} />
          </div>
          <div>
            <label htmlFor="imageUrl" className="text-xs font-medium">Image URL</label>
            <input id="imageUrl" name="imageUrl" defaultValue="/placeholders/tee.svg" className={inputClass} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              Active
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="careNotes" className="text-xs font-medium">Care notes</label>
          <input id="careNotes" name="careNotes" className={inputClass} />
        </div>

        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Create product
        </button>
      </form>
    </div>
  );
}
