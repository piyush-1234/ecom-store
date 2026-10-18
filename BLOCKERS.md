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

Razorpay, Shiprocket, Resend, and object storage credentials are **not** present. Per approval gate #1, I will build against the **official test-mode shapes** with adapter stubs and `.env.example`, and will not use real keys.

**Impact.** Payment capture, shipment creation, email delivery, and image upload remain **unverified end-to-end** until test keys are provided.

**Decision needed.** Supply **test-mode** credentials when you reach Phase 4/5, or accept stubbed integrations with contract tests.

---

## BLK-009 · HIGH · OPEN — Migrations and seed are written but never executed

**Symptom.** No PostgreSQL server and no Docker on this machine, so there is nothing for
`prisma migrate deploy` / `prisma db seed` to connect to. `GET /api/health` correctly
returns `503 { db: "down" }`.

**Impact.** The data model, migration SQL and seed script exist and typecheck, but **zero
rows have ever been written**. The seed summary in the Phase 1 report is the *designed*
dataset, not a verified row count. Phase 2 (auth) cannot be meaningfully built or tested
without a database either — this blocks the rest of the project, not just Phase 1.

**What I did instead.** Generated the migration SQL without a database using
`prisma migrate diff --from-empty --to-schema-datamodel` (19 tables, 19.6 KB), and
verified everything that does not need a connection: client generation, types, unit
tests, production build, HTTP render.

**Decision needed — pick one:**
1. Install Docker Desktop and run `docker compose up --build` (also verifies `BLK-002`), or
2. Give me a Postgres connection string (Neon/Supabase free tier is fine) — I will run
   `migrate deploy` + `seed` and report real row counts, or
3. Confirm you want the embedded-Postgres dev path and I will add it and verify it.

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
