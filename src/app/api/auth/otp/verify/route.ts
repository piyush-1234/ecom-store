import { NextResponse, type NextRequest } from 'next/server';
import { otpVerifySchema } from '@/lib/validators/auth';
import { verifyOtp } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session-cookie';
import { clientIp, parseJson, rateLimit } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    rateLimit(`otp-verify:${clientIp(request)}`, 15, 10 * 60_000);

    const input = await parseJson(request, otpVerifySchema);
    const user = await verifyOtp(input);

    await createSession({ id: user.id, email: user.email ?? '' });

    return NextResponse.json({ data: { user } });
  } catch (error) {
    return errorResponse(error);
  }
}
