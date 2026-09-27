'use client';

import { LayoutGroup, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Crown,
  Loader2,
  Pin,
  Search,
  SearchX,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import type { Campagne } from '@/lib/campagnes';
import { TYPES_NOTE, type FacettesNotes, type TypeNote } from '@/lib/notes';
import { cn } from '@/lib/utils';
import { BoutonNouvelleNote } from './bouton-nouvelle-note';
import type { ModeleNote } from './modeles';
import { dateCourte, iconeNote, segments, type Groupe, type NoteIndexee } from './outils';

export interface FiltreNotes {
  epinglees: boolean;
  type: TypeNote | null;
  /** Id de campagne ; null : toutes mes campagnes. */
  campagne: string | null;
}

export const FILTRE_VIDE: FiltreNotes = { epinglees: false, type: null, campagne: null };

export const filtreActif = (f: FiltreNotes) =>
  f.epinglees || f.type !== null || f.campagne !== null;

/** Id DOM d'une note de la liste (aria-activedescendant, défilement). */
export const idElementNote = (id: string) => `note-${id}`;

/** Pages suivantes de la liste (chargées au défilement). */
export interface SuiteListe {
  aSuite: boolean;
  enCours: boolean;
  charger: () => void;
}

/**
 * Volet liste : recherche, filtres, notes groupées (épinglées puis par
 * récence). Recherche et filtres sont appliqués par le service ; les pages
 * suivantes se chargent au défilement. La liste est un listbox : ↑/↓ changent
 * la sélection quand elle a le focus, Entrée ouvre la note.
 */
export function ListeNotes({
  chargement,
  recherchant,
  total,
  totalFiltre,
  facettes,
  suite,
  moi,
  groupes,
  mots,
  idSelection,
  recherche,
  onRecherche,
  refRecherche,
  refListe,
  filtre,
  onFiltre,
  campagnes,
  maintenant,
  onSelection,
  onOuvrir,
  onNouvelle,
  creationEnCours,
  bandeau,
  className,
}: {
  chargement: boolean;
  /** Une nouvelle recherche (ou de nouveaux filtres) est en cours au service. */
  recherchant: boolean;
  /** Toutes mes notes lisibles. */
  total: number;
  /** Notes correspondant à la recherche et aux filtres. */
  totalFiltre: number | null;
  facettes: FacettesNotes | undefined;
  suite: SuiteListe;
  moi: string;
  groupes: Groupe[];
  mots: string[];
  idSelection: string | null;
  recherche: string;
  onRecherche: (v: string) => void;
  refRecherche: RefObject<HTMLInputElement | null>;
  refListe: RefObject<HTMLDivElement | null>;
  filtre: FiltreNotes;
  onFiltre: (f: FiltreNotes) => void;
  campagnes: Campagne[];
  maintenant: number;
  onSelection: (id: string) => void;
  onOuvrir: (id: string) => void;
  onNouvelle: (modele?: ModeleNote) => void;
  creationEnCours: boolean;
  /** Message affiché sous les filtres (import des notes de ce navigateur). */
  bandeau?: ReactNode;
  className?: string;
}) {
  const ordre = useMemo(() => groupes.flatMap((g) => g.notes.map((n) => n.note.id)), [groupes]);
  const parCampagne = useMemo(() => new Map(campagnes.map((c) => [c.id, c])), [campagnes]);
  const nbVisibles = ordre.length;
  const filtree = filtreActif(filtre) || recherche.trim() !== '';

  // Bas de liste en vue : page suivante
  const repere = useRef<HTMLDivElement>(null);
  const chargerSuite = useRef(suite.charger);
  chargerSuite.current = suite.charger;
  useEffect(() => {
    const el = repere.current;
    if (!el || !suite.aSuite) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) chargerSuite.current();
      },
      { root: refListe.current, rootMargin: '0px 0px 240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [suite.aSuite, refListe, nbVisibles]);

  // La sélection suit le clavier (ou un lien direct) : on la garde à l'écran
  useEffect(() => {
    if (!idSelection) return;
    document.getElementById(idElementNote(idSelection))?.scrollIntoView({ block: 'nearest' });
  }, [idSelection]);

  const clavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ordre.length) return;
    const i = idSelection ? ordre.indexOf(idSelection) : -1;
    let cible: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'j') cible = Math.min(ordre.length - 1, i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'k') cible = i < 0 ? 0 : Math.max(0, i - 1);
    else if (e.key === 'Home') cible = 0;
    else if (e.key === 'End') cible = ordre.length - 1;
    else if (e.key === 'Enter' && idSelection) {
      e.preventDefault();
      onOuvrir(idSelection);
      return;
    }
    if (cible === null) return;
    e.preventDefault();
    onSelection(ordre[cible]);
  };

  return (
    <aside
      aria-label="Liste des notes"
      className={cn('flex min-h-0 flex-col lg:h-full', className)}
    >
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-5 lg:px-3 lg:pt-4">
        <div className="flex items-center justify-between gap-2 lg:pl-1">
          <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight lg:text-[15px]">
            Notes
            {!chargement && (
              <span className="text-sm font-normal text-subtle tabular lg:text-xs">{total}</span>
            )}
          </h1>
          <BoutonNouvelleNote onNouvelle={onNouvelle} enCours={creationEnCours} />
        </div>

        <InputGroup
          ref={refRecherche}
          type="search"
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (recherche) onRecherche('');
              else e.currentTarget.blur();
            } else if ((e.key === 'ArrowDown' || e.key === 'Enter') && ordre.length) {
              // Du champ à la liste sans lâcher le clavier
              e.preventDefault();
              onSelection(ordre[0]);
              if (e.key === 'Enter') onOuvrir(ordre[0]);
              else refListe.current?.focus();
            }
          }}
          placeholder="Rechercher titre, texte, #étiquette…"
          aria-label="Rechercher dans les notes"
          className="h-9 text-[13px] [&::-webkit-search-cancel-button]:hidden"
          avant={recherchant ? <Loader2 className="animate-spin" /> : <Search />}
          apres={
            recherche ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  onRecherche('');
                  refRecherche.current?.focus();
                }}
                aria-label="Effacer la recherche"
              >
                <X />
              </Button>
            ) : (
              <Kbd className="mr-1 hidden lg:inline-flex">/</Kbd>
            )
          }
        />

        <FiltresNotes
          filtre={filtre}
          onFiltre={onFiltre}
          facettes={facettes}
          campagnes={campagnes}
        />
        {bandeau}
      </div>

      <motion.div
        ref={refListe}
        layoutScroll
        role="listbox"
        tabIndex={0}
        aria-label="Notes"
        aria-activedescendant={idSelection ? idElementNote(idSelection) : undefined}
        onKeyDown={clavier}
        className="group/liste relative flex-1 px-2 pb-4 outline-none lg:min-h-0 lg:overflow-y-auto"
      >
        {chargement ? (
          <SqueletteListe />
        ) : nbVisibles === 0 ? (
          <AucunResultat
            recherche={recherche}
            filtre={filtre}
            onEffacer={() => {
              onRecherche('');
              onFiltre(FILTRE_VIDE);
            }}
          />
        ) : (
          <LayoutGroup id="liste-notes">
            {groupes.map((g) => (
              <div key={g.id} role="group" aria-labelledby={`groupe-${g.id}`}>
                <div
                  id={`groupe-${g.id}`}
                  className="z-10 flex items-center gap-1.5 px-3 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle lg:sticky lg:top-0 lg:bg-gradient-to-b lg:from-background lg:via-background/95 lg:to-background/0"
                >
                  <Illustration
                    src={parCampagne.get(g.id)?.coverUrl}
                    graine={g.titre}
                    initiale={false}
                    className="size-3.5 shrink-0 rounded-[4px] ring-1 ring-white/10"
                  />
                  <span className="min-w-0 truncate">{g.titre}</span>
                  <span className="ml-auto font-normal normal-case tracking-normal tabular text-subtle/70">
                    {g.notes.length}
                  </span>
                </div>
                {/* Pas d'animation de sortie : une note supprimée disparaît net, les autres glissent */}
                {g.notes.map((n) => (
                  <ElementNote
                    key={n.note.id}
                    n={n}
                    mots={mots}
                    selectionnee={n.note.id === idSelection}
                    auteur={n.note.authorId === moi ? null : n.note.authorName}
                    maintenant={maintenant}
                    onChoix={() => onSelection(n.note.id)}
                  />
                ))}
              </div>
            ))}
          </LayoutGroup>
        )}
        {!chargement && suite.aSuite && (
          <div ref={repere} className="flex justify-center py-3">
            <Button
              variant="ghost"
              size="xs"
              onClick={suite.charger}
              loading={suite.enCours}
              className="text-subtle"
            >
              Charger plus de notes
            </Button>
          </div>
        )}
      </motion.div>

      <div className="hidden h-9 shrink-0 items-center justify-between gap-2 border-t border-border/70 px-4 text-[11px] text-subtle lg:flex">
        <span className="tabular">
          {filtree
            ? `${totalFiltre ?? nbVisibles} sur ${total}`
            : `${total} note${total > 1 ? 's' : ''}`}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span className="mr-2">parcourir</span>
          <Kbd>N</Kbd>
          <span>nouvelle</span>
        </span>
      </div>
    </aside>
  );
}

function ElementNote({
  n,
  mots,
  selectionnee,
  auteur,
  maintenant,
  onChoix,
}: {
  n: NoteIndexee;
  mots: string[];
  selectionnee: boolean;
  /** Auteur, si la note est celle d'un autre joueur. */
  auteur: string | null;
  maintenant: number;
  onChoix: () => void;
}) {
  const { note } = n;
  const apercu = n.apercu;
  const titre = note.title.trim();

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      id={idElementNote(note.id)}
      role="option"
      aria-selected={selectionnee}
      onClick={onChoix}
      className="group/note relative scroll-mb-2 scroll-mt-10 cursor-pointer select-none rounded-xl"
    >
      {selectionnee && (
        <motion.div
          layoutId="selection-note"
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          className="absolute inset-0 rounded-xl bg-surface-3 shadow-surface ring-1 ring-inset ring-white/[0.05] group-focus-visible/liste:ring-primary/45"
        >
          <span className="absolute inset-y-3 left-0 w-[2px] rounded-full bg-primary" />
        </motion.div>
      )}
      <div
        className={cn(
          'relative flex gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150',
          !selectionnee && 'hover:bg-surface-2/80',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] border text-[18px] leading-none transition-colors',
            selectionnee ? 'border-border-strong bg-surface-2' : 'border-border bg-surface/80',
          )}
        >
          {iconeNote(note)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                'min-w-0 flex-1 truncate text-[13.5px] font-medium leading-5',
                titre ? 'text-foreground' : 'italic text-muted-foreground',
              )}
            >
              <Surligne texte={titre || 'Sans titre'} mots={titre ? mots : []} />
            </p>
            <span className="shrink-0 text-[11px] leading-5 text-subtle tabular">
              {dateCourte(note.updatedAt, maintenant)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 break-words text-[12.5px] leading-[1.5] text-muted-foreground/90">
            {apercu ? (
              <Surligne texte={apercu} mots={mots} />
            ) : (
              <span className="text-subtle">Aucun contenu</span>
            )}
          </p>
          {(note.pinned || note.visibility !== 'private' || note.tags.length > 0 || auteur) && (
            <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-subtle">
              {note.pinned && (
                <Pin className="size-3 shrink-0 rotate-45 text-primary/80" aria-label="Épinglée" />
              )}
              {note.visibility === 'gm' && (
                <span className="flex shrink-0 items-center gap-1">
                  <Crown className="size-3 text-primary/80" aria-hidden />
                  MJ
                </span>
              )}
              {note.visibility === 'room' && (
                <span className="flex shrink-0 items-center gap-1">
                  <Users className="size-3 text-primary/80" aria-hidden />
                  Table
                </span>
              )}
              {note.visibility === 'characters' && (
                <span className="flex shrink-0 items-center gap-1">
                  <UserRoundCheck className="size-3 text-primary/80" aria-hidden />
                  Ciblée
                </span>
              )}
              {auteur && <span className="max-w-[90px] shrink-0 truncate">{auteur}</span>}
              {note.tags.slice(0, 3).map((t) => (
                <span key={t} className="max-w-[90px] shrink-0 truncate">
                  <span className="text-subtle/60">#</span>
                  <Surligne texte={t} mots={mots} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Texte avec les termes cherchés mis en valeur. */
function Surligne({ texte, mots }: { texte: string; mots: string[] }) {
  if (!mots.length) return <>{texte}</>;
  return (
    <>
      {segments(texte, mots).map((s, i) =>
        s.surligne ? (
          <mark key={i} className="rounded-[3px] bg-primary/25 px-px text-primary-strong">
            {s.t}
          </mark>
        ) : (
          <span key={i}>{s.t}</span>
        ),
      )}
    </>
  );
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

function Puce({
  actif,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { actif: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      {...props}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium outline-none transition-[background-color,border-color,color] duration-150',
        'focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5',
        actif
          ? 'border-primary/35 bg-primary/10 text-primary-strong'
          : 'border-border bg-surface/60 text-muted-foreground hover:border-border-strong hover:text-foreground data-[state=open]:border-border-strong data-[state=open]:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

function FiltresNotes({
  filtre,
  onFiltre,
  facettes,
  campagnes,
}: {
  filtre: FiltreNotes;
  onFiltre: (f: FiltreNotes) => void;
  facettes: FacettesNotes | undefined;
  campagnes: Campagne[];
}) {
  // Compteurs de toutes mes notes, calculés par le service
  const compte = {
    types: new Map<TypeNote, number>(Object.entries(facettes?.types ?? {}) as [TypeNote, number][]),
    salles: facettes?.campagnes ?? new Map<string, number>(),
  };

  const type = filtre.type ? TYPES_NOTE.find((t) => t.id === filtre.type) : null;
  const campagne = filtre.campagne ? campagnes.find((c) => c.id === filtre.campagne) : null;

  return (
    <div
      role="toolbar"
      aria-label="Filtres"
      className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 no-scrollbar lg:-mx-3 lg:px-3"
    >
      <Puce actif={!filtreActif(filtre)} onClick={() => onFiltre(FILTRE_VIDE)}>
        Toutes
      </Puce>
      <Puce
        actif={filtre.epinglees}
        onClick={() => onFiltre({ ...filtre, epinglees: !filtre.epinglees })}
      >
        <Pin className="rotate-45" />
        Épinglées
      </Puce>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Puce actif={!!type}>
            {type ? (
              <>
                <span className="text-[13px] leading-none">{type.icone}</span>
                {type.label}
              </>
            ) : (
              'Type'
            )}
            <ChevronDown className="!size-3 opacity-60" />
          </Puce>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <ElementFiltre actif={!filtre.type} onSelect={() => onFiltre({ ...filtre, type: null })}>
            Tous les types
          </ElementFiltre>
          <DropdownMenuSeparator />
          {TYPES_NOTE.map((t) => (
            <ElementFiltre
              key={t.id}
              actif={filtre.type === t.id}
              compte={compte.types.get(t.id) ?? 0}
              onSelect={() => onFiltre({ ...filtre, type: t.id })}
            >
              <span className="w-5 text-center text-base leading-none">{t.icone}</span>
              {t.label}
            </ElementFiltre>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Puce actif={!!filtre.campagne}>
            {campagne ? (
              <>
                <Illustration
                  src={campagne.coverUrl}
                  graine={campagne.name}
                  initiale={false}
                  className="size-3.5 rounded-[4px]"
                />
                <span className="max-w-[110px] truncate">{campagne.name}</span>
              </>
            ) : (
              'Campagne'
            )}
            <ChevronDown className="!size-3 opacity-60" />
          </Puce>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <ElementFiltre
            actif={!filtre.campagne}
            onSelect={() => onFiltre({ ...filtre, campagne: null })}
          >
            Toutes les campagnes
          </ElementFiltre>
          {campagnes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Mes campagnes</DropdownMenuLabel>
            </>
          )}
          {campagnes.map((c) => (
            <ElementFiltre
              key={c.id}
              actif={filtre.campagne === c.id}
              compte={compte.salles.get(c.id) ?? 0}
              onSelect={() => onFiltre({ ...filtre, campagne: c.id })}
            >
              <Illustration
                src={c.coverUrl}
                graine={c.name}
                initiale={false}
                className="size-5 shrink-0 rounded-[5px] ring-1 ring-white/10"
              />
              <span className="truncate">{c.name}</span>
            </ElementFiltre>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ElementFiltre({
  actif,
  compte,
  onSelect,
  children,
}: {
  actif: boolean;
  compte?: number;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className={cn(actif && 'text-foreground')}>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {compte !== undefined && <span className="text-xs text-subtle tabular">{compte}</span>}
      <Check className={cn('text-primary', !actif && 'invisible')} />
    </DropdownMenuItem>
  );
}

// ─── États ───────────────────────────────────────────────────────────────────

function SqueletteListe() {
  return (
    <div className="space-y-1 px-1 pt-4" aria-busy aria-label="Chargement des notes">
      <Skeleton className="mb-3 ml-2 h-3 w-20" />
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-xl px-2 py-2.5">
          <Skeleton className="size-9 shrink-0 rounded-[10px]" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex justify-between gap-6">
              <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
              <Skeleton className="h-3 w-9" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3" style={{ width: `${55 + ((i * 23) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AucunResultat({
  recherche,
  filtre,
  onEffacer,
}: {
  recherche: string;
  filtre: FiltreNotes;
  onEffacer: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-in fade-in-0">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-border-strong bg-surface-2">
        <SearchX className="size-4 text-subtle" />
      </div>
      <p className="text-sm font-medium">Aucune note trouvée</p>
      <p className="mt-1 max-w-[240px] text-[13px] text-muted-foreground">
        {recherche
          ? `Rien ne correspond à « ${recherche.trim()} »${filtreActif(filtre) ? ' avec ces filtres' : ''}.`
          : 'Aucune note ne correspond à ces filtres.'}
      </p>
      <Button variant="secondary" size="xs" className="mt-4" onClick={onEffacer}>
        Tout effacer
      </Button>
    </div>
  );
}
