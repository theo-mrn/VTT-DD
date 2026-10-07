'use client';

/** Page publique d'un créateur : présentation et packs en vente. */
import { PackageSearch } from 'lucide-react';
import { Message } from '@/components/compte/elements';
import { EtatVide, Page } from '@/components/commun/page';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import { useCreatorPage } from '@/lib/marketplace/api';
import { MarketplaceTabs } from './elements';
import { ListingTile } from './listing-tile';

export function CreatorPage({ slug }: Readonly<{ slug: string }>) {
  const page = useCreatorPage(slug);
  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {page.data ? (
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              {page.data.creator.displayName}
            </h1>
          ) : (
            <Skeleton className="h-8 w-48" />
          )}
        </div>
        <MarketplaceTabs />
      </header>
      {page.isError && <Message>{messageErreur(page.error)}</Message>}
      {page.data?.creator.bio && (
        <p className="mb-6 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {page.data.creator.bio}
        </p>
      )}
      {page.data && page.data.listings.length === 0 && (
        <EtatVide icone={PackageSearch} titre="Aucun pack en vente" />
      )}
      {page.data && page.data.listings.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {page.data.listings.map((l) => (
            <li key={l.id}>
              <ListingTile listing={l} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
