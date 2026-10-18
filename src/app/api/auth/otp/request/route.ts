import { NextResponse, type NextRequest } from 'next/server';
import { otpRequestSchema } from '@/lib/validators/auth';
import { requestOtp } from '@/server/services/auth.service';
import { clientIp, parseJson, rateLimit } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // SMS costs money and is abusable — cap per IP as well as per phone.
    rateLimit(`otp:${clientIp(request)}`, 5, 10 * 60_000);

    const input = await parseJson(request, otpRequestSchema);
    const result = await requestOtp(input);

    return NextResponse.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
