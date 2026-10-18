import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import { generateCartToken, readCartToken, setCartToken } from '@/server/cart/identity';
import {
  EMPTY_CART,
  addToCartByToken,
  getCartByToken,
  updateCartItemQtyByToken,
  type AddResult,
  type CartDto,
  type CartLineDto,
} from '@/server/services/cart-core.service';

/**
 * Cookie-aware cart operations.
 *
 * Thin wrapper over `cart-core.service`: it resolves the cart token from the
 * request cookie and delegates. All business rules live in the core module.
 */

export type { AddResult, CartDto, CartLineDto };
export { EMPTY_CART };

/** Read-only: used by Server Components. Never creates a cart. */
export async function getCart(): Promise<CartDto> {
  const token = readCartToken();
  if (!token) return EMPTY_CART;
  return getCartByToken(token);
}

export async function getCartItemCount(): Promise<number> {
  const cart = await getCart();
  return cart.itemCount;
}

/** Resolve a token for a write, minting and persisting one on first use. */
function tokenForWrite(): string {
  const existing = readCartToken();
  if (existing) return existing;

  const token = generateCartToken();
  setCartToken(token);
  return token;
}

export async function addToCart(variantId: string, qty: number): Promise<AddResult> {
  return addToCartByToken(tokenForWrite(), variantId, qty);
}

export async function updateCartItemQty(itemId: string, qty: number): Promise<void> {
  const token = readCartToken();
  if (!token) throw new AppError('NOT_FOUND', 'Your cart is empty.', 404);
  await updateCartItemQtyByToken(token, itemId, qty);
}

export async function removeCartItem(itemId: string): Promise<void> {
  await updateCartItemQty(itemId, 0);
}

/**
 * Attach a guest cart to a user on sign-in (ADR-010).
 * Quantities merge and are clamped to stock; the guest cart row is deleted.
 */
export async function mergeGuestCartIntoUser(userId: string): Promise<void> {
  const token = readCartToken();
  if (!token) return;

  const guestCart = await prisma.cart.findUnique({
    where: { cartToken: token },
    include: { items: { include: { variant: { select: { stock: true } } } } },
  });
  if (!guestCart || guestCart.items.length === 0) return;

  const userCart = await prisma.cart.findFirst({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!userCart) {
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId } });
    return;
  }

  for (const item of guestCart.items) {
    const existing = userCart.items.find((row) => row.variantId === item.variantId);
    const combined = (existing?.qty ?? 0) + item.qty;
    const clamped = Math.min(combined, item.variant.stock);

    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: clamped } });
    } else if (clamped > 0) {
      await prisma.cartItem.create({
        data: { cartId: userCart.id, variantId: item.variantId, qty: clamped },
      });
    }
  }

  await prisma.cart.delete({ where: { id: guestCart.id } });

  let survivingToken = userCart.cartToken;
  if (!survivingToken) {
    survivingToken = generateCartToken();
    await prisma.cart.update({ where: { id: userCart.id }, data: { cartToken: survivingToken } });
  }
  setCartToken(survivingToken);
}
