import { NextResponse } from 'next/server';
import { destroySession } from '@/server/auth/session-cookie';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
