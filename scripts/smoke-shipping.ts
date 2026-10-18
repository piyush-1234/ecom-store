/**
 * Shipping lifecycle integration test against a real database.
 *
 * Drives webhook events through `applyShipmentEvent` and asserts the resulting
 * order/shipment/inventory state, including:
 *  - forward-only order progression
 *  - no regression from a late webhook
 *  - RTO restocking exactly once (idempotent)
 *
 * Run: npx tsx scripts/smoke-shipping.ts
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addToCartByToken } from '../src/server/services/cart-core.service';
import { placeOrder } from '../src/server/services/checkout.service';
import { applyShipmentEvent, createShipmentRecord } from '../src/server/services/shipping.service';

const prisma = new PrismaClient();

let passed = 0;
const failures: string[] = [];

function ok(label: string, condition: boolean, extra = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

const address = {
  fullName: 'Ship Test',
  phone: '+919876543210',
  line1: '12 MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

const created: { orderNumber: string; variantId: string; qty: number }[] = [];

async function cleanup(): Promise<void> {
  for (const entry of created) {
    // Force stock back to a known-good value by replaying the net effect.
    const order = await prisma.order.findUnique({
      where: { orderNumber: entry.orderNumber },
      include: { shipments: true },
    });
    const restocked = order?.shipments.some((shipment) => shipment.restockedAt !== null);
    if (!restocked) {
      await prisma.variant.update({
        where: { id: entry.variantId },
        data: { stock: { increment: entry.qty } },
      });
    }
    await prisma.order.deleteMany({ where: { orderNumber: entry.orderNumber } });
  }

  const carts = await prisma.cart.findMany({
    where: { cartToken: { startsWith: 'ship-' } },
    select: { id: true },
  });
  const ids = carts.map((cart) => cart.id);
  await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
  await prisma.cart.deleteMany({ where: { id: { in: ids } } });
}

async function makeOrder(variantId: string) {
  const token = `ship-${randomBytes(10).toString('hex')}`;
  await addToCartByToken(token, variantId, 1);

  const order = await placeOrder({
    cartToken: token,
    userId: null,
    email: 'ship@example.com',
    phone: '+919876543210',
    address,
    paymentMethod: 'COD',
    idempotencyKey: `ship_${randomBytes(8).toString('hex')}`,
  });

  created.push({ orderNumber: order.orderNumber, variantId, qty: 1 });
  return order;
}

async function main(): Promise<void> {
  console.log('\nShipping lifecycle integration test\n');

  const variant = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 5 }, pricePaise: { lte: 100_000 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { pricePaise: 'asc' },
  });
  if (!variant) throw new Error('No suitable variant — run the seed.');
  console.log(`  using ${variant.product.name} / ${variant.size} (stock ${variant.stock})\n`);

  // ---------- happy path ----------
  const order = await makeOrder(variant.id);
  const awb = `TESTAWB${randomBytes(4).toString('hex').toUpperCase()}`;

  const record = await createShipmentRecord(order.id, { awb, courierName: 'Test Courier' });
  ok('shipment record is created', Boolean(record.id));
  ok('shipment stores the AWB', record.awb === awb);

  const pickup = await applyShipmentEvent({ awb, rawStatus: 'PICKUP SCHEDULED' });
  ok('pickup event is handled', pickup.handled && pickup.shipmentStatus === 'PENDING', JSON.stringify(pickup));

  const transit = await applyShipmentEvent({ awb, rawStatus: 'IN TRANSIT' });
  ok('in-transit maps to shipped', transit.shipmentStatus === 'IN_TRANSIT');
  ok('order advances to SHIPPED', transit.orderStatus === 'SHIPPED', String(transit.orderStatus));

  const outForDelivery = await applyShipmentEvent({ awb, rawStatus: 'OUT FOR DELIVERY' });
  ok('out-for-delivery keeps the order SHIPPED', outForDelivery.orderStatus === null);

  const delivered = await applyShipmentEvent({ awb, rawStatus: 'DELIVERED' });
  ok('delivery advances the order to DELIVERED', delivered.orderStatus === 'DELIVERED');

  const deliveredOrder = await prisma.order.findUniqueOrThrow({
    where: { orderNumber: order.orderNumber },
    include: { payments: true },
  });
  ok('COD payment is captured on delivery', deliveredOrder.payments[0]?.status === 'CAPTURED', deliveredOrder.payments[0]?.status);

  // ---------- late webhook must not regress ----------
  const late = await applyShipmentEvent({ awb, rawStatus: 'IN TRANSIT' });
  ok('late in-transit event is accepted but ignored', late.handled === true && late.orderStatus === null);

  const stillDelivered = await prisma.order.findUniqueOrThrow({ where: { orderNumber: order.orderNumber } });
  ok('order stays DELIVERED after a late webhook', stillDelivered.status === 'DELIVERED', stillDelivered.status);

  // ---------- RTO restock ----------
  const stockBeforeRto = (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
  const rtoOrder = await makeOrder(variant.id);
  const rtoAwb = `RTOTEST${randomBytes(3).toString('hex').toUpperCase()}`;
  await createShipmentRecord(rtoOrder.id, { awb: rtoAwb, courierName: 'Test Courier' });

  await applyShipmentEvent({ awb: rtoAwb, rawStatus: 'IN TRANSIT' });

  const rtoInitiated = await applyShipmentEvent({ awb: rtoAwb, rawStatus: 'RTO INITIATED' });
  ok('RTO initiated is recorded', rtoInitiated.shipmentStatus === 'RTO_INITIATED');
  ok('RTO initiated does not restock yet', rtoInitiated.restocked === false);

  const stockDuringRto = (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
  ok('stock unchanged while the parcel is still moving', stockDuringRto === stockBeforeRto - 1);

  const rtoDelivered = await applyShipmentEvent({ awb: rtoAwb, rawStatus: 'RTO DELIVERED' });
  ok('RTO delivered marks the order RTO', rtoDelivered.orderStatus === 'RTO', String(rtoDelivered.orderStatus));
  ok('RTO delivered restocks the goods', rtoDelivered.restocked === true);

  const stockAfterRto = (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
  ok('stock is restored by exactly the ordered qty', stockAfterRto === stockDuringRto + 1, `${stockAfterRto} vs ${stockDuringRto + 1}`);

  // ---------- replay must not double-restock ----------
  const replay = await applyShipmentEvent({ awb: rtoAwb, rawStatus: 'RTO DELIVERED' });
  ok('replayed RTO event does not restock again', replay.restocked === false);

  const stockAfterReplay = (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
  ok('stock unchanged after replay', stockAfterReplay === stockAfterRto, `${stockAfterReplay} vs ${stockAfterRto}`);

  // ---------- unknown inputs ----------
  const unknownAwb = await applyShipmentEvent({ awb: 'DOES-NOT-EXIST', rawStatus: 'DELIVERED' });
  ok('unknown AWB is not handled', unknownAwb.handled === false && unknownAwb.reason === 'unknown_shipment');

  const unmapped = await applyShipmentEvent({ awb, rawStatus: 'SOME NEW STATUS' });
  ok('unmapped status is not handled', unmapped.handled === false && unmapped.reason === 'unmapped_status');

  const byOrderNumber = await applyShipmentEvent({ orderNumber: order.orderNumber, rawStatus: 'DELIVERED' });
  ok('events can be matched by order number', byOrderNumber.handled === true);
}

main()
  .catch((error) => {
    console.error('Shipping test crashed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    if (failures.length > 0) {
      console.log('Failed:\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
      process.exitCode = 1;
    }
  });
