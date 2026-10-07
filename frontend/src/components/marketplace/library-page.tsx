'use client';

/**
 * Bibliothèque : mes packs, leur dernière version, les campagnes où ils sont installés (et en
 * quelle version) ; « Installer » ou « Mettre à jour » (la nouvelle version s'ajoute à côté).
 */
import { compareVersions, type LibraryItem } from '@vtt/contracts';
import { ArrowUpCircle, Download, Library, Store } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Message } from '@/components/compte/elements';
import { EtatVide, Page } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { useLibrary } from '@/lib/marketplace/api';
import { countsLabel } from '@/lib/marketplace/format';
import { Cover, MarketplaceTabs } from './elements';
import { InstallDialog } from './install-dialog';

/** Une installation est en retard sur la dernière version publiée. */
export function outdated(item: Pick<LibraryItem, 'latestVersion' | 'installs'>) {
  const latest = item.latestVersion?.number;
  return latest ? item.installs.filter((i) => compareVersions(i.versionNumber, latest) < 0) : [];
}

export function LibraryPage() {
  const t = useTranslations('marketplace.shop.library');
  const tm = useTranslations('marketplace.common');
  const library = useLibrary();
  const campaigns = useCampagnes();
  const names = useMemo(
    () => new Map((campaigns.data ?? []).map((c) => [c.id, c.name])),
    [campaigns.data],
  );
  const [installing, setInstalling] = useState<LibraryItem | null>(null);

  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{t('title')}</h1>
        <MarketplaceTabs />
      </header>

      {library.isError && <Message>{messageErreur(library.error)}</Message>}
      {library.isPending && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}
      {library.data?.length === 0 && (
        <EtatVide
          icone={Library}
          titre={t('empty')}
          action={
            <Button asChild>
              <Link href="/marketplace">
                <Store />
                {t('browse')}
              </Link>
            </Button>
          }
        />
      )}

      {library.data && library.data.length > 0 && (
        <ul className="space-y-3">
          {library.data.map((item) => {
            const late = outdated(item);
            return (
              <li
                key={item.listing.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                <Link
                  href={`/marketplace/${item.listing.slug}`}
                  className="w-full shrink-0 overflow-hidden rounded-xl border border-border sm:w-40"
                >
                  <Cover url={item.listing.coverUrl} alt="" />
                </Link>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/marketplace/${item.listing.slug}`}
                      className="truncate text-[15px] font-semibold hover:underline"
                    >
                      {item.listing.title}
                    </Link>
                    {item.latestVersion && (
                      <Badge>{tm('version', { number: item.latestVersion.number })}</Badge>
                    )}
                    {!item.available && <Badge ton="danger">{t('unavailable')}</Badge>}
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {item.listing.creator.displayName}
                    {item.latestVersion ? ` · ${countsLabel(item.latestVersion.counts)}` : ''}
                  </p>
                  {item.installs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {item.installs.map((i) => {
                        const isLate = late.includes(i);
                        return (
                          <Info
                            key={i.id}
                            texte={
                              i.status === 'started'
                                ? t('interrupted')
                                : isLate
                                  ? t('installedVersion', { version: i.versionNumber })
                                  : undefined
                            }
                          >
                            <span>
                              <Badge ton={isLate || i.status === 'started' ? 'alerte' : 'neutre'}>
                                {t('install', {
                                  campaign: names.get(i.campaignId) ?? t('unknownCampaign'),
                                  version: i.versionNumber,
                                })}
                              </Badge>
                            </span>
                          </Info>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Button
                  variant={late.length ? 'default' : 'secondary'}
                  disabled={!item.available}
                  onClick={() => setInstalling(item)}
                  className="shrink-0"
                >
                  {late.length ? <ArrowUpCircle aria-hidden /> : <Download aria-hidden />}
                  {late.length ? t('update') : t('installAction')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {installing && (
        <InstallDialog
          open
          onOpenChange={(v) => !v && setInstalling(null)}
          listingId={installing.listing.id}
          title={installing.listing.title}
          systemId={installing.latestVersion?.systemId ?? installing.listing.systemId}
          installed={installing.installs}
        />
      )}
    </Page>
  );
}
