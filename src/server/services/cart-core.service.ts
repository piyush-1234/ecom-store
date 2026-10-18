import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';

/**
 * Cart core — pure database operations keyed by an explicit cart token.
 *
 * Deliberately imports NO `next/headers`, so this module can be exercised outside
 * a request context (integration test: scripts/smoke-cart.ts). Cookie handling
 * lives in `cart.service.ts`.
 */

const CART_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
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

export interface CartLineDto {
  id: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  size: string;
  color: string;
  colorHex: string;
  imageUrl: string;
  unitPricePaise: number;
  qty: number;
  lineTotalPaise: number;
  stock: number;
  inStock: boolean;
}

export interface CartDto {
  id: string | null;
  items: CartLineDto[];
  itemCount: number;
  subtotalPaise: number;
  hasStockIssue: boolean;
}

export const EMPTY_CART: CartDto = {
  id: null,
  items: [],
  itemCount: 0,
  subtotalPaise: 0,
  hasStockIssue: false,
};

export interface AddResult {
  qty: number;
  clamped: boolean;
  availableStock: number;
}

type CartRow = NonNullable<Awaited<ReturnType<typeof findCartByToken>>>;

export function findCartByToken(token: string) {
  return prisma.cart.findUnique({ where: { cartToken: token }, include: CART_INCLUDE });
}

export function toDto(cart: CartRow): CartDto {
  const items: CartLineDto[] = cart.items.map((item) => {
    const variant = item.variant;
    const price = variant.pricePaise;
    const stock = variant.stock;

    return {
      id: item.id,
      variantId: variant.id,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      variantLabel: `${variant.color} / ${variant.size}`,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      imageUrl: variant.product.images[0]?.url ?? '/placeholders/tee.svg',
      unitPricePaise: price,
      qty: item.qty,
      lineTotalPaise: price * item.qty,
      stock,
      inStock: stock > 0,
    };
  });

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((total, line) => total + line.qty, 0),
    subtotalPaise: items.reduce((total, line) => total + line.lineTotalPaise, 0),
    hasStockIssue: items.some((line) => !line.inStock || line.qty > line.stock),
  };
}

/** Find or create the cart row for a token. */
export async function ensureCartForToken(token: string): Promise<string> {
  const existing = await prisma.cart.findUnique({ where: { cartToken: token } });
  if (existing) return existing.id;
  const created = await prisma.cart.create({ data: { cartToken: token } });
  return created.id;
}

export async function getCartByToken(token: string): Promise<CartDto> {
  const cart = await findCartByToken(token);
  return cart ? toDto(cart) : EMPTY_CART;
}

export async function addToCartByToken(
  token: string,
  variantId: string,
  qty: number,
): Promise<AddResult> {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new AppError('VALIDATION_ERROR', 'Quantity must be at least 1.', 422);
  }

  const variant = await prisma.variant.findFirst({
    where: { id: variantId, isActive: true, product: { isActive: true } },
    select: { id: true, stock: true },
  });

  if (!variant) {
    throw new AppError('NOT_FOUND', 'That item is no longer available.', 404);
  }
  if (variant.stock < 1) {
    throw new AppError('CONFLICT', 'That size is out of stock.', 409);
  }

  const cartId = await ensureCartForToken(token);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId } },
  });

  const requested = (existing?.qty ?? 0) + qty;
  const finalQty = Math.min(requested, variant.stock);

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { qty: finalQty },
    create: { cartId, variantId, qty: finalQty },
  });

  return { qty: finalQty, clamped: finalQty < requested, availableStock: variant.stock };
}

export async function updateCartItemQtyByToken(
  token: string,
  itemId: string,
  qty: number,
): Promise<void> {
  const cart = await prisma.cart.findUnique({ where: { cartToken: token } });
  if (!cart) throw new AppError('NOT_FOUND', 'Your cart is empty.', 404);

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { variant: { select: { stock: true } } },
  });
  if (!item) throw new AppError('NOT_FOUND', 'Item not found in your cart.', 404);

  if (qty <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return;
  }

  const clamped = Math.min(qty, Math.max(item.variant.stock, 0));
  await prisma.cartItem.update({ where: { id: item.id }, data: { qty: clamped } });
}
