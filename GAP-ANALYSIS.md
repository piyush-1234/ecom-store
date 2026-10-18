# GAP-ANALYSIS — from current state to launch-ready

**Input:** `STATE.md` (audit run 2026-10-18, HEAD `6539239`)
**Scope:** every gap between verified state and the brief's production bar for a
t-shirts-and-jeans-only, India, single-vendor store.

**Effort scale** (one engineer already familiar with this codebase):
`S` ≤ half a day · `M` 1–3 days · `L` > 3 days
**Risk** = chance of breaking working behaviour, or legal/commercial exposure if shipped wrong.

---

## 1. Blocking decisions (needed before code)

| # | Decision | Why it blocks | My recommendation |
|---|---|---|---|
| D1 | **GST slab rule** — code implements 5% ≤ ₹2,500 / 18% above; the original brief said 5% < ₹1,000 / 12% above | Every invoice and every price in the catalogue depends on it. Getting it wrong is a tax-compliance defect, not a UI bug. | 5%/18% at ₹2,500 is current law (post 22-Sep-2025). **Confirm with your CA.** |
| D2 | **Brand name** — `ecomerce-store` is misspelled (`ecommerce`) | Appears in page titles, invoices, emails, the admin header, `site.ts`. Renaming later touches SEO, domain, GST invoice header, and possibly a trademark. | Pick a real brand now, before any deployment. 30-minute decision, one-day change. |
| D3 | **Auth library** — brief says Auth.js v5; repo uses custom `jose` + `bcryptjs` | A migration is `L` effort, high risk, and would touch the 222 passing tests. | **Keep the custom auth.** It works, is tested, and is simpler. Update the brief instead. |
| D4 | **Docker Compose** — unverified; installing Docker needs approval gate #4 | Only matters if you intend to self-host. Vercel + managed Postgres needs no Docker. | Defer. Keep npm path canonical. |

---

## 2. Gap register

Ordered by category, with dependency order in §3.

### Commerce

| ID | Gap | Current state | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| G1 | **GST rate rule unconfirmed** (STATE C15) | 5%/18% @₹2,500 implemented, data-driven, unit-tested | S | **High** (legal) | D1 |
| G2 | **Razorpay not enabled end-to-end** | Real REST client, signature verify, `/verify` + `/webhook` routes; `RAZORPAY_ENABLED=false`; never run with keys | S–M | Med | Test keys (gate #3) |
| G3 | **Gateway refunds missing** | `completeRefund` records locally only; no Razorpay refund call | M | Med | G2 |
| G4 | **Shiprocket never executed** | Real client + gated webhook + status mapping (32 unit tests); no live call, no captured payload | M | Med | Credentials (gate #3) |
| G5 | **Coupon editing missing** | Admin can create + activate/deactivate only; no edit of value/window/limits | S | Low | — |
| G6 | **Search does not include SKU** | `catalog.service.ts` L181-185 searches name, shortDesc, description, fit, fabric — no SKU | S | Low | — |
| G7 | **Wishlist absent** | No model, no UI, zero source hits | M | Low | Migration (gate #4) |
| G8 | **Size chart not per-PDP** | Standalone `/size-chart` page with hardcoded `TEE_SIZES`/`JEAN_SIZES`; PDP links out, no modal | S | Low | — |
| G9 | **Phone OTP provider stub only** | Console provider; MSG91/Twilio throw "not implemented" | S (stub) / M (real) | Low | Gate #3 for real SMS |
| G10 | **Image upload absent** | Admin sets an `imageUrl` string; no storage adapter despite `STORAGE_DRIVER`/`S3_*`/`CLOUDINARY_*` env slots. Edit page cannot change images at all | M | Med | Gate #2 if a storage SDK is added |

### Auth & account

| ID | Gap | Current state | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| G11 | **Auth.js mismatch** | Custom sessions, separate admin cookie/audience, 12h admin TTL | L if migrating | **High** | D3 |
| G12 | Guest checkout | **Already works** — verify only, do not rebuild | — | — | — |

### Storefront / content

| ID | Gap | Current state | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| G13 | **Legal pages missing** — Terms, Privacy, Returns/Exchange, Shipping, Contact | None exist. **Consumer Protection (E-Commerce) Rules 2020 require seller details + a grievance officer with contact + policy pages.** | S | **High** (legal) | D2 |
| G14 | **Analytics missing** | Zero GA4/Pixel code; env vars sit unused in `.env.example` | S | Low | — |
| G15 | **Email templates incomplete** | Order confirmation only; no shipped / delivered / return-approved | M | Low | G4 for shipping events |
| G16 | **Featured merchandising** | All four featured products are jeans (createdAt ordering); 8 products flagged featured | S | Low | — |

### Admin

| ID | Gap | Current state | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| G17 | **Pincode rules CRUD missing** | Model + seed only; no admin route (grep shows no admin pincode code) | S | Low | — |
| G18 | Admin product/variant/stock/orders/coupons-create | **Exist** — verify only | — | — | — |

### Quality bar (must actually run)

| ID | Gap | Current state | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| G19 | **Lighthouse evidence not persisted** | Measured last round (90/97/93 perf) but written to gitignored `.lighthouse/`; brief requires `docs/lighthouse/home.json` | S | Low | — |
| G20 | **Playwright not re-run on this build** | 13 tests passed previously (commit `9d340a1`); needs re-run + recorded output | S | Low | Migrations free of schema change |
| G21 | **Docker Compose never executed** | Exists, unverified | M | Med | Docker install (gate #4) |

### Hardening / ops

| ID | Gap | Current state | Effort | Risk | Depends on |
|---|---|---|---|---|---|
| G22 | **Preflight does not load `.env`** | Bare run fails on missing vars and cannot distinguish "unset" from "placeholder" | S | Low | — |
| G23 | **Preflight lacks `.env.example` completeness check** | Not implemented | S | Low | — |
| G24 | **Seed admin falls back to a hardcoded password** outside production | `seed.ts` L448 `password ?? 'admin-dev-password-1'` | S | Low (DX) | — |
| G25 | **Rate limiting is per-process** | In-memory `Map`, trusts `x-forwarded-for`; OTP also DB-attempt-capped | S (harden) / M (Redis) | Med | Gate #2 for Redis client |
| G26 | **Zod coverage on mutating routes** | Present on auth/checkout/admin actions; **not audited route-by-route in this pass** | S to audit, S–M to close | Med | — |
| G27 | **Env validation at startup** | `lib/env.ts` validates lazily on first use, throws with all missing keys | S to make eager | Low | — |
| G28 | **No cron jobs** | Dep audit / backup / link check / weekly E2E absent | M | Low | After Part C |
| G29 | **Legal/compliance disclosures** | No grievance officer page, no seller identity block in the footer | S | **High** (legal) | G13 |

---

## 3. Recommended execution order

**Wave 0 — decisions (no code): D1 GST, D2 brand, D3 auth.** Everything below assumes these.

**Wave 1 — legal + cheap correctness (highest risk per hour spent)**
`G13` legal pages → `G29` grievance officer/seller block → `G22` preflight loads `.env` →
`G23` `.env.example` completeness → `G24` seed password → `G1` GST (flip after D1).

**Wave 2 — commerce correctness already half-built**
`G6` SKU search → `G5` coupon edit → `G17` pincode CRUD → `G8` size-chart modal → `G16` featured order.

**Wave 3 — integrations (needs test keys, approval gate #3)**
`G2` Razorpay certified in test mode → `G3` gateway refunds → `G4` Shiprocket with a captured
payload → `G9` OTP provider stub behind the existing interface.

**Wave 4 — features that need a migration (approval gate #4)**
`G7` wishlist (new model, forward-only migration, back up `.pgdata/` first).

**Wave 5 — evidence + hardening**
`G19` Lighthouse → `docs/lighthouse/` → `G20` Playwright re-run → `G14` analytics →
`G15` email templates → `G25` rate limiting → `G26` Zod audit → `G27` eager env validation.

**Wave 6 — optional**
`G10` image upload (needs a dependency decision) → `G21` Docker Compose → `G28` cron jobs.

---

## 4. What I will not touch without your explicit go-ahead

- Any Prisma schema change (G7 wishlist) — gate #4; `.pgdata/` backed up first.
- Any new top-level dependency (storage SDK, Redis client, SMS SDK) — gate #2.
- Real API keys of any kind — gate #3.
- `prisma migrate reset` or any destructive DB command — gate #6.
- The brand string, until you pick a name — D2.

---

## 5. Honest risk ranking

| Rank | Risk | Why it matters most |
|---|---|---|
| 1 | **GST rule wrong** (G1/D1) | Every invoice is a legal document. Wrong slab = wrong tax collected. |
| 2 | **No legal pages / no grievance officer** (G13/G29) | Indian e-commerce rules require these *before* taking orders. Cheap to fix, embarrassing to omit. |
| 3 | **Razorpay never certified** (G2) | Prepaid is disabled; the store can take only COD today. |
| 4 | **Brand typo shipping to customers** (D2) | Touches invoices, emails, SEO, domain. Cheapest to fix now. |
| 5 | **Shiprocket never run** (G4) | Orders would be fulfilled manually; tracking stays "awaiting pickup". |

Everything else is polish, evidence, or quality-of-life.
