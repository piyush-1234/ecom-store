import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import type { ProductFilters, SortOption } from '@/lib/validators/catalog';

/**
 * Catalogue reads.
 *
 * Everything the storefront needs to render a listing or a PDP lives here so route
 * files stay thin. Queries are shaped to avoid N+1: products come back with their
 * images and variants in a single round-trip.
 */

export const PRODUCTS_PER_PAGE = 12;

export interface VariantDto {
  id: string;
  sku: string;
  size: string;
  sizeOrder: number;
  color: string;
  colorHex: string;
  colorOrder: number;
  pricePaise: number;
  mrpPaise: number | null;
  stock: number;
  inStock: boolean;
}

export interface ProductCardDto {
  id: string;
  slug: string;
  name: string;
  shortDesc: string | null;
  fit: string;
  gsm: number | null;
  pricePaise: number;
  mrpPaise: number | null;
  imageUrl: string;
  imageAlt: string;
  colors: string[];
  sizes: string[];
  inStock: boolean;
}

export interface ProductDetailDto extends Omit<ProductCardDto, 'colors' | 'sizes'> {
  description: string | null;
  fabric: string | null;
  wash: string | null;
  careNotes: string | null;
  categoryName: string;
  categorySlug: string;
  hsnCode: string;
  images: { url: string; alt: string }[];
  variants: VariantDto[];
}

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  hsnCode: string;
  productCount: number;
}

const productInclude = {
  images: { orderBy: { position: 'asc' }, take: 1 },
  variants: {
    where: { isActive: true },
    orderBy: [{ colorOrder: 'asc' }, { sizeOrder: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toCard(product: ProductWithRelations): ProductCardDto {
  const variants = product.variants;
  const prices = variants.map((variant) => variant.pricePaise);
  const price = prices.length > 0 ? Math.min(...prices) : product.basePricePaise;
  const mrpCandidates = variants.map((variant) => variant.mrpPaise ?? 0).filter((value) => value > 0);

  const firstImage = product.images[0];

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDesc: product.shortDesc,
    fit: product.fit,
    gsm: product.gsm,
    pricePaise: price,
    mrpPaise: mrpCandidates.length > 0 ? Math.max(...mrpCandidates) : null,
    imageUrl: firstImage?.url ?? '/placeholders/tee.svg',
    imageAlt: firstImage?.alt ?? product.name,
    colors: Array.from(new Set(variants.map((variant) => variant.color))),
    sizes: Array.from(new Set(variants.map((variant) => variant.size))),
    inStock: variants.some((variant) => variant.stock > 0),
  };
}

const sortMap: Record<SortOption, Prisma.ProductOrderByWithRelationInput[]> = {
  featured: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  price_asc: [{ basePricePaise: 'asc' }],
  price_desc: [{ basePricePaise: 'desc' }],
};

export async function listCategories(): Promise<CategoryDto[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });

  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    hsnCode: category.hsnCode,
    productCount: category._count.products,
  }));
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDto | null> {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });

  if (!category) return null;

  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    hsnCode: category.hsnCode,
    productCount: category._count.products,
  };
}

export interface ProductListResult {
  products: ProductCardDto[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export async function listProducts(
  categorySlug: string | null,
  filters: ProductFilters,
): Promise<ProductListResult> {
  const variantFilters: Prisma.VariantWhereInput = { isActive: true };

  if (filters.sizes?.length) variantFilters.size = { in: filters.sizes };
  if (filters.colors?.length) variantFilters.color = { in: filters.colors };

  if (filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined) {
    variantFilters.pricePaise = {
      ...(filters.minPricePaise !== undefined ? { gte: filters.minPricePaise } : {}),
      ...(filters.maxPricePaise !== undefined ? { lte: filters.maxPricePaise } : {}),
    };
  }

  const hasVariantFilter =
    filters.sizes?.length || filters.colors?.length ||
    filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined;

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
  };

  if (filters.fits?.length) where.fit = { in: filters.fits };
  if (hasVariantFilter) where.variants = { some: variantFilters };

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { shortDesc: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
      { fit: { contains: filters.q, mode: 'insensitive' } },
      { fabric: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  const perPage = PRODUCTS_PER_PAGE;
  const page = filters.page;

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: sortMap[filters.sort],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return {
    products: products.map(toCard),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Facets for the filter rail. Derived from data so they never drift from the catalogue. */
export interface Facets {
  sizes: string[];
  colors: { name: string; hex: string }[];
  fits: string[];
  priceRangePaise: { min: number; max: number };
}

export async function getFacets(categorySlug: string | null): Promise<Facets> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    select: {
      fit: true,
      variants: {
        where: { isActive: true },
        select: { size: true, sizeOrder: true, color: true, colorHex: true, colorOrder: true, pricePaise: true },
      },
    },
  });

  const sizes = new Map<string, number>();
  const colors = new Map<string, { hex: string; order: number }>();
  const fits = new Set<string>();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  for (const product of products) {
    fits.add(product.fit);
    for (const variant of product.variants) {
      sizes.set(variant.size, variant.sizeOrder);
      if (!colors.has(variant.color)) {
        colors.set(variant.color, { hex: variant.colorHex, order: variant.colorOrder });
      }
      min = Math.min(min, variant.pricePaise);
      max = Math.max(max, variant.pricePaise);
    }
  }

  return {
    sizes: [...sizes.entries()].sort((a, b) => a[1] - b[1]).map(([size]) => size),
    colors: [...colors.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, meta]) => ({ name, hex: meta.hex })),
    fits: [...fits].sort(),
    priceRangePaise: {
      min: Number.isFinite(min) ? min : 0,
      max: max || 0,
    },
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetailDto | null> {
  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    include: {
      category: true,
      images: { orderBy: { position: 'asc' } },
      variants: {
        where: { isActive: true },
        orderBy: [{ colorOrder: 'asc' }, { sizeOrder: 'asc' }],
      },
    },
  });

  if (!product) return null;

  const variants: VariantDto[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    sizeOrder: variant.sizeOrder,
    color: variant.color,
    colorHex: variant.colorHex,
    colorOrder: variant.colorOrder,
    pricePaise: variant.pricePaise,
    mrpPaise: variant.mrpPaise,
    stock: variant.stock,
    inStock: variant.stock > 0,
  }));

  const prices = variants.map((variant) => variant.pricePaise);
  const mrpCandidates = variants.map((variant) => variant.mrpPaise ?? 0).filter((value) => value > 0);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDesc: product.shortDesc,
    description: product.description,
    fit: product.fit,
    gsm: product.gsm,
    fabric: product.fabric,
    wash: product.wash,
    careNotes: product.careNotes,
    pricePaise: prices.length > 0 ? Math.min(...prices) : product.basePricePaise,
    mrpPaise: mrpCandidates.length > 0 ? Math.max(...mrpCandidates) : null,
    imageUrl: product.images[0]?.url ?? '/placeholders/tee.svg',
    imageAlt: product.images[0]?.alt ?? product.name,
    categoryName: product.category.name,
    categorySlug: product.category.slug,
    hsnCode: product.category.hsnCode,
    inStock: variants.some((variant) => variant.inStock),
    images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
    variants,
  };
}

export async function getFeaturedProducts(limit = 4): Promise<ProductCardDto[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true, isFeatured: true },
    include: productInclude,
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
  return products.map(toCard);
}

/** Slugs for sitemap generation. */
export async function getAllProductSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.product.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getRelatedProducts(
  categorySlug: string,
  excludeProductId: string,
  limit = 4,
): Promise<ProductCardDto[]> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      category: { slug: categorySlug },
      id: { not: excludeProductId },
    },
    include: productInclude,
    take: limit,
  });
  return products.map(toCard);
}
