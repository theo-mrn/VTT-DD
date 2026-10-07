'use client';

/**
 * Tuile du catalogue : couverture, titre, créateur, système, contenu, note et prix (ou
 * « Possédé »). Un lien vers la fiche.
 */
import type { ListingCard } from '@vtt/contracts';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { priceLabel } from '@/lib/marketplace/format';
import { cn } from '@/lib/utils';
import { Cover, KindBadges, RatingSummary, useSystemName } from './elements';

export const ListingTile = memo(function ListingTile({
  listing,
  href = `/marketplace/${listing.slug}`,
}: Readonly<{ listing: ListingCard; href?: string }>) {
  const t = useTranslations('marketplace.shop.tile');
  const systemName = useSystemName();
  const system = systemName(listing.systemId);
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[border-color,box-shadow] duration-150',
        'hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        '[contain-intrinsic-size:auto_18rem] [content-visibility:auto]',
      )}
    >
      <span className="relative">
        <Cover
          url={listing.coverUrl}
          alt=""
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute right-2 top-2">
          {listing.owned ? (
            <Badge ton="succes" taille="md" className="backdrop-blur">
              <Check aria-hidden />
              {t('owned')}
            </Badge>
          ) : (
            <Badge ton="verre" taille="md" className="tabular-nums backdrop-blur">
              {priceLabel(listing.priceCents, listing.currency)}
            </Badge>
          )}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-2 border-t border-border/60 p-3.5">
        <span className="min-w-0">
          <span className="line-clamp-1 text-[14px] font-semibold text-foreground">
            {listing.title}
          </span>
          <span className="line-clamp-1 text-[12px] text-muted-foreground">
            {listing.creator.displayName}
            {system ? ` · ${system}` : ''}
          </span>
        </span>
        {listing.summary && (
          <span className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
            {listing.summary}
          </span>
        )}
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <KindBadges kinds={listing.kinds} />
          <RatingSummary
            rating={listing.rating}
            count={listing.ratingCount}
            className="ml-auto text-[12px] text-muted-foreground"
          />
        </span>
      </span>
    </Link>
  );
});

export function ListingTileSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
