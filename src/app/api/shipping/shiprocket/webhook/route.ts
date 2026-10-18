import { NextResponse, type NextRequest } from 'next/server';
import { applyShipmentEvent } from '@/server/services/shipping.service';
import { verifyWebhookToken } from '@/server/shipping/shiprocket';

export const dynamic = 'force-dynamic';

/**
 * Shiprocket webhook.
 *
 * Authentication: the shared token configured in the Shiprocket panel arrives in
 * `x-api-key`. It is NOT an HMAC over the body, so the body is never trusted beyond
 * identifying the shipment — every state change is derived server-side.
 *
 * Responses:
 *  - 200 → event accepted or deliberately ignored (unknown shipment/status)
 *  - 401 → token missing/wrong
 *  - 503 → webhook token not configured (refuse rather than accept unauthenticated)
 *  - 500 → processing error, so Shiprocket retries
 */

interface ShiprocketWebhookBody {
  awb?: string | number;
  awb_code?: string;
  shipment_id?: string | number;
  order_id?: string | number;
  current_status?: string;
  current_status_id?: number;
  shipment_status?: string;
  courier_name?: string;
  etd?: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  if (!process.env.SHIPROCKET_WEBHOOK_TOKEN) {
    return NextResponse.json(
      { error: 'webhook token not configured' },
      { status: 503 },
    );
  }

  const token = request.headers.get('x-api-key');
  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let body: ShiprocketWebhookBody;
  try {
    body = (await request.json()) as ShiprocketWebhookBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const rawStatus = body.current_status ?? body.shipment_status ?? '';
  if (!rawStatus) {
    return NextResponse.json({ received: true, ignored: 'no status in payload' });
  }

  try {
    const result = await applyShipmentEvent({
      awb: body.awb ? String(body.awb) : body.awb_code ? String(body.awb_code) : null,
      providerShipmentId: body.shipment_id ? String(body.shipment_id) : null,
      orderNumber: body.order_id ? String(body.order_id) : null,
      rawStatus,
      courierName: body.courier_name ?? null,
      occurredAt: new Date(),
    });

    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error('[shiprocket webhook] failed', error);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
