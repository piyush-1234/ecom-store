import Link from 'next/link';
import Image from 'next/image';
import type { ProductCardDto } from '@/server/services/catalog.service';
import { discountPercent, formatINR } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

interface ProductCardProps {
  product: ProductCardDto;
  priority?: boolean;
  className?: string;
}

export function ProductCard({ product, priority = false, className }: ProductCardProps) {
  const discount =
    product.mrpPaise !== null ? discountPercent(product.mrpPaise, product.pricePaise) : 0;

  return (
    <article className={cn('group', className)}>
      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-secondary">
          <Image
            src={product.imageUrl}
            alt={product.imageAlt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            unoptimized={product.imageUrl.endsWith('.svg')}
          />

          {discount >= 5 ? (
            <span className="absolute left-2 top-2 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
              {discount}% off
            </span>
          ) : null}

          {!product.inStock ? (
            <span className="absolute inset-x-0 bottom-0 bg-foreground/80 py-1.5 text-center text-xs font-medium text-background">
              Out of stock
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-1">
          <h3 className="text-sm font-medium leading-snug">{product.name}</h3>

          <p className="text-xs text-muted-foreground">
            {product.fit}
            {product.gsm ? ` · ${product.gsm} GSM` : ''}
          </p>

          <p className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold">{formatINR(product.pricePaise)}</span>
            {product.mrpPaise && product.mrpPaise > product.pricePaise ? (
              <span className="text-xs text-muted-foreground line-through">
                {formatINR(product.mrpPaise)}
              </span>
            ) : null}
          </p>
        </div>
      </Link>
    </article>
  );
}
