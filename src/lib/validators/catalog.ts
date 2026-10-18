import { z } from 'zod';

/**
 * Catalogue filter parsing.
 *
 * Filters live in the URL (`?size=M,L&color=Black&fit=Oversized&min=500&max=2000&sort=price_asc`)
 * so every filtered view is shareable, cacheable and crawlable — and so the grid works
 * with JavaScript disabled.
 *
 * Repeated params (`size=M&size=L`) and comma lists (`size=M,L`) are both accepted.
 */

const PRICE_CEILING_RUPEES = 100_000;

const csvList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const parts = (Array.isArray(value) ? value : [value])
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
    return parts.length > 0 ? Array.from(new Set(parts)) : undefined;
  });

const rupeesToPaise = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > PRICE_CEILING_RUPEES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid price filter' });
      return z.NEVER;
    }
    return Math.round(parsed * 100);
  });

export const SORT_OPTIONS = ['featured', 'newest', 'price_asc', 'price_desc'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const catalogueQuerySchema = z.object({
  size: csvList,
  color: csvList,
  fit: csvList,
  min: rupeesToPaise,
  max: rupeesToPaise,
  sort: z.enum(SORT_OPTIONS).optional(),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return 1;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid page' });
        return z.NEVER;
      }
      return parsed;
    }),
  q: z.string().trim().max(120).optional(),
});

export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;

export interface ProductFilters {
  sizes?: string[];
  colors?: string[];
  fits?: string[];
  minPricePaise?: number;
  maxPricePaise?: number;
  sort: SortOption;
  page: number;
  q?: string;
}

/**
 * Parse raw search params into filters.
 * Never throws: a malformed filter is dropped rather than turning a browse page
 * into a 500. Unknown/invalid values simply do not filter.
 */
export function parseCatalogueFilters(
  raw: Record<string, string | string[] | undefined>,
): ProductFilters {
  const parsed = catalogueQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return { sort: 'featured', page: 1 };
  }

  const data = parsed.data;
  const min = data.min ?? undefined;
  const max = data.max ?? undefined;

  return {
    sizes: data.size,
    colors: data.color,
    fits: data.fit,
    // Guard against an inverted range rather than returning zero results.
    minPricePaise: min !== undefined && max !== undefined && min > max ? max : min,
    maxPricePaise: min !== undefined && max !== undefined && min > max ? min : max,
    sort: data.sort ?? 'featured',
    page: data.page,
    q: data.q || undefined,
  };
}

/** Build a query string from filters, preserving ones not being changed. */
export function buildFilterQuery(
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(current)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry) params.append(key, entry);
    }
  }

  for (const [key, value] of Object.entries(patch)) {
    params.delete(key);
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry) params.append(key, entry);
    }
  }

  // Any filter change resets pagination to page 1.
  if (!('page' in patch)) params.delete('page');

  const query = params.toString();
  return query ? `?${query}` : '';
}
