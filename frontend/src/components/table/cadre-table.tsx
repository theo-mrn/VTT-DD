'use client';

import { ArrowLeft, Crown, DoorOpen, Eye, RotateCw, UserRoundCog } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EtatVide } from '@/components/commun/page';
import { DiceThrowerHost } from '@/components/dice/thrower-host';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { EcranChargement } from '@/components/shell/ecran-chargement';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { ApiError, messageErreur } from '@/lib/api';
import { useCampagne } from '@/lib/campagnes';
import { usePersonnagesCampagne, type Personnage } from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfilRequis } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  FournisseurTable,
  ONGLETS,
  ongletActif,
  ongletsPour,
  type OngletTable,
  type Table,
} from './contexte';
import { FrontiereTable } from './frontiere';
import { JaugesFiche } from './jauges';

/** Vrai si la frappe vise un champ ou une fenêtre : les raccourcis se taisent alors. */
function frappeAilleurs(e: KeyboardEvent): boolean {
  const cible = e.target instanceof HTMLElement ? e.target : null;
  return Boolean(
    cible?.isContentEditable ||
    cible?.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
    ),
  );
}

/**
 * Cadre de la table de jeu d'une campagne : en-tête (campagne, héros incarné,
 * ressources), navigation par onglets (barre latérale compacte, en bas sur
 * mobile, ⌥1…⌥6 au clavier) et thème de la campagne sur toute la table. Un
 * non-membre retourne à la page de la campagne ; un joueur sans héros choisit
 * d'abord le sien.
 */
export function CadreTable({ id, children }: { id: string; children: ReactNode }) {
  const profil = useProfilRequis();
  const router = useRouter();
  const chemin = usePathname();
  const campagne = useCampagne(profil ? id : null);
  const engages = usePersonnagesCampagne(profil ? id : null);
  const c = campagne.data;
  const moi = c?.members.find((m) => m.userId === profil?.id) ?? null;
  const herosId = c?.playedCharacterId ?? null;
  // Table, héros et membres tenus à jour en direct
  useSynchroCampagne(c ? id : null, { personnage: herosId });

  const refuse = campagne.error instanceof ApiError && [403, 404].includes(campagne.error.status);
  const sansHeros = Boolean(c && moi && moi.role === 'player' && !herosId);
  const horsTable = Boolean(c && !moi);

  useEffect(() => {
    if (refuse || horsTable) router.replace(`/campagnes/${id}`);
    else if (sansHeros) router.replace(`/campagnes/${id}/personnage`);
  }, [refuse, horsTable, sansHeros, router, id]);

  const heros = useMemo(
    () => engages.data?.find((p) => p.id === herosId) ?? null,
    [engages.data, herosId],
  );

  const table = useMemo<Table | null>(
    () =>
      c && moi
        ? {
            campagne: c,
            moi,
            gm: c.role === 'gm',
            herosId,
            heros,
            base: `/campagnes/${id}/table`,
          }
        : null,
    [c, moi, herosId, heros, id],
  );

  if (!profil || campagne.isLoading || refuse || horsTable || sansHeros)
    return <EcranChargement texte="Installation de la table…" />;
  if (!table)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <EtatVide
          icone={DoorOpen}
          titre="La table est inaccessible"
          description={messageErreur(campagne.error)}
          className="w-full max-w-md"
          action={
            <>
              <Button variant="secondary" onClick={() => void campagne.refetch()}>
                <RotateCw />
                Réessayer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/campagnes">Mes campagnes</Link>
              </Button>
            </>
          }
        />
      </div>
    );

  return (
    <FournisseurTable value={table}>
      <div data-ambiance={table.campagne.ambiance} className="min-h-dvh bg-background">
        <EnTeteTable table={table} herosId={herosId} />
        <div className="flex">
          <NavTable table={table} />
          <main className="min-w-0 flex-1 pb-24 lg:pb-0">
            <FrontiereTable
              cle={chemin}
              nom={ONGLETS.find((o) => o.id === ongletActif(chemin, table.base))?.label ?? 'Onglet'}
            >
              {children}
            </FrontiereTable>
          </main>
        </div>
        <NavTableMobile table={table} />
        {/* Dés 3D de la table, chargés au premier lancer */}
        <DiceThrowerHost />
      </div>
    </FournisseurTable>
  );
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

function EnTeteTable({ table, herosId }: { table: Table; herosId: string | null }) {
  const { campagne: c, gm, moi } = table;
  const nomSysteme = useNomSysteme(c.system);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-2 backdrop-blur-xl sm:gap-3 sm:px-3">
      <Info texte="Retour au salon">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/campagnes/${c.id}`} aria-label="Retour au salon">
            <ArrowLeft />
          </Link>
        </Button>
      </Info>
      <Link href={`/campagnes/${c.id}`} className="flex min-w-0 items-center gap-2.5 rounded-lg">
        <Illustration
          src={c.coverUrl}
          graine={c.name}
          className="hidden size-9 shrink-0 rounded-lg ring-1 ring-border sm:block"
        />
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-semibold leading-tight">
            {c.name}
          </span>
          <span className="block truncate text-[11px] text-subtle">{nomSysteme}</span>
        </span>
      </Link>

      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        {table.heros ? (
          <FrontiereTable nom="Fiche" compacte>
            <HerosIncarne heros={table.heros} herosId={herosId} base={table.base} />
          </FrontiereTable>
        ) : table.herosId ? (
          <Skeleton className="size-9 rounded-full" aria-label="Chargement du héros" />
        ) : (
          <span className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-strong">
            {gm ? <Crown className="size-3.5" /> : <Eye className="size-3.5" />}
            {gm ? 'Maître du jeu' : moi.role === 'spectator' ? 'Spectateur' : 'Sans héros'}
          </span>
        )}
        {moi.role !== 'spectator' && (
          <Info texte={gm ? 'Jouer un héros ou mener en MJ' : 'Changer de héros'}>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/campagnes/${c.id}/personnage`}>
                <UserRoundCog />
                <span className="hidden md:inline">Changer de héros</span>
              </Link>
            </Button>
          </Info>
        )}
      </div>
    </header>
  );
}

/** Mon héros : portrait, nom et ressources principales, lien vers ma fiche. */
function HerosIncarne({
  heros,
  herosId,
  base,
}: {
  heros: Personnage;
  herosId: string | null;
  base: string;
}) {
  const { ctx } = useFicheCalculee(herosId);
  return (
    <Link
      href={`${base}/fiche`}
      className="flex min-w-0 items-center gap-3 rounded-xl px-1.5 py-1 transition-colors hover:bg-surface-2"
    >
      {ctx && <JaugesFiche ctx={ctx} className="hidden xl:flex" />}
      {ctx && <JaugesFiche ctx={ctx} nombre={1} className="hidden sm:flex xl:hidden" />}
      <span className="hidden min-w-0 text-right md:block">
        <span className="block truncate text-[13px] font-semibold leading-tight">{heros.name}</span>
        <span className="block truncate text-[11px] text-subtle">
          {heros.summary.tagline || 'Mon héros'}
        </span>
      </span>
      <Illustration
        src={heros.portraitUrl}
        graine={heros.name}
        position="top"
        className="size-9 shrink-0 rounded-full ring-2 ring-primary/60"
      />
    </Link>
  );
}

// ─── Navigation ──────────────────────────────────────────────────────────────

/** ⌥1, ⌥2… : onglets disponibles dans l'ordre. */
function useRaccourcisOnglets(onglets: OngletTable[], base: string) {
  const router = useRouter();
  useEffect(() => {
    const actifs = onglets.filter((o) => !o.bientot);
    const clavier = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !e.altKey || e.metaKey || e.ctrlKey) return;
      if (frappeAilleurs(e)) return;
      // `code` : ⌥1 produit « & » ou « ¡ » selon le clavier
      const m = /^Digit([1-9])$/.exec(e.code);
      const o = m ? actifs[Number(m[1]) - 1] : undefined;
      if (!o) return;
      e.preventDefault();
      router.push(`${base}/${o.id}`);
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onglets, base, router]);
}

function NavTable({ table }: { table: Table }) {
  const chemin = usePathname();
  const onglets = useMemo(() => ongletsPour(table.gm), [table.gm]);
  useRaccourcisOnglets(onglets, table.base);
  const actif = ongletActif(chemin, table.base);
  let rang = 0;

  return (
    <nav
      aria-label="Table de jeu"
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[84px] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface/60 py-3 lg:flex"
    >
      {onglets.map((o) => {
        const touche = o.bientot ? null : ++rang;
        const contenu = (
          <>
            <o.icone className="size-5" aria-hidden />
            <span className="text-[10px] font-medium leading-none">{o.label}</span>
          </>
        );
        const classes = cn(
          'relative flex w-[68px] flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        );
        if (o.bientot)
          return (
            <Info key={o.id} texte={`${o.label} : bientôt disponible`} cote="right">
              <span
                aria-disabled
                className={cn(classes, 'mt-auto cursor-not-allowed text-subtle/60')}
              >
                {contenu}
                <span className="rounded-full bg-surface-3 px-1.5 py-px text-[9px] text-subtle">
                  Bientôt
                </span>
              </span>
            </Info>
          );
        const courant = actif === o.id;
        return (
          <Info
            key={o.id}
            cote="right"
            texte={
              <span className="flex items-center gap-2">
                {o.label}
                <Kbd>⌥{touche}</Kbd>
              </span>
            }
          >
            <Link
              href={`${table.base}/${o.id}`}
              aria-current={courant ? 'page' : undefined}
              className={cn(
                classes,
                courant
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
              )}
            >
              {courant && (
                <span
                  aria-hidden
                  className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                />
              )}
              {contenu}
            </Link>
          </Info>
        );
      })}
    </nav>
  );
}

function NavTableMobile({ table }: { table: Table }) {
  const chemin = usePathname();
  const actif = ongletActif(chemin, table.base);
  const onglets = ongletsPour(table.gm);
  return (
    <nav
      aria-label="Table de jeu"
      className="fixed inset-x-2 bottom-2 z-40 flex items-center rounded-2xl border border-border-strong bg-popover/85 px-1 py-1.5 shadow-elevated backdrop-blur-xl lg:hidden"
    >
      {onglets.map((o) =>
        o.bientot ? (
          <span
            key={o.id}
            aria-disabled
            title={`${o.label} : bientôt disponible`}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium text-subtle/50"
          >
            <o.icone className="size-5" aria-hidden />
            <span className="max-w-full truncate">{o.label}</span>
          </span>
        ) : (
          <Link
            key={o.id}
            href={`${table.base}/${o.id}`}
            aria-current={actif === o.id ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] font-medium transition-colors',
              actif === o.id ? 'text-primary' : 'text-subtle',
            )}
          >
            <o.icone className="size-5" aria-hidden />
            <span className="max-w-full truncate">{o.label}</span>
          </Link>
        ),
      )}
    </nav>
  );
}
