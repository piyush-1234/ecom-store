# ARCHITECTURE — ecomerce-store

**Modular monolith.** One deployable Next.js app. No microservices.

---

## 1. Directory map

```
ecommerce-store/
├── docs/                       # BRIEF, ARCHITECTURE, DECISIONS, DEPLOY
├── prisma/
│   ├── schema.prisma           # single source of truth for the data model
│   ├── migrations/             # SQL migrations (committed)
│   └── seed.ts                 # idempotent seed: 2 categories, 20 tees, 20 jeans
├── scripts/
│   ├── dev-db.ts               # no-Docker Postgres fallback (embedded)
│   ├── backup-db.ts            # nightly dump (cron)
│   └── check-links.ts          # broken-link check (cron)
├── src/
│   ├── app/                    # Next.js App Router ONLY (routing + layouts)
│   │   ├── (store)/            # public storefront route group
│   │   ├── (auth)/             # login, register, OTP
│   │   ├── account/            # authed customer area
│   │   ├── admin/              # admin area (separate layout + guard)
│   │   └── api/                # route handlers (webhooks, thin endpoints)
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── store/              # storefront components
│   │   └── admin/              # admin components
│   ├── lib/
│   │   ├── config/             # site, nav, brand tokens
│   │   ├── utils/              # money, dates, cn(), slugify
│   │   └── validators/         # Zod schemas (shared client+server)
│   └── server/
│       ├── db/                 # Prisma client singleton
│       ├── auth/               # session, password, otp, guards
│       ├── services/           # business logic (the real app)
│       ├── payments/           # razorpay adapter + cod
│       ├── shipping/           # shiprocket adapter
│       ├── storage/            # image storage adapter (local | s3 | cloudinary)
│       ├── email/              # resend + templates
│       ├── tax/                # GST engine + HSN mapping
│       └── invoice/            # GST invoice PDF generator
└── tests/
    ├── unit/                   # vitest
    └── e2e/                    # playwright
```

**Rule:** route handlers and server components are *thin*. Business logic lives in `src/server/services/*`. This keeps the checkout flow testable without HTTP.

---

## 2. Layering

```
Route / Server Action / Route Handler
        │  (validate input with Zod)
        ▼
   Service layer  (src/server/services)   ← all business rules live here
        │
        ├── tax engine (GST + HSN)
        ├── payments adapter
        ├── shipping adapter
        ├── email adapter
        └── storage adapter
        ▼
   Prisma client  (src/server/db)
        ▼
     PostgreSQL
```

Adapters exist for anything external (`payments`, `shipping`, `email`, `storage`) so they can be swapped and so **no network call is made during tests** — mocks implement the same interface.

---

## 3. Money and tax model

**All money is stored as integer paise (`Int`).** No floats anywhere. `₹899.00` = `89900`.

Rationale: floating-point money causes rounding drift in tax and totals. This is the single most common source of "invoice total doesn't match cart total" bugs.

```
Money helpers (src/lib/utils/money.ts)
  toPaise(rupees)      → Int
  fromPaise(paise)     → number
  formatINR(paise)     → "₹899.00"  (Intl.NumberFormat, en-IN)
```

**GST engine (`src/server/services/tax.service.ts`)** is **data-driven**, not hardcoded:

```ts
type GstRule = {
  hsn: string;
  label: string;
  thresholdPaise: number | null; // per-piece price threshold
  rateBelow: number;            // percent
  rateAbove: number;            // percent
  effectiveFrom: string;        // ISO date
};
```

GST is computed **per line item on the unit selling price**, because Indian apparel GST depends on the **per-piece value**, not the order total. A ₹2,499 jean and a ₹2,599 jean in the same order are taxed at different rates. This is a real compliance trap and is covered by unit tests.

See **ADR-004** for the rate table and why it differs from the brief.

---

## 4. Auth

Two principals, two guards:

| Principal | Table | Guard |
|---|---|---|
| Customer | `User` | `requireUser()` |
| Staff | `AdminUser` (roles: `ADMIN`, `OPS`) | `requireAdmin()` |

- **Session:** signed JWT in an `httpOnly`, `Secure`, `SameSite=Lax` cookie (`jose`). No Redis dependency in phase 1 → stateless and Vercel-friendly. Redis-backed session revocation is a phase-3 upgrade.
- **Passwords:** `bcryptjs` (pure JS — avoids native build failures on Windows/CI).
- **Phone OTP:** `OtpToken` table with `hashedCode`, `expiresAt`, `attempts`. Provider interface with a `console` dev provider (prints OTP to server log) and a real SMS adapter stub. **OTP is hashed at rest and rate-limited.**
- **Guest checkout:** `Cart` and `Order` may exist with `userId = null`, keyed by a signed cart cookie. On login, guest cart is merged.

---

## 5. Checkout flow

```
Cart (server-validated)
  → POST /api/checkout/quote        ← recalculates price, tax, shipping server-side
      ├─ pincode serviceability (PincodeRule + Shiprocket)
      ├─ coupon validation
      └─ COD eligibility (amount cap, pincode rules)
  → POST /api/checkout/order        ← creates Order (status PENDING) inside a transaction
      ├─ decrement stock with optimistic guard (stock check + update in one tx)
      └─ create Payment (PENDING)
  → Razorpay: create order → client checkout → webhook/payment verify
      or COD: mark CONFIRMED immediately
  → post-payment: Order PAID → invoice PDF → confirmation email → Shiprocket push
```

**Critical invariants:**
- **Never trust client-sent prices.** The quote endpoint recomputes from DB and returns a signed quote id; the order endpoint verifies it.
- **Stock is decremented inside a transaction with a conditional update** (`WHERE stock >= qty`), so two concurrent buyers cannot oversell the last piece. Verified by a concurrency unit test.
- **Idempotency:** `Order.idempotencyKey` unique — protects against double-submit and Razorpay webhook retries.

---

## 6. Returns / exchanges (first-class)

`Return` has `kind: REFUND | EXCHANGE`, plus `requestedVariantId` for size exchanges.

Size exchange flow:
```
Customer requests exchange (order item + desired size)
  → validate: within window (config), item not already exchanged, desired size in stock
  → create Return(kind=EXCHANGE, status=REQUESTED)
  → ops approves → reserve replacement stock
  → reverse pickup created (Shiprocket) → on receipt, ship replacement
```

Refund flow is separate and hits Razorpay refund API. Both write `AuditLog` rows.

---

## 7. Shipping

`ShiprocketAdapter` interface:
- `checkServiceability(pincode, weightGrams, cod)` → `{ serviceable, etaDays, courier, codAvailable }`
- `createShipment(order)` → `{ awb, courier, trackingUrl }`
- `cancelShipment(id)`
- `parseWebhook(payload)` → normalised `ShipmentEvent`

RTO handling: a shipment status of `RTO_*` transitions `Order.status = RTO`, **restocks inventory** and triggers a customer email. Webhook is signature-verified.

---

## 8. Error handling & logging

- `AppError` class with `code`, `httpStatus`, `userMessage`, `context`. Services throw these; a single handler maps them to responses.
- **Never leak stack traces or Prisma errors to the client.** Logged server-side with a correlation id.
- Structured logger (`src/server/logger.ts`) — JSON lines, level from env. Adapter for Sentry is stubbed behind an interface (error tracking in Phase 8).
- Route-level `error.tsx` and a global `not-found.tsx`.

---

## 9. Testing strategy

| Layer | Tool | What it proves |
|---|---|---|
| Tax engine | Vitest | GST per-piece slabs, HSN mapping, rounding |
| Money utils | Vitest | paise conversions, no float drift |
| Stock concurrency | Vitest (real DB) | no oversell under parallel orders |
| Coupon rules | Vitest | min spend, expiry, usage caps |
| Exchange eligibility | Vitest | window, stock, double-exchange guards |
| Critical user journey | Playwright | browse → filter → cart → pay → track → exchange |

**No fabricated results.** If a test cannot run in this environment, it is recorded in `BLOCKERS.md` and reported — not marked passing.

---

## 10. SEO

- Per-route `generateMetadata()` with canonical, OG, Twitter.
- JSON-LD: `Organization`, `WebSite`, `BreadcrumbList`, `Product` (+ `offers`, `hasMerchantReturnPolicy`, `shippingDetails`), `ItemList`.
- `app/sitemap.ts` and `app/robots.ts` generated dynamically from DB.
- Semantic HTML, one `<h1>` per page, descriptive alt text.
- Faceted URLs canonicalise to the parent category (prevents crawl bloat).

---

## 11. Security headers

Set in `next.config.mjs`: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and a CSP (report-only first, then enforced in Phase 8).

---

## 12. Environment variables

Grouped in `.env.example`:
`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `STORAGE_DRIVER`, `S3_*` / `CLOUDINARY_*`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `GST_LEGAL_ENTITY_NAME`, `GST_GSTIN`, `GST_STATE_CODE`, `SELLER_STATE`, `LOG_LEVEL`.

Validation: **`env.ts` parses with Zod at boot and fails fast** with a readable list of missing vars. No `process.env.X!` scattered through the codebase.
