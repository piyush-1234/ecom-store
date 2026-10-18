import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import { serverEnv } from '@/lib/env';
import { gstStateCode } from '@/lib/validators/address';
import {
  computeOrderTotals,
  isCodAllowed,
  pricingOptionsFromEnv,
  type PaymentMethod,
} from '@/server/services/pricing.service';
import { checkServiceability } from '@/server/services/pincode.service';
import { createInvoiceToken } from '@/server/invoice/token';
import type { InvoiceOrder, InvoiceItem } from '@/server/invoice/pdf';

/**
 * Checkout / order placement.
 *
 * The single most important guarantee in this file: stock is decremented inside
 * the same transaction as the order insert, using a *conditional* update
 * (`WHERE stock >= qty`). If two customers race for the last piece, exactly one
 * succeeds and the other gets a CONFLICT — no overselling, no negative stock.
 */

export interface CheckoutAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface PlaceOrderInput {
  cartToken: string;
  userId: string | null;
  email: string;
  phone: string;
  address: CheckoutAddress;
  paymentMethod: PaymentMethod;
  /** Reused on retry to make order creation idempotent. */
  idempotencyKey?: string;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalPaise: number;
  paymentMethod: PaymentMethod;
  invoiceToken: string;
  alreadyExisted: boolean;
}

const CART_INCLUDE = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: { images: { orderBy: { position: 'asc' }, take: 1 }, category: true },
          },
        },
      },
    },
  },
} as const;

function orderNumber(): string {
  const now = new Date();
  const stamp =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  return `ES-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const env = serverEnv();
  const pricing = pricingOptionsFromEnv();

  // --- idempotency: a retried submit must not create a second order ---
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, orderNumber: true, status: true, totalPaise: true, paymentMethod: true },
    });
    if (existing) {
      return {
        id: existing.id,
        orderNumber: existing.orderNumber,
        status: existing.status,
        totalPaise: existing.totalPaise,
        paymentMethod: existing.paymentMethod as PaymentMethod,
        invoiceToken: createInvoiceToken(existing.orderNumber),
        alreadyExisted: true,
      };
    }
  }

  const cart = await prisma.cart.findUnique({
    where: { cartToken: input.cartToken },
    include: CART_INCLUDE,
  });

  if (!cart || cart.items.length === 0) {
    throw new AppError('CONFLICT', 'Your cart is empty.', 409);
  }

  // --- serviceability ---
  const serviceability = await checkServiceability(input.address.pincode);
  if (!serviceability.serviceable) {
    throw new AppError(
      'CONFLICT',
      `We cannot deliver to ${input.address.pincode} yet. Please try another address.`,
      409,
    );
  }

  // --- pricing (server-side, from database prices) ---
  const lines = cart.items.map((item) => ({
    unitPricePaise: item.variant.pricePaise,
    qty: item.qty,
    hsnCode: item.variant.product.category.hsnCode,
  }));

  const totals = computeOrderTotals(lines, {
    ...pricing,
    sellerStateCode: env.GST_SELLER_STATE_CODE,
    shipStateCode: gstStateCode(input.address.state) || env.GST_SELLER_STATE_CODE,
    paymentMethod: input.paymentMethod,
  });

  if (input.paymentMethod === 'COD') {
    const allowed = isCodAllowed({
      totalPaise: totals.totalPaise,
      codMaxAmountPaise: env.COD_MAX_AMOUNT_PAISE,
      pincodeAllowsCod: serviceability.codAllowed,
    });
    if (!allowed) {
      throw new AppError(
        'CONFLICT',
        'Cash on delivery is not available for this order. Please pay online.',
        409,
      );
    }
  }

  const shippingAddress = {
    fullName: input.address.fullName,
    phone: input.address.phone,
    line1: input.address.line1,
    line2: input.address.line2 ?? null,
    landmark: input.address.landmark ?? null,
    city: input.address.city,
    state: input.address.state,
    pincode: input.address.pincode,
  };

  const created = await prisma.$transaction(async (tx) => {
    // 1. Reserve stock atomically. Any failure throws and rolls back everything.
    for (const [index, item] of cart.items.entries()) {
      const line = lines[index]!;
      const updated = await tx.variant.updateMany({
        where: { id: item.variantId, stock: { gte: line.qty } },
        data: { stock: { decrement: line.qty } },
      });

      if (updated.count !== 1) {
        throw new AppError(
          'CONFLICT',
          `${item.variant.product.name} (${item.variant.size}) just sold out. Please remove it and try again.`,
          409,
        );
      }
    }

    // 2. Create the order.
    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        userId: input.userId,
        email: input.email,
        phone: input.phone,
        status: input.paymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING',
        paymentMethod: input.paymentMethod,
        shippingAddress,
        shipCity: input.address.city,
        shipState: input.address.state,
        shipPincode: input.address.pincode,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        shippingPaise: totals.shippingPaise,
        codFeePaise: totals.codFeePaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        idempotencyKey: input.idempotencyKey ?? null,
        confirmedAt: input.paymentMethod === 'COD' ? new Date() : null,
        items: {
          create: cart.items.map((item, index) => {
            const priced = totals.lines[index]!;
            const image = item.variant.product.images[0]?.url ?? null;

            return {
              variantId: item.variantId,
              productId: item.variant.productId,
              productName: item.variant.product.name,
              variantLabel: `${item.variant.color} / ${item.variant.size}`,
              sku: item.variant.sku,
              hsnCode: priced.hsnCode,
              imageUrl: image,
              unitPricePaise: item.variant.pricePaise,
              qty: item.qty,
              weightGrams: item.variant.weightGrams,
              taxRatePct: priced.ratePct,
              taxableValuePaise: priced.taxableValuePaise,
              taxPaise: priced.taxPaise,
              discountPaise: priced.discountPaise,
              lineTotalPaise: priced.grossPaise,
            };
          }),
        },
      },
    });

    // 3. Payment intent.
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: input.paymentMethod === 'COD' ? 'COD' : 'RAZORPAY',
        method: input.paymentMethod,
        status: 'PENDING',
        amountPaise: totals.totalPaise,
      },
    });

    // 4. Empty the cart.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.delete({ where: { id: cart.id } });

    return order;
  });

  return {
    id: created.id,
    orderNumber: created.orderNumber,
    status: created.status,
    totalPaise: created.totalPaise,
    paymentMethod: created.paymentMethod as PaymentMethod,
    invoiceToken: createInvoiceToken(created.orderNumber),
    alreadyExisted: false,
  };
}

/** Load an order and shape it for the invoice renderer. */
export async function getOrderForInvoice(orderNumberValue: string): Promise<{
  userId: string | null;
  invoice: InvoiceOrder;
} | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumberValue },
    include: { items: true, payments: true },
  });
  if (!order) return null;

  const address = order.shippingAddress as unknown as CheckoutAddress;

  const items: InvoiceItem[] = order.items.map((item) => ({
    productName: item.productName,
    variantLabel: item.variantLabel,
    hsnCode: item.hsnCode,
    qty: item.qty,
    unitPricePaise: item.unitPricePaise,
    taxableValuePaise: item.taxableValuePaise,
    taxPaise: item.taxPaise,
    taxRatePct: item.taxRatePct,
    lineTotalPaise: item.lineTotalPaise,
  }));

  return {
    userId: order.userId,
    invoice: {
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      email: order.email,
      phone: order.phone,
      paymentMethod: order.paymentMethod as 'PREPAID' | 'COD',
      status: order.status,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2 ?? null,
        landmark: address.landmark ?? null,
        city: order.shipCity,
        state: order.shipState,
        pincode: order.shipPincode,
      },
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      codFeePaise: order.codFeePaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
      items,
    },
  };
}

export interface OrderSummary {
  orderNumber: string;
  status: string;
  placedAt: Date;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  email: string;
  items: {
    productName: string;
    variantLabel: string;
    qty: number;
    lineTotalPaise: number;
    imageUrl: string | null;
  }[];
  etaDaysMin?: number;
  etaDaysMax?: number;
}

export async function getOrderSummary(orderNumberValue: string): Promise<OrderSummary | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumberValue },
    include: { items: true },
  });
  if (!order) return null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    paymentMethod: order.paymentMethod as PaymentMethod,
    totalPaise: order.totalPaise,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    taxPaise: order.taxPaise,
    email: order.email,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantLabel: item.variantLabel,
      qty: item.qty,
      lineTotalPaise: item.lineTotalPaise,
      imageUrl: item.imageUrl,
    })),
  };
}
