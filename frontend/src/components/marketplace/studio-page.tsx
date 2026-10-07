'use client';

/**
 * Studio du créateur : profil public, ses packs (tous statuts), ventes et compte de paiement
 * (Stripe Connect, par billing ; seulement quand la vente est ouverte).
 */
import type { CreatorProfile, StudioListing } from '@vtt/contracts';
import {
  CircleDollarSign,
  ExternalLink,
  Loader2,
  PackagePlus,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { EtatVide, Page, Panneau } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import {
  dateLabel,
  LISTING_STATUS_LABELS,
  priceLabel,
  VERSION_STATUS_LABELS,
} from '@/lib/marketplace/format';
import { Cover, MarketplaceTabs } from './elements';

export function StudioPage() {
  const me = useMarketplaceMe();
  const creator = me.data?.creator ?? null;
  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Studio</h1>
        <MarketplaceTabs />
      </header>
      {me.isError && <Message>{messageErreur(me.error)}</Message>}
      {me.isPending && <Skeleton className="h-40 w-full rounded-2xl" />}
      {me.data && !creator && <CreatorSetup />}
      {creator && <Studio creator={creator} />}
    </Page>
  );
}

/** Première visite : nom public et présentation. */
function CreatorSetup() {
  return (
    <EtatVide
      icone={Wand2}
      titre="Publiez vos créations"
      action={<CreatorDialogButton creator={null} label="Créer mon profil de créateur" />}
    />
  );
}

function CreatorDialogButton({
  creator,
  label,
}: Readonly<{ creator: CreatorProfile | null; label: string }>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(creator?.displayName ?? '');
  const [bio, setBio] = useState(creator?.bio ?? '');
  const save = useMarketplaceMutation(() =>
    marketplaceApi.saveCreator({
      displayName: name.trim(),
      bio: bio.trim(),
      ...(creator ? { version: creator.version } : {}),
    }),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        toast.success('Profil enregistré');
      },
    });
  }

  return (
    <>
      <Button variant={creator ? 'secondary' : 'default'} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Profil de créateur</DialogTitle>
              <DialogDescription className="sr-only">
                Nom et présentation affichés sur vos packs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="creator-name">Nom public</Label>
              <Input
                id="creator-name"
                value={name}
                minLength={2}
                maxLength={40}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="creator-bio">Présentation</Label>
              <Textarea
                id="creator-bio"
                value={bio}
                maxLength={1000}
                rows={4}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            {save.isError && <Message>{messageErreur(save.error)}</Message>}
            <DialogFooter>
              <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Studio({ creator }: Readonly<{ creator: CreatorProfile }>) {
  const router = useRouter();
  const studio = useStudio();
  const config = useMarketplaceConfig();
  const create = useMarketplaceMutation(() =>
    marketplaceApi.createListing({ title: 'Nouveau pack' }),
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
          <h2 className="text-sm font-semibold">Mes packs</h2>
          <Button size="sm" onClick={newListing} loading={create.isPending}>
            <PackagePlus aria-hidden />
            Nouveau pack
          </Button>
        </div>
        {studio.isError && <Message>{messageErreur(studio.error)}</Message>}
        {studio.isPending && <Skeleton className="h-24 w-full rounded-2xl" />}
        {studio.data?.length === 0 && <EtatVide icone={PackagePlus} titre="Aucun pack" />}
        <ul className="space-y-2">
          {studio.data?.map((l) => (
            <StudioRow key={l.id} listing={l} />
          ))}
        </ul>
      </section>

      <aside className="space-y-4">
        <Panneau
          titre={creator.displayName}
          action={<CreatorDialogButton creator={creator} label="Modifier" />}
        >
          <p className="line-clamp-4 whitespace-pre-line text-[13px] text-muted-foreground">
            {creator.bio || '—'}
          </p>
          <Link
            href={`/marketplace/creators/${creator.slug}`}
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
          >
            Page publique
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </Panneau>
        {config.data?.paidListings && <PayoutsPanel creator={creator} />}
      </aside>
    </div>
  );
}

function StudioRow({ listing }: Readonly<{ listing: StudioListing }>) {
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
              {LISTING_STATUS_LABELS[listing.status]}
            </Badge>
            {open && (
              <Badge ton={open.status === 'in_review' ? 'info' : 'neutre'}>
                v{open.number} · {VERSION_STATUS_LABELS[open.status]}
              </Badge>
            )}
            {rejected && <Badge ton="danger">v{rejected.number} refusée</Badge>}
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-[12px] text-muted-foreground sm:block">
          <span className="block tabular-nums">
            {priceLabel(listing.priceCents, listing.currency)}
          </span>
          <span className="block tabular-nums">{listing.acquisitionsCount} acquéreurs</span>
        </span>
      </Link>
    </li>
  );
}

/** Compte de paiement (Stripe Connect) et ventes. */
function PayoutsPanel({ creator }: Readonly<{ creator: CreatorProfile }>) {
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
      toast.error('Paiement indisponible', { description: messageErreur(err) });
      setBusy(false);
    }
  }

  const status = account?.status ?? null;
  return (
    <Panneau
      titre="Ventes"
      action={
        account && (
          <Info texte="Relire le compte">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Relire le compte"
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
        <p className="text-[13px] text-subtle">Vente indisponible</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-primary" aria-hidden />
            <Badge ton={status === 'active' ? 'succes' : status ? 'alerte' : 'neutre'}>
              {status === 'active'
                ? 'Compte actif'
                : status
                  ? `${account!.requirementsDue} information${account!.requirementsDue > 1 ? 's' : ''} à fournir`
                  : 'Aucun compte'}
            </Badge>
          </div>
          {status !== 'active' ? (
            <Button className="w-full" loading={busy} onClick={() => void go('onboarding')}>
              {status ? 'Compléter mon compte' : 'Activer les ventes'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              loading={busy}
              onClick={() => void go('dashboard')}
            >
              <ExternalLink aria-hidden />
              Versements et factures
            </Button>
          )}
          {sales.data && sales.data.length > 0 && (
            <ul className="divide-y divide-border/60 text-[12.5px]">
              {sales.data.slice(0, 10).map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="text-subtle">{dateLabel(s.completedAt)}</span>
                  <Info
                    texte={`Prix ${priceLabel(s.amount, s.currency)}, commission ${priceLabel(s.fee, s.currency)}`}
                  >
                    <span
                      className={
                        s.status === 'completed'
                          ? 'tabular-nums'
                          : 'tabular-nums text-subtle line-through'
                      }
                    >
                      {priceLabel(s.net, s.currency)}
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
