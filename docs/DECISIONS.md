# DECISIONS — ecomerce-store

Numbered ADRs. Newest decisions appended. Each records context, decision, and consequence.

---

## ADR-001 — Project relocated from `D:\ecommerce store` to `E:\automation\ecommerce-store`

**Context.** The brief specifies `D:\ecommerce store` as PROJECT_DIR. Probing showed writes are denied at the OS level — `Set-Content` to `D:\` root *and* to `D:\ecommerce store` both raise `UnauthorizedAccessException`. This is not a DSH sandbox denial; the drive itself is not writable by this process. The DSH file policy additionally confines writes to `E:\automation`.

**Decision.** Build in `E:\automation\ecommerce-store`.

**Consequence.** Path difference from the brief. Moving later is a single `robocopy` and no code changes — all paths in the repo are relative. Logged as `BLK-001`.

---

## ADR-002 — `npm` instead of `pnpm`

**Context.** pnpm is installed (v12.11.2) but every install fails with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, including with explicit `--store-dir` and `--config.cache-dir`. npm succeeds once its cache is redirected.

**Decision.** Use npm with `package-lock.json`.

**Consequence.** Slightly slower installs, no content-addressed dedupe. Toolchain is otherwise identical. The brief did not mandate pnpm. Revisit if the lock bug is resolved.

---

## ADR-003 — Package-manager and temp state redirected into the workspace

**Context.** Default npm cache is `C:\Users\HP\AppData\Local\npm-cache`, outside the writable sandbox. Installs failed with `EPERM ... open 'C:\Users\HP\AppData\Local\npm-cache\_cacache\tmp\...'` *after* successfully contacting the registry. This initially looked like a network failure and was not.

**Decision.** Set `npm_config_cache=E:\automation\.cache\npm` and `TEMP/TMP=E:\automation\.cache\tmp` for every package operation. Documented in `README.md`.

**Consequence.** Anyone running this project in a confined environment must export the same vars or set them via `.npmrc` (`cache=...`).

---

## ADR-004 — GST rate table follows current law, NOT the brief's stated slabs ⚠️

**Context.** The brief specifies: *"GST slab logic (5% under ₹1000, 12% above)"*. **That is the pre-22-September-2025 rule and is no longer correct.**

The 56th GST Council meeting removed the 12% slab for apparel. Implemented by the Central Government with effect from **22 September 2025**:

- Articles of apparel and clothing accessories **≤ ₹2,500 per piece → 5% GST**
- **> ₹2,500 per piece → 18% GST** (increased from 12%)
- The concessional 5% threshold was raised from ₹1,000 to **₹2,500 per piece**

Source: Ministry of Finance reply, Lok Sabha Unstarred Question No. 2509 (15 Dec 2025), reproduced at https://taxguru.in/goods-and-service-tax/gst-garments-rs-2500-raised-18-percent-rationalise-tax-structure.html

**Decision.** Implement the **current** law (`5% ≤ ₹2,500`, `18% > ₹2,500`) as the default rate table, and implement it **data-driven** (`GstRule` table in code, date-versioned) so the legacy `5%/12%` rule can be selected by config or a future rate change without editing logic.

**Rationale.** Shipping the brief's numbers verbatim would produce **legally incorrect GST invoices** — an actual compliance defect, and tax invoices are a hard requirement in this brief. A silently wrong invoice is worse than a documented deviation. This is surfaced in `BLOCKERS.md` (BLK-004) for explicit user confirmation.

**Consequence.** If the user genuinely intends the old slabs (e.g. for historical data), flip one config value. Otherwise no action needed.

---

## ADR-005 — All money stored as integer paise

**Context.** Float arithmetic on currency produces drift; GST at 5% on ₹899.00 is ₹42.8095…, and naive rounding across line items makes invoice totals disagree with cart totals.

**Decision.** Every monetary column is `Int` paise. Rounding happens **once per line item**, using half-up to the paisa, and totals are sums of rounded line values.

**Consequence.** Slightly more verbose code (`toPaise`/`fromPaise` helpers everywhere). Eliminates a whole class of reconciliation bugs.

---

## ADR-006 — Stateless JWT sessions; Redis deferred to phase 3

**Context.** The brief lists Redis as optional in phase 1. Vercel serverless has no sticky sessions, so in-memory sessions are unusable.

**Decision.** Signed JWT (`jose`) in `httpOnly` cookie. Cart identity via a signed cookie for guests.

**Consequence.** No instant server-side session revocation (mitigated with short TTL + rotation). Redis added in phase 3 for rate limiting and revocation lists.

---

## ADR-007 — `bcryptjs` over `argon2`/`bcrypt`

**Context.** Native modules (`argon2`, `bcrypt`) require node-gyp + MSVC build tools on Windows and are a common CI failure.

**Decision.** `bcryptjs` (pure JS), cost factor 12.

**Consequence.** Slower hashing than native argon2 and weaker than argon2id against GPU attacks. Acceptable for v1 with rate-limited login; argon2id is the documented upgrade path.

---

## ADR-008 — Storage adapter instead of direct Cloudinary/S3 calls

**Context.** The brief allows "Cloudinary or AWS S3", and neither credential is available yet.

**Decision.** `StorageAdapter` interface with three implementations: `local` (dev, writes to `public/uploads`, gitignored), `s3`, `cloudinary`. Driver chosen by `STORAGE_DRIVER` env.

**Consequence.** Local dev works with zero cloud credentials; production swap is config-only. Local driver must never be used in production — asserted at boot when `NODE_ENV=production`.

---

## ADR-009 — Docker Compose is a deliverable, not a verified runtime (Docker absent)

**Context.** `docker` is not installed on this machine (`Get-Command docker` → nothing). The DoD says "fresh clone → `docker compose up`". I cannot execute or verify that here.

**Decision.** Ship `docker-compose.yml` + `Dockerfile` as required deliverables, clearly marked **unverified in this environment**. Provide a second, verified path: `scripts/dev-db.ts` using `embedded-postgres` so migrations and seed can actually run without Docker.

**Consequence.** I will report Docker artifacts as *unverified*, not as *working*. This is a recorded deviation from the DoD checklist (BLK-003), not a hidden one.

---

## ADR-010 — Guest checkout via signed cart cookie, merged on login

**Context.** The brief requires guest checkout, and apparel has high abandonment.

**Decision.** `Cart` row may have `userId = null` and is identified by an HMAC-signed `cart_id` cookie. On authentication, the guest cart merges into the user cart (sum quantities, re-clamp to stock).

**Consequence.** Cart must be revalidated server-side at checkout regardless of owner. Merge path needs its own tests.

---

## ADR-011 — Server recomputes every price; client totals are display-only

**Context.** Price/tax tampering is the most common ecommerce vulnerability.

**Decision.** `POST /api/checkout/quote` recomputes line prices, GST, shipping and discounts from the database and returns a **signed quote** (`HMAC` over the computed totals + cart hash + expiry). `POST /api/checkout/order` verifies that signature before creating the order.

**Consequence.** An extra round-trip at checkout. Worth it: no client-supplied price is ever trusted.

---

## ADR-012 — Zod schemas shared between client and server

**Context.** Duplicated validation logic drifts and causes "server rejected what the form allowed".

**Decision.** One schema per entity in `src/lib/validators/*`, imported by both React forms and route handlers.

**Consequence.** Validators must stay isomorphic — no Prisma or Node built-ins inside them.

---

## ADR-013 — `size`, `fit` and `color` are `String`, not Prisma enums

**Context.** The catalogue spans two shapes that do not share a size scale: t-shirts
(XS–XXL) and jeans (waist 28–40). Adding a size, a wash or a new fit is a routine
merchandising action and should not require a schema migration.

**Decision.** Store `size`, `fit`, `color` as `String`, with explicit `sizeOrder` and
`colorOrder` `Int` columns for deterministic sorting.

**Consequence.** No migration when the catalogue grows. The trade-off is that invalid
values are not rejected by the database — Zod schemas at the service boundary own that
validation, and the seed/fixtures are the reference for allowed values. Enums remain the
right choice where the set is genuinely closed and semantically meaningful (order status,
payment status, return kind/reason), because there the type system prevents real bugs.

---

## ADR-014 — System font stack; `next/font` deliberately NOT used

**Context.** `next/font` fetches font files from Google Fonts at build time. In the
environment this was built in, outbound HTTPS was unreliable, and an offline/CI build
would fail on a font download — a trivial cause for a broken deploy.

**Decision.** Use a system stack (`Segoe UI, system-ui, -apple-system, …`) declared as
`--font-sans`, applied via `font-sans` on `body`.

**Consequence.** Zero font bytes, instant text render (helps the LCP budget), no network
dependency at build time. Trade-off: typography differs slightly per OS. If a custom
typeface is wanted later, self-host the `.woff2` in `/public` and use `next/font/local`,
which avoids the network fetch entirely.

**Bug caught during Phase 1:** the initial build had no font applied to `body`, so the
page rendered in the browser default (Times). Fixed and re-verified.

---

## ADR-015 — `npm install --ignore-scripts`, with explicit full-access escalation for spawn-bound tools

**Context.** The confined sandbox blocks child processes that use piped stdio. This breaks
`npm install` (lifecycle scripts), `prisma generate`, `vitest` (esbuild), `next build`
(workers) and headless Chrome — all with `EPERM`.

**Decision.** Two-part:

1. Install with `npm install --ignore-scripts`. The dependency tree is complete (448
   packages) and nothing in this project relies on a postinstall step at install time —
   Prisma generation is an explicit `npm run db:generate`.
2. Run each spawn-bound verification step as a single, explicit, justified
   full-access escalation. Do not contrive workarounds that avoid running the check.

**Consequence.** Local development needs escalation prompts (or CI). **Nothing is skipped
to avoid them** — `BLOCKERS.md` `BLK-008` records this. CI is unaffected because GitHub
Actions runs unconfined.

---

## ADR-016 — Seed ships SVG placeholder images instead of remote stock photos

**Context.** Real product photography does not exist yet, and pointing the seed at remote
image hosts would make the app depend on third-party availability and slow first render.

**Decision.** Commit two local SVG placeholders (`public/placeholders/tee.svg`,
`jeans.svg`) and have the seed attach three images per product.

**Consequence.** The storefront renders deterministically offline with zero external
requests. Replaced by real photography in Phase 3 via the storage adapter.

---

## ADR-017 — `embedded-postgres` as a devDependency for the local database

**Context.** The authoring environment had neither Docker nor a system PostgreSQL, so the
data model had never touched a database (`BLK-009`). The brief's DoD requires a seeded store
running locally, and Phase 2 onward needs a live database for every test.

**Decision.** Add `embedded-postgres` as a **devDependency**. It ships platform-specific
Postgres binaries as an optional dependency, so `npm run dev:db` starts a real PostgreSQL 18
cluster on port 5433 with its data directory inside the repo (`.pgdata/`, gitignored).
`docker-compose.yml` remains the documented/CI path.

**Consequence.** No global install, no admin rights, no Docker required for development.
Trade-offs: ~105 MB of binaries per developer, and the cluster is single-node/local-only.
Production still uses a managed Postgres.

**Critical detail discovered:** the cluster must be created with
`initdbFlags: ['--encoding=UTF8', '--locale=C']`. The Windows default locale creates a
**WIN1252** database, which cannot store `₹` or Devanagari and fails migration import with
`0xEF 0xBB 0xBF ... has no equivalent in encoding "WIN1252"`. This is now enforced in
`scripts/dev-db.ts` and documented in the README.

---

## ADR-018 — OTPs stored as HMAC-SHA256, not bcrypt; security comes from caps, not hashing

**Context.** A 6-digit OTP has only 10^6 possible values. Hashing it with bcrypt would add
~300 ms to each verification while providing little protection: an attacker holding the hash
can brute-force the 10^6 space offline regardless of the algorithm. The real defences are a
short TTL, a hard attempt cap, and single-use consumption.

**Decision.** Store `HMAC-SHA256(AUTH_SECRET, phone + ":" + code)`. Verify with
`timingSafeEqual`. Enforce: 10-minute TTL, `OTP_MAX_ATTEMPTS` (default 5), mark consumed
**before** touching the user record, and refuse re-issue within 30 seconds.

**Consequence.** Fast verification, no plaintext codes at rest, and replay is impossible
because the token is burned before the session is created. If OTPs are ever lengthened to
something with meaningful entropy (or reused across purposes), revisit this.

---

## ADR-019 — Session logic split into pure `session.ts` + `session-cookie.ts`; guard in layout, not middleware

**Context.** `next/headers` cannot be imported in a plain Vitest node environment, so mixing
`cookies()` into the JWT module made the signing logic untestable. Separately, a middleware
guard can only cheaply check that a cookie *exists* — it would need to re-verify the JWT on
every request.

**Decision.**
1. `session.ts` holds only `signSession` / `verifySession` (pure, unit-tested).
   `session-cookie.ts` owns `cookies()` access.
2. The `/account` guard lives in `app/account/layout.tsx` and calls `getCurrentSession()`,
   which **verifies the signature** before rendering. `redirect('/login')` otherwise.

**Consequence.** Session logic is covered by unit tests (tampering, wrong secret, garbage
input) without mocking Next internals, and an expired/forged token can never render account
content. Cost: the auth check runs per-request in the layout rather than once in middleware —
acceptable at this scale, and it is the correct trade for actually validating the token.

---

## ADR-020 — Storefront rendering: URL-driven filters, dynamic pages, split cart

**Context.** Phase 3 needed several coupled choices: how filters work, whether store pages
are static, and how a cookie-backed cart can be tested.

**Decisions.**

1. **Filters are plain `<Link>`s, not a client widget.** Every filter/sort/page state is a
   URL. Benefits: shareable, crawlable, cacheable, works without JS, and the grid is
   server-rendered. Cost: no instant in-page toggle — acceptable for apparel browsing.
2. **Store pages render dynamically.** The header shows the cart count and the
   sign-in/account state, which are per-user. Reading them server-side means the header is
   correct on first paint. Alternative (static shell + client fetch) was rejected because it
   flickers and adds a request per page view.
3. **Cart is split into `cart-core.service` and `cart.service`.** The core takes an explicit
   cart token and imports no `next/headers`, so it can be driven directly by an integration
   test against Postgres. The wrapper resolves the token from the cookie and delegates.
   This was not cosmetic: before the split, the cart could only be tested through HTTP.
4. **Product/category pages are not statically generated yet.** No `generateStaticParams`,
   because prices/stock must be fresh and the catalogue is small (40 products). Revisit when
   the catalogue grows or when ISR with on-demand revalidation is wired.

**Consequence.** The storefront is simple and testable, and 32 HTTP-level assertions cover
rendering. The trade-off is that every store request is server-rendered — fine at this
volume, worth revisiting for LCP once real photography replaces the SVG placeholders.

---

## ADR-021 — GST invoice: "Rs." in the PDF, "₹" in the UI; compression configurable

**Context.** PDFKit's base-14 fonts use WinAnsi encoding, which has **no U+20B9 (₹)** glyph.
Embedding a Unicode TTF would add a binary asset and a font-licensing question. Separately,
PDFKit compresses content streams and emits glyphs as hex strings split at kerning
boundaries, which made content assertions fail in a way that looked like a rendering bug.

**Decision.**
1. Format invoice amounts as `Rs. 1,234.00`. "Rs." is unambiguous, standard on Indian
   invoices, and needs no font embedding. The web UI keeps `₹` via `Intl.NumberFormat`.
2. `generateInvoicePdf(order, { compress })`. Production keeps compression on; tests render
   uncompressed and decode the hex glyph runs to assert the actual invoice text.

**Consequence.** Invoices are portable across any host (no font dependency) and their content
is verifiable in CI. The cost is a slightly less pretty currency symbol on the PDF.

---

## ADR-022 — Tax-inclusive pricing; tax is derived per component, never added on top

**Context.** Indian retail prices are quoted inclusive of GST. The order total must equal
what the customer was shown, while the invoice must still break out tax correctly.

**Decision.** Treat every price as tax-inclusive. Derive tax by dividing it out:
`net = round(gross / (1 + rate/100))`. Compute it **per line, per piece** (the apparel slab
depends on the unit price), plus **18% service GST** on shipping and the COD fee. The order
total is then reconciled from its components, and `computeOrderTotals` asserts the
relationship rather than assuming it.

**Consequence.** The cart total, the order record and the invoice can never disagree. A
₹2,499 and a ₹2,599 jean in the same order are correctly taxed at 5% and 18% respectively.

---

## ADR-023 — Razorpay over `fetch`, gated by `RAZORPAY_ENABLED`; webhook is the source of truth

**Context.** The brief lists the Razorpay Node SDK. Adding it means another dependency for a
handful of REST calls, and the browser callback is unreliable (tab closed, network drop).

**Decision.**
1. Call the documented REST API with `fetch`; verify signatures with `node:crypto`.
2. Everything is gated on `RAZORPAY_ENABLED`. When false, prepaid checkout refuses with a
   clear message instead of appearing to work.
3. The **webhook** reconciles payment state, reading the raw body for signature verification
   and returning 500 on handler failure so Razorpay retries. Unsigned webhooks get 400.

**Consequence.** One fewer dependency, an explicit network surface, and no silently unverified
payment path. Trade-off: the SDK's typing/helpers are not available (the two endpoints used
are trivial).

---

## ADR-024 — Shipping webhooks are authenticated, never trusted; order state is forward-only

**Context.** Courier webhooks arrive out of order, retry, and are the primary source of
delivery truth. Two failure modes are severe: marking a failed delivery as delivered (which
captures COD money that was never collected), and regressing a delivered order back to
"shipped" because a stale event arrived late.

**Decisions.**

1. **Auth is a shared token**, because Shiprocket authenticates its webhook with the
   configured token in `x-api-key` — it is *not* an HMAC over the body. The token is compared
   in constant time, the route returns **503 when no token is configured** (refusing rather
   than accepting unauthenticated), and the body is treated purely as a pointer to the
   shipment. Every state change is derived server-side.
2. **Order progression is forward-only** (`shouldAdvanceOrder`), with cancellation able to
   win and cancelled/refunded orders never resurrected.
3. **Restocking is guarded by a column**, `Shipment.restockedAt`, rather than inferred from
   the previous status. A replayed `RTO DELIVERED` therefore cannot double-increment stock —
   a bug that silently inflates inventory and is very hard to trace later.
4. **Exceptions are matched before positives.** `"UNDELIVERED".includes("DELIVERED")` is true;
   without explicit ordering a failed delivery becomes a delivered order. A unit test pins
   this.

**Consequence.** The lifecycle test proves RTO restocks once and late events are inert. The
cost is one extra nullable column and a slightly longer mapping function — cheap insurance
for inventory and payment correctness.
