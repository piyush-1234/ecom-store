/**
 * Site-wide brand + business config.
 *
 * Single source of truth for values set at the Phase 0 gate. Anything that must
 * change per-environment (secrets, keys) lives in env instead — see src/lib/env.ts.
 */

export const siteConfig = {
  name: 'ecomerce-store',
  tagline: 'Tees & denim, built to fit',
  description:
    'Premium cotton t-shirts and jeans made for Indian bodies. Honest fabric specs, free size exchange, and fit guidance that actually helps.',
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  locale: 'en-IN',
  currency: 'INR',

  // Phase 0 gate: user chose a text logo — no image asset required.
  logo: {
    type: 'text' as const,
    wordmark: 'ecomerce-store',
  },

  // Placeholders until the entity is registered (BLK-006 / BRIEF §2).
  supportEmail: 'support@example.com',
  legalEntityName: process.env.GST_LEGAL_ENTITY_NAME ?? '[LEGAL_ENTITY_NAME]',
  gstin: process.env.GST_GSTIN ?? '[GSTIN]',

  social: {
    instagram: '',
    youtube: '',
  },
} as const;

export type SiteConfig = typeof siteConfig;
