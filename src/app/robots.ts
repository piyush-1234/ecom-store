import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/config/site';

export default function robots(): MetadataRoute.Robots {
  const base = siteConfig.url.replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account',
          '/account/',
          '/cart',
          '/api/',
          '/search',
          '/login',
          '/register',
          '/checkout',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
