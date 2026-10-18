'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addToCart, removeCartItem, updateCartItemQty } from '@/server/services/cart.service';
import { AppError } from '@/server/errors';

/**
 * Cart Server Actions.
 *
 * Server Actions can set cookies, which is why cart mutations live here rather
 * than in a Server Component. They are also progressively enhanced: the forms
 * work with JavaScript disabled.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

function toMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  console.error('[cart action]', error);
  return 'Something went wrong. Please try again.';
}

export async function addToCartAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const variantId = String(formData.get('variantId') ?? '');
  const qty = Number(formData.get('qty') ?? 1);

  if (!variantId) return { ok: false, message: 'Please choose a size.' };

  try {
    const result = await addToCart(variantId, Number.isFinite(qty) ? qty : 1);
    revalidatePath('/cart');
    // The header shows a live cart count.
    revalidatePath('/', 'layout');

    if (result.clamped) {
      return {
        ok: true,
        message: `Only ${result.availableStock} left — we set your quantity to ${result.qty}.`,
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

/** Adds and then navigates to the cart (the PDP "Buy now"-style path). */
export async function addToCartAndGoAction(formData: FormData): Promise<void> {
  const variantId = String(formData.get('variantId') ?? '');
  const qty = Number(formData.get('qty') ?? 1);
  if (!variantId) return;

  await addToCart(variantId, Number.isFinite(qty) ? qty : 1);
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
  redirect('/cart');
}

export async function updateQtyAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get('itemId') ?? '');
  const qty = Number(formData.get('qty') ?? 1);
  if (!itemId) return;

  try {
    await updateCartItemQty(itemId, Number.isFinite(qty) ? qty : 1);
  } catch (error) {
    // A stale cart line should not crash the page.
    console.error('[updateQtyAction]', toMessage(error));
  }
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get('itemId') ?? '');
  if (!itemId) return;

  try {
    await removeCartItem(itemId);
  } catch (error) {
    console.error('[removeItemAction]', toMessage(error));
  }
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}
