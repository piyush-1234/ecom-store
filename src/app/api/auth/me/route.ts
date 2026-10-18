import { NextResponse } from 'next/server';
import { getProfileSummary } from '@/server/services/auth.service';
import { requireUser } from '@/server/http';
import { errorResponse } from '@/server/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireUser();
    const profile = await getProfileSummary(session.sub);
    return NextResponse.json({ data: { user: profile } });
  } catch (error) {
    return errorResponse(error);
  }
}
