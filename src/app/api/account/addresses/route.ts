import { NextResponse, type NextRequest } from 'next/server';
import { addressSchema } from '@/lib/validators/address';
import { createAddress, listAddresses } from '@/server/services/address.service';
import { parseJson, requireUser } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireUser();
    const addresses = await listAddresses(session.sub);
    return NextResponse.json({ data: { addresses } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser();
    const input = await parseJson(request, addressSchema);
    const address = await createAddress(session.sub, input);
    return NextResponse.json({ data: { address } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
