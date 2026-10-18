import { NextResponse, type NextRequest } from 'next/server';
import { addressUpdateSchema } from '@/lib/validators/address';
import { deleteAddress, updateAddress } from '@/server/services/address.service';
import { parseJson, requireUser } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireUser();
    const input = await parseJson(request, addressUpdateSchema);
    const address = await updateAddress(session.sub, params.id, input);
    return NextResponse.json({ data: { address } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireUser();
    await deleteAddress(session.sub, params.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
