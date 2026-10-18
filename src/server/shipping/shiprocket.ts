import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@/server/errors';

/**
 * Shiprocket adapter.
 *
 * Gated on SHIPROCKET_ENABLED. Without credentials every call refuses clearly —
 * no silent no-ops that make an unshipped order look shipped.
 *
 * Webhook authentication: Shiprocket sends the token you configure in the panel as
 * the `x-api-key` header. It is NOT an HMAC of the body, so we verify it as a shared
 * secret in constant time and still treat the payload as untrusted input.
 */

const API_BASE = 'https://apiv2.shiprocket.in/v1/external';

export interface ShiprocketShipment {
  shipmentId: string;
  awb: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  status: string;
}

export function isShiprocketEnabled(): boolean {
  return process.env.SHIPROCKET_ENABLED === 'true';
}

/** Constant-time webhook token check. */
export function verifyWebhookToken(received: string | null | undefined): boolean {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected || !received) return false;

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (!isShiprocketEnabled()) {
    throw new AppError('CONFLICT', 'Shipping integration is not enabled.', 409);
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) {
    throw new Error('SHIPROCKET_ENABLED=true but SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD are missing');
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Shiprocket auth failed (${response.status})`);
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error('Shiprocket auth returned no token');

  // Shiprocket tokens last ~10 days; refresh conservatively.
  cachedToken = { value: body.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return body.token;
}

async function authorisedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

export interface CreateShipmentInput {
  orderNumber: string;
  orderDate: string;
  billing: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
  };
  items: { name: string; sku: string; units: number; sellingPricePaise: number }[];
  weightKg: number;
  isCod: boolean;
  codAmountPaise: number;
  subTotalPaise: number;
}

/**
 * Create a shipment and assign an AWB.
 * Not exercised in this environment (no credentials) — see BLOCKERS BLK-005.
 */
export async function createShipment(input: CreateShipmentInput): Promise<ShiprocketShipment> {
  const payload = {
    order_id: input.orderNumber,
    order_date: input.orderDate,
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION ?? 'Primary',
    billing_customer_name: input.billing.name,
    billing_address: input.billing.address,
    billing_city: input.billing.city,
    billing_state: input.billing.state,
    billing_pincode: input.billing.pincode,
    billing_phone: input.billing.phone,
    billing_email: input.billing.email,
    shipping_is_billing: true,
    order_items: input.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.units,
      selling_price: item.sellingPricePaise / 100,
    })),
    payment_method: input.isCod ? 'COD' : 'Prepaid',
    sub_total: input.subTotalPaise / 100,
    length: 30,
    breadth: 25,
    height: 5,
    weight: input.weightKg,
  };

  const created = await authorisedFetch('/orders/create/adhoc', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!created.ok) {
    throw new Error(`Shiprocket order creation failed (${created.status}): ${await created.text()}`);
  }

  const body = (await created.json()) as {
    shipment_id?: number | string;
    awb_code?: string;
    courier_name?: string;
    status?: string;
  };

  return {
    shipmentId: String(body.shipment_id ?? ''),
    awb: body.awb_code ?? null,
    courierName: body.courier_name ?? null,
    trackingUrl: body.awb_code ? `https://shiprocket.co/tracking/${body.awb_code}` : null,
    status: body.status ?? 'NEW',
  };
}

export interface ServiceabilityResult {
  serviceable: boolean;
  courierName: string | null;
  etaDays: number | null;
  codAvailable: boolean;
}

/** Live pincode serviceability. Falls back to the database rules when disabled. */
export async function checkDeliveryServiceability(
  deliveryPincode: string,
  pickupPincode: string,
  weightKg: number,
  cod: boolean,
): Promise<ServiceabilityResult | null> {
  if (!isShiprocketEnabled()) return null;

  const params = new URLSearchParams({
    pickup_postcode: pickupPincode,
    delivery_postcode: deliveryPincode,
    weight: String(weightKg),
    cod: cod ? '1' : '0',
  });

  const response = await authorisedFetch(`/courier/serviceability/?${params.toString()}`);
  if (!response.ok) return null;

  const body = (await response.json()) as {
    data?: {
      available_courier_companies?: {
        courier_name?: string;
        estimated_delivery_days?: string | number;
        cod?: number | string;
      }[];
    };
  };

  const first = body.data?.available_courier_companies?.[0];
  if (!first) return { serviceable: false, courierName: null, etaDays: null, codAvailable: false };

  return {
    serviceable: true,
    courierName: first.courier_name ?? null,
    etaDays: first.estimated_delivery_days ? Number(first.estimated_delivery_days) : null,
    codAvailable: String(first.cod ?? '0') !== '0',
  };
}

export async function cancelShipment(shipmentIds: string[]): Promise<void> {
  const response = await authorisedFetch('/orders/cancel/shipment/awbs', {
    method: 'POST',
    body: JSON.stringify({ awbs: shipmentIds }),
  });
  if (!response.ok) {
    throw new Error(`Shiprocket cancel failed (${response.status})`);
  }
}
