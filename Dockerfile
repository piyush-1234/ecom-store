# =============================================================================
# ecomerce-store — production image
# Multi-stage build using Next.js standalone output.
#
# NOTE: Docker is not installed in the environment this was authored in, so this
# file is a careful-by-construction deliverable and is NOT runtime-verified here.
# See BLOCKERS.md BLK-002.
# =============================================================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---------------------------------------------------------------------------
# 1. Dependencies
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma needs a syntactically valid URL at generate-time; it does not connect.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# 3. Runtime
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone server + static assets + public files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma engine + schema must ship with the runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
