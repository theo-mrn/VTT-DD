'use client';

/**
 * Bloc Compétences : toute la progression du personnage en un bloc, plusieurs vues au choix
 * dans l'en-tête (contrôle segmenté, choix mémorisé par personnage et par bloc) :
 * - **Progression** : voies en tableau (une ligne par voie, une colonne par rang), ou arbres
 *   de talents en grille ; la forme vient des données du système, jamais de son identifiant ;
 * - **rangs** (nom de la sorte) : entrées dont les rangs s'achètent directement, avec « + » ;
 * - **Capacités** : entrées acquises, toutes sortes du bloc confondues, avec activation.
 * Les soldes des monnaies de la progression sont dans l'en-tête ; le détail s'ouvre au clic
 * (description, effets, achat ou remboursement par les opérations de la fiche).
 */
import { Coins, ListChecks, Search, TableProperties, TrendingUp, X } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TreeDetailDialog, type TreeSelection } from '../tree/detail-dialog';
import { TreeExplorer } from '../tree/explorer';
import { currencyName } from '../tree/model';
import { sheetWrites } from '../tree/writes';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';
import { buildSkillsBlock, VIEW_ORDER, type OwnedItem, type SkillsViewId } from './abilities';
import { BlockShell } from './block-shell';
import type { SkillCard } from './model';
import { OwnedList } from './owned-list';
import { SkillDialog } from './parts';
import { PathsTable } from './paths-table';
import { RankedList } from './ranked-list';
import { ViewSwitch, type ViewOption } from './view-switch';

/** Texte comparable : minuscules, sans accents. */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Largeur d'un élément, suivie au redimensionnement du bloc. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    obs.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => obs.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Vue choisie, mémorisée dans le navigateur (préférence locale, sans garantie). */
function useStoredView(key: string, available: SkillsViewId[], preferred?: SkillsViewId) {
  const [stored, setStored] = useState<SkillsViewId | null>(() => {
    try {
      const v = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
      return VIEW_ORDER.includes(v as SkillsViewId) ? (v as SkillsViewId) : null;
    } catch {
      return null;
    }
  });
  const pick = (v: SkillsViewId | null | undefined) => (v && available.includes(v) ? v : null);
  const view = pick(stored) ?? pick(preferred) ?? available[0] ?? 'capacites';
  const set = (v: SkillsViewId) => {
    setStored(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // Stockage indisponible (navigation privée…) : le choix vaut pour la session
    }
  };
  return [view, set] as const;
}

function SearchField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher…"
        aria-label={label}
        className="h-9 w-full rounded-lg border border-input bg-surface-2/60 pl-8 pr-8 text-[13px] text-foreground placeholder:text-subtle focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 sm:h-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-subtle hover:text-foreground"
          aria-label="Effacer la recherche"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function SkillsBlock({ ctx, widget, mode, height = 'auto' }: SheetBlockProps<'competences'>) {
  const data = useMemo(() => buildSkillsBlock(ctx.fiche, widget), [ctx.fiche, widget]);
  const writes = sheetWrites(ctx, mode);
  const [bodyRef, width] = useWidth<HTMLDivElement>();
  const panelId = useId();
  const [view, setView] = useStoredView(
    `vtt.fiche.competences.vue:${ctx.personnage.id}:${widget.titre}`,
    data.views,
    widget.vue,
  );
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [filter, setFilter] = useState<string | null>(null);
  const [rankSel, setRankSel] = useState<TreeSelection | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);

  const cur = (id: string | undefined) => currencyName(ctx.systeme, id);
  const q = plain(deferred.trim());
  const matches = (c: SkillCard) =>
    !q || plain([c.entry.nom, c.entry.description ?? ''].join(' ')).includes(q);
  const owned = data.owned.filter(
    (o) => (filter === null || o.filterKey === filter) && matches(o.card),
  );
  const allCards: SkillCard[] = [
    ...data.owned.map((o) => o.card),
    ...data.ranked.flatMap((r) => r.groups.flatMap((g) => g.cards)),
  ];
  const selectedCard = allCards.find((c) => c.entry.id === cardId) ?? null;

  const narrow = width > 0 && width < 560;
  const options: ViewOption<SkillsViewId>[] = data.views.map((id) =>
    id === 'progression'
      ? { id, label: 'Progression', icon: TableProperties }
      : id === 'rangs'
        ? {
            id,
            label: data.ranked.map((r) => r.sorte.nomPluriel ?? r.sorte.nom).join(', '),
            icon: TrendingUp,
          }
        : { id, label: 'Capacités', icon: ListChecks },
  );
  const searchable = view === 'capacites' || view === 'rangs';
  const trees = view === 'progression' && data.trees.length > 0;

  return (
    <>
      <BlockShell
        title={widget.titre}
        actions={
          <>
            {options.length > 1 && (
              <ViewSwitch
                options={options}
                value={view}
                onChange={(v) => {
                  setView(v);
                  setFilter(null);
                }}
                label={`Vues de ${widget.titre}`}
                panelId={panelId}
                showLabels={width === 0 || width >= 420}
              />
            )}
            {data.balances.map((b) => (
              <Info key={b.currency} texte={`${b.balance} ${b.name} à dépenser`}>
                <span className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-[12px]">
                  <Coins className="size-3.5 text-primary" aria-hidden />
                  <span className="font-mono font-semibold tabular">{b.balance}</span>
                  <span className={cn('text-subtle', narrow && 'sr-only')}>{b.name}</span>
                </span>
              </Info>
            ))}
          </>
        }
        toolbar={
          searchable &&
          (view === 'capacites' ? data.owned.length : allCards.length - data.owned.length) > 5 ? (
            <>
              <SearchField
                value={query}
                onChange={setQuery}
                label={`Rechercher dans ${widget.titre}`}
              />
              {view === 'capacites' && data.filters.length > 0 && (
                <div
                  className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]"
                  role="group"
                  aria-label="Filtrer par type"
                >
                  {[{ key: null, label: 'Toutes', count: data.owned.length }, ...data.filters].map(
                    (f) => {
                      const on = filter === f.key;
                      return (
                        <button
                          key={f.key ?? '*'}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setFilter(on && f.key !== null ? null : f.key)}
                          className={cn(
                            'flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium sm:h-6',
                            'transition-colors duration-150 motion-reduce:transition-none',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            on
                              ? 'border-primary/40 bg-primary/10 text-primary-strong'
                              : 'border-border-strong text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {f.label}
                          <span className="font-mono tabular opacity-60">{f.count}</span>
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </>
          ) : undefined
        }
        bodyClassName={cn(trees && height === 'fixed' && 'overflow-hidden')}
      >
        <div
          ref={bodyRef}
          id={panelId}
          role={options.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={options.length > 1 ? `${panelId}-tab-${view}` : undefined}
          className={cn(trees && height === 'fixed' && 'flex h-full min-h-0 flex-col gap-3')}
        >
          {view === 'progression' && (
            <>
              {data.paths.length > 0 && (
                <PathsTable
                  paths={data.paths}
                  columns={data.pathColumns}
                  caption={data.pathSorteNames.join(', ') || widget.titre}
                  narrow={narrow}
                  currencyName={cur}
                  onSelect={(path, rank) => setRankSel({ kind: 'rank', path, rank })}
                />
              )}
              {data.trees.length > 0 && (
                <div
                  className={cn(
                    height === 'fixed' ? 'min-h-0 flex-1' : 'h-[min(70vh,34rem)]',
                    data.paths.length > 0 && 'mt-3',
                  )}
                >
                  <TreeExplorer ctx={ctx} writes={writes} treesOnly />
                </div>
              )}
            </>
          )}
          {view === 'rangs' && (
            <RankedList
              ctx={ctx}
              groups={data.ranked}
              matches={matches}
              writes={writes}
              onOpen={(c) => setCardId(c.entry.id)}
            />
          )}
          {view === 'capacites' &&
            (data.owned.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune capacité acquise pour l’instant.
                {data.views.includes('progression') && ' Elles s’obtiennent par la progression.'}
              </p>
            ) : owned.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
            ) : (
              <OwnedList
                items={owned}
                showFilterLabel={(o: OwnedItem) => o.filterKey.startsWith('champ:')}
                writes={writes}
                onOpen={(o) => setCardId(o.card.entry.id)}
              />
            ))}
        </div>
      </BlockShell>

      <TreeDetailDialog
        ctx={ctx}
        writes={writes}
        selection={rankSel}
        onClose={() => setRankSel(null)}
      />
      <SkillDialog ctx={ctx} card={selectedCard} writes={writes} onClose={() => setCardId(null)} />
    </>
  );
}

export const skillsBlock: SheetBlockDefinition<'competences'> = {
  type: 'competences',
  label: 'Compétences',
  description:
    'Progression (voies en tableau ou arbres), compétences à rangs et capacités acquises.',
  defaultSize: { w: 12, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: SkillsBlock,
};
