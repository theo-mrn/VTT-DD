'use client';

/**
 * Fiche d'un pack : galerie, description, contenu, versions, avis ; à droite, l'essentiel et
 * l'action (obtenir, acheter, installer, gérer). Au retour d'un achat (`?purchased=1`), la
 * fiche se relit jusqu'à ce que l'acquisition arrive (le paiement passe par le bus).
 */
import { PAGES_FRONT, type ListingDetail } from '@vtt/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, Flag, Library, Loader2, Pencil, Scale, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { Page } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  marketplaceApi,
  marketplaceKeys,
  useListing,
  useMarketplaceConfig,
  useMarketplaceMutation,
} from '@/lib/marketplace/api';
import {
  countsLabel,
  dateLabel,
  LICENSE_LABELS,
  LISTING_STATUS_LABELS,
  priceLabel,
} from '@/lib/marketplace/format';
import { cn } from '@/lib/utils';
import {
  Cover,
  KindBadges,
  MarketplaceTabs,
  RatingSummary,
  useSystemName,
  WarningBadges,
} from './elements';
import { InstallDialog } from './install-dialog';
import { ReportDialog } from './report-dialog';
import { ReviewsSection } from './reviews';

/** Relectures au retour d'un achat, le temps que la vente arrive par le bus. */
const PURCHASE_POLL_MS = 2_000;
const PURCHASE_POLL_MAX = 15;

export function ListingPage({ slug }: Readonly<{ slug: string }>) {
  const t = useTranslations('marketplace.shop.listing');
  const listing = useListing(slug);
  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">{listing.data?.title ?? t('fallbackTitle')}</h1>
        <MarketplaceTabs className="ml-auto" />
      </header>
      {listing.isError && <Message>{messageErreur(listing.error)}</Message>}
      {listing.isPending && <ListingSkeleton />}
      {listing.data && <Listing listing={listing.data} />}
    </Page>
  );
}

function Listing({ listing }: Readonly<{ listing: ListingDetail }>) {
  const t = useTranslations('marketplace.shop.listing');
  const tm = useTranslations('marketplace.common');
  const images = [listing.coverUrl, ...listing.gallery].filter((u): u is string => Boolean(u));
  const [shown, setShown] = useState(0);
  const latest = listing.versions[0] ?? null;
  const systemName = useSystemName();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border">
            <Cover url={images[shown] ?? null} alt={listing.title} />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  aria-label={t('image', { index: i + 1 })}
                  aria-pressed={i === shown}
                  onClick={() => setShown(i)}
                  className={cn(
                    'w-28 shrink-0 overflow-hidden rounded-lg border transition-colors',
                    i === shown ? 'border-primary' : 'border-border hover:border-border-strong',
                  )}
                >
                  <Cover url={url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {listing.description && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('description')}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {listing.description}
            </p>
          </section>
        )}

        {listing.versions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('versions')}</h2>
            <ol className="space-y-3">
              {listing.versions.map((v) => (
                <li key={v.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold tabular-nums">
                      {tm('version', { number: v.number })}
                    </span>
                    <span className="text-muted-foreground">{countsLabel(v.counts)}</span>
                    <span className="ml-auto text-xs text-subtle">{dateLabel(v.publishedAt)}</span>
                  </div>
                  {v.notes && (
                    <p className="mt-2 whitespace-pre-line text-[13px] text-muted-foreground">
                      {v.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <ReviewsSection listing={listing} />
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-surface">
          <div className="space-y-1">
            <p className="text-lg font-semibold leading-tight tracking-tight">{listing.title}</p>
            <p className="text-[13px] text-muted-foreground">
              {listing.creator.slug ? (
                <Link
                  href={`/marketplace/creators/${listing.creator.slug}`}
                  className="hover:text-foreground hover:underline"
                >
                  {listing.creator.displayName}
                </Link>
              ) : (
                listing.creator.displayName
              )}
            </p>
          </div>
          {listing.summary && (
            <p className="text-[13px] text-muted-foreground">{listing.summary}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {listing.status !== 'published' && (
              <Badge ton={listing.status === 'removed' ? 'danger' : 'neutre'}>
                {LISTING_STATUS_LABELS[listing.status]}
              </Badge>
            )}
            <KindBadges kinds={listing.kinds} />
            <WarningBadges warnings={listing.contentWarnings} />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {listing.systemId && (
              <>
                <dt className="text-subtle">{t('system')}</dt>
                <dd>{systemName(listing.systemId)}</dd>
              </>
            )}
            {latest && (
              <>
                <dt className="text-subtle">{t('content')}</dt>
                <dd>{countsLabel(latest.counts)}</dd>
              </>
            )}
            <dt className="text-subtle">{t('license')}</dt>
            <dd className="flex items-center gap-1.5">
              {LICENSE_LABELS[listing.license]}
              {listing.attribution && (
                <Info texte={listing.attribution}>
                  <Scale className="size-3.5 text-subtle" aria-label={t('credits')} />
                </Info>
              )}
            </dd>
            {listing.ratingCount > 0 && (
              <>
                <dt className="text-subtle">{t('rating')}</dt>
                <dd>
                  <RatingSummary rating={listing.rating} count={listing.ratingCount} />
                </dd>
              </>
            )}
            {listing.tags.length > 0 && (
              <>
                <dt className="text-subtle">{t('tags')}</dt>
                <dd className="text-muted-foreground">{listing.tags.join(', ')}</dd>
              </>
            )}
          </dl>

          <ListingActions listing={listing} />
        </div>
      </aside>
    </div>
  );
}

function ListingActions({ listing }: Readonly<{ listing: ListingDetail }>) {
  const t = useTranslations('marketplace.shop.listing');
  const client = useQueryClient();
  const params = useSearchParams();
  const config = useMarketplaceConfig();
  const [installing, setInstalling] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [paying, setPaying] = useState(false);
  const acquire = useMarketplaceMutation(() => marketplaceApi.acquire(listing.id));
  const waitingPurchase = params.get('purchased') === '1' && !listing.owned;

  // Retour d'un achat : la vente arrive par le bus, quelques secondes après le paiement
  useEffect(() => {
    if (!waitingPurchase) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      void client.invalidateQueries({ queryKey: marketplaceKeys.listing(listing.slug) });
      if (tries >= PURCHASE_POLL_MAX) clearInterval(timer);
    }, PURCHASE_POLL_MS);
    return () => clearInterval(timer);
  }, [waitingPurchase, client, listing.slug]);

  async function buy() {
    setPaying(true);
    try {
      const { url } = await marketplaceApi.checkout(
        listing.id,
        `${PAGES_FRONT.marketplace}/${listing.slug}?purchased=1`,
      );
      window.location.assign(url);
    } catch (err) {
      toast.error(t('paymentUnavailable'), { description: messageErreur(err) });
      setPaying(false);
    }
  }

  const removed = listing.status === 'removed';
  const forSale = listing.status === 'published';
  let main;
  if (listing.mine)
    main = (
      <Button asChild className="w-full">
        <Link href={`/marketplace/studio/${listing.id}`}>
          <Pencil aria-hidden />
          {t('manage')}
        </Link>
      </Button>
    );
  else if (listing.owned)
    main = (
      <Button className="w-full" disabled={removed} onClick={() => setInstalling(true)}>
        <Download aria-hidden />
        {t('install')}
      </Button>
    );
  else if (waitingPurchase)
    main = (
      <Button className="w-full" disabled>
        <Loader2 className="animate-spin" aria-hidden />
        {t('confirmingPayment')}
      </Button>
    );
  else if (forSale && listing.priceCents === 0)
    main = (
      <Button
        className="w-full"
        loading={acquire.isPending}
        onClick={() =>
          acquire.mutate(undefined, {
            onSuccess: () => toast.success(t('addedToLibrary')),
            onError: (e) => toast.error(messageErreur(e)),
          })
        }
      >
        <Library aria-hidden />
        {t('getFree')}
      </Button>
    );
  else if (forSale && config.data?.paidListings)
    main = (
      <Button className="w-full" loading={paying} onClick={() => void buy()}>
        <ShoppingBag aria-hidden />
        {t('buy', { price: priceLabel(listing.priceCents, listing.currency) })}
      </Button>
    );

  return (
    <div className="space-y-2">
      {listing.owned && !listing.mine && (
        <p className="flex items-center gap-1.5 text-[13px] text-success">
          <Check className="size-4" aria-hidden />
          {t('inLibrary')}
        </p>
      )}
      {!listing.owned && !listing.mine && (
        <p className="text-xl font-semibold tabular-nums">
          {priceLabel(listing.priceCents, listing.currency)}
        </p>
      )}
      {main}
      {listing.mine && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setInstalling(true)}
          disabled={removed || listing.versions.length === 0}
        >
          <Download aria-hidden />
          {t('install')}
        </Button>
      )}
      {!listing.mine && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setReporting(true)}
        >
          <Flag aria-hidden />
          {t('report')}
        </Button>
      )}
      <InstallDialog
        open={installing}
        onOpenChange={setInstalling}
        listingId={listing.id}
        title={listing.title}
        systemId={listing.systemId}
      />
      <ReportDialog open={reporting} onOpenChange={setReporting} listingId={listing.id} />
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
