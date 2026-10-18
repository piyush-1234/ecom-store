/**
 * Checkout integration test against a real database.
 *
 * Proves the money path end to end without HTTP: cart → totals → order →
 * stock decrement → invoice PDF. Also proves the failure modes that matter:
 * overselling, double-submitting, COD limits and unserviceable pincodes.
 *
 * Run: npx tsx scripts/smoke-checkout.ts
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { addToCartByToken, getCartByToken } from '../src/server/services/cart-core.service';
import { placeOrder, getOrderForInvoice } from '../src/server/services/checkout.service';
import { generateInvoicePdf } from '../src/server/invoice/pdf';

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
  fullName: 'Smoke Buyer',
  phone: '+919876543210',
  line1: '12 MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

const createdOrders: { orderNumber: string; restore: { variantId: string; qty: number }[] }[] = [];

function trackOrder(orderNumber: string, variantId: string, qty: number): void {
  createdOrders.push({ orderNumber, restore: [{ variantId, qty }] });
}

async function cleanup(): Promise<void> {
  for (const entry of createdOrders) {
    for (const item of entry.restore) {
      await prisma.variant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.qty } },
      });
    }
    await prisma.order.deleteMany({ where: { orderNumber: entry.orderNumber } });
  }
  const carts = await prisma.cart.findMany({
    where: { cartToken: { startsWith: 'smoke-' } },
    select: { id: true },
  });
  const ids = carts.map((c) => c.id);
  await prisma.cartItem.deleteMany({ where: { cartId: { in: ids } } });
  await prisma.cart.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Extract visible text from a PDFKit-generated PDF.
 *
 * PDFKit writes glyphs as HEX strings inside TJ arrays, split at kerning
 * boundaries, e.g. `[<54> 90 <415820494e56>] TJ` renders "T" + "AX INV".
 * Concatenating every hex token therefore reconstructs the visible text.
 *
 * Only valid for simple, uncompressed, text-only documents — which is exactly what
 * the invoice renderer produces when compression is disabled.
 */
function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const parts: string[] = [];
  const hexRun = /<([0-9A-Fa-f]+)>/g;

  let match: RegExpExecArray | null;
  while ((match = hexRun.exec(raw)) !== null) {
    const hex = match[1]!;
    if (hex.length % 2 !== 0) continue;

    let decoded = '';
    for (let index = 0; index < hex.length; index += 2) {
      decoded += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
    }
    parts.push(decoded);
  }

  return parts.join('');
}

async function main(): Promise<void> {
  console.log('\nCheckout integration test\n');

  // COD is capped at COD_MAX_AMOUNT_PAISE (₹1,500 by default), so the happy path
  // must use a genuinely cheap single item.
  const cheap = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 5 }, pricePaise: { lte: 100_000 }, product: { isActive: true } },
    include: { product: { include: { category: true } } },
    orderBy: { pricePaise: 'asc' },
  });
  const expensive = await prisma.variant.findFirst({
    where: { isActive: true, stock: { gte: 3 }, pricePaise: { gte: 150_000 }, product: { isActive: true } },
    include: { product: true },
    orderBy: { pricePaise: 'desc' },
  });

  if (!cheap) throw new Error('No cheap in-stock variant — run the seed.');

  console.log(
    `  cheap    : ${cheap.product.name} / ${cheap.size} — Rs ${cheap.pricePaise / 100} (stock ${cheap.stock})`,
  );
  if (expensive) {
    console.log(`  expensive: ${expensive.product.name} — Rs ${expensive.pricePaise / 100}`);
  }
  console.log('');

  // ---------- happy path: one cheap item, COD ----------
  const token = `smoke-${randomBytes(12).toString('hex')}`;
  await addToCartByToken(token, cheap.id, 1);

  const stockBefore = cheap.stock;

  const order = await placeOrder({
    cartToken: token,
    userId: null,
    email: 'smoke@example.com',
    phone: '+919876543210',
    address,
    paymentMethod: 'COD',
    idempotencyKey: `smoke_${randomBytes(8).toString('hex')}`,
  });
  trackOrder(order.orderNumber, cheap.id, 1);

  ok('order number matches ES-YYMMDD-XXXXXX', /^ES-\d{6}-[0-9A-F]{6}$/.test(order.orderNumber), order.orderNumber);
  ok('COD order is CONFIRMED immediately', order.status === 'CONFIRMED', order.status);
  ok('total is positive', order.totalPaise > 0, String(order.totalPaise));
  ok('COD total stays under the cap', order.totalPaise <= 150_000, String(order.totalPaise));
  ok('invoice token is issued', order.invoiceToken.length === 32);

  const afterStock = await prisma.variant.findUniqueOrThrow({ where: { id: cheap.id } });
  ok('stock decremented by 1', afterStock.stock === stockBefore - 1, `${afterStock.stock} vs ${stockBefore - 1}`);

  const cartAfter = await getCartByToken(token);
  ok('cart is emptied after checkout', cartAfter.items.length === 0);

  const stored = await prisma.order.findUniqueOrThrow({
    where: { orderNumber: order.orderNumber },
    include: { items: true, payments: true },
  });

  ok('order has one line item', stored.items.length === 1);
  ok('order item snapshots the HSN code', stored.items[0]!.hsnCode === cheap.product.category.hsnCode);
  ok('order item snapshots the SKU', stored.items[0]!.sku === cheap.sku);
  ok('order stores a payment record', stored.payments.length === 1 && stored.payments[0]!.method === 'COD');

  const componentSum =
    stored.subtotalPaise - stored.discountPaise + stored.shippingPaise + stored.codFeePaise;
  ok('stored total equals its components', stored.totalPaise === componentSum, `${stored.totalPaise} vs ${componentSum}`);
  ok('tax is computed and non-zero', stored.taxPaise > 0, String(stored.taxPaise));
  ok('COD fee is applied', stored.codFeePaise > 0, String(stored.codFeePaise));

  // ---------- idempotency ----------
  const key = `smoke_idem_${randomBytes(6).toString('hex')}`;
  const token2 = `smoke-${randomBytes(12).toString('hex')}`;
  await addToCartByToken(token2, cheap.id, 1);

  const first = await placeOrder({
    cartToken: token2,
    userId: null,
    email: 'smoke@example.com',
    phone: '+919876543210',
    address,
    paymentMethod: 'COD',
    idempotencyKey: key,
  });
  trackOrder(first.orderNumber, cheap.id, 1);

  const replay = await placeOrder({
    cartToken: 'smoke-does-not-exist',
    userId: null,
    email: 'smoke@example.com',
    phone: '+919876543210',
    address,
    paymentMethod: 'COD',
    idempotencyKey: key,
  });

  ok('replaying the same idempotency key returns the same order', replay.orderNumber === first.orderNumber);
  ok('replay is flagged as already existing', replay.alreadyExisted === true);
  const countForKey = await prisma.order.count({ where: { idempotencyKey: key } });
  ok('replay created no duplicate order', countForKey === 1, String(countForKey));

  // ---------- COD cap ----------
  if (expensive) {
    const capToken = `smoke-${randomBytes(12).toString('hex')}`;
    await addToCartByToken(capToken, expensive.id, 2);

    let capRejected = false;
    let capMessage = '';
    try {
      await placeOrder({
        cartToken: capToken,
        userId: null,
        email: 'smoke@example.com',
        phone: '+919876543210',
        address,
        paymentMethod: 'COD',
      });
    } catch (error) {
      capRejected = true;
      capMessage = error instanceof Error ? error.message : String(error);
    }
    ok('COD above the cap is rejected', capRejected, capMessage);
    ok('rejection explains COD is unavailable', /cash on delivery is not available/i.test(capMessage), capMessage);
  }

  // ---------- oversell guard (prepaid, so the COD cap is not the blocker) ----------
  const stockBeforeGuard = (await prisma.variant.findUniqueOrThrow({ where: { id: cheap.id } })).stock;
  const guardToken = `smoke-${randomBytes(12).toString('hex')}`;
  const guardCartId = (await prisma.cart.create({ data: { cartToken: guardToken } })).id;
  // Bypass the cart clamp to simulate a stale cart asking for more than exists.
  await prisma.cartItem.create({
    data: { cartId: guardCartId, variantId: cheap.id, qty: stockBeforeGuard + 50 },
  });

  let oversellRejected = false;
  let oversellMessage = '';
  try {
    await placeOrder({
      cartToken: guardToken,
      userId: null,
      email: 'smoke@example.com',
      phone: '+919876543210',
      address,
      paymentMethod: 'PREPAID',
    });
  } catch (error) {
    oversellRejected = true;
    oversellMessage = error instanceof Error ? error.message : String(error);
  }

  ok('oversell is rejected', oversellRejected, oversellMessage);
  ok('rejection names the sold-out item', /sold out/i.test(oversellMessage), oversellMessage);

  const stockAfterOversell = await prisma.variant.findUniqueOrThrow({ where: { id: cheap.id } });
  ok(
    'failed order rolled back — stock unchanged',
    stockAfterOversell.stock === stockBeforeGuard,
    `${stockAfterOversell.stock} vs ${stockBeforeGuard}`,
  );
  const ordersForGuard = await prisma.order.count({ where: { email: 'smoke@example.com', status: 'PENDING' } });
  ok('no pending order was left behind by the failed transaction', ordersForGuard === 0, String(ordersForGuard));

  // ---------- unserviceable pincode ----------
  const badToken = `smoke-${randomBytes(12).toString('hex')}`;
  await addToCartByToken(badToken, cheap.id, 1);

  let pincodeRejected = false;
  try {
    await placeOrder({
      cartToken: badToken,
      userId: null,
      email: 'smoke@example.com',
      phone: '+919876543210',
      address: { ...address, pincode: '744101' }, // seeded as non-serviceable
      paymentMethod: 'COD',
    });
  } catch {
    pincodeRejected = true;
  }
  ok('unserviceable pincode is rejected', pincodeRejected);

  // ---------- invoice PDF ----------
  const invoiceData = await getOrderForInvoice(first.orderNumber);
  ok('invoice data loads for the order', Boolean(invoiceData));

  if (invoiceData) {
    // Default render: compressed, this is what production serves.
    const pdf = await generateInvoicePdf(invoiceData.invoice);
    ok('invoice PDF is generated', pdf.length > 1000, `${pdf.length} bytes`);
    ok('invoice PDF has a PDF header', pdf.subarray(0, 5).toString('latin1') === '%PDF-');

    // Uncompressed render for content assertions (compressed streams hide text).
    const plain = extractPdfText(await generateInvoicePdf(invoiceData.invoice, { compress: false }));

    ok('invoice contains the order number', plain.includes(first.orderNumber), plain.slice(0, 120));
    ok('invoice declares TAX INVOICE', plain.includes('TAX INVOICE'));
    ok('invoice shows the HSN code', plain.includes(cheap.product.category.hsnCode));
    ok('invoice uses Rs. amounts', plain.includes('Rs.'));
    ok('invoice splits CGST/SGST intra-state', plain.includes('CGST') && plain.includes('SGST'));
    ok('invoice names the buyer', plain.includes('Smoke Buyer'));
    ok('invoice states prices include GST', /inclusive of GST/i.test(plain));
  }
}

main()
  .catch((error) => {
    console.error('Checkout test crashed:', error);
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
