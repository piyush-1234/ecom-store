/**
 * Seed data — deliberately realistic so the storefront has something honest to render.
 *
 * Volume: 2 categories · 20 t-shirts · 20 jeans · ~420 variants.
 *
 * Pricing is chosen to sit BELOW the ₹2,500 per-piece GST threshold (ADR-004), so
 * every seeded garment is taxed at 5%. One item is intentionally priced at
 * ₹2,499 (exactly at the ceiling) to exercise the boundary in manual testing.
 *
 * Idempotent: safe to run repeatedly (upserts keyed on slug / sku / code).
 * Run with: npm run db:seed
 */

import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rupees = (value: number): number => Math.round(value * 100);

type SeedVariant = {
  size: string;
  sizeOrder: number;
  color: string;
  colorHex: string;
  colorOrder: number;
  pricePaise: number;
  mrpPaise: number;
  stock: number;
  weightGrams: number;
};

type SeedProduct = {
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  fit: string;
  fabric: string;
  gsm: number | null;
  wash: string | null;
  careNotes: string;
  basePricePaise: number;
  mrpPaise: number;
  isFeatured: boolean;
  variants: SeedVariant[];
};

const TEE_SIZES: Array<{ size: string; sizeOrder: number; weightGrams: number }> = [
  { size: 'XS', sizeOrder: 10, weightGrams: 320 },
  { size: 'S', sizeOrder: 20, weightGrams: 340 },
  { size: 'M', sizeOrder: 30, weightGrams: 360 },
  { size: 'L', sizeOrder: 40, weightGrams: 380 },
  { size: 'XL', sizeOrder: 50, weightGrams: 400 },
  { size: 'XXL', sizeOrder: 60, weightGrams: 430 },
];

const DENIM_WAISTS: Array<{ size: string; sizeOrder: number; weightGrams: number }> = [
  { size: '28', sizeOrder: 28, weightGrams: 620 },
  { size: '30', sizeOrder: 30, weightGrams: 650 },
  { size: '32', sizeOrder: 32, weightGrams: 680 },
  { size: '34', sizeOrder: 34, weightGrams: 700 },
  { size: '36', sizeOrder: 36, weightGrams: 730 },
  { size: '38', sizeOrder: 38, weightGrams: 760 },
];

const TEE_COLORS: Array<{ color: string; colorHex: string; colorOrder: number }> = [
  { color: 'Black', colorHex: '#0B0B0B', colorOrder: 10 },
  { color: 'Ecru', colorHex: '#F4F1E8', colorOrder: 20 },
  { color: 'Olive', colorHex: '#5F6F3E', colorOrder: 30 },
];

/**
 * Deterministic pseudo-stock so the seed is reproducible across runs.
 * A few zeros are deliberate — the UI must handle out-of-stock variants.
 */
function stockFor(seed: number): number {
  const value = (seed * 37 + 13) % 41; // 0..40
  return value < 4 ? 0 : value;
}

// ---------------------------------------------------------------------------
// T-shirt catalogue (20)
// ---------------------------------------------------------------------------

const TEE_NAMES: Array<{ name: string; fit: string; gsm: number; price: number; mrp: number }> = [
  { name: 'Heavyweight Oversized Tee', fit: 'Oversized', gsm: 240, price: 899, mrp: 1299 },
  { name: 'Everyday Oversized Tee', fit: 'Oversized', gsm: 220, price: 799, mrp: 1099 },
  { name: 'Boxy Drop-Shoulder Tee', fit: 'Oversized', gsm: 240, price: 999, mrp: 1399 },
  { name: 'Essential Crew Tee', fit: 'Regular', gsm: 180, price: 599, mrp: 899 },
  { name: 'Combed Cotton Crew Tee', fit: 'Regular', gsm: 220, price: 799, mrp: 1099 },
  { name: 'Relaxed Fit Tee', fit: 'Relaxed', gsm: 220, price: 849, mrp: 1199 },
  { name: 'Structure Boxy Tee', fit: 'Oversized', gsm: 240, price: 949, mrp: 1349 },
  { name: 'Soft-Touch Crew Tee', fit: 'Regular', gsm: 180, price: 649, mrp: 949 },
  { name: 'Textured Knit Tee', fit: 'Regular', gsm: 220, price: 899, mrp: 1249 },
  { name: 'Washed Cotton Tee', fit: 'Relaxed', gsm: 220, price: 899, mrp: 1299 },
  { name: 'Longline Tee', fit: 'Oversized', gsm: 220, price: 849, mrp: 1199 },
  { name: 'Pocket Detail Tee', fit: 'Regular', gsm: 180, price: 699, mrp: 999 },
  { name: 'Ribbed Neck Tee', fit: 'Regular', gsm: 220, price: 749, mrp: 1049 },
  { name: 'Heavy Cotton Tee', fit: 'Oversized', gsm: 240, price: 999, mrp: 1399 },
  { name: 'Summer Light Tee', fit: 'Regular', gsm: 160, price: 549, mrp: 799 },
  { name: 'Tailored Boxy Tee', fit: 'Oversized', gsm: 220, price: 899, mrp: 1299 },
  { name: 'Garment-Dyed Tee', fit: 'Relaxed', gsm: 220, price: 949, mrp: 1349 },
  { name: 'Ringer Collar Tee', fit: 'Regular', gsm: 180, price: 749, mrp: 1099 },
  { name: 'Undyed Natural Tee', fit: 'Regular', gsm: 220, price: 849, mrp: 1199 },
  { name: 'Studio Boxy Tee', fit: 'Oversized', gsm: 240, price: 999, mrp: 1449 },
];

function buildTeeProducts(): SeedProduct[] {
  return TEE_NAMES.map((entry, index) => {
    const slug = `${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(index + 1).padStart(2, '0')}`;

    const variants: SeedVariant[] = [];
    TEE_COLORS.forEach((color, colorIdx) => {
      TEE_SIZES.forEach((size, sizeIdx) => {
        // XS and XXL carry less stock — mirrors real size curves.
        const sizeFactor = size.size === 'XS' || size.size === 'XXL' ? 0.4 : 1;
        const raw = stockFor(index * 97 + colorIdx * 13 + sizeIdx * 7);
        variants.push({
          ...size,
          ...color,
          pricePaise: rupees(entry.price),
          mrpPaise: rupees(entry.mrp),
          stock: Math.round(raw * sizeFactor),
          weightGrams: size.weightGrams,
        });
      });
    });

    return {
      slug,
      name: entry.name,
      shortDesc: `${entry.gsm} GSM combed cotton. Pre-shrunk, collar that holds its shape.`,
      description:
        `A ${entry.fit.toLowerCase()} t-shirt cut for Indian bodies in ${entry.gsm} GSM combed cotton. ` +
        'Bio-washed for softness, pre-shrunk so it stays the size you bought, and finished with a ' +
        '2x1 ribbed collar containing elastane so it does not warp after washing.\n\n' +
        'Specs: 100% combed compact cotton · side-seamed (not tubular, so it will not twist) · ' +
        'double-needle hem · shrinkage under 3% after three washes.',
      fit: entry.fit,
      fabric: '100% Combed Cotton',
      gsm: entry.gsm,
      wash: null,
      careNotes: 'Machine wash cold, inside out. Do not bleach. Tumble dry low. Warm iron if needed.',
      basePricePaise: rupees(entry.price),
      mrpPaise: rupees(entry.mrp),
      isFeatured: index < 4,
      variants,
    };
  });
}

// ---------------------------------------------------------------------------
// Jeans catalogue (20)
// ---------------------------------------------------------------------------

const DENIM_STYLES: Array<{
  name: string;
  fit: string;
  wash: string;
  weightOz: number;
  price: number;
  mrp: number;
}> = [
  { name: 'Straight Fit Jeans', fit: 'Straight', wash: 'Mid Indigo', weightOz: 12, price: 2299, mrp: 3299 },
  { name: 'Relaxed Fit Jeans', fit: 'Relaxed', wash: 'Dark Indigo', weightOz: 12, price: 2399, mrp: 3399 },
  { name: 'Wide Leg Jeans', fit: 'Wide Leg', wash: 'Light Wash', weightOz: 11, price: 2299, mrp: 3199 },
  { name: 'Slim Fit Jeans', fit: 'Slim', wash: 'Washed Black', weightOz: 11, price: 2199, mrp: 3099 },
  { name: 'Tapered Fit Jeans', fit: 'Tapered', wash: 'Mid Indigo', weightOz: 12, price: 2299, mrp: 3199 },
  { name: 'Loose Fit Jeans', fit: 'Relaxed', wash: 'Stone Wash', weightOz: 12, price: 2399, mrp: 3499 },
  { name: 'Regular Straight Jeans', fit: 'Straight', wash: 'Rinse Indigo', weightOz: 13, price: 2499, mrp: 3499 },
  { name: 'Comfort Stretch Jeans', fit: 'Straight', wash: 'Dark Indigo', weightOz: 11, price: 2199, mrp: 2999 },
  { name: 'Carpenter Jeans', fit: 'Relaxed', wash: 'Mid Indigo', weightOz: 13, price: 2499, mrp: 3599 },
  { name: 'Raw Denim Jeans', fit: 'Straight', wash: 'Raw Indigo', weightOz: 14, price: 2499, mrp: 3699 },
  { name: 'Ecru Denim Jeans', fit: 'Straight', wash: 'Ecru', weightOz: 12, price: 2299, mrp: 3199 },
  { name: 'Black Straight Jeans', fit: 'Straight', wash: 'Washed Black', weightOz: 12, price: 2299, mrp: 3199 },
  { name: 'Grey Relaxed Jeans', fit: 'Relaxed', wash: 'Grey Wash', weightOz: 12, price: 2199, mrp: 3099 },
  { name: 'Vintage Wash Jeans', fit: 'Straight', wash: 'Vintage Blue', weightOz: 12, price: 2399, mrp: 3399 },
  { name: 'Cropped Straight Jeans', fit: 'Straight', wash: 'Mid Indigo', weightOz: 11, price: 1999, mrp: 2899 },
  { name: 'Barrel Leg Jeans', fit: 'Wide Leg', wash: 'Light Wash', weightOz: 12, price: 2399, mrp: 3299 },
  { name: 'Workwear Jeans', fit: 'Relaxed', wash: 'Brown Duck', weightOz: 13, price: 2499, mrp: 3599 },
  { name: 'Slim Tapered Jeans', fit: 'Tapered', wash: 'Dark Indigo', weightOz: 11, price: 2199, mrp: 3049 },
  { name: 'Easy Straight Jeans', fit: 'Straight', wash: 'Stone Wash', weightOz: 12, price: 2199, mrp: 3099 },
  { name: 'Heavyweight Straight Jeans', fit: 'Straight', wash: 'Raw Indigo', weightOz: 14, price: 2499, mrp: 3599 },
];

function buildJeanProducts(): SeedProduct[] {
  return DENIM_STYLES.map((entry, index) => {
    const slug = `${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(index + 1).padStart(2, '0')}`;

    const variants: SeedVariant[] = DENIM_WAISTS.map((waist, waistIdx) => {
      const raw = stockFor(index * 53 + waistIdx * 11 + 3);
      return {
        ...waist,
        color: entry.wash,
        colorHex: denimHex(entry.wash),
        colorOrder: 10,
        pricePaise: rupees(entry.price),
        mrpPaise: rupees(entry.mrp),
        stock: raw,
        weightGrams: waist.weightGrams,
      };
    });

    return {
      slug,
      name: entry.name,
      shortDesc: `${entry.weightOz} oz ${entry.wash.toLowerCase()} denim. ${entry.fit} fit, free hemming.`,
      description:
        `${entry.fit} fit jeans in ${entry.weightOz} oz denim (${entry.wash}). Graded on a block built for ` +
        'Indian proportions — shorter inseam, room through the thigh, and a waistband that sits flat ' +
        'instead of gaping at the back.\n\n' +
        'Specs: 98% cotton / 2% elastane · sanforized (shrinkage under 2%) · YKK zip · bar-tacked ' +
        'stress points · chain-stitched hem. Comes with free hemming to your length.',
      fit: entry.fit,
      fabric: '98% Cotton, 2% Elastane',
      gsm: null,
      wash: entry.wash,
      careNotes:
        'Wash inside out in cold water, separately for the first two washes. Line dry in shade. Avoid bleach.',
      basePricePaise: rupees(entry.price),
      mrpPaise: rupees(entry.mrp),
      isFeatured: index < 4,
      variants,
    };
  });
}

function denimHex(wash: string): string {
  if (/black/i.test(wash)) return '#1A1A1A';
  if (/grey/i.test(wash)) return '#6B6B6B';
  if (/ecru/i.test(wash)) return '#E8E0CE';
  if (/light|stone/i.test(wash)) return '#7C9BC4';
  if (/raw/i.test(wash)) return '#1F3A5F';
  return '#2E4A7D';
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function upsertCategory(slug: string, name: string, hsnCode: string, position: number, description: string) {
  return prisma.category.upsert({
    where: { slug },
    update: { name, hsnCode, position, description },
    create: {
      slug,
      name,
      hsnCode,
      position,
      description,
      metaTitle: `${name} — buy online in India | ecomerce-store`,
      metaDesc: description.slice(0, 155),
    },
  });
}

async function seedProducts(
  categoryId: string,
  products: SeedProduct[],
): Promise<{ products: number; variants: number }> {
  let variantCount = 0;

  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        shortDesc: product.shortDesc,
        description: product.description,
        fit: product.fit,
        fabric: product.fabric,
        gsm: product.gsm,
        wash: product.wash,
        careNotes: product.careNotes,
        basePricePaise: product.basePricePaise,
        mrpPaise: product.mrpPaise,
        isFeatured: product.isFeatured,
        categoryId,
      },
      create: {
        slug: product.slug,
        name: product.name,
        shortDesc: product.shortDesc,
        description: product.description,
        fit: product.fit,
        fabric: product.fabric,
        gsm: product.gsm,
        wash: product.wash,
        careNotes: product.careNotes,
        basePricePaise: product.basePricePaise,
        mrpPaise: product.mrpPaise,
        isFeatured: product.isFeatured,
        categoryId,
        metaTitle: `${product.name} | ecomerce-store`,
        metaDesc: product.shortDesc,
      },
    });

    // Images: placeholder SVGs until real photography lands (Phase 3).
    const imageUrl = product.gsm !== null ? '/placeholders/tee.svg' : '/placeholders/jeans.svg';
    await prisma.productImage.deleteMany({ where: { productId: created.id } });
    await prisma.productImage.createMany({
      data: [
        { productId: created.id, url: imageUrl, alt: `${product.name} front`, position: 0 },
        { productId: created.id, url: imageUrl, alt: `${product.name} back`, position: 1 },
        { productId: created.id, url: imageUrl, alt: `${product.name} fabric detail`, position: 2 },
      ],
    });

    // Variants keyed on SKU.
    const prefix = product.gsm !== null ? 'TEE' : 'JEA';
    const indexTag = product.slug.slice(-2);

    for (const variant of product.variants) {
      const colorCode = variant.color.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
      const sku = `ES-${prefix}-${indexTag}-${colorCode}-${variant.size}`;

      const data: Prisma.VariantUncheckedCreateInput = {
        productId: created.id,
        sku,
        size: variant.size,
        sizeOrder: variant.sizeOrder,
        color: variant.color,
        colorHex: variant.colorHex,
        colorOrder: variant.colorOrder,
        pricePaise: variant.pricePaise,
        mrpPaise: variant.mrpPaise,
        stock: variant.stock,
        weightGrams: variant.weightGrams,
        isActive: true,
      };

      await prisma.variant.upsert({
        where: { sku },
        update: {
          pricePaise: data.pricePaise,
          mrpPaise: data.mrpPaise,
          stock: data.stock,
          sizeOrder: data.sizeOrder,
          colorOrder: data.colorOrder,
          isActive: true,
        },
        create: data,
      });
      variantCount += 1;
    }
  }

  return { products: products.length, variants: variantCount };
}

async function seedCoupons() {
  const coupons: Array<Prisma.CouponUncheckedCreateInput> = [
    {
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 10,
      minOrderPaise: rupees(1499),
      maxDiscountPaise: rupees(300),
      usageLimit: 1000,
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: 'FLAT200',
      type: 'FLAT',
      value: rupees(200),
      minOrderPaise: rupees(1999),
      usageLimit: 500,
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: 'FREESHIP',
      type: 'FREE_SHIPPING',
      value: 0,
      minOrderPaise: rupees(999),
      isActive: true,
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: { isActive: coupon.isActive },
      create: coupon,
    });
  }
  return coupons.length;
}

async function seedPincodeRules() {
  const rules: Array<Prisma.PincodeRuleUncheckedCreateInput> = [
    // Metro prefixes: fast, COD allowed.
    { prefix: '400', serviceable: true, codAllowed: true, etaDaysMin: 2, etaDaysMax: 4, state: 'Maharashtra' },
    { prefix: '110', serviceable: true, codAllowed: true, etaDaysMin: 2, etaDaysMax: 4, state: 'Delhi' },
    { prefix: '560', serviceable: true, codAllowed: true, etaDaysMin: 3, etaDaysMax: 5, state: 'Karnataka' },
    { prefix: '600', serviceable: true, codAllowed: true, etaDaysMin: 3, etaDaysMax: 5, state: 'Tamil Nadu' },
    // COD not available (example of a prepaid-only zone).
    { prefix: '190', serviceable: true, codAllowed: false, etaDaysMin: 5, etaDaysMax: 8, state: 'Jammu & Kashmir' },
    // Explicitly not serviceable (example of a remote exclusion).
    {
      pincode: '744101',
      serviceable: false,
      codAllowed: false,
      etaDaysMin: 0,
      etaDaysMax: 0,
      state: 'Andaman & Nicobar',
      notes: 'Courier does not service this pincode',
    },
  ];

  for (const rule of rules) {
    if (rule.pincode) {
      await prisma.pincodeRule.upsert({
        where: { pincode: rule.pincode },
        update: rule,
        create: rule,
      });
    } else if (rule.prefix) {
      const existing = await prisma.pincodeRule.findFirst({ where: { prefix: rule.prefix } });
      if (existing) {
        await prisma.pincodeRule.update({ where: { id: existing.id }, data: rule });
      } else {
        await prisma.pincodeRule.create({ data: rule });
      }
    }
  }
  return rules.length;
}

async function main() {
  console.log('Seeding ecomerce-store…');

  const tees = await upsertCategory(
    't-shirts',
    'T-Shirts',
    '6109',
    0,
    'Premium cotton t-shirts in oversized, regular and relaxed fits. 180–240 GSM, pre-shrunk, built for Indian bodies.',
  );
  const jeans = await upsertCategory(
    'jeans',
    'Jeans',
    '6203',
    1,
    'Straight, relaxed and wide-leg jeans graded for Indian proportions. 11–14 oz denim with free hemming.',
  );

  const teeResult = await seedProducts(tees.id, buildTeeProducts());
  const jeanResult = await seedProducts(jeans.id, buildJeanProducts());

  const couponCount = await seedCoupons();
  const pincodeCount = await seedPincodeRules();

  const [productTotal, variantTotal, inStock] = await Promise.all([
    prisma.product.count(),
    prisma.variant.count(),
    prisma.variant.count({ where: { stock: { gt: 0 } } }),
  ]);

  console.log('');
  console.log('  Categories   : 2  (T-Shirts 6109, Jeans 6203)');
  console.log(`  T-shirts     : ${teeResult.products} products, ${teeResult.variants} variants`);
  console.log(`  Jeans        : ${jeanResult.products} products, ${jeanResult.variants} variants`);
  console.log(`  Coupons      : ${couponCount}`);
  console.log(`  Pincode rules: ${pincodeCount}`);
  console.log('  ─────────────────────────────────────────');
  console.log(`  Total        : ${productTotal} products, ${variantTotal} variants`);
  console.log(`  In stock     : ${inStock} / ${variantTotal}`);
  console.log('');
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
