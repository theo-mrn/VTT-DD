'use client';

/**
 * Studio du créateur : profil public, ses packs (tous statuts), ventes et compte de paiement
 * (Stripe Connect, par billing ; seulement quand la vente est ouverte).
 */
import type { CreatorProfile, StudioListing } from '@vtt/contracts';
import { CircleDollarSign, ExternalLink, Loader2, PackagePlus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvatarJoueur, Message } from '@/components/compte/elements';
import { EtatVide, Page, Panneau } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  connectApi,
  marketplaceApi,
  useConnect,
  useMarketplaceConfig,
  useMarketplaceMe,
  useMarketplaceMutation,
  useSales,
  useStudio,
} from '@/lib/marketplace/api';
import { Cover } from './elements';
import { PublishButton } from './publish-dialog';
import { useStudioLabels } from './studio-labels';
import { useProfil } from '@/lib/session';

export function StudioPage() {
  const tp = useTranslations('marketplace.publish');
  const me = useMarketplaceMe();
  const creator = me.data?.creator ?? null;
  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{tp('mine')}</h1>
        <PublishButton />
      </header>
      {me.isError && <Message>{messageErreur(me.error)}</Message>}
      {me.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {me.data && <CreatorFromAccount creator={creator} />}
      {me.data && !creator && <Skeleton className="h-40 w-full rounded-2xl" />}
      {creator && <Studio creator={creator} />}
    </Page>
  );
}

/** Nom public d'un créateur : celui du compte, dans les bornes du serveur (2 à 40). */
function creatorName(name: string): string {
  const n = name.trim().slice(0, 40);
  return n.length >= 2 ? n : n.padEnd(2, '·');
}

/**
 * Le profil de créateur est celui du compte : créé à la première visite du Studio, puis remis
 * à jour quand le nom ou la présentation du compte changent. Aucun formulaire à part.
 */
function CreatorFromAccount({ creator }: Readonly<{ creator: CreatorProfile | null }>) {
  const profil = useProfil();
  const displayName = creatorName(profil.name);
  const bio = (profil.bio ?? '').trim().slice(0, 1000);
  const synced = useRef<string | null>(null);
  const save = useMarketplaceMutation(() =>
    marketplaceApi.saveCreator({
      displayName,
      bio,
      ...(creator ? { version: creator.version } : {}),
    }),
  );
  const wanted = `${displayName}\n${bio}`;
  const upToDate = creator && creator.displayName === displayName && creator.bio === bio;

  useEffect(() => {
    if (upToDate || synced.current === wanted || save.isPending) return;
    synced.current = wanted;
    save.mutate(undefined, { onError: (e) => toast.error(messageErreur(e)) });
  }, [upToDate, wanted, save]);

  return null;
}

function Studio({ creator }: Readonly<{ creator: CreatorProfile }>) {
  const t = useTranslations('marketplace.studio.page');
  const profil = useProfil();
  const router = useRouter();
  const studio = useStudio();
  const config = useMarketplaceConfig();
  const create = useMarketplaceMutation(() =>
    marketplaceApi.createListing({ title: t('newPackTitle') }),
  );

  function newListing() {
    create.mutate(undefined, {
      onSuccess: (l) => router.push(`/marketplace/studio/${l.id}`),
      onError: (e) => toast.error(messageErreur(e)),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t('myPacks')}</h2>
          <Button size="sm" onClick={newListing} loading={create.isPending}>
            <PackagePlus aria-hidden />
            {t('newPack')}
          </Button>
        </div>
        {studio.isError && <Message>{messageErreur(studio.error)}</Message>}
        {studio.isPending && <Skeleton className="h-24 w-full rounded-2xl" />}
        {studio.data?.length === 0 && <EtatVide icone={PackagePlus} titre={t('noPacks')} />}
        <ul className="space-y-2">
          {studio.data?.map((l) => (
            <StudioRow key={l.id} listing={l} />
          ))}
        </ul>
      </section>

      <aside className="space-y-4">
        <Panneau
          titre={creator.displayName}
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/profil">{t('editProfile')}</Link>
            </Button>
          }
        >
          <div className="flex items-start gap-3">
            <AvatarJoueur
              nom={creator.displayName}
              url={profil.avatarUrl}
              bordure={profil.borderType}
            />
            <p className="line-clamp-4 min-w-0 flex-1 whitespace-pre-line text-[13px] text-muted-foreground">
              {creator.bio || '—'}
            </p>
          </div>
          <Link
            href={`/marketplace/creators/${creator.slug}`}
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
          >
            {t('publicPage')}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </Panneau>
        {config.data?.paidListings && <PayoutsPanel creator={creator} />}
      </aside>
    </div>
  );
}

function StudioRow({ listing }: Readonly<{ listing: StudioListing }>) {
  const t = useTranslations('marketplace.studio.row');
  const labels = useStudioLabels();
  const open = listing.versions.find((v) => v.status === 'draft' || v.status === 'in_review');
  const rejected = listing.versions[0]?.status === 'rejected' ? listing.versions[0] : null;
  return (
    <li>
      <Link
        href={`/marketplace/studio/${listing.id}`}
        className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-border-strong"
      >
        <span className="w-28 shrink-0 overflow-hidden rounded-lg border border-border">
          <Cover url={listing.coverUrl} alt="" />
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block truncate text-sm font-semibold">{listing.title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge
              ton={
                listing.status === 'published'
                  ? 'succes'
                  : listing.status === 'removed'
                    ? 'danger'
                    : 'neutre'
              }
            >
              {labels.listingStatus(listing.status)}
            </Badge>
            {open && (
              <Badge ton={open.status === 'in_review' ? 'info' : 'neutre'}>
                {t('openVersion', {
                  number: open.number,
                  status: labels.versionStatus(open.status),
                })}
              </Badge>
            )}
            {rejected && (
              <Badge ton="danger">{t('rejectedVersion', { number: rejected.number })}</Badge>
            )}
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-[12px] text-muted-foreground sm:block">
          <span className="block tabular-nums">
            {labels.price(listing.priceCents, listing.currency)}
          </span>
          <span className="block tabular-nums">
            {t('buyers', { count: listing.acquisitionsCount })}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Compte de paiement (Stripe Connect) et ventes. */
function PayoutsPanel({ creator }: Readonly<{ creator: CreatorProfile }>) {
  const t = useTranslations('marketplace.studio.payouts');
  const labels = useStudioLabels();
  const params = useSearchParams();
  const connect = useConnect();
  const account = connect.data?.account ?? null;
  const sales = useSales(Boolean(account));
  const [busy, setBusy] = useState(false);
  const refresh = useMarketplaceMutation(() => connectApi.refresh());

  // Retour de l'onboarding Stripe : relire le compte tout de suite, une fois
  const returned = params.get('connect') === 'return';
  const hasAccount = Boolean(account);
  const refreshed = useRef(false);
  useEffect(() => {
    if (!returned || !hasAccount || refreshed.current) return;
    refreshed.current = true;
    refresh.mutate(undefined);
  }, [returned, hasAccount, refresh]);

  async function go(kind: 'onboarding' | 'dashboard') {
    setBusy(true);
    try {
      const { url } =
        kind === 'onboarding'
          ? await connectApi.onboarding(creator.displayName)
          : await connectApi.dashboard();
      window.location.assign(url);
    } catch (err) {
      toast.error(t('paymentUnavailable'), { description: messageErreur(err) });
      setBusy(false);
    }
  }

  const status = account?.status ?? null;
  return (
    <Panneau
      titre={t('title')}
      action={
        account && (
          <Info texte={t('refresh')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('refresh')}
              onClick={() => refresh.mutate(undefined)}
              disabled={refresh.isPending}
            >
              <RefreshCw className={refresh.isPending ? 'animate-spin' : undefined} />
            </Button>
          </Info>
        )
      }
    >
      {connect.isPending ? (
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      ) : !connect.data?.enabled ? (
        <p className="text-[13px] text-subtle">{t('unavailable')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-primary" aria-hidden />
            <Badge ton={status === 'active' ? 'succes' : status ? 'alerte' : 'neutre'}>
              {status === 'active'
                ? t('active')
                : status
                  ? t('requirementsDue', { count: account!.requirementsDue })
                  : t('noAccount')}
            </Badge>
          </div>
          {status !== 'active' ? (
            <Button className="w-full" loading={busy} onClick={() => void go('onboarding')}>
              {status ? t('complete') : t('activate')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              loading={busy}
              onClick={() => void go('dashboard')}
            >
              <ExternalLink aria-hidden />
              {t('dashboard')}
            </Button>
          )}
          {sales.data && sales.data.length > 0 && (
            <ul className="divide-y divide-border/60 text-[12.5px]">
              {sales.data.slice(0, 10).map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="text-subtle">{labels.date(s.completedAt)}</span>
                  <Info
                    texte={t('saleDetail', {
                      price: labels.price(s.amount, s.currency),
                      fee: labels.price(s.fee, s.currency),
                    })}
                  >
                    <span
                      className={
                        s.status === 'completed'
                          ? 'tabular-nums'
                          : 'tabular-nums text-subtle line-through'
                      }
                    >
                      {labels.price(s.net, s.currency)}
                    </span>
                  </Info>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panneau>
  );
}
