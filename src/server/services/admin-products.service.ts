import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';

/**
 * Admin product and inventory management.
 *
 * Guardrails that matter:
 *  - slugs and SKUs are generated once and must stay stable (they appear on invoices
 *    and in URLs), so an existing slug is never silently rewritten
 *  - variants are never deleted, only deactivated — order history references them
 *  - stock edits are absolute (set to N), not deltas, so a typo cannot compound
 */

/** URL-safe slug. Pure and predictable. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Short colour token used inside a SKU, e.g. "Black" → BLK. */
export function colorCode(color: string): string {
  const cleaned = color.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (cleaned.slice(0, 3) || 'CLR').padEnd(3, 'X');
}

/**
 * Deterministic SKU: brand prefix, category prefix, product index, colour, size.
 * Stable for the same inputs, unique per size/colour combination.
 */
export function buildSku(params: {
  categoryPrefix: string;
  slug: string;
  index: number;
  color: string;
  size: string;
}): string {
  const index = String(params.index).padStart(2, '0');
  const slugToken = params.slug.slice(-2).toUpperCase().replace(/[^A-Z0-9]/g, '0');
  return `ES-${params.categoryPrefix}-${slugToken}${index}-${colorCode(params.color)}-${params.size.toUpperCase()}`;
}

export interface VariantInput {
  id?: string;
  size: string;
  sizeOrder: number;
  color: string;
  colorHex: string;
  colorOrder: number;
  pricePaise: number;
  mrpPaise?: number | null;
  stock: number;
  weightGrams: number;
  isActive?: boolean;
}

export interface ProductInput {
  name: string;
  slug?: string;
  shortDesc?: string | null;
  description?: string | null;
  categoryId: string;
  fit: string;
  fabric?: string | null;
  gsm?: number | null;
  wash?: string | null;
  careNotes?: string | null;
  basePricePaise: number;
  mrpPaise?: number | null;
  isActive?: boolean;
  images?: { url: string; alt: string }[];
  variants: VariantInput[];
}

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  fit: string;
  basePricePaise: number;
  isActive: boolean;
  variantCount: number;
  totalStock: number;
}

export async function listProductsAdmin(params: {
  q?: string;
  categoryId?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<{ products: AdminProductRow[]; total: number; page: number; totalPages: number }> {
  const perPage = params.perPage ?? 20;
  const page = Math.max(1, params.page ?? 1);

  const where = {
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: 'insensitive' as const } },
            { slug: { contains: params.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        category: { select: { name: true } },
        variants: { select: { stock: true, isActive: true } },
      },
    }),
  ]);

  return {
    products: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      categoryName: row.category.name,
      fit: row.fit,
      basePricePaise: row.basePricePaise,
      isActive: row.isActive,
      variantCount: row.variants.length,
      totalStock: row.variants.reduce((sum, variant) => sum + variant.stock, 0),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getProductForEdit(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      variants: { orderBy: [{ colorOrder: 'asc' }, { sizeOrder: 'asc' }] },
      images: { orderBy: { position: 'asc' } },
    },
  });
}

export async function createProduct(input: ProductInput): Promise<{ slug: string }> {
  if (input.variants.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Add at least one size.', 422);
  }

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new AppError('VALIDATION_ERROR', 'Choose a category.', 422);

  const slug = slugify(input.slug || input.name);
  if (!slug) throw new AppError('VALIDATION_ERROR', 'Enter a product name.', 422);

  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing) throw new AppError('CONFLICT', 'A product with that slug already exists.', 409);

  const categoryPrefix = category.slug === 'jeans' ? 'JEA' : 'TEE';
  const count = await prisma.product.count();

  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        slug,
        name: input.name,
        shortDesc: input.shortDesc ?? null,
        description: input.description ?? null,
        categoryId: input.categoryId,
        fit: input.fit,
        fabric: input.fabric ?? null,
        gsm: input.gsm ?? null,
        wash: input.wash ?? null,
        careNotes: input.careNotes ?? null,
        basePricePaise: input.basePricePaise,
        mrpPaise: input.mrpPaise ?? null,
        isActive: input.isActive ?? true,
        metaTitle: `${input.name} | ecomerce-store`,
        metaDesc: input.shortDesc ?? null,
      },
    });

    for (const [index, variant] of input.variants.entries()) {
      await tx.variant.create({
        data: {
          productId: product.id,
          sku: buildSku({
            categoryPrefix,
            slug,
            index: count + index + 1,
            color: variant.color,
            size: variant.size,
          }),
          size: variant.size,
          sizeOrder: variant.sizeOrder,
          color: variant.color,
          colorHex: variant.colorHex,
          colorOrder: variant.colorOrder,
          pricePaise: variant.pricePaise,
          mrpPaise: variant.mrpPaise ?? null,
          stock: variant.stock,
          weightGrams: variant.weightGrams,
          isActive: variant.isActive ?? true,
        },
      });
    }

    if (input.images?.length) {
      await tx.productImage.createMany({
        data: input.images.map((image, position) => ({
          productId: product.id,
          url: image.url,
          alt: image.alt,
          position,
        })),
      });
    }

    return product;
  });

  return { slug: created.slug };
}

export async function updateProduct(slug: string, input: ProductInput): Promise<void> {
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found.', 404);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: {
        name: input.name,
        shortDesc: input.shortDesc ?? null,
        description: input.description ?? null,
        categoryId: input.categoryId,
        fit: input.fit,
        fabric: input.fabric ?? null,
        gsm: input.gsm ?? null,
        wash: input.wash ?? null,
        careNotes: input.careNotes ?? null,
        basePricePaise: input.basePricePaise,
        mrpPaise: input.mrpPaise ?? null,
        isActive: input.isActive ?? product.isActive,
      },
    });

    for (const variant of input.variants) {
      if (variant.id) {
        await tx.variant.update({
          where: { id: variant.id },
          data: {
            pricePaise: variant.pricePaise,
            mrpPaise: variant.mrpPaise ?? null,
            stock: variant.stock,
            isActive: variant.isActive ?? true,
          },
        });
      } else {
        await tx.variant.create({
          data: {
            productId: product.id,
            sku: buildSku({
              categoryPrefix: 'VAR',
              slug: product.slug,
              index: 90,
              color: variant.color,
              size: variant.size,
            }),
            size: variant.size,
            sizeOrder: variant.sizeOrder,
            color: variant.color,
            colorHex: variant.colorHex,
            colorOrder: variant.colorOrder,
            pricePaise: variant.pricePaise,
            mrpPaise: variant.mrpPaise ?? null,
            stock: variant.stock,
            weightGrams: variant.weightGrams,
            isActive: true,
          },
        });
      }
    }
  });
}

export async function setProductActive(slug: string, isActive: boolean): Promise<void> {
  await prisma.product.update({ where: { slug }, data: { isActive } });
}

/** Absolute stock set, guarded against negatives. */
export async function setVariantStock(variantId: string, stock: number): Promise<void> {
  if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
    throw new AppError('VALIDATION_ERROR', 'Stock must be a whole number between 0 and 100000.', 422);
  }
  await prisma.variant.update({ where: { id: variantId }, data: { stock } });
}

export interface InventoryRow {
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  stock: number;
  pricePaise: number;
  isActive: boolean;
}

export async function listInventory(params: { lowStockThreshold?: number } = {}): Promise<InventoryRow[]> {
  const threshold = params.lowStockThreshold ?? 5;

  const variants = await prisma.variant.findMany({
    where: { isActive: true, stock: { lte: threshold } },
    include: { product: { select: { name: true, slug: true, isActive: true } } },
    orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
    take: 200,
  });

  return variants.map((variant) => ({
    variantId: variant.id,
    sku: variant.sku,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    variantLabel: `${variant.color} / ${variant.size}`,
    stock: variant.stock,
    pricePaise: variant.pricePaise,
    isActive: variant.isActive && variant.product.isActive,
  }));
}

export async function listCategoriesForAdmin(): Promise<{ id: string; name: string; slug: string }[]> {
  return prisma.category.findMany({
    orderBy: { position: 'asc' },
    select: { id: true, name: true, slug: true },
  });
}
