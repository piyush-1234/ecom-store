'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/server/auth/guards';
import { productInputSchema, couponInputSchema } from '@/lib/validators/admin';
import {
  createProduct,
  getProductForEdit,
  setProductActive,
  setVariantStock,
  updateProduct,
  type VariantInput,
} from '@/server/services/admin-products.service';
import { createCoupon, setCouponActive } from '@/server/services/admin-coupons.service';
import { AppError } from '@/server/errors';

/**
 * Admin catalogue actions.
 *
 * Forms use a compact "sizes × colours" matrix instead of dozens of inputs: the
 * admin types `S,M,L,XL` and `Black:#0B0B0B,Olive:#5F6F3E` and the variant matrix is
 * generated. One colour and one size still produces exactly one variant.
 */

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseColors(raw: string): { name: string; hex: string }[] {
  const entries = parseList(raw);
  if (entries.length === 0) return [{ name: 'Black', hex: '#0B0B0B' }];

  return entries.map((entry) => {
    const [name, hex] = entry.split(':');
    const cleanName = (name ?? 'Colour').trim();
    const cleanHex = (hex ?? '').trim();
    return {
      name: cleanName,
      hex: /^#[0-9A-Fa-f]{6}$/.test(cleanHex) ? cleanHex : '#0B0B0B',
    };
  });
}

function backWith(path: string, params: Record<string, string> = {}): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${path}${query ? `?${query}` : ''}`);
}

async function runAdmin(path: string, work: () => Promise<string | void>): Promise<never> {
  let destination = path;
  try {
    await requireAdmin();
    const result = await work();
    if (typeof result === 'string') destination = result;
    revalidatePath('/admin/products');
    revalidatePath('/admin/inventory');
    backWith(destination, { ok: '1' });
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Action failed.';
    if (!(error instanceof AppError)) console.error('[admin catalog]', error);
    backWith(path, { error: message });
  }
}

function buildVariants(formData: FormData): VariantInput[] {
  const sizes = parseList(String(formData.get('sizes') ?? ''));
  const colors = parseColors(String(formData.get('colors') ?? ''));

  const pricePaise = Math.round(Number(formData.get('priceRupees') ?? 0) * 100);
  const mrpPaiseRaw = Number(formData.get('mrpRupees') ?? 0);
  const stock = Math.max(0, Math.floor(Number(formData.get('stock') ?? 0)));
  const weightGrams = Math.max(100, Math.floor(Number(formData.get('weightGrams') ?? 400)));

  const variants: VariantInput[] = [];

  sizes.forEach((size, sizeIndex) => {
    colors.forEach((color, colorIndex) => {
      variants.push({
        size,
        // Numeric sizes (waists) sort numerically; letter sizes fall back to index.
        sizeOrder: /^\d+$/.test(size) ? Number(size) : (sizeIndex + 1) * 10,
        color: color.name,
        colorHex: color.hex,
        colorOrder: (colorIndex + 1) * 10,
        pricePaise,
        mrpPaise: mrpPaiseRaw > 0 ? Math.round(mrpPaiseRaw * 100) : null,
        stock,
        weightGrams,
        isActive: true,
      });
    });
  });

  return variants;
}

export async function createProductAction(formData: FormData): Promise<never> {
  return runAdmin('/admin/products/new', async () => {
    const parsed = productInputSchema.safeParse({
      name: String(formData.get('name') ?? ''),
      slug: String(formData.get('slug') ?? '') || undefined,
      categoryId: String(formData.get('categoryId') ?? ''),
      fit: String(formData.get('fit') ?? ''),
      shortDesc: String(formData.get('shortDesc') ?? '') || undefined,
      description: String(formData.get('description') ?? '') || undefined,
      fabric: String(formData.get('fabric') ?? '') || undefined,
      gsm: formData.get('gsm') || undefined,
      wash: String(formData.get('wash') ?? '') || undefined,
      careNotes: String(formData.get('careNotes') ?? '') || undefined,
      priceRupees: String(formData.get('priceRupees') ?? ''),
      mrpRupees: formData.get('mrpRupees') || undefined,
      isActive: formData.get('isActive') === 'on',
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new AppError('VALIDATION_ERROR', first ? `${first.path.join('.')}: ${first.message}` : 'Invalid product', 422);
    }

    const variants = buildVariants(formData);
    if (variants.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Enter at least one size.', 422);
    }

    const created = await createProduct({
      ...parsed.data,
      slug: parsed.data.slug,
      basePricePaise: Math.round(parsed.data.priceRupees * 100),
      mrpPaise: parsed.data.mrpRupees ? Math.round(parsed.data.mrpRupees * 100) : null,
      shortDesc: parsed.data.shortDesc ?? null,
      description: parsed.data.description ?? null,
      fabric: parsed.data.fabric ?? null,
      gsm: parsed.data.gsm ?? null,
      wash: parsed.data.wash ?? null,
      careNotes: parsed.data.careNotes ?? null,
      images: [
        {
          url: String(formData.get('imageUrl') ?? '') || '/placeholders/tee.svg',
          alt: parsed.data.name,
        },
      ],
      variants,
    });

    return `/admin/products/${created.slug}`;
  });
}

export async function updateProductAction(formData: FormData): Promise<never> {
  const slug = String(formData.get('slug') ?? '');
  return runAdmin(`/admin/products/${slug}`, async () => {
    // Read the existing variants from the database and merge in the edited
    // price/stock/active values, so the form never has to round-trip size metadata.
    const existing = await getProductForEdit(slug);
    if (!existing) throw new AppError('NOT_FOUND', 'Product not found.', 404);

    const variants: VariantInput[] = existing.variants.map((variant) => ({
      id: variant.id,
      size: variant.size,
      sizeOrder: variant.sizeOrder,
      color: variant.color,
      colorHex: variant.colorHex,
      colorOrder: variant.colorOrder,
      weightGrams: variant.weightGrams,
      pricePaise: Math.round(Number(formData.get(`price_${variant.id}`) ?? variant.pricePaise / 100) * 100),
      mrpPaise: variant.mrpPaise,
      stock: Math.max(0, Math.floor(Number(formData.get(`stock_${variant.id}`) ?? variant.stock))),
      isActive: formData.get(`active_${variant.id}`) === 'on',
    }));

    await updateProduct(slug, {
      name: String(formData.get('name') ?? ''),
      categoryId: String(formData.get('categoryId') ?? ''),
      fit: String(formData.get('fit') ?? ''),
      shortDesc: String(formData.get('shortDesc') ?? '') || null,
      description: String(formData.get('description') ?? '') || null,
      fabric: String(formData.get('fabric') ?? '') || null,
      gsm: Number(formData.get('gsm')) || null,
      wash: String(formData.get('wash') ?? '') || null,
      careNotes: String(formData.get('careNotes') ?? '') || null,
      basePricePaise: Math.round(Number(formData.get('priceRupees') ?? 0) * 100),
      mrpPaise:
        Number(formData.get('mrpRupees') ?? 0) > 0
          ? Math.round(Number(formData.get('mrpRupees')) * 100)
          : null,
      isActive: formData.get('isActive') === 'on',
      variants,
    });
  });
}

export async function toggleProductAction(formData: FormData): Promise<never> {
  const slug = String(formData.get('slug') ?? '');
  const activate = formData.get('activate') === '1';
  return runAdmin('/admin/products', async () => {
    await setProductActive(slug, activate);
  });
}

export async function setStockAction(formData: FormData): Promise<never> {
  const variantId = String(formData.get('variantId') ?? '');
  const stock = Number(formData.get('stock') ?? 0);
  const backTo = String(formData.get('backTo') ?? '/admin/inventory');
  return runAdmin(backTo, async () => {
    await setVariantStock(variantId, stock);
  });
}

export async function createCouponAction(formData: FormData): Promise<never> {
  return runAdmin('/admin/coupons', async () => {
    const parsed = couponInputSchema.safeParse({
      code: String(formData.get('code') ?? ''),
      type: String(formData.get('type') ?? 'PERCENT'),
      value: String(formData.get('value') ?? '0'),
      minOrderRupees: String(formData.get('minOrderRupees') ?? '0'),
      maxDiscountRupees: formData.get('maxDiscountRupees') || undefined,
      usageLimit: formData.get('usageLimit') || undefined,
      perUserLimit: String(formData.get('perUserLimit') ?? '1'),
      startsAt: formData.get('startsAt') || undefined,
      expiresAt: formData.get('expiresAt') || undefined,
      isActive: true,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new AppError('VALIDATION_ERROR', first ? first.message : 'Invalid coupon', 422);
    }

    await createCoupon(parsed.data);
  });
}

export async function toggleCouponAction(formData: FormData): Promise<never> {
  const couponId = String(formData.get('couponId') ?? '');
  const activate = formData.get('activate') === '1';
  return runAdmin('/admin/coupons', async () => {
    await setCouponActive(couponId, activate);
  });
}
