/**
 * Demo order helper (development only).
 *
 *   npx tsx scripts/_demo-order.ts --create   # creates an order, prints its URL
 *   npx tsx scripts/_demo-order.ts --cleanup  # removes it and restores stock
 *
 * Exists so the confirmation page and invoice can be inspected in a browser
 * without driving the checkout form.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addToCartByToken } from '../src/server/services/cart-core.service';
import { placeOrder } from '../src/server/services/checkout.service';
import { applyShipmentEvent, createShipmentRecord } from '../src/server/services/shipping.service';

const prisma = new PrismaClient();
const STATE_PATH = '.cache/demo-order.json';

interface DemoState {
  orderNumber: string;
  variantId: string;
  qty: number;
}

async function create(): Promise<void> {
  const variant = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 3 }, pricePaise: { lte: 90_000 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { pricePaise: 'asc' },
  });
  if (!variant) throw new Error('No suitable variant');

  const token = `demo-${randomBytes(10).toString('hex')}`;
  const qty = 2;
  await addToCartByToken(token, variant.id, qty);

  const order = await placeOrder({
    cartToken: token,
    userId: null,
    email: 'demo@example.com',
    phone: '+919876543210',
    address: {
      fullName: 'Piyush Bakde',
      phone: '+919876543210',
      line1: '12 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
    paymentMethod: 'COD',
    idempotencyKey: `demo_${randomBytes(6).toString('hex')}`,
  });

  const state: DemoState = {
    orderNumber: order.orderNumber,
    variantId: variant.id,
    qty,
  };

  // Give the demo order a shipment and drive it to delivered, so both the tracking
  // timeline and the return/exchange affordance are visible.
  const awb = `DEMO${randomBytes(4).toString('hex').toUpperCase()}`;
  await createShipmentRecord(order.id, { awb, courierName: 'Delhivery Surface' });
  await applyShipmentEvent({ awb, rawStatus: 'PICKUP SCHEDULED' });
  await applyShipmentEvent({ awb, rawStatus: 'IN TRANSIT' });
  await applyShipmentEvent({ awb, rawStatus: 'OUT FOR DELIVERY' });
  await applyShipmentEvent({ awb, rawStatus: 'DELIVERED' });

  mkdirSync('.cache', { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  const url = `http://127.0.0.1:3000/order/${order.orderNumber}?token=${order.invoiceToken}`;
  console.log(`order      : ${order.orderNumber}`);
  console.log(`product    : ${variant.product.name} / ${variant.size} x${qty}`);
  console.log(`total      : Rs ${order.totalPaise / 100}`);
  console.log(`page       : ${url}`);
  console.log(`invoice    : http://127.0.0.1:3000/api/orders/${order.orderNumber}/invoice?token=${order.invoiceToken}`);
}

async function cleanup(): Promise<void> {
  if (!existsSync(STATE_PATH)) {
    console.log('nothing to clean up');
    return;
  }
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as DemoState;

  await prisma.variant.update({
    where: { id: state.variantId },
    data: { stock: { increment: state.qty } },
  });
  await prisma.order.deleteMany({ where: { orderNumber: state.orderNumber } });

  const carts = await prisma.cart.findMany({
    where: { cartToken: { startsWith: 'demo-' } },
    select: { id: true },
  });
  const ids = carts.map((cart) => cart.id);
  await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
  await prisma.cart.deleteMany({ where: { id: { in: ids } } });

  console.log(`cleaned up ${state.orderNumber} (stock restored)`);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === '--create') await create();
  else if (mode === '--cleanup') await cleanup();
  else console.log('usage: --create | --cleanup');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
