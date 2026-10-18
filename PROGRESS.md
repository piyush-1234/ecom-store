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
| 1 | Scaffold, Docker Compose, Prisma schema + migration, seed, env template, CI | ✅ **Complete** | Prisma generate ✔ · migration SQL ✔ · tsc ✔ · 35/35 tests ✔ · `next build` ✔ · home page rendered ✔ **· migrations + seed now EXECUTED against a real Postgres (see follow-up below)** |
| 2 | Auth (email + phone OTP), account, addresses | ✅ **Complete** | tsc ✔ · 86/86 unit tests ✔ · build 15 routes ✔ · **29/29 e2e smoke** ✔ · guard redirect 307 ✔ |
| 3 | Storefront — catalog, PDP, variants, size chart, search, filters, cart | ✅ **Complete** | 102/102 unit ✔ · **14/14 cart integration** ✔ · **32/32 storefront smoke** ✔ · 29/29 auth regression ✔ · build 22 routes ✔ |
| 4 | Checkout — address, pincode, Razorpay + COD, order, GST invoice PDF | ✅ **Complete** (prepaid gated) | **146/146 unit** ✔ · **34/34 checkout integration** ✔ · **41/41 HTTP** ✔ · invoice served as real PDF ✔ |
| 5 | Shipping — Shiprocket webhook, tracking, status sync | ✅ **Complete** (adapter gated) | **178/178 unit** ✔ · **21/21 shipping lifecycle** ✔ · **44/44 HTTP** ✔ · tracking UI verified visually ✔ |
| 6 | Returns/exchanges, refunds, admin order management | ✅ **Complete** | **206/206 unit** ✔ · **21/21 returns lifecycle** ✔ · **9/9 admin smoke** ✔ · 44/44 storefront ✔ |
| 7 | Admin dashboard — product CRUD, inventory, coupons, analytics | ✅ **Complete** | **222/222 unit** ✔ · **14/14 admin** ✔ · **12/12 coupons** ✔ · 44/44 store · 34/34 checkout · 21/21 returns · 21/21 shipping |
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
- `next@14.2.15` flagged by npm with a security advisory → **upgraded to 14.2.35** at the
  start of Phase 2 (patched, still Next 14)

---

### `feat(db): provision a local PostgreSQL so migrations and seed can actually run`

Resolves `BLK-009` — the project previously had a data model that had never touched a
database.

**Approach.** `embedded-postgres` as a **devDependency** (no Docker, no global install, no
admin rights). Binaries ship as an optional platform package; the cluster lives in
`.pgdata/` (gitignored). `npm run dev:db` starts it on port 5433.

**Two real bugs found and fixed**
1. **UTF-8 BOM in `migration.sql`.** PowerShell 5.1's `Set-Content -Encoding utf8` wrote a
   BOM, and Postgres rejected the file (`0xEF 0xBB 0xBF ... no equivalent in WIN1252`).
   Stripped the BOM and wrote via `UTF8Encoding($false)`.
2. **Cluster initialised as WIN1252.** The Windows default locale made the database
   unable to store `₹` or any non-Latin text — unacceptable for a commerce DB. Recreated
   with `initdbFlags: ['--encoding=UTF8', '--locale=C']`.

**Verified**
| Check | Result |
|---|---|
| `prisma migrate deploy` | ✅ `0001_init` applied |
| `prisma migrate dev --name user_email_optional` | ✅ `20261018111832_...` created + applied |
| `npm run db:seed` | ✅ 40 products · 480 variants · 435 in stock · 3 coupons · 6 pincode rules |
| Seed re-run | ✅ **idempotent** — identical counts |
| `server_encoding` | ✅ **UTF8** |
| UTF-8 round-trip (`₹ प्रोब — Olive`, rolled back) | ✅ PASS |

---

### `feat(phase-2): authentication (email + phone OTP), account area, address book`

**Done**
- `src/lib/env.ts` — Zod-validated env, **lazy** so builds don't need a live environment,
  and all missing keys reported at once
- Password hashing (`bcryptjs`, cost 12) with timing-equalised verification for unknown users
- Sessions: HS256 JWT (`jose`) in an httpOnly/SameSite=Lax cookie; `session.ts` kept pure
  and unit-testable, cookie plumbing isolated in `session-cookie.ts`
- Phone OTP: CSPRNG code, **HMAC-SHA256 at rest** (never plaintext), 10-min TTL,
  single-use consumption, attempt cap, 30s re-request throttle
- Services: `auth.service` (register / login / OTP request+verify / profile),
  `address.service` (list / create / update / delete, default-address promotion)
- 8 API routes under `/api/auth/*` and `/api/account/addresses`
- UI: `/login`, `/register`, `/account` (guarded layout), `/account/addresses`
- Shared Zod validators for email, Indian mobile (E.164 normalisation), password, PIN code,
  36 states/UTs, GST state-code mapping
- `scripts/smoke-auth.mjs` — reusable end-to-end HTTP smoke test

**Security properties verified by the smoke test**
| Property | Result |
|---|---|
| Unauthenticated `/api/auth/me` | ✅ 401 |
| `/account` without a session | ✅ 307 redirect to `/login` |
| Invalid phone rejected with field-level error | ✅ 422 |
| Duplicate email | ✅ 409 |
| Phone uniqueness | ✅ enforced (caught a real collision during testing) |
| Cross-user address update (IDOR) | ✅ 404 |
| Login with wrong password | ✅ 401 |
| Login with unknown email | ✅ 401 — **no user enumeration** |
| Wrong OTP | ✅ 400 |
| Logout invalidates access | ✅ 401 afterwards |

**Verified — executed**
- `npx tsc --noEmit` → exit 0
- `npx vitest run` → **86/86 passed** (gst 24, money 11, validators 36, auth 15)
- `npx next build` → exit 0, 15 routes, home still static (181 B), first-load JS 96.1 kB
- `node scripts/smoke-auth.mjs` → **29/29 passed** against a live server + real DB

**Not verified / out of scope this phase**
- Real SMS delivery — `OTP_PROVIDER=console` logs the code; MSG91/Twilio need credentials
  (approval gate #1). Sending fails loudly rather than pretending.
- Email verification and password reset were **not** in the brief's Phase 2 scope; noted
  as a gap for Phase 8 (security hardening).

---

### `feat(phase-3): storefront — catalogue, PDP, filters, search, size chart, cart`

**Done**
- `catalog.service` — categories, paginated product listing, facets derived from data,
  PDP lookup, featured/related products, sitemap slugs
- Routes: `/` (merchandised home), `/[category]` (`t-shirts`, `jeans` — anything else
  404s), `/product/[slug]`, `/cart`, `/search`, `/size-chart`, plus `sitemap.xml`
  and `robots.txt`
- Filters (`size`, `colour`, `fit`, `price`, `sort`, `page`) implemented as **plain
  links**: shareable, crawlable, and working with JavaScript disabled
- PDP: gallery, colour swatches, size grid with per-size stock, add-to-cart server action,
  spec table (fabric/GSM/fit/**HSN**/country of origin), care notes, related products,
  and `Product` JSON-LD with `hasMerchantReturnPolicy` + `shippingDetails`
- Cart: guest cart identified by a 256-bit httpOnly token; quantities clamped to stock;
  `/cart` line management via server actions
- `robots.txt` disallows account/cart/checkout/search; sitemap is DB-driven with a
  static fallback so a cold database cannot break a deploy

**Architecture decisions made during the phase**
- Split `cart.service` into `cart-core.service` (pure, no `next/headers`, DB-testable) and
  `cart.service` (cookie-aware wrapper). Without this split the cart could only be tested
  through HTTP.
- The store header reads the cart count and session server-side, so store routes render
  dynamically. Accepted: a per-user header that is correct on first paint beats a static
  header that flickers.

**Verified — executed**
| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run` | ✅ **102/102** (added 16 catalogue-filter tests) |
| `npx next build` | ✅ exit 0, 22 routes, shared JS 87.3 kB |
| `npx tsx scripts/smoke-cart.ts` | ✅ **14/14** against real Postgres (add, merge, clamp, update, remove, out-of-stock, unknown variant, cart isolation) |
| `node scripts/smoke-store.mjs` | ✅ **32/32** (home, both listings, PDP, JSON-LD INR + return policy, filters, garbage filters, search, empty search, size chart, cart, sitemap, robots, 404s) |
| `node scripts/smoke-auth.mjs` | ✅ 29/29 (Phase 2 regression) |
| Visual | ✅ home / listing / PDP / size chart captured in `docs/screenshots/` |

**Bugs found and fixed while verifying**
1. **PDP defaulted to size XS** — it preselected simply the first in-stock variant. Now
   picks by a size-curve preference (M → L → XL → S → XXL → XS). Caught by looking at the
   screenshot, not by a test.
2. **`setCartToken` called twice** in the guest-cart merge path (one call with an empty
   string). Removed, and the surviving cart now mints a token if it lacks one.
3. **£ vs ₹ scare** — the price glyph looked like a pound sign at low resolution. Verified
   programmatically that `Intl.NumberFormat` emits **U+20B9 (₹)** and that the served HTML
   contains no U+00A3. It was a preview artifact.

**Not verified**
- The **add-to-cart click path** (form → server action → redirect) is not exercised
  through a real browser: the built-in browser cannot expose CDP here and headless Chrome
  has no driver. It is covered at the action/service layer and by typecheck; true browser
  E2E lands with Playwright in Phase 8. Logged as `BLK-011`.

---

### `feat(phase-4): checkout, COD, Razorpay integration, GST invoice PDF`

**Done**
- `pricing.service` — order totals with **per-line, per-piece GST**; discount allocated
  pro-rata across lines (largest-remainder, sums exactly); service GST on shipping/COD;
  CGST+SGST vs IGST by state; `total` reconciled from components by construction
- `checkout.service` — `placeOrder` inside a transaction: conditional stock decrement
  (`WHERE stock >= qty`), order + items + payment created atomically, cart destroyed;
  idempotency key makes double-submit return the same order; COD cap and pincode
  serviceability enforced before anything is written
- `pincode.service` — exact → prefix → default resolution, COD eligibility, ETA
- GST invoice **PDF** (`pdfkit`) with HSN, per-line tax, CGST/SGST or IGST split, seller
  identity and declaration; served from `/api/orders/[orderNumber]/invoice`
- Signed invoice tokens (HMAC) so guest orders can download without an account
- Razorpay adapter over the REST API + signature-verified `/verify` and `/webhook` routes
- Email adapter (console by default, Resend behind `EMAIL_ENABLED`) + order confirmation
- UI: `/checkout` (address, live pincode check, payment choice) and `/order/[orderNumber]`

**Verified — executed**
| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run` | ✅ **146/146** (added 23 pricing + 21 payment/invoice-token tests) |
| `npx tsx scripts/smoke-checkout.ts` | ✅ **34/34** against real Postgres |
| `node scripts/smoke-store.mjs` | ✅ **41/41** HTTP (incl. 9 new checkout/payment checks) |
| `node scripts/smoke-auth.mjs` | ✅ 29/29 |
| `npx next build` | ✅ exit 0, 26 routes |
| Invoice over HTTP | ✅ `200`, 2,676 bytes, `%PDF-` header; **no token → 404** |
| Confirmation page | ✅ rendered (see `docs/screenshots/phase4-order-confirmation.png`) |

The 34 checkout assertions cover the things that actually lose money:
`oversell rejected` · `failed order rolled back, stock unchanged` · `no orphan order left
behind` · `replay of idempotency key creates no duplicate` · `COD above cap rejected` ·
`unserviceable pincode rejected` · `stock decremented exactly once` · `stored total equals
its components` · invoice contains the order number, HSN, CGST/SGST and "Rs." amounts.

**Bugs found and fixed while verifying**
1. **Invoice text assertions failed** — not a PDF bug. `pdfkit` compresses content streams
   (FlateDecode) *and* emits glyphs as hex strings split at kerning boundaries
   (`[<54> 90 <415820494e56>] TJ` = "T" + "AX INV"). Added a `compress` option and a hex-run
   decoder in the test, so the invoice content is genuinely asserted rather than assumed.
2. **Checkout test used 2 × ₹2,199 jeans** and was refused by the ₹1,500 COD cap. The guard
   was right; the test data was wrong. Rewrote it to use a cheap item for the happy path and
   added an explicit assertion that COD above the cap is rejected.
3. **`setCartToken` misuse surfaced again** during the cart split — the merge path now
   mints a token when a user cart lacks one instead of writing an empty cookie.

**Deliberately not built yet**
- Coupon redemption at checkout (the model and admin exist; wiring it into `placeOrder`
  belongs with the coupon admin in Phase 7, not half-built now).
- Prepaid checkout is **disabled in the UI** because `RAZORPAY_ENABLED=false`: choosing it
  returns "Online payment is not enabled yet". The integration is real but unverified
  without test keys (`BLK-005`, approval gate #1). Signature verification is covered by
  unit tests with a locally generated secret.

---

### `feat(phase-5): shipping lifecycle — Shiprocket webhook, status sync, tracking UI`

**Done**
- `status-map.ts` — Shiprocket status strings → internal `ShipmentStatus`, plus order
  progression rules (`shouldAdvanceOrder`) and restock eligibility, as pure functions
- `shiprocket.ts` — adapter (token auth cached ~9 days, create shipment, live
  serviceability, cancel) **fully gated** on `SHIPROCKET_ENABLED`
- `shipping.service` — `applyShipmentEvent` runs the whole transition in one transaction:
  shipment update, forward-only order advancement, COD payment capture on delivery, and
  restocking guarded by a new `Shipment.restockedAt` column
- `/api/shipping/shiprocket/webhook` — shared-token auth (`x-api-key`), 503 when
  unconfigured, 401 on bad token, 200 for accepted-or-ignored events, 500 on failure so
  Shiprocket retries
- Order page now shows a delivery timeline (Confirmed → Shipped → Out for delivery →
  Delivered) with AWB, courier and an RTO notice
- `maybeCreateShipmentForOrder` called best-effort after COD checkout — a shipping outage
  can never lose a paid order
- Migration `shipment_restocked_at`

**Verified — executed**
| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run` | ✅ **178/178** (added 32 shipping tests) |
| `npx tsx scripts/smoke-shipping.ts` | ✅ **21/21** against real Postgres |
| `node scripts/smoke-store.mjs` | ✅ **44/44** HTTP (incl. webhook auth) |
| `node scripts/smoke-auth.mjs` | ✅ 29/29 |
| `npx next build` | ✅ exit 0 |
| Tracking UI | ✅ rendered with AWB + stepper (`docs/screenshots/phase5-order-tracking.png`) |

**The bug this phase existed to catch**

`UNDELIVERED`.includes(`DELIVERED`) is `true`. My first mapping checked "delivered" first, so
a **failed delivery would have marked the order as delivered** — and, worse, captured the COD
payment. The unit test caught it; the checks are now ordered exceptions-before-positives and
that ordering is asserted explicitly. This is exactly the class of bug that a webhook-driven
system hides until real traffic arrives.

**Also verified by the lifecycle test:** late/out-of-order webhooks cannot regress an order;
RTO restocks exactly once (replay is a no-op); stock is not restored while a parcel is still
in transit; unknown AWBs and unmapped statuses are reported as *not handled* rather than
guessed at.

**Not verified**
- **Live Shiprocket calls** (auth, create order, serviceability) — no credentials. The
  adapter is written to the documented REST shape and gated off. `BLK-005`.
- The webhook payload is parsed defensively (`current_status` ?? `shipment_status`, awb or
  awb_code, shipment_id or order_id), but real payload field names could differ; a single
  captured sample payload would settle it.

---

### `feat(phase-6): returns & exchanges, refunds, admin order management`

**Done**
- `returns.rules` — eligibility (delivered-only, 7-day refund / 15-day exchange windows,
  quantity accounting, one open request per item, exchange stock check) and refund maths,
  as pure functions
- `returns.service` — request creation with authorisation-independent validation, plus admin
  transitions: approve / reject / cancel / receive / ship replacement / refund / complete
- **Stock semantics:** an exchange *reserves* the replacement at approval, the returned item
  is restocked at *receipt*, and cancelling an approved exchange *releases* the reservation.
  Every movement is a conditional update.
- Admin authentication: separate admin cookie, issuer and audience from customer sessions,
  short-lived (12h), role-aware guard
- Admin UI: orders list with filters + stats, order detail with items/payment/shipment and
  pack/cancel actions, returns queue with status-specific actions
- Customer UI: return/exchange request form on the order page (exchange presented first,
  since it keeps the sale), plus request history
- Admin seeding (refuses a default password in production), audit log rows on every admin
  transition

**Verified — executed**
| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run` | ✅ **206/206** (added 28 returns-rule tests) |
| `npx tsx scripts/smoke-returns.ts` | ✅ **21/21** against real Postgres |
| `node scripts/smoke-admin.mjs` | ✅ **9/9** (guard, bad creds, no enumeration, session) |
| `node scripts/smoke-store.mjs` | ✅ 44/44 |
| `node scripts/smoke-auth.mjs` | ✅ 29/29 |
| `npx tsx scripts/smoke-shipping.ts` | ✅ 21/21 |
| `npx tsx scripts/smoke-checkout.ts` | ✅ 34/34 |
| `npx next build` | ✅ exit 0 |
| Order page + returns | ✅ rendered (`docs/screenshots/phase6-order-returns.png`) |

**Bugs and traps found**
1. **A stale server nearly produced a false verification.** The Phase 5 process still held
   port 3000, so the first Phase 6 HTTP run silently hit the *old* build (`EADDRINUSE` was
   swallowed by the background job). Caught by reading the job output and probing the port;
   all HTTP suites were re-run against a confirmed Phase 6 build.
2. **COD banner on a delivered order.** The page told a customer to "keep ₹1,196 ready" on an
   order already marked DELIVERED. Now suppressed for terminal statuses. Caught by looking at
   the screenshot, not by a test.
3. **Copy contradicted policy.** Footer and order page said "free size exchange within 7
   days" while the implemented exchange window is 15 days. Unified to 15 (refund window
   stays 7).
4. **`smoke-admin` crashed reading a Response body twice** — `res.json()` then `res.text()`.
   Now reads the body once.

**Deliberately not done**
- **Gateway refunds.** `completeRefund` records the refund amount against the payment and
  marks it `PARTIALLY_REFUNDED`, but does **not** call the Razorpay refund API — that needs
  test keys (`BLK-005`). Until then, refunds are an ops action reconciled manually.
  Called out explicitly rather than implied.
- Coupons, product CRUD and analytics remain Phase 7.

---

### `feat(phase-7): admin dashboard, product CRUD, inventory, coupons, analytics`

**Done**
- `coupons.rules` — pure coupon evaluation (active window, global cap, per-customer limit,
  minimum spend, percent/flat/free-shipping) with explicit rejection codes
- Coupon redemption **wired into checkout**: validated before any stock moves, applied to
  goods or shipping, recorded as a `CouponRedemption`, and the global usage cap enforced by
  a **conditional increment** inside the order transaction (concurrent use cannot exceed it)
- `admin-products.service` — create/update products, generated slugs and SKUs, variant
  matrix creation, absolute stock set, low-stock inventory query
- `admin-analytics.service` — revenue (excluding cancelled/RTO), AOV, top products by units,
  recent orders, low-stock count
- `admin-coupons.service` + Zod validation for coupon creation
- Admin UI: dashboard, products list (search + activate toggle), new product (size × colour
  matrix), product edit (per-variant price/stock/active), inventory (quick absolute set),
  coupons (create + toggle)
- Nav updated; all pages behind the admin guard

**Verified — executed**
| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run` | ✅ **222/222** (added 16 coupon tests) |
| `node scripts/smoke-admin.mjs` | ✅ **14/14** (dashboard, products, new, inventory, coupons all render) |
| `npx tsx scripts/smoke-coupons.ts` | ✅ **12/12** against real Postgres |
| `node scripts/smoke-store.mjs` | ✅ 44/44 |
| `node scripts/smoke-auth.mjs` | ✅ 29/29 |
| `npx tsx scripts/smoke-checkout.ts` | ✅ 34/34 |
| `npx tsx scripts/smoke-returns.ts` | ✅ 21/21 |
| `npx tsx scripts/smoke-shipping.ts` | ✅ 21/21 |
| `npx next build` | ✅ exit 0 |

Coupon assertions cover the money and the guardrails: percentage + prepaid incentive stack
correctly, `usedCount` increments, a redemption row is written, **a second use by the same
customer is refused**, unknown codes are refused, free-shipping zeroes the shipping charge,
and a below-minimum coupon is refused with the shortfall in the message.

**Environment trap (second time, now understood)**
`next start` kept failing with `EADDRINUSE` while `Get-Process node` reported **zero**
processes and `Get-NetTCPConnection` reported **no listener** — yet requests to :3000 were
answered by an older build. Process/port visibility is filtered in this sandbox, so the
stale server was invisible and could not be killed. Two verification runs were briefly
misattributed to the new build before the probe caught it.

Resolution: a **build-identity probe** before trusting any HTTP result —
`GET /admin/products` must return **307** (route exists, guard redirects) and not **404**
(route missing). Verification then ran on a fresh port (:3100) instead of fighting :3000.
Logged as `BLK-012`.

**Not verified**
- Admin pages are verified **over HTTP** (200 + rendered), not visually: the admin cookie is
  `httpOnly`, and headless Chrome cannot be handed a cookie by this toolchain. Deliberate:
  I will not add a dev backdoor route just to take a screenshot.

---
