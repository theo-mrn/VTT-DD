'use client';

/**
 * Bloc Compétences : toute la progression du personnage en un bloc, plusieurs vues au choix
 * dans l'en-tête (contrôle segmenté, choix mémorisé par personnage et par bloc) :
 * - **Progression** : voies en tableau (une ligne par voie, une colonne par rang), ou arbres
 *   de talents en grille ; la forme vient des données du système, jamais de son identifiant ;
 * - **rangs** (nom de la sorte) : entrées dont les rangs s'achètent directement, avec « + » ;
 * - **Capacités** : entrées acquises, toutes sortes du bloc confondues, rangées par état
 *   (actives, à activer, usages limités, passives), avec activation, usages, durée et
 *   « Lancer » (panneau des dés avec leurs bonus, à la table).
 * Les soldes des monnaies de la progression sont dans l'en-tête ; le détail s'ouvre au clic
 * (description, effets, achat ou remboursement par les opérations de la fiche).
 */
import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import { Coins, ListChecks, Search, TableProperties, TrendingUp, X } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { bonusDeJet } from '@/components/des/bonus-jet';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TreeDetailDialog, type TreeSelection } from '../tree/detail-dialog';
import { TreeExplorer } from '../tree/explorer';
import { currencyName } from '../tree/model';
import { sheetWrites } from '../tree/writes';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';
import {
  buildSkillsBlock,
  VIEW_ORDER,
  type OwnedItem,
  type SkillsBlockData,
  type SkillsViewId,
} from './abilities';
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
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  label: string;
}>) {
  const t = useTranslations();
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('map.tokens.library.searchPlaceholder')}
        aria-label={label}
        className="h-11 w-full rounded-lg border border-input bg-surface-2/60 pl-8 pr-8 text-[13px] text-foreground placeholder:text-subtle focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 sm:h-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 sm:size-7 items-center justify-center rounded text-subtle hover:text-foreground"
          aria-label={t('resources.clearSearch')}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Recherche des vues en liste (Capacités, rangs), au-delà de 5 entrées. */
function withSearch(view: SkillsViewId, ownedCount: number, rankedCount: number): boolean {
  if (view !== 'capacites' && view !== 'rangs') return false;
  return (view === 'capacites' ? ownedCount : rankedCount) > 5;
}

type Ctx = SheetBlockProps<'competences'>['ctx'];
type Writes = ReturnType<typeof sheetWrites>;

/** Pastilles de filtre de la vue Capacités (« Toutes », puis chaque type, avec leur nombre). */
function FilterChips({
  total,
  filters,
  filter,
  onFilter,
}: Readonly<{
  total: number;
  filters: SkillsBlockData['filters'];
  filter: string | null;
  onFilter(key: string | null): void;
}>) {
  const t = useTranslations();
  return (
    <div
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]"
      role="group"
      aria-label={t('sheet.skills.filterType')}
    >
      {[{ key: null, label: t('map.sounds.allCategories'), count: total }, ...filters].map((f) => {
        const on = filter === f.key;
        return (
          <button
            key={f.key ?? '*'}
            type="button"
            aria-pressed={on}
            onClick={() => onFilter(on && f.key !== null ? null : f.key)}
            className={cn(
              'relative flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium sm:h-6',
              "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] sm:after:hidden",
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
      })}
    </div>
  );
}

/** Vue Progression : voies en tableau, puis arbres de talents. */
function ProgressionView({
  ctx,
  data,
  writes,
  height,
  narrow,
  title,
  onSelect,
}: Readonly<{
  ctx: Ctx;
  data: SkillsBlockData;
  writes: Writes;
  height: SheetBlockProps<'competences'>['height'];
  narrow: boolean;
  title: string;
  onSelect(selection: TreeSelection): void;
}>) {
  return (
    <>
      {data.paths.length > 0 && (
        <PathsTable
          paths={data.paths}
          columns={data.pathColumns}
          caption={data.pathSorteNames.join(', ') || title}
          narrow={narrow}
          currencyName={(id: string | undefined) => currencyName(ctx.systeme, id)}
          onSelect={(path, rank) => onSelect({ kind: 'rank', path, rank })}
        />
      )}
      {data.trees.length > 0 && (
        <div
          className={cn(
            height === 'fixed' ? 'min-h-0 flex-1' : 'h-[min(70vh,34rem)]',
            data.paths.length > 0 && 'mt-3',
          )}
        >
          <TreeExplorer ctx={ctx} trees={data.trees} writes={writes} />
        </div>
      )}
    </>
  );
}

/** Groupes de la vue Capacités, dans l'ordre : ce qui joue maintenant, puis le reste. */
const CAPACITY_GROUPS = ['active', 'toActivate', 'limited', 'passive'] as const;
type CapacityGroup = (typeof CAPACITY_GROUPS)[number];

function groupOf({ card }: OwnedItem): CapacityGroup {
  if (card.activable) return card.active ? 'active' : 'toActivate';
  return card.uses ? 'limited' : 'passive';
}

/** Ce qu'un « Lancer » demande au panneau des dés pour une capacité. */
export interface RollRequest {
  bonus: string[];
  attributs: string[];
}

/**
 * Vue Capacités : entrées acquises filtrées, rangées par état (actives, à activer, usages
 * limités, passives), ou ce qui explique leur absence. « Lancer » ouvre les dés avec les
 * bonus de jet de la capacité.
 */
function CapacitesView({
  data,
  owned,
  writes,
  rolls,
  onRoll,
  onOpen,
}: Readonly<{
  data: SkillsBlockData;
  owned: OwnedItem[];
  writes: Writes;
  rolls: ReadonlyMap<string, RollRequest>;
  onRoll: ((r: RollRequest) => void) | undefined;
  onOpen(card: SkillCard): void;
}>) {
  const t = useTranslations();
  const groups = CAPACITY_GROUPS.map(
    (g) => [g, owned.filter((o) => groupOf(o) === g)] as const,
  ).filter(([, items]) => items.length > 0);
  return (
    <>
      {data.owned.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('sheet.skills.noAbility')}
          {data.views.includes('progression') && ` ${t('sheet.skills.noAbilityHint')}`}
        </p>
      )}
      {data.owned.length > 0 && owned.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('sheet.effects.noResult')}
        </p>
      )}
      {groups.map(([group, items]) => (
        <section key={group} aria-label={t(`sheet.skills.groups.${group}`)} className="pb-1">
          {groups.length > 1 && (
            <h4 className="px-1.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-subtle first:pt-0">
              {t(`sheet.skills.groups.${group}`)}
            </h4>
          )}
          <OwnedList
            items={items}
            showFilterLabel={(o: OwnedItem) => o.filterKey.startsWith('champ:')}
            writes={writes}
            onOpen={(o) => onOpen(o.card)}
            {...(onRoll
              ? {
                  onRoll: (o: OwnedItem) => {
                    const r = rolls.get(o.card.entry.id);
                    if (r) onRoll(r);
                  },
                  canRoll: (o: OwnedItem) => rolls.has(o.card.entry.id),
                }
              : {})}
          />
        </section>
      ))}
    </>
  );
}

function SkillsBlock({
  ctx,
  widget,
  mode,
  height = 'auto',
}: Readonly<SheetBlockProps<'competences'>>) {
  const t = useTranslations();
  const data = useMemo(() => buildSkillsBlock(ctx.fiche, widget), [ctx.fiche, widget]);
  const writes = sheetWrites(ctx, mode);
  // Bonus de jet de chaque capacité, pour « Lancer » (à la table, sur son héros)
  const rolls = useMemo(() => {
    const m = new Map<string, RollRequest>();
    if (!ctx.lancerJet) return m;
    for (const b of bonusDeJet(ctx.fiche, '', ctx.presentation)) {
      // Seuls les bonus de jet (actifs, à invoquer, ou d'une capacité éteinte) se lancent
      if (!b.jet || !b.entree || (b.terme === null && !b.vises.length)) continue;
      const r = m.get(b.entree) ?? { bonus: [], attributs: [] };
      if (b.terme !== null) r.bonus.push(b.cle);
      for (const a of b.vises) if (!r.attributs.includes(a)) r.attributs.push(a);
      m.set(b.entree, r);
    }
    return m;
  }, [ctx.fiche, ctx.presentation, ctx.lancerJet]);
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
  const libellesVues: Record<SkillsViewId, Omit<ViewOption<SkillsViewId>, 'id'>> = {
    progression: { label: t('sheet.skills.progression'), icon: TableProperties },
    rangs: {
      label: data.ranked.map((r) => r.sorte.nomPluriel ?? r.sorte.nom).join(', '),
      icon: TrendingUp,
    },
    capacites: { label: t('resources.tabs.capacites'), icon: ListChecks },
  };
  const options: ViewOption<SkillsViewId>[] = data.views.map((id) => ({
    id,
    ...libellesVues[id],
  }));
  const tabs = options.length > 1;
  const avecRecherche = withSearch(view, data.owned.length, allCards.length - data.owned.length);
  const fixedTrees = view === 'progression' && data.trees.length > 0 && height === 'fixed';

  return (
    <>
      <BlockShell
        title={widget.titre}
        actions={
          <>
            {tabs && (
              <ViewSwitch
                options={options}
                value={view}
                onChange={(v) => {
                  setView(v);
                  setFilter(null);
                }}
                label={t('sheet.skills.viewsOf', { name: widget.titre })}
                panelId={panelId}
                showLabels={width === 0 || width >= 420}
              />
            )}
            {data.balances.map((b) => (
              <Info
                key={b.currency}
                texte={t('sheet.skills.toSpend', { amount: `${b.balance} ${b.name}` })}
              >
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
          avecRecherche ? (
            <>
              <SearchField
                value={query}
                onChange={setQuery}
                label={t('resources.catalogue.searchIn', { section: widget.titre })}
              />
              {view === 'capacites' && data.filters.length > 0 && (
                <FilterChips
                  total={data.owned.length}
                  filters={data.filters}
                  filter={filter}
                  onFilter={setFilter}
                />
              )}
            </>
          ) : undefined
        }
        bodyClassName={cn(fixedTrees && 'overflow-hidden')}
      >
        <div
          ref={bodyRef}
          id={panelId}
          role={tabs ? 'tabpanel' : undefined}
          aria-labelledby={tabs ? `${panelId}-tab-${view}` : undefined}
          className={cn(fixedTrees && 'flex h-full min-h-0 flex-col gap-3')}
        >
          {view === 'progression' && (
            <ProgressionView
              ctx={ctx}
              data={data}
              writes={writes}
              height={height}
              narrow={narrow}
              title={widget.titre}
              onSelect={setRankSel}
            />
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
          {view === 'capacites' && (
            <CapacitesView
              data={data}
              owned={owned}
              writes={writes}
              rolls={rolls}
              onRoll={mode === 'edit' ? undefined : ctx.lancerJet}
              onOpen={(c) => setCardId(c.entry.id)}
            />
          )}
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
  get label() {
    return translate('sheet.blocks.skills.label');
  },
  get description() {
    return translate('sheet.blocks.skills.description');
  },
  defaultSize: { w: 12, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: SkillsBlock,
};
