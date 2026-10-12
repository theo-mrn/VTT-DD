'use client';

/**
 * Chronique d'une campagne : fil compact jour par jour (avatar et pastille
 * de catégorie, message, heure), filtrable par personnage joueur (côté
 * serveur) et par catégorie (menu). Les données viennent du service history
 * (`lib/history.ts`, visibilité appliquée par le serveur), tenues à jour en
 * direct ; les noms (membres, personnages, système) sont lus en lot pour
 * mettre les événements en mots (`format.ts`). Les chroniques IA de l'ancienne
 * app n'ont pas encore de service : elles ne sont pas proposées.
 */
import { useFormatter, useTranslations } from 'next-intl';
import {
  Activity,
  Book,
  HandCoins,
  History,
  ListFilter,
  Loader2,
  MapPin,
  RotateCw,
  Shield,
  Skull,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EtatVide } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
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

/** Icône et teinte de chaque catégorie ; nom : `history.categories.<catégorie>`. */
const CATEGORIES: Record<EventType, { icone: LucideIcon; texte: string; point: string }> = {
  creation: { icone: UserPlus, texte: 'text-info', point: 'bg-info' },
  combat: { icone: Activity, texte: 'text-destructive', point: 'bg-destructive' },
  mort: { icone: Skull, texte: 'text-muted-foreground', point: 'bg-muted-foreground' },
  niveau: { icone: TrendingUp, texte: 'text-warning', point: 'bg-warning' },
  stats: { icone: Shield, texte: 'text-success', point: 'bg-success' },
  inventaire: { icone: HandCoins, texte: 'text-primary', point: 'bg-primary' },
  competence: { icone: Star, texte: 'text-arcane', point: 'bg-arcane' },
  note: { icone: Book, texte: 'text-info', point: 'bg-info' },
  deplacement: { icone: MapPin, texte: 'text-success', point: 'bg-success' },
  info: { icone: History, texte: 'text-subtle', point: 'bg-subtle' },
};

// ─── Dates ───────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
/** `yyyy-MM-dd` dans le fuseau du navigateur. */
const cleJour = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** « Aujourd’hui », « Hier », sinon « Samedi 4 octobre 2026 » (langue de la page). */
function useLibelleJour(): (d: Date) => string {
  const t = useTranslations('chat');
  const format = useFormatter();
  return useCallback(
    (d: Date) => {
      const aujourdhui = new Date();
      const hier = new Date();
      hier.setDate(hier.getDate() - 1);
      if (cleJour(d) === cleJour(aujourdhui)) return t('today');
      if (cleJour(d) === cleJour(hier)) return t('yesterday');
      const texte = format.dateTime(d, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      return texte.charAt(0).toUpperCase() + texte.slice(1);
    },
    [t, format],
  );
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

export function Chronique({ campagne }: Readonly<{ campagne: DetailCampagne }>) {
  const t = useTranslations();
  const [personnage, setPersonnage] = useState<string | null>(null);
  const [categories, setCategories] = useState<ReadonlySet<EventType>>(new Set());
  const { live } = useHistoriqueEnDirect(campagne.id);

  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-semibold tracking-tight">{t('history.title')}</h2>
        <Info texte={live ? t('history.live') : t('history.polling')}>
          <span className="relative flex size-1.5 shrink-0">
            {live && <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />}
            <span
              className={cn('relative size-1.5 rounded-full', live ? 'bg-success' : 'bg-subtle')}
            />
            <span className="sr-only">{live ? t('history.live') : t('history.polling')}</span>
          </span>
        </Info>
        <div className="ml-auto flex items-center gap-1">
          <FiltrePersonnage campagneId={campagne.id} valeur={personnage} onChange={setPersonnage} />
          <FiltreCategories valeur={categories} onChange={setCategories} />
        </div>
      </header>
      <Flux
        key={personnage ?? ''}
        campagne={campagne}
        characterId={personnage}
        categories={categories}
      />
    </section>
  );
}

/** Personnages joueurs en avatars ronds : un clic restreint la chronique au sien. */
function FiltrePersonnage({
  campagneId,
  valeur,
  onChange,
}: Readonly<{
  campagneId: string;
  valeur: string | null;
  onChange: (id: string | null) => void;
}>) {
  const t = useTranslations();
  const liste = usePersonnagesCampagne(campagneId).data ?? [];
  if (!liste.length) return null;
  return (
    <div className="flex items-center -space-x-1.5 pr-1">
      <Info texte={t('history.allCharacters')}>
        <button
          type="button"
          aria-pressed={valeur === null}
          aria-label={t('history.allCharacters')}
          onClick={() => onChange(null)}
          className={cn(
            'relative grid size-7 place-items-center rounded-full border-2 border-card bg-surface-3 transition-transform hover:z-10 hover:scale-110',
            valeur === null ? 'z-10 text-primary ring-2 ring-primary' : 'text-muted-foreground',
          )}
        >
          <Users className="size-3.5" aria-hidden />
        </button>
      </Info>
      {liste.map((p) => {
        const actif = valeur === p.id;
        return (
          <Info key={p.id} texte={p.name}>
            <button
              type="button"
              aria-pressed={actif}
              aria-label={p.name}
              onClick={() => onChange(actif ? null : p.id)}
              className={cn(
                'relative rounded-full border-2 border-card transition-[transform,opacity] hover:z-10 hover:scale-110 hover:opacity-100',
                actif ? 'z-10 ring-2 ring-primary' : valeur && 'opacity-50',
              )}
            >
              <Illustration
                largeur={48}
                src={p.portraitUrl}
                graine={p.name}
                position="top"
                className="size-6 rounded-full"
              />
            </button>
          </Info>
        );
      })}
    </div>
  );
}

/** Catégories affichées (aucune cochée : toutes). */
function FiltreCategories({
  valeur,
  onChange,
}: Readonly<{
  valeur: ReadonlySet<EventType>;
  onChange: (v: ReadonlySet<EventType>) => void;
}>) {
  const t = useTranslations();
  return (
    <DropdownMenu>
      <Info texte={t('history.categoryFilter')}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('history.categoryFilter')}
            className={cn('relative', valeur.size > 0 && 'text-primary')}
          >
            <ListFilter />
            {valeur.size > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {valeur.size}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent align="end" className="w-52">
        {(Object.keys(CATEGORIES) as EventType[]).map((c) => {
          const { icone: Icone, texte } = CATEGORIES[c];
          return (
            <DropdownMenuCheckboxItem
              key={c}
              checked={valeur.has(c)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => {
                const suite = new Set(valeur);
                if (on) suite.add(c);
                else suite.delete(c);
                onChange(suite);
              }}
            >
              <Icone className={cn('mr-2 size-3.5', texte)} aria-hidden />
              {t(`history.categories.${c}`)}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Fil de la chronique, groupé par jour, du plus récent au plus ancien. */
function Flux({
  campagne,
  characterId,
  categories,
}: Readonly<{
  campagne: DetailCampagne;
  characterId: string | null;
  categories: ReadonlySet<EventType>;
}>) {
  const t = useTranslations();
  const libelleJour = useLibelleJour();
  const flux = useHistorique(campagne.id, characterId);
  const bruts = useMemo(() => flux.data?.pages.flatMap((p) => p.events) ?? [], [flux.data]);
  const ctx = useContexteFormat(campagne, bruts);
  const lignes = useMemo(
    () =>
      // MJ : les tours en double (complet et expurgé, même version) ne comptent qu'une fois
      withoutRedactedTwins(bruts)
        .map((e) => formatHistoryEvent(e, ctx))
        .filter((e): e is GameEvent => e !== null)
        // Toute la campagne : les doublons (jet d'une action…) ne sont montrés que par personnage
        .filter((e) => characterId !== null || !e.hiddenFromTimeline)
        .filter((e) => !categories.size || categories.has(e.type)),
    [bruts, ctx, characterId, categories],
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
      <div className="p-4">
        <EtatVide
          icone={History}
          titre={t('history.unavailable')}
          description={messageErreur(flux.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void flux.refetch()}>
              <RotateCw />
              {t('common.actions.retry')}
            </Button>
          }
        />
      </div>
    );
  if (!lignes.length && !flux.hasNextPage)
    return (
      <div className="p-4">
        <EtatVide
          icone={History}
          titre={characterId ? t('history.nothingForCharacter') : t('history.blank')}
          description={characterId ? t('history.characterHint') : t('history.campaignHint')}
        />
      </div>
    );

  return (
    <div className="px-2 pb-2">
      {jours.map((j) => (
        <section key={j.cle} aria-label={libelleJour(j.date)}>
          <h3 className="sticky top-14 z-10 flex justify-center py-2">
            <span className="rounded-full border border-border bg-card/90 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {Number.isNaN(j.date.getTime()) ? t('history.unknownDate') : libelleJour(j.date)}
            </span>
          </h3>
          <ol>
            {j.lignes.map((l) => (
              <Ligne key={l.id} ligne={l} ctx={ctx} />
            ))}
          </ol>
        </section>
      ))}
      <Suite
        actif={flux.hasNextPage}
        enCours={flux.isFetchingNextPage}
        onCharger={() => {
          if (!flux.isFetchingNextPage) void flux.fetchNextPage();
        }}
        compte={bruts.length}
      />
    </div>
  );
}

/** Une ligne : avatar (pastille de catégorie dans le coin), message, heure. */
function Ligne({ ligne: l, ctx }: Readonly<{ ligne: GameEvent; ctx: FormatContext }>) {
  const t = useTranslations();
  const format = useFormatter();
  const { icone: Icone, texte, point } = CATEGORIES[l.type];
  const avatar =
    l.characterAvatar ??
    (l.characterId ? ctx.characters.get(l.characterId.toLowerCase())?.avatarUrl : null) ??
    null;
  const valide = !Number.isNaN(l.timestamp.getTime());
  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2/70">
      <span className="relative shrink-0" title={t(`history.categories.${l.type}`)}>
        {l.characterName ? (
          <Illustration
            largeur={48}
            src={avatar}
            graine={l.characterName}
            position="top"
            className="size-7 rounded-full"
          />
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-surface-3">
            <Icone className={cn('size-3.5', texte)} aria-hidden />
          </span>
        )}
        {l.characterName && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card',
              point,
            )}
            aria-hidden
          />
        )}
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
        {message(l.message)}
      </p>
      {valide && (
        <time
          dateTime={l.timestamp.toISOString()}
          className="shrink-0 text-[11px] tabular-nums text-subtle opacity-70 transition-opacity group-hover:opacity-100"
        >
          {format.dateTime(l.timestamp, 'time')}
        </time>
      )}
    </li>
  );
}

/** `**nom**` ressort en gras. */
function message(texte: string): ReactNode[] {
  return texte.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
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
}: Readonly<{
  actif: boolean;
  enCours: boolean;
  onCharger: () => void;
  compte: number;
}>) {
  const t = useTranslations();
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
        <Loader2 className="size-4 animate-spin text-primary" aria-label={t('history.loading')} />
      ) : (
        <Button variant="ghost" size="sm" onClick={onCharger}>
          {t('history.older')}
        </Button>
      )}
    </div>
  );
}

function SqueletteFlux() {
  const t = useTranslations();
  return (
    <div className="space-y-1 p-4" aria-busy aria-label={t('history.loadingChronicle')}>
      <Skeleton className="mx-auto mb-3 h-4 w-24 rounded-full" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${45 + ((i * 17) % 40)}%` }} />
          <Skeleton className="ml-auto h-2.5 w-8" />
        </div>
      ))}
    </div>
  );
}
