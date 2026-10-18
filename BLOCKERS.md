# BLOCKERS — ecomerce-store

Open issues that need a human decision or that block full verification.
Format: `BLK-nnn` · severity · status · what I did instead (never left idle).

---

## BLK-001 · HIGH · OPEN — `D:\ecommerce store` is not writable

**Symptom**
```
Set-Content -LiteralPath 'D:\ecommerce store\.__probe'
→ UnauthorizedAccessException: Access to the path is denied.
```
Also denied writing to `D:\` root. This is an **OS-level ACL/permission** denial, not the DSH sandbox message format.

**Impact.** The brief's specified PROJECT_DIR cannot be used.

**What I did instead.** Built in `E:\automation\ecommerce-store` (workspace-writable). All repo paths are relative, so relocating later is a `robocopy` with no code changes.

**Decision needed.** Either (a) accept `E:\automation\ecommerce-store`, or (b) grant write permission to `D:\ecommerce store` (or map a writable drive) and tell me — I'll move the repo.

---

## BLK-002 · MEDIUM · OPEN — Docker is not installed

**Symptom.** `Get-Command docker` returns nothing; `docker compose version` produces no output.

**Impact.** The DoD requires "`docker compose up` → seeded store runs locally". I can **write** `Dockerfile` + `docker-compose.yml`, but I **cannot execute or verify** them here. I will not claim they work.

**What I did instead.** Providing a verified no-Docker path via `scripts/dev-db.ts` (embedded Postgres) so migrations + seed can actually be run and proven.

**Decision needed.** Install Docker Desktop (requires your action; I will not install globally without approval — gate #4), or accept the embedded-Postgres dev path and treat Compose as deploy-time-only.

---

## BLK-003 · LOW · OPEN — pnpm unusable in this environment

**Symptom.** Every `pnpm add` fails with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, including with explicit `--store-dir`.

**Impact.** Minor; npm works.

**What I did instead.** Standardised on npm (ADR-002).

**Decision needed.** None, unless you specifically require pnpm lockfiles for your CI.

---

## BLK-004 · HIGH · ⚠️ NEEDS CONFIRMATION — GST slabs in the brief are outdated

**The brief says:** *"GST slab logic (5% under ₹1000, 12% above)"*

**Current law (since 22 September 2025, 56th GST Council):**
- Apparel **≤ ₹2,500 per piece → 5%**
- Apparel **> ₹2,500 per piece → 18%**
- Concessional threshold raised from ₹1,000 to ₹2,500 per piece; the 12% slab was removed.

Source: Ministry of Finance, Lok Sabha Unstarred Q. No. 2509 (15 Dec 2025) — https://taxguru.in/goods-and-service-tax/gst-garments-rs-2500-raised-18-percent-rationalise-tax-structure.html

**Why this matters.** Tax invoices are a hard requirement in this brief. Implementing the brief literally would generate **incorrect GST invoices** — a real compliance defect, not a style preference.

**What I did instead.** Implemented the **current** law as the default, in a **data-driven, date-versioned** rate table (`ADR-004`), so the old 5%/12% behaviour is a config switch away.

**Decision needed.** Confirm one of:
1. **Use current law (5% ≤₹2,500 / 18% >₹2,500)** — recommended, no change required.
2. Use the brief's legacy slabs (5% / 12% at ₹1,000) — I flip a config value, and we note the invoices are non-compliant.

---

## BLK-005 · MEDIUM · OPEN — No API credentials (by design)

Razorpay, Shiprocket, Resend and object-storage credentials are **not** present. Per approval
gate #1 the integrations are built against the documented request/response shapes and are
**feature-flagged off**, rather than being faked.

**Current behaviour without keys (Phase 4)**
- **Prepaid checkout**: the option is visible but disabled; submitting it returns
  "Online payment is not enabled yet. Please choose cash on delivery."
- **COD**: fully functional end to end — verified by 34 integration assertions.
- **Email**: the console provider logs instead of sending. `EMAIL_ENABLED=true` without a
  key throws rather than pretending a confirmation went out.
- **Shiprocket**: not wired yet (Phase 5).

**Verified without keys.** Payment and webhook signature verification are pure functions and
are unit-tested with a locally generated HMAC secret, including forged signatures, wrong
secret, wrong payment id and tampered webhook bodies. The webhook rejects unsigned payloads
with 400 (confirmed over HTTP).

**Decision needed.** Supply **test-mode** Razorpay keys (plus a Resend key, and Shiprocket
credentials when reaching Phase 5) to complete live verification. Until then prepaid stays
visibly disabled — I will not enable an unverified payment path.

---

## BLK-009 · ✅ RESOLVED — Migrations and seed had never been executed

**Resolution.** Introduced `embedded-postgres` as a devDependency (no Docker, no global
install). `npm run dev:db` starts a real PostgreSQL 18 cluster on port 5433 with the data
directory inside the repo.

Executed and verified:
- `prisma migrate deploy` → `0001_init` applied
- `prisma migrate dev --name user_email_optional` → second migration created + applied
- `npm run db:seed` → 40 products, 480 variants, 435 in stock, 3 coupons, 6 pincode rules
- Seed re-run → **identical counts (idempotent)**
- `server_encoding` = **UTF8**; `₹` + Devanagari round-trip PASS (transaction rolled back)

Two genuine defects were found by doing this (both fixed): a UTF-8 BOM in `migration.sql`
that Postgres rejected, and a cluster created with the Windows locale (WIN1252) that
could not store non-ASCII text.

**Remaining caveat.** This is a *development* database inside the repo. Production still
needs a managed Postgres (Neon/Supabase) — that is a deployment decision, not a blocker.

---

## BLK-011 · MEDIUM · OPEN — No browser automation, so UI interactions are verified below the click layer

**Context.** Phase 3 adds an add-to-cart flow implemented as a React Server Action bound to
a form. The built-in browser cannot expose CDP in this environment (`chrome did not expose
CDP within 30s`), and headless Chrome is only usable for screenshots — there is no driver
to click a button and observe the result.

**Impact.** The following are verified:
- pages render with real data (32-assertion HTTP smoke)
- cart DB operations (14-assertion integration test against Postgres)
- types, build, and that the action is correctly bound in the rendered HTML

The following is **not** verified: actually clicking "Add to cart" in a browser and landing
on `/cart` with the item present. That gap is real but narrow — the action delegates to the
integration-tested cart core.

**What I did instead.** Split the cart into `cart-core.service` (pure, DB-testable) and a
thin cookie-aware wrapper so the business logic is exercised directly rather than assumed.

**Decision needed.** None now. Playwright in Phase 8 provides true browser E2E; if you want
it sooner, that phase can be pulled forward.

---

## BLK-010 · MEDIUM · OPEN — Rate limiting is in-process and trusts `x-forwarded-for`

**Context.** `src/server/http.ts` implements a fixed-window limiter held in a module-level
`Map`, keyed by an IP taken from `x-forwarded-for`.

**Two limitations:**
1. **Per-process only.** On Vercel/serverless each instance has its own map, so limits are
   per-instance rather than global. Redis-backed limiting is the phase-3 fix.
2. **`x-forwarded-for` is trusted blindly.** Safe behind Vercel/a proxy that overwrites the
   header. If the app is ever exposed directly, a client can spoof the header and evade
   limits. The smoke test relies on this to simulate distinct clients.

**Mitigations already in place.** OTP is additionally attempt-capped and single-use at the
database level, so brute-forcing a 6-digit code is bounded regardless of IP limits.

**Decision needed.** None now; must be fixed before public launch (phase 8 hardening).

---

## BLK-007 · MEDIUM · OPEN — Mobile layout unverified (headless Chrome clamps viewport)

**Symptom.** Rendering `http://127.0.0.1:3000/` with `--window-size=390,844` produced a
390 px-wide image, but the page had clearly laid out at a wider viewport: text was clipped
mid-word and the header nav ran off-screen. Requesting 360/390/412 gave the same result in
both `--headless` and `--headless=new`.

**Diagnosis.** Chrome enforces a minimum OS window width on Windows, so the *layout*
viewport is wider than the requested size and the screenshot is a crop. This is a capture
limitation, not proof of a CSS overflow — but I could not distinguish the two, so I am not
claiming mobile works.

**Impact.** Mobile-first is a stated non-negotiable. Desktop rendering is verified; mobile
is not. Misleading "mobile" screenshots were deleted rather than shipped.

**What I did instead.** Took only the verifiable desktop capture, and pre-emptively hardened
the header (`shrink-0`, tighter mobile gaps) and added an `overflow-x-hidden` guard on
`body`.

**Decision needed.** None now — Playwright device emulation in Phase 8 provides true
viewport control and will verify this properly. Flagged so it is not forgotten.

---

## BLK-008 · MEDIUM · OPEN — Sandbox blocks child-process spawning

**Symptom.** Under the default confined mode, anything that spawns a child process with
piped stdio fails with `EPERM`:

- `npm install` (lifecycle scripts) → `spawn EPERM`
- `prisma generate` (generator child process) → `spawn EPERM`
- `vitest` (`esbuild` service) → `spawn EPERM`
- `next build` (build workers) → `spawn EPERM`
- headless Chrome (renderer processes) → `spawn EPERM`

**Impact.** Local verification and the dev server require a full-access escalation per
invocation. **CI (GitHub Actions) is unaffected** — it runs unconfined and will exercise the
normal path.

**What I did instead.** Ran installs with `--ignore-scripts` (which succeeds) and used
single, explicit full-access escalations for each verification step. Nothing was skipped —
subsequent phases will need the same escalations, or CI to do the running.

**Decision needed.** Either accept per-command escalation prompts, or run the toolchain
yourself / via CI. I will not silently skip verification to avoid the prompts.

---

## BLK-006 · LOW · OPEN — Brand name looks like a placeholder

`ecomerce-store` (sic — "ecommerce" is misspelled) is the confirmed brand name per the Phase 0 gate. It will appear on the storefront, invoices, and emails.

**Impact.** Cosmetic/credibility, zero technical impact. Changing later is a `site.ts` edit plus a find-and-replace.

**Decision needed.** None required; flagged once so it is a conscious choice.
