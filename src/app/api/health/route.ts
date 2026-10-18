import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * Liveness + readiness probe.
 * Used by the Docker healthcheck and by uptime monitoring after deploy.
 * Deliberately returns 503 when the database is unreachable — a health check
 * that passes without a database is worse than none.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        db: 'down',
        error: error instanceof Error ? error.message : 'unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
