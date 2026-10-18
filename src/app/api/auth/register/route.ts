import { NextResponse, type NextRequest } from 'next/server';
import { registerSchema } from '@/lib/validators/auth';
import { registerUser } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session-cookie';
import { clientIp, parseJson, rateLimit } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    rateLimit(`register:${clientIp(request)}`, 5, 60_000);

    const input = await parseJson(request, registerSchema);
    const user = await registerUser(input);

    // Register logs the customer straight in — one less step to abandon.
    await createSession({ id: user.id, email: user.email ?? '' });

    return NextResponse.json({ data: { user } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
