'use client';

/**
 * Chronique d'une campagne : l'ancien panneau Historique (« Archives du
 * Destin ») adapté au design system. Deux vues : le Journal, jour par jour,
 * et « Par personnage ». Les données viennent du service history
 * (`lib/history.ts`, visibilité appliquée par le serveur), tenues à jour en
 * direct ; les noms (membres, personnages, système) sont lus en lot pour
 * mettre les événements en mots (`format.ts`). Les chroniques IA de l'ancienne
 * app n'ont pas encore de service : elles ne sont pas proposées.
 */
import {
  Activity,
  ArrowLeft,
  Book,
  HandCoins,
  History,
  Loader2,
  MapPin,
  Radio,
  RotateCw,
  Shield,
  Skull,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EtatVide } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import type { DetailCampagne } from '@/lib/campagnes';
import { useHistorique, useHistoriqueEnDirect, type HistoryEvent } from '@/lib/history';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { useSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import {
  formatHistoryEvent,
  withoutRedactedTwins,
  namesFromEvents,
  type CharacterLabel,
  type EventType,
  type FormatContext,
  type GameEvent,
  type UserLabel,
} from './format';

// ─── Catégories ──────────────────────────────────────────────────────────────

const CATEGORIES: Record<EventType, { icone: LucideIcon; classe: string; nom: string }> = {
  creation: { icone: UserPlus, classe: 'text-info', nom: 'Création' },
  combat: { icone: Activity, classe: 'text-destructive', nom: 'Combat' },
  mort: { icone: Skull, classe: 'text-muted-foreground', nom: 'Mort' },
  niveau: { icone: TrendingUp, classe: 'text-warning', nom: 'Progression' },
  stats: { icone: Shield, classe: 'text-success', nom: 'Caractéristiques' },
  inventaire: { icone: HandCoins, classe: 'text-primary', nom: 'Inventaire' },
  competence: { icone: Star, classe: 'text-arcane', nom: 'Action' },
  note: { icone: Book, classe: 'text-info', nom: 'Note' },
  deplacement: { icone: MapPin, classe: 'text-success', nom: 'Déplacement' },
  info: { icone: History, classe: 'text-subtle', nom: 'Information' },
};

// ─── Dates ───────────────────────────────────────────────────────────────────

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const pad = (n: number) => String(n).padStart(2, '0');
/** `yyyy-MM-dd` dans le fuseau du navigateur. */
const cleJour = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function libelleJour(d: Date): string {
  const aujourdhui = new Date();
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  if (cleJour(d) === cleJour(aujourdhui)) return "Aujourd'hui";
  if (cleJour(d) === cleJour(hier)) return 'Hier';
  const texte = JOUR.format(d);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// ─── Noms ────────────────────────────────────────────────────────────────────

/**
 * Contexte de mise en forme : membres et rôle (campagne), personnages joueurs
 * engagés (hook du domaine), système de jeu, et noms connus par les événements
 * eux-mêmes (PNJ, personnages retirés).
 */
function useContexteFormat(campagne: DetailCampagne, events: readonly HistoryEvent[]) {
  const engages = usePersonnagesCampagne(campagne.id);
  const systeme = useSysteme(campagne.system);
  const extra = useMemo(() => namesFromEvents(events), [events]);

  return useMemo<FormatContext>(() => {
    const characters = new Map<string, CharacterLabel>();
    for (const [id, name] of extra)
      characters.set(id, { name, avatarUrl: null, side: null, type: null });
    for (const p of engages.data ?? [])
      characters.set(p.id.toLowerCase(), {
        name: p.name,
        avatarUrl: p.portraitUrl,
        side: 'players',
        type: p.type || null,
      });
    const users = new Map<string, UserLabel>(
      campagne.members.map((m) => [
        m.userId.toLowerCase(),
        { name: m.name, avatarUrl: m.avatarUrl },
      ]),
    );
    return {
      characters,
      users,
      maps: new Map(),
      system: systeme.data?.systeme ?? null,
      viewerIsGm: campagne.role === 'gm',
    };
  }, [extra, engages.data, campagne.members, campagne.role, systeme.data]);
}

// ─── Chronique ───────────────────────────────────────────────────────────────

export function Chronique({ campagne }: { campagne: DetailCampagne }) {
  const [vue, setVue] = useState<'journal' | 'personnages'>('journal');
  const [personnage, setPersonnage] = useState<string | null>(null);
  const { live } = useHistoriqueEnDirect(campagne.id);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          {vue === 'personnages' && personnage ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Retour aux personnages"
              onClick={() => setPersonnage(null)}
            >
              <ArrowLeft />
            </Button>
          ) : (
            <History className="size-4 text-primary" aria-hidden />
          )}
          <h2 className="truncate text-[15px] font-semibold tracking-tight">
            Chronique de la campagne
          </h2>
          <Info texte={live ? 'En direct' : 'Temps réel indisponible : relecture périodique'}>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]',
                live ? 'text-success' : 'text-subtle',
              )}
            >
              <Radio className="size-3" aria-hidden />
              <span className="sr-only">{live ? 'En direct' : 'Hors ligne'}</span>
            </span>
          </Info>
        </div>
        <Tabs
          value={vue}
          onValueChange={(v) => {
            setVue(v as 'journal' | 'personnages');
            setPersonnage(null);
          }}
        >
          <TabsList>
            <TabsTrigger value="journal">
              <History aria-hidden />
              Journal
            </TabsTrigger>
            <TabsTrigger value="personnages">
              <Users aria-hidden />
              Par personnage
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-3 sm:p-5">
        {vue === 'journal' ? (
          <Flux campagne={campagne} characterId={null} parJour />
        ) : personnage ? (
          <Flux campagne={campagne} characterId={personnage} parJour={false} />
        ) : (
          <ChoixPersonnage campagneId={campagne.id} onChoix={setPersonnage} />
        )}
      </div>
    </section>
  );
}

/** Personnages joueurs de la campagne : un clic ouvre leur chronique. */
function ChoixPersonnage({
  campagneId,
  onChoix,
}: {
  campagneId: string;
  onChoix: (id: string) => void;
}) {
  const personnages = usePersonnagesCampagne(campagneId);
  if (personnages.isLoading)
    return (
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    );
  if (personnages.isError)
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {messageErreur(personnages.error)}
      </p>
    );
  const liste = personnages.data ?? [];
  if (!liste.length)
    return (
      <EtatVide
        icone={Users}
        titre="Aucun personnage à la table"
        description="Les héros des joueurs apparaîtront ici."
      />
    );
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7">
      {liste.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChoix(p.id)}
          className="group flex flex-col items-center gap-2 rounded-2xl p-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Illustration
            largeur={128}
            src={p.portraitUrl}
            graine={p.name}
            position="top"
            className="aspect-square w-full rounded-xl ring-1 ring-border transition-transform group-hover:scale-105"
          />
          <span className="w-full truncate text-center text-xs font-medium text-muted-foreground group-hover:text-foreground">
            {p.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Événements d'une chronique, groupés par jour (Journal) ou à plat (un personnage). */
function Flux({
  campagne,
  characterId,
  parJour,
}: {
  campagne: DetailCampagne;
  characterId: string | null;
  parJour: boolean;
}) {
  const flux = useHistorique(campagne.id, characterId);
  const bruts = useMemo(() => flux.data?.pages.flatMap((p) => p.events) ?? [], [flux.data]);
  const ctx = useContexteFormat(campagne, bruts);
  const lignes = useMemo(
    () =>
      // MJ : les tours en double (complet et expurgé, même version) ne comptent qu'une fois
      withoutRedactedTwins(bruts)
        .map((e) => formatHistoryEvent(e, ctx))
        .filter((e): e is GameEvent => e !== null)
        // Journal : les doublons (jet d'une action…) ne sont montrés que par personnage
        .filter((e) => !parJour || !e.hiddenFromTimeline),
    [bruts, ctx, parJour],
  );
  const jours = useMemo(() => {
    const groupes: { cle: string; date: Date; lignes: GameEvent[] }[] = [];
    for (const l of lignes) {
      const cle = Number.isNaN(l.timestamp.getTime()) ? '?' : cleJour(l.timestamp);
      const dernier = groupes.at(-1);
      if (dernier?.cle === cle) dernier.lignes.push(l);
      else groupes.push({ cle, date: l.timestamp, lignes: [l] });
    }
    return groupes;
  }, [lignes]);

  if (flux.isPending) return <SqueletteFlux />;
  if (flux.isError && !flux.data)
    return (
      <EtatVide
        icone={History}
        titre="Chronique indisponible"
        description={messageErreur(flux.error)}
        action={
          <Button variant="secondary" size="sm" onClick={() => void flux.refetch()}>
            <RotateCw />
            Réessayer
          </Button>
        }
      />
    );
  if (!lignes.length && !flux.hasNextPage)
    return (
      <EtatVide
        icone={History}
        titre={characterId ? 'Rien à raconter pour ce personnage' : 'Les parchemins sont vierges'}
        description={
          characterId
            ? 'Ses actions, jets et changements apparaîtront ici.'
            : "L'aventure commence : jets, combats, trésors et arrivées s'inscriront ici."
        }
      />
    );

  const suite = (
    <Suite
      actif={flux.hasNextPage}
      enCours={flux.isFetchingNextPage}
      onCharger={() => {
        if (!flux.isFetchingNextPage) void flux.fetchNextPage();
      }}
      compte={bruts.length}
    />
  );

  if (!parJour)
    return (
      <ol className="space-y-1">
        {lignes.map((l) => (
          <Ligne key={l.id} ligne={l} ctx={ctx} avecDate />
        ))}
        {suite}
      </ol>
    );

  return (
    <div className="space-y-6">
      {jours.map((j) => (
        <section key={j.cle} aria-label={libelleJour(j.date)}>
          <h3 className="sticky top-14 z-10 -mx-3 mb-2 flex items-center gap-3 bg-card/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle sm:-mx-5 sm:px-5">
            <span className="h-px flex-1 bg-border" aria-hidden />
            {Number.isNaN(j.date.getTime()) ? 'Date inconnue' : libelleJour(j.date)}
            <span className="h-px flex-1 bg-border" aria-hidden />
          </h3>
          <ol className="space-y-1">
            {j.lignes.map((l) => (
              <Ligne key={l.id} ligne={l} ctx={ctx} />
            ))}
          </ol>
        </section>
      ))}
      {suite}
    </div>
  );
}

function Ligne({
  ligne: l,
  ctx,
  avecDate = false,
}: {
  ligne: GameEvent;
  ctx: FormatContext;
  avecDate?: boolean;
}) {
  const categorie = CATEGORIES[l.type];
  const Icone = categorie.icone;
  const avatar =
    l.characterAvatar ??
    (l.characterId ? ctx.characters.get(l.characterId.toLowerCase())?.avatarUrl : null) ??
    null;
  const valide = !Number.isNaN(l.timestamp.getTime());
  return (
    <li className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2/60">
      <div className="relative shrink-0">
        <Illustration
          largeur={40}
          src={avatar}
          graine={l.characterName ?? l.source}
          initiale={l.characterName ? undefined : '·'}
          position="top"
          className="size-10 rounded-xl ring-1 ring-border"
        />
        <span
          className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-md border border-border bg-card"
          title={categorie.nom}
        >
          <Icone className={cn('size-3', categorie.classe)} aria-hidden />
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-xs font-semibold text-foreground">
            {l.characterName ?? 'Système'}
          </span>
          {valide && (
            <time
              dateTime={l.timestamp.toISOString()}
              className="shrink-0 font-mono text-[11px] text-subtle tabular"
            >
              {avecDate && `${l.timestamp.toLocaleDateString('fr-FR')} · `}
              {HEURE.format(l.timestamp)}
            </time>
          )}
        </div>
        <p className="text-[13px] leading-relaxed text-foreground/85">{message(l.message)}</p>
      </div>
    </li>
  );
}

/** `**nom**` devient une pastille. */
function message(texte: string): ReactNode[] {
  return texte.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <span
        key={i}
        className="mx-0.5 inline-block rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-baseline text-[12px] font-semibold text-primary-strong"
      >
        {part.slice(2, -2)}
      </span>
    ) : (
      part
    ),
  );
}

/** Suite au défilement (page précédente par `beforeSeq`), avec un bouton de secours. */
function Suite({
  actif,
  enCours,
  onCharger,
  compte,
}: {
  actif: boolean;
  enCours: boolean;
  onCharger: () => void;
  compte: number;
}) {
  const repere = useRef<HTMLDivElement>(null);
  const charger = useRef(onCharger);
  charger.current = onCharger;
  useEffect(() => {
    const el = repere.current;
    if (!actif || enCours || !el) return;
    const io = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) charger.current();
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [actif, enCours, compte]);

  if (!actif && !enCours) return null;
  return (
    <div ref={repere} className="flex justify-center py-4">
      {enCours ? (
        <Loader2 className="size-4 animate-spin text-primary" aria-label="Chargement" />
      ) : (
        <Button variant="ghost" size="sm" onClick={onCharger}>
          Plus ancien
        </Button>
      )}
    </div>
  );
}

function SqueletteFlux() {
  return (
    <div className="space-y-3" aria-busy aria-label="Chargement de la chronique">
      <Skeleton className="mx-auto h-3 w-32" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 px-2 py-2">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
