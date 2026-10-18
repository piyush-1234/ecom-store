import { NextResponse, type NextRequest } from 'next/server';
import { checkServiceability, formatEta } from '@/server/services/pincode.service';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

/** Pincode serviceability lookup for the checkout form. */
export async function GET(request: NextRequest) {
  try {
    const pincode = request.nextUrl.searchParams.get('pincode') ?? '';
    const result = await checkServiceability(pincode);

    return NextResponse.json({
      data: { ...result, etaLabel: formatEta(result) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
