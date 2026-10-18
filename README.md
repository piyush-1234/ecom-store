# ecomerce-store

Single-vendor D2C ecommerce store — **T-shirts and jeans only**, India-first, INR.

Production-oriented Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL build with
Razorpay, Shiprocket, GST invoicing, and a first-class **size-exchange** flow.

> **Status: Phase 1 complete** — scaffold, data model, migrations, seed, Docker artifacts, CI.
> Storefront, auth, checkout and admin land in Phases 2–7. See [`PROGRESS.md`](./PROGRESS.md).

---

## Contents

- [Stack](#stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment](#environment)
- [Scripts](#scripts)
- [Seed data](#seed-data)
- [Project structure](#project-structure)
- [Money and GST rules](#money-and-gst-rules)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Docs](#docs)
- [Roadmap](#roadmap)

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript `strict` |
| Styling | Tailwind CSS (token-based), shadcn/ui conventions |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Payments | Razorpay (UPI / cards / netbanking / wallets) + COD |
| Shipping | Shiprocket (serviceability, AWB, webhooks, RTO) |
| Email | Resend |
| Images | Storage adapter — `local` \| `s3` \| `cloudinary` |
| Validation | Zod (shared client + server) |
| Tests | Vitest (unit) · Playwright (e2e) |
| Deploy | Vercel + Neon/Supabase (not executed without approval) |

---

## Prerequisites

- **Node.js 20+** (tested on 24.x)
- **npm** (this repo uses `package-lock.json`)
- **PostgreSQL 16** — either via Docker (recommended), a local install, or the embedded dev DB
- Docker Desktop is **optional**; see the no-Docker path below

---

## Quick start

### Option A — Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

This boots Postgres, applies migrations, seeds the catalogue, and serves the app on
<http://localhost:3000>. The `migrate` service runs once and exits; `app` waits for it.

> ⚠️ Docker artifacts here are authored but **not runtime-verified** in the environment
> they were written in (Docker was unavailable). See [`BLOCKERS.md`](./BLOCKERS.md) `BLK-002`.

### Option B — No Docker

```bash
cp .env.example .env

# 1. Start a local Postgres any way you like, then point DATABASE_URL at it:
#    postgresql://store:store@localhost:5432/store?schema=public

# 2. Install and prepare
npm install
npx prisma generate
npx prisma migrate deploy     # or: npx prisma migrate dev
npm run db:seed

# 3. Run
npm run dev
```

### Option B — No Docker (verified path)

A PostgreSQL 18 cluster can be run entirely from the repo — no Docker, no global install,
no admin rights:

```bash
cp .env.example .env

# 1. Start the embedded Postgres (first run initialises, ~30s)
npm run dev:db
#    -> postgresql://postgres:postgres@localhost:5433/store?schema=public
#    (leave this running; Ctrl+C to stop)

# 2. In a second terminal: install and prepare
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed

# 3. Run
npm run dev
```

The cluster lives in `.pgdata/` (gitignored) and is created with `--encoding=UTF8
--locale=C`. UTF-8 is required — the Windows default locale produces WIN1252, which cannot
store `₹` or non-Latin addresses and will break migrations.

If you prefer a managed database instead, point `DATABASE_URL` at a Neon/Supabase instance
and skip step 1.

> ✅ **Verified status:** migrations and seed have both been **executed** against a real
> PostgreSQL 18 instance (40 products / 480 variants), the seed is **idempotent**, and the
> auth + address flows pass a **29-assertion end-to-end smoke test**
> (`node scripts/smoke-auth.mjs`). See [`PROGRESS.md`](./PROGRESS.md).

---

## Environment

Copy `.env.example` → `.env`. Every variable is documented inline in that file.

**Required to boot:** `DATABASE_URL`, `AUTH_SECRET` (≥ 32 chars), `NEXT_PUBLIC_APP_URL`.

**Not required until later phases:** Razorpay, Shiprocket, Resend, S3/Cloudinary keys.
Each integration is feature-flagged (`RAZORPAY_ENABLED`, `SHIPROCKET_ENABLED`, `EMAIL_ENABLED`)
and fails soft with a clear log line when disabled.

Secrets policy: `.env*` is gitignored, `.env.example` is committed and complete, and no
credential is ever hardcoded. Real keys are **not** used until approval gate #1 is cleared.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next.js ESLint |
| `npm run format` | Prettier write |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright (Phase 8) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Create + apply a migration (dev) |
| `npm run db:deploy` | Apply committed migrations (CI/prod) |
| `npm run db:seed` | Seed catalogue |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | **Drop + recreate + reseed** (local only) |
| `npm run dev:db` | Start the embedded PostgreSQL 18 dev cluster |
| `npm run verify` | typecheck + lint + test |

---

## Seed data

`npm run db:seed` is **idempotent** (upserts keyed on slug / SKU / coupon code).

| | |
|---|---|
| Categories | 2 — `T-Shirts` (HSN **6109**), `Jeans` (HSN **6203**) |
| T-shirts | 20 products · 6 sizes (XS–XXL) × 3 colours = **360 variants** |
| Jeans | 20 products · 6 waists (28–38) × 1 wash = **120 variants** |
| Prices | Tees ₹549–₹999 · Jeans ₹1,999–₹2,499 |
| Stock | Deterministic pseudo-random 0–40; some variants are deliberately **0** to exercise out-of-stock UI |
| Coupons | `WELCOME10` (10%, min ₹1,499), `FLAT200` (₹200 off, min ₹1,999), `FREESHIP` (free shipping, min ₹999) |
| Pincode rules | Metro prefixes serviceable w/ COD · `190` prepaid-only · `744101` not serviceable |

Every seeded price sits at or below **₹2,499**, i.e. inside the 5% GST band — that is
deliberate, not incidental (see below).

---

## Project structure

```
├── docs/                BRIEF · ARCHITECTURE · DECISIONS
├── prisma/
│   ├── schema.prisma    data model (21 models, 10 enums)
│   ├── migrations/      committed SQL
│   └── seed.ts          idempotent catalogue seed
├── scripts/             dev-db, backup, link-check
├── src/
│   ├── app/             routes only — thin
│   │   ├── (store)/     storefront
│   │   ├── (auth)/      login / OTP
│   │   ├── account/     customer area
│   │   ├── admin/       admin area
│   │   └── api/         route handlers
│   ├── components/      ui · store · admin
│   ├── lib/             config, utils (money), validators (zod)
│   └── server/          db · auth · services · payments · shipping
│                        storage · email · tax · invoice
└── tests/               unit · e2e
```

Business logic lives in `src/server/services`; routes stay thin so the checkout flow is
testable without HTTP.

---

## Money and GST rules

Two rules that the whole codebase depends on.

**1. Money is integer paise.** Every monetary column is `Int` paise (`₹899` → `89900`).
No floats. See `src/lib/utils/money.ts` and `ADR-005`.

**2. GST is per-piece, not per-order.** Current law (effective **22 Sep 2025**):

| Per-piece selling price | GST |
|---|---|
| ≤ ₹2,500 | **5%** |
| > ₹2,500 | **18%** |

> ⚠️ The original project brief specified "5% under ₹1000, 12% above". That is the
> **pre-2025** rule. The 12% apparel slab was removed by the 56th GST Council. The
> rate table in `src/server/tax/gst.ts` is **data-driven and date-versioned**, so the
> legacy rule is one config line away — but the default is current law.
> Full rationale: `ADR-004` in [`docs/DECISIONS.md`](./docs/DECISIONS.md), tracked in
> [`BLOCKERS.md`](./BLOCKERS.md) `BLK-004`.

Practical consequence: a ₹2,499 jean nets **more** after tax than a ₹2,599 jean. The seed
data and the pricing strategy both exploit this deliberately.

HSN codes: **6109** knitted t-shirts · **6203** men's woven trousers/jeans.

---

## Testing

```bash
npm test              # unit
npm run test:e2e      # e2e (Phase 8)
npm run verify        # typecheck + lint + test
```

Current unit coverage focuses on the highest-risk pure logic: the GST engine and money
math (rounding drift, per-piece thresholds, threshold boundary, intra/inter-state split).

**Tests are never reported as passing unless they actually ran.** Anything unverifiable in
a given environment is logged in `BLOCKERS.md`.

---

## Troubleshooting

### `npm install` fails with `EPERM ... npm-cache`

The package cache is outside the writable sandbox. Point npm and temp inside the project
tree:

```bash
# PowerShell
$env:npm_config_cache = "$PWD\.npm-cache"
$env:TEMP = "$PWD\.tmp"; $env:TMP = "$PWD\.tmp"
npm install
```

```bash
# bash
export npm_config_cache="$PWD/.npm-cache"
export TMPDIR="$PWD/.tmp"
npm install
```

### `pnpm` fails with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`

Known issue in restricted environments. Use **npm** (see `ADR-002`).

### `prisma migrate dev` says the database does not exist

Start Postgres first (`docker compose up db -d`), or point `DATABASE_URL` at a hosted
Postgres. Then check that the URL in `.env` matches the running instance.

### Docker not installed

Use Option B above. `docker-compose.yml` and `Dockerfile` are deliverables for
deploy-time / CI use.

---

## Docs

| Doc | Contents |
|---|---|
| [`docs/BRIEF.md`](./docs/BRIEF.md) | Scope, non-negotiables, stack, DoD, approval gates |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Layering, checkout flow, auth, tax, shipping, testing |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | 12 ADRs incl. the GST correction |
| [`PROGRESS.md`](./PROGRESS.md) | Phase-by-phase log |
| [`BLOCKERS.md`](./BLOCKERS.md) | Open issues needing a human decision |

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Docs | ✅ |
| 1 | Scaffold · schema · migration · seed · Docker · CI | ✅ |
| 2 | Auth (email + phone OTP), account, addresses | ✅ |
| 3 | Storefront — catalogue, PDP, variants, size chart, search, filters, cart | ⬜ |
| 4 | Checkout — pincode, Razorpay + COD, order, GST invoice PDF | ⬜ |
| 5 | Shipping — Shiprocket webhook, tracking, status sync | ⬜ |
| 6 | Returns/exchanges, refunds, admin orders | ⬜ |
| 7 | Admin dashboard — product CRUD, inventory, coupons, analytics | ⬜ |
| 8 | Hardening — e2e, rate limiting, CSP, SEO, a11y, error tracking | ⬜ |
| 9 | `docs/DEPLOY.md` — **no deploy without approval** | ⬜ |

---

**Private / proprietary.** Not licensed for redistribution.
