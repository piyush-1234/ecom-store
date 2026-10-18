/**
 * Coupon redemption integration test against a real database.
 *
 * Covers the money path and the guardrails:
 *  - a valid coupon discounts the order, records a redemption and bumps usedCount
 *  - per-customer limit blocks a second use
 *  - unknown, minimum-spend and free-shipping cases behave correctly
 *
 * Run: npx tsx scripts/smoke-coupons.ts
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addToCartByToken } from '../src/server/services/cart-core.service';
import { placeOrder } from '../src/server/services/checkout.service';

const prisma = new PrismaClient();

let passed = 0;
const failures: string[] = [];
const created: { orderNumber: string; variantId: string; qty: number }[] = [];
const couponSnapshot = new Map<string, number>();
const originalStock = new Map<string, number>();

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
  fullName: 'Coupon Test',
  phone: '+919876543210',
  line1: '12 MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

async function makeOrder(variantId: string, qty: number, couponCode?: string) {
  const token = `cpn-${randomBytes(10).toString('hex')}`;
  await addToCartByToken(token, variantId, qty);

  const order = await placeOrder({
    cartToken: token,
    userId: null,
    email: `coupon_${randomBytes(6).toString('hex')}@example.com`,
    phone: '+919876543210',
    address,
    paymentMethod: 'PREPAID',
    idempotencyKey: `cpn_${randomBytes(8).toString('hex')}`,
    couponCode,
  });

  created.push({ orderNumber: order.orderNumber, variantId, qty });
  return prisma.order.findUniqueOrThrow({
    where: { orderNumber: order.orderNumber },
    include: { payments: true },
  });
}

async function snapshotCoupon(code: string): Promise<void> {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (coupon && !couponSnapshot.has(code)) couponSnapshot.set(code, coupon.usedCount);
}

async function cleanup(): Promise<void> {
  for (const entry of created) {
    const original = originalStock.get(entry.variantId);
    if (original !== undefined) {
      await prisma.variant.update({ where: { id: entry.variantId }, data: { stock: original } });
    }
  }
  for (const entry of created) {
    const order = await prisma.order.findUnique({ where: { orderNumber: entry.orderNumber } });
    if (order) {
      await prisma.couponRedemption.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { id: order.id } });
    }
  }
  for (const [code, usedCount] of couponSnapshot.entries()) {
    await prisma.coupon.update({ where: { code }, data: { usedCount } }).catch(() => {});
  }

  const carts = await prisma.cart.findMany({
    where: { cartToken: { startsWith: 'cpn-' } },
    select: { id: true },
  });
  const ids = carts.map((cart) => cart.id);
  await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
  await prisma.cart.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  console.log('\nCoupon redemption integration test\n');

  const jean = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 5 }, pricePaise: { gte: 200_000 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { pricePaise: 'asc' },
  });
  const cheap = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 5 }, pricePaise: { lte: 60_000 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { pricePaise: 'asc' },
  });
  if (!jean || !cheap) throw new Error('Need seeded variants to test coupons.');
  console.log(`  jean : ${jean.product.name} Rs ${jean.pricePaise / 100}`);
  console.log(`  cheap: ${cheap.product.name} Rs ${cheap.pricePaise / 100}\n`);

  const jeanStock = jean.stock;
  const cheapStock = cheap.stock;
  originalStock.set(jean.id, jeanStock);
  originalStock.set(cheap.id, cheapStock);

  // ---------- PERCENT coupon ----------
  await snapshotCoupon('WELCOME10');
  const before = await prisma.coupon.findUniqueOrThrow({ where: { code: 'WELCOME10' } });

  const withCoupon = await makeOrder(jean.id, 1, 'welcome10'); // lowercase on purpose
  const couponDiscount = Math.min(Math.round(jean.pricePaise * 0.1), 30_000);
  const prepaidIncentive = Number(process.env.PREPAID_DISCOUNT_PAISE ?? 5_000);

  ok('coupon is stored on the order', withCoupon.couponCode === 'WELCOME10', String(withCoupon.couponCode));
  ok('order records a discount', withCoupon.discountPaise > 0, String(withCoupon.discountPaise));
  ok(
    'discount = 10% coupon + prepaid incentive',
    withCoupon.discountPaise === couponDiscount + prepaidIncentive,
    `${withCoupon.discountPaise} vs ${couponDiscount + prepaidIncentive}`,
  );

  const after = await prisma.coupon.findUniqueOrThrow({ where: { code: 'WELCOME10' } });
  ok('usedCount incremented', after.usedCount === before.usedCount + 1, `${after.usedCount} vs ${before.usedCount + 1}`);

  const redemption = await prisma.couponRedemption.findUnique({ where: { orderId: withCoupon.id } });
  ok('redemption row created', Boolean(redemption));
  ok('redemption records the discount value', (redemption?.amountPaise ?? 0) > 0, String(redemption?.amountPaise));

  // ---------- per-customer limit ----------
  const email = `dup_${randomBytes(6).toString('hex')}@example.com`;
  const tokenA = `cpn-${randomBytes(8).toString('hex')}`;
  await addToCartByToken(tokenA, jean.id, 1);
  const first = await placeOrder({
    cartToken: tokenA,
    userId: null,
    email,
    phone: '+919876543210',
    address,
    paymentMethod: 'PREPAID',
    idempotencyKey: `cpn_${randomBytes(8).toString('hex')}`,
    couponCode: 'WELCOME10',
  });
  created.push({ orderNumber: first.orderNumber, variantId: jean.id, qty: 1 });

  const tokenB = `cpn-${randomBytes(8).toString('hex')}`;
  await addToCartByToken(tokenB, jean.id, 1);
  let reuseRejected = false;
  try {
    await placeOrder({
      cartToken: tokenB,
      userId: null,
      email,
      phone: '+919876543210',
      address,
      paymentMethod: 'PREPAID',
      idempotencyKey: `cpn_${randomBytes(8).toString('hex')}`,
      couponCode: 'WELCOME10',
    });
  } catch (error) {
    reuseRejected = error instanceof Error && /already used/i.test(error.message);
  }
  ok('second use by the same customer is refused', reuseRejected);

  // ---------- unknown code ----------
  let unknownRejected = false;
  try {
    const token = `cpn-${randomBytes(8).toString('hex')}`;
    await addToCartByToken(token, jean.id, 1);
    await placeOrder({
      cartToken: token,
      userId: null,
      email: `u_${randomBytes(6).toString('hex')}@example.com`,
      phone: '+919876543210',
      address,
      paymentMethod: 'PREPAID',
      idempotencyKey: `cpn_${randomBytes(8).toString('hex')}`,
      couponCode: 'NOPE123',
    });
  } catch {
    unknownRejected = true;
  }
  ok('unknown coupon code is refused', unknownRejected);

  // ---------- free shipping ----------
  await snapshotCoupon('FREESHIP');
  const freeShip = await makeOrder(cheap.id, 2, 'FREESHIP');
  ok('free-shipping order charges no shipping', freeShip.shippingPaise === 0, String(freeShip.shippingPaise));
  ok('free-shipping order records the coupon', freeShip.couponCode === 'FREESHIP');

  // ---------- flat coupon below minimum ----------
  await snapshotCoupon('FLAT200');
  let minOrderRejected = false;
  let minOrderMessage = '';
  try {
    const token = `cpn-${randomBytes(8).toString('hex')}`;
    await addToCartByToken(token, cheap.id, 1); // 1 cheap tee < Rs.1,999
    await placeOrder({
      cartToken: token,
      userId: null,
      email: `m_${randomBytes(6).toString('hex')}@example.com`,
      phone: '+919876543210',
      address,
      paymentMethod: 'PREPAID',
      idempotencyKey: `cpn_${randomBytes(8).toString('hex')}`,
      couponCode: 'FLAT200',
    });
  } catch (error) {
    minOrderRejected = true;
    minOrderMessage = error instanceof Error ? error.message : '';
  }
  ok('coupon below its minimum spend is refused', minOrderRejected);
  ok('rejection explains the shortfall', /Add Rs\./i.test(minOrderMessage), minOrderMessage);
}

main()
  .catch((error) => {
    console.error('Coupon test crashed:', error);
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
