import { NextResponse, type NextRequest } from 'next/server';
import { loginSchema } from '@/lib/validators/auth';
import { loginUser } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session-cookie';
import { clientIp, parseJson, rateLimit } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Brute-force guard: 10 attempts per IP per minute, on top of per-account
    // timing equalisation in the service.
    rateLimit(`login:${clientIp(request)}`, 10, 60_000);

    const input = await parseJson(request, loginSchema);
    const user = await loginUser(input);

    await createSession({ id: user.id, email: user.email ?? '' });

    return NextResponse.json({ data: { user } });
  } catch (error) {
    return errorResponse(error);
  }
}
