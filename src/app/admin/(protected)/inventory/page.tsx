import type { Metadata } from 'next';
import Link from 'next/link';
import { listInventory } from '@/server/services/admin-products.service';
import { setStockAction } from '@/server/actions/admin-catalog';
import { formatINR } from '@/lib/utils/money';

export const metadata: Metadata = {
  title: 'Inventory · admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const rows = await listInventory({ lowStockThreshold: 5 });
  const outOfStock = rows.filter((row) => row.stock === 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} variants at or below 5 units · {outOfStock} out of stock
        </p>
      </div>

      {searchParams.ok ? (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Stock updated.</p>
      ) : null}
      {searchParams.error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-8 text-center text-sm text-muted-foreground">
          Nothing is low on stock.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-4 py-2 font-medium">Product</th>
                <th scope="col" className="px-4 py-2 font-medium">Variant</th>
                <th scope="col" className="px-4 py-2 font-medium">SKU</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Price</th>
                <th scope="col" className="px-4 py-2 font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.variantId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/products/${row.productSlug}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {row.productName}
                    </Link>
                    {!row.isActive ? (
                      <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                        hidden
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">{row.variantLabel}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.sku}</td>
                  <td className="px-4 py-2.5 text-right">{formatINR(row.pricePaise)}</td>
                  <td className="px-4 py-2.5">
                    <form action={setStockAction} className="flex items-center gap-2">
                      <input type="hidden" name="variantId" value={row.variantId} />
                      <input type="hidden" name="backTo" value="/admin/inventory" />
                      <input
                        name="stock"
                        type="number"
                        min={0}
                        defaultValue={row.stock}
                        className={`h-8 w-20 rounded border border-input bg-background px-2 text-sm ${
                          row.stock === 0 ? 'font-medium text-destructive' : ''
                        }`}
                      />
                      <button
                        type="submit"
                        className="h-8 rounded border border-border px-2 text-xs font-medium hover:bg-secondary"
                      >
                        Set
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
