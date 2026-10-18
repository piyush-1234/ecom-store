import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  getProductBySlug,
  getRelatedProducts,
} from '@/server/services/catalog.service';
import { VariantPicker } from '@/components/store/variant-picker';
import { ProductCard } from '@/components/store/product-card';
import { discountPercent, formatINR, fromPaise } from '@/lib/utils/money';
import { siteConfig } from '@/lib/config/site';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProductBySlug(params.slug);
  if (!product) return { title: 'Product not found' };

  const description =
    product.shortDesc ??
    `${product.name} — ${product.fit} fit${product.gsm ? `, ${product.gsm} GSM` : ''}. Free size exchange.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      url: `/product/${product.slug}`,
      images: [{ url: product.imageUrl }],
      type: 'website',
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const product = await getProductBySlug(params.slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.categorySlug, product.id, 4);
  const discount =
    product.mrpPaise !== null ? discountPercent(product.mrpPaise, product.pricePaise) : 0;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDesc ?? product.name,
    image: product.images.map((image) => `${siteConfig.url}${image.url}`),
    sku: product.variants[0]?.sku ?? product.slug,
    brand: { '@type': 'Brand', name: siteConfig.name },
    offers: {
      '@type': 'Offer',
      url: `${siteConfig.url}/product/${product.slug}`,
      priceCurrency: 'INR',
      price: fromPaise(product.pricePaise).toFixed(2),
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: siteConfig.name },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IN',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 7,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'INR' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
      },
    },
  };

  const specs: { label: string; value: string }[] = [
    ...(product.fabric ? [{ label: 'Fabric', value: product.fabric }] : []),
    ...(product.gsm ? [{ label: 'Weight', value: `${product.gsm} GSM` }] : []),
    ...(product.wash ? [{ label: 'Wash', value: product.wash }] : []),
    { label: 'Fit', value: product.fit },
    { label: 'HSN code', value: product.hsnCode },
    { label: 'Country of origin', value: 'India' },
  ];

  return (
    <div className="container-page py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/${product.categorySlug}`} className="hover:text-accent">
              {product.categoryName}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-secondary">
            <Image
              src={product.imageUrl}
              alt={product.imageAlt}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              unoptimized={product.imageUrl.endsWith('.svg')}
            />
          </div>

          {product.images.length > 1 ? (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {product.images.slice(0, 4).map((image) => (
                <li
                  key={image.url + image.alt}
                  className="relative aspect-square overflow-hidden rounded border border-border bg-secondary"
                >
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="15vw"
                    className="object-cover"
                    unoptimized={image.url.endsWith('.svg')}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-semibold">{formatINR(product.pricePaise)}</span>
            {product.mrpPaise && product.mrpPaise > product.pricePaise ? (
              <>
                <span className="text-sm text-muted-foreground line-through">
                  {formatINR(product.mrpPaise)}
                </span>
                <span className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  {discount}% off
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{product.shortDesc}</p>

          <div className="mt-6">
            <VariantPicker variants={product.variants} />
          </div>

          <section className="mt-8" aria-labelledby="details-heading">
            <h2 id="details-heading" className="text-sm font-semibold">
              Details
            </h2>
            <dl className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
              {specs.map((spec) => (
                <div key={spec.label} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">{spec.label}</dt>
                  <dd className="text-right font-medium">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {product.careNotes ? (
            <section className="mt-6" aria-labelledby="care-heading">
              <h2 id="care-heading" className="text-sm font-semibold">
                Care
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{product.careNotes}</p>
            </section>
          ) : null}

          {product.description ? (
            <section className="mt-6" aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-sm font-semibold">
                About this piece
              </h2>
              {product.description.split('\n\n').map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-16" aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-6 text-xl font-semibold tracking-tight">
            More from {product.categoryName}
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
