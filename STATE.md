# STATE — Ground Truth Audit

**Repo:** `E:\automation\ecommerce-store`
**Branch:** `master` · **HEAD:** `6539239` · **Working tree:** clean
**Commit count:** 11
**Audit run:** 2026-10-18 (per server timestamp in the health payload)
**Toolchain observed:** Node v24.21.0 · npm 11.19.0 · Next.js 14.2.35 · Prisma 5.22.0 · PostgreSQL 18.4 (embedded)

This document records **only what was executed or read in this session**. Where a claim
could not be re-verified during this audit, it is marked as such rather than assumed.

---

## 0. Premise corrections (read this first)

Three of the "locked-in facts" in the brief do not match the repository:

| Brief says | Reality | Evidence |
|---|---|---|
| `Local deployment checklist.txt` exists at PROJECT_DIR | **No such file exists.** Searched project root, `docs/`, and `E:\automation`; also searched the whole tree for `*checklist*`. Zero matches. | `Get-ChildItem -Recurse -Filter '*checklist*'` → empty |
| Auth: **Auth.js v5** (`AUTH_SECRET`) | **Custom auth.** `jose` (HS256 JWT) + `bcryptjs`, hand-rolled session modules. `next-auth` and `@auth/*` are **not installed**. | `Test-Path node_modules\next-auth` → False; `src/server/auth/` contains `session.ts`, `session-cookie.ts`, `admin-session.ts`, `password.ts`, `otp.ts`, `guards.ts` |
| Razorpay and Shiprocket are **STUBBED** | Both are **real REST clients** written to the documented APIs, gated behind `RAZORPAY_ENABLED` / `SHIPROCKET_ENABLED` (both `false`). They have **never been executed against the live services**. "Stubbed" understates it (real code) and overstates it (never run). | `src/server/payments/razorpay.ts`, `src/server/shipping/shiprocket.ts` |

`AUTH_SECRET` is the env var name in both worlds, which is probably why this looked aligned.

---

## (a) VERIFIED WORKING

Each row was produced by a command run in this audit.

| # | Claim | How proved | Output |
|---|---|---|---|
| A1 | Embedded Postgres starts and is reachable | `npx tsx scripts/dev-db.ts` then `node scripts/db-ping.mjs` | `DB UP {"db":"store","products":40,"variants":480,"orders":0,"users":0}` |
| A2 | Seed data matches the brief | same probe | 40 products, 480 variants ✓ |
| A3 | 3 forward-only migrations applied | `preflight` migration check | `✓ migrations applied — 3 migration(s)` |
| A4 | Unit tests pass | `npm test` | `Test Files 10 passed (10) / Tests 222 passed (222)` · exit 0 |
| A5 | Production build succeeds | `npm run build` | exit 0, `○ (Static)` + `ƒ (Dynamic)` output |
| A6 | Server serves and DB is up | `curl http://localhost:3000/api/health` | `{"status":"ok","db":"up","latencyMs":1,...}` · `HTTP 200` |
| A7 | Home page renders | `curl /` + Playwright screenshots | `HTTP 200 34467 bytes 0.187s`; desktop 1440px and Pixel 5 mobile both correct |
| A8 | Running build is the current build | `curl /admin/products` | `HTTP 307` (route exists → guard redirects; a stale build returns 404) |
| A9 | Preflight detects a dev secret | `node scripts/preflight.mjs` with env exported | `✗ AUTH_SECRET is a development value — generate a fresh 32-byte secret` → exit 1 |
| A10 | Account area exists | route inventory | `/account`, `/account/addresses` present |
| A11 | Exchange flow is covered by tests | read `scripts/smoke-returns.ts` | L201 `─── EXCHANGE lifecycle ───`; asserts request → approve (reserve) → receive (restock) → ship replacement → complete, plus cancel-releases-reservation |
| A12 | GST invoice PDF generated | prior round evidence (commit `cd0d7c8`), re-run in this audit only via unit tests | `tests/unit/payment.test.ts` 21 tests pass; Playwright journey downloads a `%PDF-` file (see B1) |
| A13 | Search + filters implemented | route + component inventory | `/[category]?size=&color=&fit=&min=&max=&sort=`, `/search?q=`; filters are URL links |
| A14 | Admin surfaces exist | route inventory | dashboard, orders (+detail), returns, products (+new/edit), inventory, coupons — 11 admin route files |
| A15 | Security headers configured | `next.config.mjs` headers() | CSP, COOP, HSTS, nosniff, Referrer-Policy, Permissions-Policy |

---

## (b) WRITTEN BUT UNVERIFIED (in this audit)

| # | Item | Status | Why it is not "verified" here |
|---|---|---|---|
| B1 | **Playwright E2E** (13 tests) | Passed in a previous round (commit `9d340a1`); **not re-run in this audit** | Part A scope; chromium lives at `E:\automation\.cache\ms-playwright` and needs `PLAYWRIGHT_BROWSERS_PATH` + a running server |
| B2 | **Lighthouse** (Perf 90/97/93, A11y 98–100, BP 96, SEO 100) | Measured in a previous round | Reports written to `.lighthouse/` which is **gitignored**; they are **not** persisted at `docs/lighthouse/home.json` as the brief requires |
| B3 | **Docker Compose** | File exists, **never executed** | Docker is not installed; `docker` is not on PATH. Requires approval gate #4 to install |
| B4 | **Razorpay live flow** | Code + signature unit tests only | `RAZORPAY_ENABLED=false`, no keys. Signature verification is unit-tested with a local HMAC secret |
| B5 | **Shiprocket live flow** | Code + status-mapping tests only | `SHIPROCKET_ENABLED=false`, no credentials, no captured webhook payload |
| B6 | **Resend email delivery** | Interface + console transport | `EMAIL_ENABLED=false`, no API key, no verified sending domain |
| B7 | **Rate limiting** | In-process `Map` | Per-instance only; no Redis. Trusts `x-forwarded-for` |
| B8 | **Load test** | Ran previously (p95 498 ms, 0% errors) | Not part of this audit |

---

## (c) MISSING OR STUBBED

| # | Target from brief | Actual state | Evidence |
|---|---|---|---|
| C1 | **Wishlist** | **Does not exist** | zero source hits for `wishlist`/`Wishlist`; no Prisma model |
| C2 | **Legal pages** (Terms, Privacy, Returns/Exchange, Shipping, Contact) | **None exist** | no `src/app/**/terms\|privacy\|returns-policy\|shipping-policy\|contact` routes |
| C3 | **GA4 + Meta Pixel** | **No code at all** | 0 hits in `src/`; 2 hits only in `.env.example` |
| C4 | **Size chart per PDP** (JSON per category, modal) | **Standalone page only** | `/size-chart` hardcodes `TEE_SIZES` / `JEAN_SIZES` in the page file; PDP links to it but has no modal |
| C5 | **Phone OTP provider** (MSG91/Twilio) | **Console provider only**; other providers throw | `src/server/auth/otp.ts` — `OTP_PROVIDER` enum, non-console throws "not implemented" |
| C6 | **Admin pincode rules CRUD** | **No admin UI** | `PincodeRule` model + seed exist; no `/admin/pincodes` route |
| C7 | **Admin refund via gateway** | **Local record only** | `completeRefund` increments `Payment.refundedPaise`; no Razorpay refund API call |
| C8 | **Image upload / storage** | **URL-only, no adapter** | admin product form takes an `imageUrl` string; `STORAGE_DRIVER`/`S3_*`/`CLOUDINARY_*` exist as env slots with **no storage module** |
| C9 | **Transactional emails** (shipped, delivered, return approved) | **Order confirmation only** | `src/server/email/` contains only `provider.ts` + `order-emails.ts` |
| C10 | **Preflight loads `.env`** | **No** — bare run fails on missing vars (and reports placeholder warnings that are indistinguishable from unset values) | `node scripts/preflight.mjs` → `✗ AUTH_SECRET is missing`, `✗ NEXT_PUBLIC_APP_URL is missing` |
| C11 | **Preflight checks `.env.example` completeness** | Not implemented | grep: no such check in `scripts/preflight.mjs` |
| C12 | **Seed admin**: env password only outside development | Partially — skips in production without `ADMIN_SEED_PASSWORD`, but **falls back to `admin-dev-password-1` in any non-production env** | `prisma/seed.ts` L448 `password ?? 'admin-dev-password-1'` |
| C13 | **Brand typo** `ecomerce-store` | Live on every page | visible in screenshots; `src/lib/config/site.ts` |
| C14 | **Cron jobs** (dep audit, backup, link check, weekly E2E) | **None** | no cron/scheduler code |
| C15 | **GST rate confirmation** | **Unresolved since Phase 0** — code implements 5% ≤ ₹2,500 / 18% above; the brief specified 5% < ₹1,000 / 12% above | `src/server/tax/gst.ts`, `BLK-004` |

---

## Claimed-vs-actual summary

| Brief claim | Verdict |
|---|---|
| npm + `package-lock.json` | ✅ confirmed |
| Next.js, `NEXT_PUBLIC_APP_URL` | ✅ confirmed |
| Auth.js v5 | ❌ **false** — custom `jose` + `bcryptjs` |
| Prisma requires `DATABASE_URL` + `DIRECT_URL` | ✅ confirmed (`directUrl` in schema) |
| Embedded PG on 5433 via `npm run dev:db` | ✅ confirmed (started in this audit) |
| Docker Compose unverified | ✅ confirmed |
| Scripts exist and are reusable | ✅ all 9 named scripts exist (+2 extras: `smoke-cart.ts`, `_demo-order.ts`) |
| 222 unit tests | ✅ confirmed exactly |
| Seed: 2 categories / 40 products / 480 variants / 3 coupons / 6 pincode rules | ✅ confirmed |
| Razorpay + Shiprocket stubbed, COD works | ⚠️ **partly** — clients are real, gated, never executed live |
| `Local deployment checklist.txt` | ❌ **does not exist** |

---

## Verbatim command outputs (required by the brief)

### 1. `node scripts/preflight.mjs`

Without env (as literally specified):

```
Deployment preflight

WARN
  ! GST_LEGAL_ENTITY_NAME is a placeholder
  ! GST_GSTIN is a placeholder
  ! RAZORPAY_ENABLED is false — prepaid checkout is disabled in the UI
  ! SHIPROCKET_ENABLED is false — no shipments are created automatically
  ! EMAIL_ENABLED is false — confirmations are only logged
  ! STORAGE_DRIVER=local writes to the app filesystem and is not durable
  ! ERROR_WEBHOOK_URL is not set — errors only go to stderr

FAIL
  ✗ AUTH_SECRET is missing
  ✗ NEXT_PUBLIC_APP_URL is missing — invoice links and emails depend on it

Preflight FAILED with 2 blocking issue(s).

exit: 1
```

With the local env exported:

```
Deployment preflight

PASS
  ✓ AUTH_SECRET is set
  ✓ NEXT_PUBLIC_APP_URL looks right — http://localhost:3000
  ✓ DIRECT_URL matches DATABASE_URL (fine for a direct/non-pooled host)
  ✓ database reachable — store, 20 tables
  ✓ migrations applied — 3 migration(s)
  ✓ catalogue has products — 40 products
  ✓ admin user exists — 1 active

WARN
  ! GST_LEGAL_ENTITY_NAME is a placeholder
  ! GST_GSTIN is a placeholder
  ! RAZORPAY_ENABLED is false — prepaid checkout is disabled in the UI
  ! SHIPROCKET_ENABLED is false — no shipments are created automatically
  ! EMAIL_ENABLED is false — confirmations are only logged
  ! STORAGE_DRIVER=local writes to the app filesystem and is not durable
  ! ERROR_WEBHOOK_URL is not set — errors only go to stderr

FAIL
  ✗ AUTH_SECRET is a development value — generate a fresh 32-byte secret

Preflight FAILED with 1 blocking issue(s).

exit: 1
```

**Both runs exit 1.** The only blocking failure with env loaded is the dev `AUTH_SECRET`,
which is correct behaviour — but it means the repo as-committed cannot pass its own gate.

### 2. `npm test`

```
 Test Files  10 passed (10)
      Tests  222 passed (222)
   Duration  5.82s
exit: 0
```

### 3. `curl http://localhost:3000/api/health`

```
{"status":"ok","db":"up","latencyMs":1,"uptimeSeconds":16,"timestamp":"2026-10-18T13:42:56.691Z"}
HTTP 200
```

### 4. Vision-verified screenshots

- `docs/screenshots/audit-home-desktop.png` (1440×1200) — hero, both category cards, featured grid
- `docs/screenshots/audit-home-mobile.png` (Pixel 5, 1081×1999 @2.75×) — no overflow, nav fits

Observed while reviewing: all four "Featured" products are **jeans**, because featured
ordering is `createdAt desc` and jeans were seeded after tees. Cosmetic merchandising issue.
