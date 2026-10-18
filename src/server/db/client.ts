import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * Next.js dev mode hot-reloads modules, which would otherwise open a new pool on
 * every reload until Postgres refuses connections. Caching on `globalThis`
 * keeps a single client across reloads.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
