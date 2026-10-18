/**
 * Returns / exchanges lifecycle integration test against a real database.
 *
 * Proves the paths that move money and stock:
 *  - refund: request → approve → receive (restock) → refund (payment credited)
 *  - exchange: request → approve (reserve replacement) → receive (restock original)
 *    → ship replacement → complete
 *  - cancel of an approved exchange releases the reservation
 *  - policy gates: not delivered, window expired, duplicate request
 *
 * Run: npx tsx scripts/smoke-returns.ts
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addToCartByToken } from '../src/server/services/cart-core.service';
import { placeOrder } from '../src/server/services/checkout.service';
import {
  approveReturn,
  cancelReturn,
  completeExchange,
  completeRefund,
  createReturnRequest,
  markReturnReceived,
  shipReplacement,
} from '../src/server/services/returns.service';

const prisma = new PrismaClient();

let passed = 0;
const failures: string[] = [];
const originalStock = new Map<string, number>();
const createdOrders: string[] = [];

function ok(label: string, condition: boolean, extra = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function noteStock(...ids: string[]): void {
  for (const id of ids) {
    if (!originalStock.has(id)) originalStock.set(id, 0);
  }
}

async function variant(id: string) {
  return prisma.variant.findUniqueOrThrow({ where: { id } });
}

const address = {
  fullName: 'Returns Test',
  phone: '+919876543210',
  line1: '12 MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

async function makeDeliveredOrder(variantId: string, deliveredAt = new Date()) {
  const token = `ret-${randomBytes(10).toString('hex')}`;
  await addToCartByToken(token, variantId, 1);

  const order = await placeOrder({
    cartToken: token,
    userId: null,
    email: 'returns@example.com',
    phone: '+919876543210',
    address,
    paymentMethod: 'COD',
    idempotencyKey: `ret_${randomBytes(8).toString('hex')}`,
  });

  createdOrders.push(order.orderNumber);
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'DELIVERED', deliveredAt },
  });

  const full = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });

  return { order: full, item: full.items[0]! };
}

async function cleanup(): Promise<void> {
  for (const orderNumber of createdOrders) {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true },
    });
    if (!order) continue;

    for (const item of order.items) {
      const original = originalStock.get(item.variantId ?? '');
      if (item.variantId && original !== undefined) {
        await prisma.variant.update({
          where: { id: item.variantId },
          data: { stock: original },
        });
      }
    }

    await prisma.return.deleteMany({ where: { orderId: order.id } });
    await prisma.order.deleteMany({ where: { id: order.id } });
  }

  // Restore any replacement variants we reserved from.
  for (const [id, stock] of originalStock.entries()) {
    await prisma.variant.update({ where: { id }, data: { stock } }).catch(() => {});
  }

  const carts = await prisma.cart.findMany({
    where: { cartToken: { startsWith: 'ret-' } },
    select: { id: true },
  });
  const ids = carts.map((cart) => cart.id);
  await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
  await prisma.cart.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  console.log('\nReturns lifecycle integration test\n');

  const admin = await prisma.adminUser.findFirstOrThrow();
  console.log(`  acting as ${admin.email}\n`);

  const cheap = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 5 }, pricePaise: { lte: 90_000 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { pricePaise: 'asc' },
  });
  if (!cheap) throw new Error('No suitable variant — run the seed.');
  noteStock(cheap.id);
  originalStock.set(cheap.id, cheap.stock);

  // ---------- REFUND lifecycle ----------
  const refundOrder = await makeDeliveredOrder(cheap.id);
  const stockBeforeReturn = (await variant(cheap.id)).stock;

  const refundRequest = await createReturnRequest({
    orderNumber: refundOrder.order.orderNumber,
    orderItemId: refundOrder.item.id,
    kind: 'REFUND',
    reason: 'FIT_NOT_AS_EXPECTED',
    qty: 1,
  });

  ok('refund request is created as REQUESTED', refundRequest.status === 'REQUESTED');
  ok(
    'refund amount equals the paid line total',
    refundRequest.refundAmountPaise === refundOrder.item.lineTotalPaise,
    `${refundRequest.refundAmountPaise} vs ${refundOrder.item.lineTotalPaise}`,
  );

  // duplicate while open
  let duplicateRejected = false;
  try {
    await createReturnRequest({
      orderNumber: refundOrder.order.orderNumber,
      orderItemId: refundOrder.item.id,
      kind: 'REFUND',
      reason: 'CHANGED_MIND',
      qty: 1,
    });
  } catch {
    duplicateRejected = true;
  }
  ok('a second request for the same item is rejected', duplicateRejected);

  const approved = await approveReturn(refundRequest.id, admin.id);
  ok('admin approval moves it to APPROVED', approved.status === 'APPROVED');

  const stockAfterApprove = (await variant(cheap.id)).stock;
  ok('approval does not restock (goods not received yet)', stockAfterApprove === stockBeforeReturn);

  const received = await markReturnReceived(refundRequest.id, admin.id);
  ok('receiving moves it to RECEIVED', received.status === 'RECEIVED');

  const stockAfterReceive = (await variant(cheap.id)).stock;
  ok('receiving restocks the item', stockAfterReceive === stockBeforeReturn + 1, `${stockAfterReceive} vs ${stockBeforeReturn + 1}`);

  const refunded = await completeRefund(refundRequest.id, admin.id);
  ok('refund completion sets REFUNDED', refunded.status === 'REFUNDED');

  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: refundOrder.order.id } });
  ok(
    'payment records the refunded amount',
    payment.refundedPaise === refundOrder.item.lineTotalPaise,
    `${payment.refundedPaise}`,
  );
  ok('payment status becomes PARTIALLY_REFUNDED', payment.status === 'PARTIALLY_REFUNDED', payment.status);

  // ---------- EXCHANGE lifecycle ----------
  const exchangeOrder = await makeDeliveredOrder(cheap.id);
  const replacement = await prisma.variant.findFirst({
    where: {
      productId: cheap.productId,
      isActive: true,
      id: { not: cheap.id },
      stock: { gte: 2 },
    },
  });
  if (!replacement) throw new Error('No replacement variant available');
  noteStock(replacement.id);
  originalStock.set(replacement.id, replacement.stock);

  const exchange = await createReturnRequest({
    orderNumber: exchangeOrder.order.orderNumber,
    orderItemId: exchangeOrder.item.id,
    kind: 'EXCHANGE',
    reason: 'SIZE_TOO_SMALL',
    qty: 1,
    requestedVariantId: replacement.id,
  });
  ok('exchange request is created', exchange.status === 'REQUESTED' && exchange.kind === 'EXCHANGE');
  ok('exchange has no refund amount', exchange.refundAmountPaise === null);

  const replacementStockBefore = (await variant(replacement.id)).stock;
  const returnedStockBefore = (await variant(cheap.id)).stock;

  await approveReturn(exchange.id, admin.id);
  const replacementAfterApprove = (await variant(replacement.id)).stock;
  ok(
    'approval reserves the replacement (stock decremented)',
    replacementAfterApprove === replacementStockBefore - 1,
    `${replacementAfterApprove} vs ${replacementStockBefore - 1}`,
  );

  await markReturnReceived(exchange.id, admin.id);
  const returnedAfterReceive = (await variant(cheap.id)).stock;
  ok(
    'receiving restocks the returned size',
    returnedAfterReceive === returnedStockBefore + 1,
    `${returnedAfterReceive} vs ${returnedStockBefore + 1}`,
  );

  const shipped = await shipReplacement(exchange.id, admin.id);
  ok('replacement shipment moves it to REPLACEMENT_SHIPPED', shipped.status === 'REPLACEMENT_SHIPPED');

  const completed = await completeExchange(exchange.id, admin.id);
  ok('exchange completes', completed.status === 'COMPLETED');

  // ---------- cancel releases reservation ----------
  const cancelOrder2 = await makeDeliveredOrder(cheap.id);
  const toCancel = await createReturnRequest({
    orderNumber: cancelOrder2.order.orderNumber,
    orderItemId: cancelOrder2.item.id,
    kind: 'EXCHANGE',
    reason: 'SIZE_TOO_LARGE',
    qty: 1,
    requestedVariantId: replacement.id,
  });
  const beforeReserve = (await variant(replacement.id)).stock;
  await approveReturn(toCancel.id, admin.id);
  ok('reservation applied before cancel', (await variant(replacement.id)).stock === beforeReserve - 1);

  const cancelled = await cancelReturn(toCancel.id, admin.id);
  ok('cancel sets CANCELLED', cancelled.status === 'CANCELLED');
  ok(
    'cancel releases the reserved replacement stock',
    (await variant(replacement.id)).stock === beforeReserve,
    `${(await variant(replacement.id)).stock} vs ${beforeReserve}`,
  );

  // ---------- policy gates ----------
  const notDeliveredToken = `ret-${randomBytes(10).toString('hex')}`;
  await addToCartByToken(notDeliveredToken, cheap.id, 1);
  const pending = await placeOrder({
    cartToken: notDeliveredToken,
    userId: null,
    email: 'returns@example.com',
    phone: '+919876543210',
    address,
    paymentMethod: 'COD',
    idempotencyKey: `ret_${randomBytes(8).toString('hex')}`,
  });
  createdOrders.push(pending.orderNumber);
  const pendingFull = await prisma.order.findUniqueOrThrow({
    where: { id: pending.id },
    include: { items: true },
  });

  let notDeliveredRejected = false;
  try {
    await createReturnRequest({
      orderNumber: pending.orderNumber,
      orderItemId: pendingFull.items[0]!.id,
      kind: 'REFUND',
      reason: 'CHANGED_MIND',
      qty: 1,
    });
  } catch {
    notDeliveredRejected = true;
  }
  ok('an undelivered order cannot be returned', notDeliveredRejected);

  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const oldOrder = await makeDeliveredOrder(cheap.id, oldDate);
  let expiredRejected = false;
  try {
    await createReturnRequest({
      orderNumber: oldOrder.order.orderNumber,
      orderItemId: oldOrder.item.id,
      kind: 'REFUND',
      reason: 'CHANGED_MIND',
      qty: 1,
    });
  } catch {
    expiredRejected = true;
  }
  ok('a refund past the 7-day window is rejected', expiredRejected);
}

main()
  .catch((error) => {
    console.error('Returns test crashed:', error);
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
