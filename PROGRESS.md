# PROGRESS — ecomerce-store

Phase-by-phase log. Commit-style entries. Updated at the end of every phase.

**Project root:** `E:\automation\ecommerce-store`
**Package manager:** npm (ADR-002)
**Env note:** package cache + temp must point inside the workspace (ADR-003)

---

## Phase status

| Phase | Scope | Status | Verified how |
|---|---|---|---|
| 0 | Brief, architecture, decisions, progress, blockers | ✅ **Complete** | Files written; decisions recorded |
| 1 | Scaffold, Docker Compose, Prisma schema + migration, seed, env template, CI | ✅ **Complete** (DB run pending) | Prisma generate ✔ · migration SQL ✔ · tsc ✔ · 35/35 tests ✔ · `next build` ✔ · home page rendered ✔ |
| 2 | Auth (email + phone OTP), account, addresses | ⬜ Not started | — |
| 3 | Storefront — catalog, PDP, variants, size chart, search, filters, cart | ⬜ Not started | — |
| 4 | Checkout — address, pincode, Razorpay + COD, order, GST invoice PDF | ⬜ Not started | — |
| 5 | Shipping — Shiprocket webhook, tracking, status sync | ⬜ Not started | — |
| 6 | Returns/exchanges, refunds, admin order management | ⬜ Not started | — |
| 7 | Admin dashboard — product CRUD, inventory, coupons, analytics | ⬜ Not started | — |
| 8 | Hardening — tests, rate limiting, headers, SEO, a11y, error tracking | ⬜ Not started | — |
| 9 | Deploy runbook (`docs/DEPLOY.md`) — **no execution without approval** | ⬜ Not started | — |

---

## Log

### `chore(phase-0): establish project docs and record environment constraints`

**Done**
- Probed toolchain: node v24.21.0 · npm 11.19.0 · pnpm 12.11.2 (broken) · git 2.54.0 · **docker absent**
- Diagnosed `D:\` as OS-level unwritable → relocated project to `E:\automation\ecommerce-store` (`BLK-001`)
- Diagnosed npm `EPERM` cache failures → redirected cache/temp into workspace, verified installs succeed (`ADR-003`)
- Standardised on npm (`ADR-002`)
- Wrote `docs/BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `PROGRESS.md`, `BLOCKERS.md`
- Recorded 12 ADRs, including the **GST slab correction** (`ADR-004`) and the payment/tax integrity design (`ADR-011`)

**Flags raised**
- ⚠️ `BLK-004` — brief's GST slabs (5%/12% @ ₹1,000) are pre-2025 law; implemented current law (5%/18% @ ₹2,500), data-driven
- `BLK-001`, `BLK-002` — path and Docker deviations from the DoD

**Tests:** n/a (docs only)

---

### `feat(phase-1): scaffold app, data model, migrations, seed, Docker + CI`

**Done**
- Next.js 14.2.15 (App Router) + TypeScript strict + Tailwind, token-based brand palette
  (ink / off-white / olive) wired through HSL CSS vars
- Prisma schema: **19 models, 11 enums** (User, AdminUser, Address, OtpToken, Category,
  Product, ProductImage, Variant, Cart, CartItem, Order, OrderItem, Payment, Shipment,
  Return, Coupon, CouponRedemption, PincodeRule, AuditLog)
- Initial migration generated via `prisma migrate diff` (no DB needed) → **19 tables,
  19.6 KB SQL**, plus `migration_lock.toml`
- Idempotent seed: 2 categories (HSN 6109 / 6203), **20 t-shirts × 18 variants = 360**,
  **20 jeans × 6 waists = 120**, 3 coupons, 6 pincode rules
- GST engine (`src/server/tax/gst.ts`) — **data-driven, date-versioned rate table**,
  per-piece thresholds, intra/inter-state split, HSN mapping
- Money utils — integer paise only, Indian-format rendering
- `Dockerfile` (multi-stage, standalone, non-root, healthcheck) + `docker-compose.yml`
  (db + redis + one-shot migrate + app)
- GitHub Actions CI: install → prisma generate → typecheck → lint → format → test →
  prisma validate → build
- `.env.example` complete and commented; `.env` gitignored; no secrets committed
- `README.md` with setup, scripts, GST rules, and troubleshooting
- Placeholder home page + `/api/health` (returns 503 when DB is down, by design)

**Verified — actually executed, not assumed**

| Check | Command | Result |
|---|---|---|
| Prisma client | `npx prisma generate` | ✅ v5.22.0 |
| Migration SQL | `prisma migrate diff --from-empty --to-schema-datamodel` | ✅ 19.6 KB, 19 tables |
| Types | `npx tsc --noEmit` | ✅ exit 0 |
| Unit tests | `npx vitest run` | ✅ **35/35 passed** (24 GST, 11 money) |
| Production build | `npx next build` | ✅ exit 0, home route 94.1 kB First Load JS |
| Runtime | `next start` + HTTP probe | ✅ 200, 16,107 bytes |
| Health check | `GET /api/health` | ✅ 503 `db:down` (correct behaviour without a DB) |
| Visual | headless Chrome @1280 | ✅ desktop rendered (see `docs/screenshots/`) |

**Not verified — recorded honestly**
- **Migrations and seed were NOT executed**: no PostgreSQL and no Docker on this machine.
  The SQL and seed code exist and typecheck, but no rows have ever been written. → `BLK-009`
- Docker Compose stack unexecuted → `BLK-002`
- Narrow-viewport (mobile) rendering: headless Chrome clamps its layout viewport, so the
  "mobile" captures were misleading and have been removed. Mobile layout is **unverified**
  until Playwright device emulation lands in Phase 8 → `BLK-007`

**Fixes made during the phase**
- Removed a stray `import { type } from 'zod'` that would have broken the typecheck
- Body had no font applied → rendered in Times; added a system sans stack +
  `overflow-x-hidden` guard
- Header didn't shrink on small widths → added `shrink-0` / tighter gaps

**Flags**
- ⚠️ `BLK-004` — GST slabs corrected to current law (5%/18% at ₹2,500), not the brief's
  5%/12% at ₹1,000
- `next@14.2.15` is flagged by npm as having a security advisory; a patched 14.2.x
  (**14.2.35**) is available and should be adopted at the start of Phase 2

---
