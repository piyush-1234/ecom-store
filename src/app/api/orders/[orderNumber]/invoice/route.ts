import { NextResponse, type NextRequest } from 'next/server';
import { getOrderForInvoice } from '@/server/services/checkout.service';
import { generateInvoicePdf } from '@/server/invoice/pdf';
import { verifyInvoiceToken } from '@/server/invoice/token';
import { getCurrentSession } from '@/server/auth/session-cookie';

export const dynamic = 'force-dynamic';

/**
 * GST invoice PDF.
 *
 * Access is either a signed token (guest orders, carried in the confirmation link)
 * or an authenticated owner session. Anything else 404s rather than 403 so an
 * attacker cannot probe for valid order numbers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  const orderNumber = params.orderNumber;
  const token = request.nextUrl.searchParams.get('token') ?? '';

  const found = await getOrderForInvoice(orderNumber);
  if (!found) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found.' } }, { status: 404 });
  }

  let authorised = token ? verifyInvoiceToken(orderNumber, token) : false;

  if (!authorised) {
    const session = await getCurrentSession();
    authorised = Boolean(session && found.userId && session.sub === found.userId);
  }

  if (!authorised) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found.' } }, { status: 404 });
  }

  try {
    const pdf = await generateInvoicePdf(found.invoice);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${orderNumber}.pdf"`,
        'cache-control': 'private, no-store',
        'content-length': String(pdf.length),
      },
    });
  } catch (error) {
    console.error('[invoice] generation failed', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Could not generate the invoice.' } },
      { status: 500 },
    );
  }
}
