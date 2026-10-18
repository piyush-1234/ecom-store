/**
 * Cart integration test against a real database.
 *
 * Uses the token-level cart API, so no HTTP/cookie context is required.
 * Run: npx tsx scripts/smoke-cart.ts
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  addToCartByToken,
  getCartByToken,
  updateCartItemQtyByToken,
} from '../src/server/services/cart-core.service';

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

async function main(): Promise<void> {
  console.log('\nCart integration test\n');

  const token = `smoke-${randomBytes(16).toString('hex')}`;

  // Pick a variant with plenty of stock so clamping can be tested.
  const variant = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 3 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { stock: 'desc' },
  });

  if (!variant) throw new Error('No in-stock variant to test with — run the seed first.');
  console.log(`  using ${variant.product.name} / ${variant.size} / ${variant.color} (stock ${variant.stock})\n`);

  try {
    // --- empty cart ---
    const empty = await getCartByToken(token);
    ok('unknown token returns an empty cart', empty.items.length === 0 && empty.id === null);

    // --- add ---
    const added = await addToCartByToken(token, variant.id, 2);
    ok('add 2 units', added.qty === 2 && added.clamped === false, JSON.stringify(added));

    const cart = await getCartByToken(token);
    ok('cart has 1 line', cart.items.length === 1);
    ok('cart item count is 2', cart.itemCount === 2);
    ok(
      'subtotal = unit price x qty',
      cart.subtotalPaise === variant.pricePaise * 2,
      `${cart.subtotalPaise} vs ${variant.pricePaise * 2}`,
    );
    ok('line label is "colour / size"', cart.items[0]?.variantLabel === `${variant.color} / ${variant.size}`);

    // --- re-add merges onto the same line ---
    await addToCartByToken(token, variant.id, 1);
    const merged = await getCartByToken(token);
    ok('re-adding merges into one line', merged.items.length === 1 && merged.itemCount === 3);

    // --- clamp to stock ---
    const overOrder = await addToCartByToken(token, variant.id, variant.stock + 50);
    ok('quantity is clamped to available stock', overOrder.qty === variant.stock, `${overOrder.qty} vs ${variant.stock}`);
    ok('clamping is reported to the caller', overOrder.clamped === true);

    // --- update down ---
    const lineId = merged.items[0]!.id;
    await updateCartItemQtyByToken(token, lineId, 1);
    const updated = await getCartByToken(token);
    ok('update quantity to 1', updated.itemCount === 1);

    // --- update to 0 removes ---
    await updateCartItemQtyByToken(token, lineId, 0);
    const cleared = await getCartByToken(token);
    ok('quantity 0 removes the line', cleared.items.length === 0);

    // --- out of stock variant is rejected ---
    const soldOut = await prisma.variant.findFirst({
      where: { isActive: true, stock: 0, product: { isActive: true } },
      select: { id: true },
    });
    if (soldOut) {
      let rejected = false;
      try {
        await addToCartByToken(token, soldOut.id, 1);
      } catch {
        rejected = true;
      }
      ok('adding an out-of-stock variant throws', rejected);
    } else {
      console.log('  SKIP  out-of-stock rejection (no zero-stock variant)');
    }

    // --- unknown variant ---
    let notFound = false;
    try {
      await addToCartByToken(token, 'variant_does_not_exist', 1);
    } catch {
      notFound = true;
    }
    ok('adding an unknown variant throws', notFound);

    // --- isolation between carts ---
    const otherToken = `smoke-${randomBytes(16).toString('hex')}`;
    await addToCartByToken(otherToken, variant.id, 1);
    const mine = await getCartByToken(token);
    const theirs = await getCartByToken(otherToken);
    ok('separate tokens have separate carts', mine.items.length === 0 && theirs.itemCount === 1);
  } finally {
    // Always clean up so repeat runs stay deterministic.
    const carts = await prisma.cart.findMany({
      where: { cartToken: { startsWith: 'smoke-' } },
      select: { id: true },
    });
    await prisma.cartItem.deleteMany({ where: { cartId: { in: carts.map((c) => c.id) } } });
    await prisma.cart.deleteMany({ where: { id: { in: carts.map((c) => c.id) } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    console.log('Failed:\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('Cart test crashed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
