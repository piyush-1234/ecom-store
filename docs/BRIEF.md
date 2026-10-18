# BRIEF — ecomerce-store

**Status:** Phase 0 complete
**Owner:** Lead engineer / operator
**Last updated:** Phase 0

---

## 1. What this is

A production-ready, single-vendor D2C ecommerce store for **T-shirts and jeans only**, India-first, INR, English UI.

Not a demo. Not a marketplace. No third-party sellers.

---

## 2. Brand (locked at Phase 0 gate)

| Field | Value | Source |
|---|---|---|
| Brand name | `ecomerce-store` | User decision — keep as-is (flagged as placeholder-looking) |
| Logo | Text wordmark, rendered in UI (no asset file) | User decision |
| Palette | Black (ink) + Off-white (surface) + Olive (accent) | User decision |
| Support email | `support@example.com` — **placeholder, env-driven** | User decision (will replace before deploy) |
| Legal entity | `[LEGAL_ENTITY_NAME]` placeholder | User decision ("not yet") |
| GSTIN | `[GSTIN]` placeholder | User decision ("not yet") |

All five are single-source-of-truth in `src/lib/config/site.ts` and/or env vars so they can be swapped without code edits.

---

## 3. Non-negotiables

- TypeScript **strict**, no `any` escapes without a written reason.
- Env-based config. **No secrets in repo.** `.env.example` is complete; `.env` is gitignored.
- Mobile-first responsive. Target **LCP < 2.5s on 4G**.
- SEO-ready: per-page metadata, canonical URLs, JSON-LD, sitemap, robots.
- India compliance:
  - GST invoices with HSN codes (**6109** t-shirts, **6203/6204** trousers/jeans).
  - GST slab logic — **see ADR-004: the brief's stated slabs are out of date; current law is implemented.**
  - Address model carries `state` + 6-digit `pincode` validation.
- Payments: **Razorpay** (UPI, cards, netbanking, wallets) **+ COD**.
- Shipping: **Shiprocket** — pincode serviceability check, RTO handling, status sync.
- Auth: email/password **+ phone OTP**. **Guest checkout allowed.**
- **Size exchange flow is first-class** — exchange for a different size, not merely a refund.
- Never run destructive commands, never touch real payment keys, never deploy publicly without approval.

---

## 4. Scope — IN (v1)

**Storefront**
home · category (`/t-shirts`, `/jeans`) · PDP with size × colour variants · size chart · search · filters (size, colour, fit, price) · cart · checkout · order tracking · returns/exchanges · account · wishlist · static pages (about, contact, policies)

**Admin**
product CRUD with variants + images · inventory · orders · refunds/exchanges · coupons · pincode rules · basic dashboard

**Infra**
Dockerized local dev · CI (lint + typecheck + test) · migrations · seed data · error logging · analytics hooks (GA4 + Meta Pixel placeholders) · sitemap · robots.txt

## 5. Scope — OUT (v1, do NOT build)

Multi-vendor · mobile apps · recommendation ML · loyalty programme · multi-currency · international shipping · blog CMS · live chat · AR try-on

---

## 6. Stack (locked)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router + TypeScript strict |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) |
| DB | PostgreSQL + Prisma |
| Cache/queue | Redis — **optional in phase 1**, added in phase 3 |
| Payments | Razorpay Node SDK |
| Shipping | Shiprocket API |
| Images | S3-compatible (Cloudinary or AWS S3) behind a storage adapter |
| Email | Resend |
| Validation | Zod |
| Tests | Vitest (unit) + Playwright (e2e) |
| Local infra | Docker Compose (Postgres + Redis + app) |
| Deploy target | Vercel (app) + Neon/Supabase (Postgres) — **not executed without approval** |

---

## 7. Architecture

Modular monolith. Folders: `/app` (routes) · `/components` · `/lib` · `/server` (services, db, auth, payments, shipping) · `/prisma` · `/tests` · `/scripts` · `/docs`.
No microservices. No premature abstraction. See `docs/ARCHITECTURE.md`.

---

## 8. Core data model (minimum)

`User` · `Address` · `Product` · `Variant` (size × colour, SKU, stock, price) · `Category` · `ProductImage` · `Cart` · `CartItem` · `Order` · `OrderItem` · `Payment` · `Shipment` · `Return` / `Exchange` · `Coupon` · `PincodeRule` · `AdminUser` · `AuditLog`

---

## 9. Phase plan

| Phase | Deliverable |
|---|---|
| 0 | This brief, ARCHITECTURE, DECISIONS, PROGRESS, BLOCKERS |
| 1 | Repo scaffold, Docker Compose, Prisma schema + migration, seed (~20 tees, ~20 jeans), env template, CI |
| 2 | Auth (email + phone OTP), account, addresses |
| 3 | Storefront — catalog, PDP, variants, size chart, search, filters, cart |
| 4 | Checkout — address, pincode check, Razorpay + COD, order creation, GST invoice PDF |
| 5 | Shipping — Shiprocket webhook, tracking page, status sync |
| 6 | Returns/exchanges, refunds, admin order management |
| 7 | Admin dashboard — product CRUD, inventory, coupons, analytics |
| 8 | Hardening — unit + e2e tests, rate limiting, security headers, load test, SEO, a11y, error tracking |
| 9 | Deploy runbook in `docs/DEPLOY.md` (**do not execute without approval**) |

---

## 10. Definition of Done (v1)

1. Fresh clone → `docker compose up` → seeded store runs locally with **zero manual steps**.
2. A user can: browse → filter by size → add to cart → pay via **Razorpay test** → receive order email → track order → **request size exchange**. **End-to-end Playwright test passes.**
3. Admin can add a product with variants, see orders, issue a refund.
4. Lighthouse: **Performance ≥ 85 mobile, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 95**.
5. No secrets in repo. `.env.example` complete. README has setup + deploy steps.

---

## 11. Approval gates (stop and ask)

1. Before using **real** Razorpay/Shiprocket keys.
2. Before any **public deployment** or domain change.
3. Before **destructive DB operations** outside local dev.
4. Before installing anything **globally** on Windows.
5. Brand name, logo, palette, legal pages content — **resolved at Phase 0 gate (see §2)**.

---

## 12. Environment realities discovered at Phase 0

These shaped the build. Details in `BLOCKERS.md` and `docs/DECISIONS.md`.

- `D:\ecommerce store` is **not writable** at the OS level (even `D:\` root denies writes) → project relocated to `E:\automation\ecommerce-store`.
- **Docker is not installed** on this machine → `docker-compose.yml` ships as a deliverable but cannot be executed/verified locally. A no-Docker fallback is provided.
- **pnpm is broken** in this sandbox (`ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`) → **npm** is the package manager.
- npm/pnpm/temp state must be redirected inside the workspace (`E:\automation\.cache`) or installs fail with `EPERM`.
