import type { MetadataRoute } from 'next';
import { getAllProductSlugs, listCategories } from '@/server/services/catalog.service';
import { siteConfig } from '@/lib/config/site';

/**
 * Dynamic sitemap.
 *
 * Wrapped in try/catch: a sitemap must never break a build or a deploy when the
 * database is briefly unreachable. On failure we still emit the static routes.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, '');
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/t-shirts`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/jeans`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/size-chart`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    const [categories, products] = await Promise.all([listCategories(), getAllProductSlugs()]);

    const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
      url: `${base}/${category.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    }));

    const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${base}/product/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...categoryRoutes, ...productRoutes];
  } catch (error) {
    console.error('[sitemap] falling back to static routes:', error);
    return staticRoutes;
  }
}
