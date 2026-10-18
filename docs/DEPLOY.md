# DEPLOY — ecomerce-store

**Status: runbook written, deployment NOT executed.**
Executing any of this requires explicit approval (approval gate #2). Nothing here has been
run against a public environment.

---

## 0. Approval gates that apply to this document

| Gate | Meaning here |
|---|---|
| #1 Real API keys | Razorpay, Shiprocket and Resend must be **test-mode** until you clear them |
| #2 Public deployment / domain | Everything in §9–§12 |
| #3 Destructive DB operations | `prisma migrate reset`, dropping a production database |
| #4 Global installs | Not required for this stack |

---

## 1. Target architecture

| Concern | Service | Notes |
|---|---|---|
| App | Vercel (Next.js 14 App Router) | Serverless; no sticky sessions, stateless JWT sessions |
| Database | Neon or Supabase (PostgreSQL 16+) | **Pooled URL for runtime, direct URL for migrations** |
| Images | Cloudinary or S3 (`STORAGE_DRIVER`) | `local` is rejected for production by preflight |
| Email | Resend | Requires a verified sending domain |
| Payments | Razorpay | UPI / cards / netbanking / wallets + COD |
| Shipping | Shiprocket | Serviceability, AWB, webhook status sync |

---

## 2. Preflight (do this first, every time)

```bash
node scripts/preflight.mjs              # local / staging
node scripts/preflight.mjs --production # launch gate: fails on placeholders and dev secrets
```

It checks, and **exits non-zero on**:

- missing or development `AUTH_SECRET` (must be ≥ 32 chars, freshly generated)
- `NEXT_PUBLIC_APP_URL` missing, non-HTTPS, or pointing at localhost
- placeholder `GST_LEGAL_ENTITY_NAME` / `GST_GSTIN` — invoices would be legally invalid
- database unreachable, or a migration recorded but unfinished
- `STORAGE_DRIVER=local` in production (non-durable storage)
- `RAZORPAY_ENABLED` or `EMAIL_ENABLED` false in production

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 3. Provision the database

1. Create a Neon (or Supabase) project in `ap-south-1` / the closest India region.
2. Copy both connection strings:
   - **Pooled** → `DATABASE_URL` (add `?sslmode=require&pgbouncer=true` for Neon pooled)
   - **Direct** → `DIRECT_URL` (migrations only; DDL through a transaction pooler fails)

The Prisma datasource declares both (`url` + `directUrl`), so `migrate` automatically uses the
direct connection while the app uses the pooler.

> Keep `DIRECT_URL` out of the Vercel runtime if you like — it is only needed by the migration
> step. It is harmless to set it there (unused at runtime).

---

## 4. Apply migrations (before the new code serves traffic)

Run from your machine or CI, **not** from a Vercel build step:

```bash
export DATABASE_URL="<pooled>"
export DIRECT_URL="<direct>"

npx prisma migrate deploy     # applies committed migrations only, never invents schema
npx prisma migrate status     # confirm "Database schema is up to date!"
```

**Order matters.** Migrations must be backwards compatible with the currently-deployed code:

1. migrate first when the change is additive (new nullable column, new table) — old code keeps working
2. deploy first only when the change is destructive (drop/rename) and the old code no longer uses it

All migrations in this repo are additive so far, so **migrate → deploy** is safe.

**Never** run `prisma migrate reset` against anything but a local database (approval gate #3).

---

## 5. Seed the catalogue (first deployment only)

```bash
npx prisma db seed
```

Creates: 2 categories, 40 products / 480 variants, 3 coupons, 6 pincode rules, and an admin
user. The seed is **idempotent** — safe to re-run.

Admin seeding rules:

- outside production it creates `admin@ecomerce-store.local` with a development password
- in production it **skips** unless `ADMIN_SEED_PASSWORD` is set (and never overwrites an
  existing admin's password)

```bash
ADMIN_SEED_EMAIL="you@yourdomain.com" ADMIN_SEED_PASSWORD="<strong-password>" npx prisma db seed
```

Then sign in at `/admin/login` and **change nothing about the demo catalogue you plan to keep**
— edit or deactivate products from `/admin/products`.

---

## 6. Configure Vercel

Project settings:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Build command | `prisma generate && next build` (already the `build` script) |
| Install command | `npm ci` |
| Node version | 20.x or 22.x |
| Region | Mumbai (`bom1`) if available, else nearest to your database |

Environment variables (Production + Preview):

```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://yourdomain.com
AUTH_SECRET=<fresh 32-byte secret>
DATABASE_URL=<pooled>
DIRECT_URL=<direct>

GST_LEGAL_ENTITY_NAME=<registered legal name>
GST_GSTIN=<15-char GSTIN>
GST_SELLER_STATE=<state>
GST_SELLER_STATE_CODE=<2-digit code, e.g. 27>

RAZORPAY_ENABLED=true
RAZORPAY_KEY_ID=rzp_live_...        # test keys until gate #1 clears
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

SHIPROCKET_ENABLED=true
SHIPROCKET_EMAIL=...
SHIPROCKET_PASSWORD=...
SHIPROCKET_WEBHOOK_TOKEN=<random string; also configured in Shiprocket>

EMAIL_ENABLED=true
RESEND_API_KEY=re_...
EMAIL_FROM="ecomerce-store <orders@yourdomain.com>"

STORAGE_DRIVER=cloudinary           # or s3
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

ERROR_WEBHOOK_URL=<optional error sink>
```

`NEXT_PUBLIC_*` values are baked at build time — changing `NEXT_PUBLIC_APP_URL` requires a
redeploy, not just an env edit.

---

## 7. Configure the integrations

### Razorpay
1. Dashboard → Settings → API Keys → generate **test** keys first.
2. Settings → Webhooks → add `https://yourdomain.com/api/payments/razorpay/webhook`
   - events: `payment.captured`
   - secret → `RAZORPAY_WEBHOOK_SECRET`
3. Keep `RAZORPAY_ENABLED=false` until keys are in place: prepaid checkout is refused with a
   clear message rather than failing at payment time.

The webhook is the source of truth — a closed browser tab must not lose a captured payment.

### Shiprocket
1. Create the account, note the pickup location name (`SHIPROCKET_PICKUP_LOCATION`, default `Primary`).
2. Settings → Webhooks → `https://yourdomain.com/api/shipping/shiprocket/webhook`,
   token = `SHIPROCKET_WEBHOOK_TOKEN`.
3. Shiprocket sends that token in `x-api-key`; the route returns **503** if no token is
   configured and **401** on a mismatch. Unsigned traffic is never processed.

### Resend
1. Add and verify your sending domain (SPF + DKIM DNS records).
2. Set `EMAIL_FROM` to an address on that verified domain, or delivery fails.

---

## 8. Domain and DNS

1. Vercel → Domains → add `yourdomain.com` and `www`.
2. At your registrar: `A`/`ALIAS` to Vercel as instructed; `CNAME www` → `cname.vercel-dns.com`.
3. Wait for the certificate to be issued (automatic).
4. Set `NEXT_PUBLIC_APP_URL` to the final HTTPS origin and **redeploy** (build-time value).
5. Confirm HSTS/HTTPS by loading `/api/health` over `https://`.

---

## 9. Post-deploy verification

Run these against the deployed origin, in order:

```bash
# 1. liveness + database
curl -s https://yourdomain.com/api/health | jq
#    expect {"status":"ok","db":"up",...}

# 2. security headers present
curl -sI https://yourdomain.com/ | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type'

# 3. SEO surface
curl -s https://yourdomain.com/robots.txt
curl -s https://yourdomain.com/sitemap.xml | head

# 4. HTTP suites (safe: they create a test account and a COD order)
node scripts/smoke-store.mjs https://yourdomain.com
node scripts/smoke-auth.mjs  https://yourdomain.com
node scripts/smoke-admin.mjs https://yourdomain.com
```

> `smoke-store` / `smoke-auth` / `smoke-admin` create real rows. On production, either accept
> a test order and cancel it from `/admin/orders`, or point them at a staging deployment.

**Manual, must-do before announcing:**

1. Place a **real COD order** yourself, end to end, on a phone.
2. Open the confirmation email, click **Download GST invoice** — check the GSTIN, HSN codes,
   the CGST/SGST split and that the totals match the order.
3. In `/admin/orders`, mark it packed, then cancel it and confirm stock returned.
4. Trigger a Razorpay test payment; confirm the order flips to `PAID` and the webhook fires.
5. Create a shipment, receive the webhook, confirm the tracking timeline updates.
6. Request a size exchange as a customer; approve and complete it in `/admin/returns`.

---

## 10. Rollback

| Situation | Action |
|---|---|
| Bad deploy, DB unchanged | Vercel → Deployments → **Promote** the previous build (instant, no rebuild) |
| Bad deploy + bad additive migration | Promote the previous build first (old code tolerates new columns), then fix forward |
| Data corruption | Neon/Supabase point-in-time restore; then `migrate deploy` to the target schema |
| Integration misbehaving | Set `RAZORPAY_ENABLED=false` / `SHIPROCKET_ENABLED=false` and redeploy — the app degrades to COD + manual fulfilment instead of failing |

Migrations are **forward-only** by design. Do not hand-write down-migrations in production;
restore and re-migrate instead.

---

## 11. Monitoring and backups

| What | How |
|---|---|
| Uptime | Ping `https://yourdomain.com/api/health` every minute; it returns **503 when the DB is down** |
| Errors | `ERROR_WEBHOOK_URL` receives structured JSON (`route`, `code`, `message`, `stack`) |
| Backups | Neon/Supabase automated backups + PITR; verify the retention window matches your tolerance |
| Database size | Watch the `public` schema size; orders + audit logs grow forever |
| Logs | Vercel runtime logs for 500s; correlate with the error webhook payload |

Suggested alerts: health non-200 for 2 minutes · 5xx rate > 1% · p95 > 2s · payment webhook
failures · migration status not current.

---

## 12. Security checklist

- [ ] `AUTH_SECRET` is unique to production and not in git
- [ ] `.env` never committed (`git check-ignore .env` → ignored)
- [ ] Razorpay webhook secret set; unsigned webhooks return 400
- [ ] Shiprocket webhook token set; unsigned returns 401
- [ ] `STORAGE_DRIVER` is not `local`
- [ ] Database accepts only TLS connections
- [ ] Admin password is strong and not the seeded development value
- [ ] `robots.txt` disallows `/account`, `/cart`, `/checkout`, `/search`, `/api/`
- [ ] Invoice URLs are token-gated (no token → 404)

---

## 13. Go-live checklist

- [ ] `node scripts/preflight.mjs --production` passes with zero FAILs
- [ ] `npx prisma migrate status` → up to date
- [ ] Health endpoint green from outside India and inside India
- [ ] One real COD order placed and cancelled successfully
- [ ] One Razorpay test payment captured
- [ ] Invoice PDF verified against the GSTIN
- [ ] Support inbox (`support@…`) receives a test email
- [ ] `/admin` reachable with a real staff account; demo admin removed or disabled
- [ ] Error webhook receiving events
- [ ] Sitemap submitted in Google Search Console

---

## 14. Known limitations before public launch

These are recorded, not hidden:

| # | Limitation | Impact | Owner action |
|---|---|---|---|
| 1 | **GST slab rule unconfirmed** (`BLK-004`) | Invoices use current law (5% ≤ ₹2,500, 18% above). If that is wrong, every invoice is wrong | Confirm with your CA |
| 2 | **Prepaid disabled without keys** (`BLK-005`) | Only COD works; checkout says so plainly | Supply test-mode Razorpay keys |
| 3 | **Gateway refunds not wired** | Refunds are recorded locally and settled manually | Needs Razorpay keys |
| 4 | **Shiprocket adapter unverified** | Adapter follows the documented API but has never run against the real service | Supply credentials + one sample webhook payload |
| 5 | **Rate limiting is per-process** (`BLK-010`) | Limits reset per serverless instance | Add Redis (Upstash) before scale |
| 6 | **CSP allows `'unsafe-inline'`** (`BLK-013`) | Weaker XSS defence than a nonce policy | Nonce CSP via middleware |
| 7 | **Mobile layout verified at 393 px only** | Larger phones/tablets less exercised | Playwright device matrix |

---

## 15. What was actually verified while building this

For honesty about this runbook's own status:

- `npx prisma migrate deploy` and `prisma migrate status` — **executed** against a local
  PostgreSQL 18 instance (3 migrations, schema in sync)
- `node scripts/preflight.mjs` — **executed**; correctly fails in production mode on the
  current placeholders
- `docker compose up` — **never executed** (Docker is not installed here), see `BLK-002`
- Vercel deploy, DNS, Razorpay/Shiprocket/Resend live calls — **not executed** (approval gate #2
  and missing credentials)
