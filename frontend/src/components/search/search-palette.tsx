'use client';

/**
 * Palette ⌘K (docs/recherche.md) : une seule, à l'accueil comme à la table. Rubriques en
 * pastilles : « Aller à » (navigation, à l'accueil), « Tout », puis celles que déclare le
 * système ; la fiche d'un résultat s'ouvre à la place de la liste, avec ses actions (ranger
 * un objet dans l'inventaire du héros, poser une créature sur la carte pour le MJ).
 */
import type { Entree } from '@vtt/rules';
import {
  ArrowLeft,
  BookOpen,
  Compass,
  Layers,
  MapPin,
  Skull,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { TOKENS_TOOL_ID } from '@/lib/map/features/tokens/engine/place-tool';
import { tokensStateOf } from '@/lib/map/features/tokens/engine/state';
import { cn } from '@/lib/utils';
import { CreatureSheet } from '../resources/bestiary/bestiary-tab';
import { EntryDetail } from '../resources/catalogue/entry-detail';
import { AddButton } from '../resources/market/market-tab';
import type { InventoryTarget } from '../resources/market/use-inventory-target';
import { Thumb } from '../resources/parts';
import { ALL, searchIndex, type SearchHit, type SearchItem, type SearchTabKind } from './model';
import type { RulesSearchData } from './use-rules-search';

const NAV = 'nav';

const ICONS: Record<SearchTabKind, LucideIcon> = {
  capacites: BookOpen,
  marche: Store,
  bestiaire: Skull,
};

export interface PaletteRules {
  data: RulesSearchData | null;
  isPending: boolean;
  /** Inventaire du héros incarné (table) ; null : pas d'ajout. */
  inventory: InventoryTarget | null;
  /** Carte affichée, pour le MJ (table) ; null : pas de pose. */
  engine: MapEngine | null;
}

export function SearchPalette({
  open,
  onOpenChange,
  rules,
  navigation,
  systemPicker,
  placeholder,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  rules: PaletteRules;
  /** Groupes de navigation (accueil) ; absents à la table. */
  navigation?: (o: { query: string; close(): void; rulesPreview: ReactNode }) => ReactNode;
  /** Choix du système (accueil), à droite des rubriques. */
  systemPicker?: ReactNode;
  placeholder?: string;
}>) {
  const t = useTranslations('search');
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [tab, setTab] = useState<string>(navigation ? NAV : ALL);
  const [opened, setOpened] = useState<SearchItem | null>(null);
  /** Élément en surbrillance (cmdk) : le premier à chaque saisie ou rubrique. */
  const [active, setActive] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Entrées liées ouvertes depuis la fiche (fil d'Ariane), de la première à l'affichée. */
  const [trail, setTrail] = useState<string[]>([]);

  const data = rules.data;
  const tabs = data?.index.tabs ?? [];
  // Rubrique disparue (autre système) : retour au début
  useEffect(() => {
    if (tab !== NAV && tab !== ALL && !tabs.some((t) => t.id === tab)) setTab(ALL);
  }, [tab, tabs]);

  const hits = useMemo(
    () => (data && tab !== NAV ? searchIndex(data.systeme, data.index, search, tab) : []),
    [data, search, tab],
  );
  const preview = useMemo(
    () =>
      data && navigation && tab === NAV && search.trim()
        ? searchIndex(data.systeme, data.index, search, ALL, 6)
        : [],
    [data, navigation, tab, search],
  );

  // Nouvelle saisie ou rubrique : en haut de la liste, le premier résultat en surbrillance
  // (cmdk garderait sinon l'élément et le défilement d'avant, au milieu des nouveaux résultats)
  const firstValue = tab === ALL && !search.trim() ? (tabs[0]?.id ?? '') : (hits[0]?.item.id ?? '');
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    // « Aller à » : cmdk filtre et choisit le premier lui-même
    if (tab !== NAV) setActive(firstValue);
  }, [search, tab, firstValue]);

  const reset = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setQuery('');
      setOpened(null);
      setTrail([]);
      setTab(navigation ? NAV : ALL);
    }
  };
  const close = () => reset(false);
  const openItem = (item: SearchItem) => {
    setOpened(item);
    setTrail([]);
  };

  const chips: { id: string; label: string; icon: LucideIcon }[] = [
    ...(navigation ? [{ id: NAV, label: t('goTo'), icon: Compass }] : []),
    ...(data ? [{ id: ALL, label: t('all'), icon: Layers }] : []),
    ...tabs.map((t) => ({ id: t.id, label: t.label, icon: ICONS[t.kind] })),
  ];

  // Tab / Maj+Tab dans la saisie : rubrique suivante ou précédente
  const cycle = (dir: 1 | -1) => {
    const i = chips.findIndex((c) => c.id === tab);
    const next = chips[(i + dir + chips.length) % chips.length];
    if (next) {
      setTab(next.id);
      setOpened(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        unstyled
        showCloseButton={false}
        className="top-[12%] max-w-2xl translate-y-0 overflow-hidden rounded-2xl border border-border-strong bg-popover shadow-elevated data-[state=open]:slide-in-from-top-4 sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <Command
          loop
          shouldFilter={tab === NAV}
          value={active}
          onValueChange={setActive}
          className="max-h-[70vh]"
        >
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setOpened(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && chips.length > 1) {
                e.preventDefault();
                cycle(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder={tab === NAV ? t('navPlaceholder') : (placeholder ?? t('placeholder'))}
            apres={<Kbd>{t('escape')}</Kbd>}
          />
          {chips.length > 1 && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div
                role="tablist"
                aria-label={t('tabs')}
                className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
              >
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === c.id}
                    onClick={() => {
                      setTab(c.id);
                      setOpened(null);
                      // La saisie garde la main : on continue de taper après un clic de rubrique
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors',
                      tab === c.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <c.icon className="size-3.5" aria-hidden />
                    {c.label}
                  </button>
                ))}
              </div>
              {systemPicker}
            </div>
          )}

          {opened && data ? (
            <Detail
              item={opened}
              trail={trail}
              data={data}
              rules={rules}
              onTrail={setTrail}
              onBack={() => (trail.length ? setTrail(trail.slice(0, -1)) : setOpened(null))}
              onClose={close}
            />
          ) : (
            <CommandList ref={listRef} className="max-h-[56vh]">
              {tab === NAV && navigation ? (
                navigation({
                  query: search,
                  close,
                  rulesPreview: preview.length ? (
                    <CommandGroup
                      heading={t('rules', { system: data?.systeme.source.nom ?? '' })}
                      forceMount
                    >
                      {preview.map((h) => (
                        <Result key={h.item.id} hit={h} onSelect={() => openItem(h.item)} />
                      ))}
                    </CommandGroup>
                  ) : null,
                })
              ) : (
                <RulesList
                  rules={rules}
                  tab={tab}
                  query={search}
                  hits={hits}
                  onTab={setTab}
                  onOpen={openItem}
                />
              )}
            </CommandList>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function RulesList({
  rules,
  tab,
  query,
  hits,
  onTab,
  onOpen,
}: Readonly<{
  rules: PaletteRules;
  tab: string;
  query: string;
  hits: SearchHit[];
  onTab(id: string): void;
  onOpen(item: SearchItem): void;
}>) {
  const t = useTranslations('search');
  if (rules.isPending && !rules.data)
    return (
      <div className="space-y-2 p-3" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  if (!rules.data) return <CommandEmpty>{t('rulesUnavailable')}</CommandEmpty>;
  // « Tout » sans saisie : les rubriques du système, pour y entrer
  if (tab === ALL && !query.trim())
    return (
      <CommandGroup heading={rules.data.systeme.source.nom}>
        {rules.data.index.tabs.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <CommandItem key={t.id} value={t.id} onSelect={() => onTab(t.id)}>
              <Icon />
              {t.label}
              <CommandShortcut className="tabular-nums">{t.count}</CommandShortcut>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  if (!hits.length) return <CommandEmpty>{t('noResult')}</CommandEmpty>;
  return (
    <CommandGroup>
      {hits.map((h) => (
        <Result key={h.item.id} hit={h} onSelect={() => onOpen(h.item)} />
      ))}
    </CommandGroup>
  );
}

function Result({ hit, onSelect }: Readonly<{ hit: SearchHit; onSelect(): void }>) {
  const t = useTranslations('search');
  const format = useFormatter();
  const { item, via } = hit;
  const Icon = item.creature ? Skull : item.market ? Store : BookOpen;
  return (
    <CommandItem value={item.id} onSelect={onSelect} forceMount className="gap-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
        <Thumb
          src={item.image}
          width={32}
          alt=""
          className="size-full object-cover"
          fallback={<Icon className="size-4 text-subtle" />}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {(item.subtitle || via.length > 0) && (
          <span className="block truncate text-xs text-muted-foreground">
            {via.length > 0
              ? t('via', { names: format.list(via.map((v) => v.nom)) })
              : item.subtitle}
          </span>
        )}
      </span>
    </CommandItem>
  );
}

function Detail({
  item,
  trail,
  data,
  rules,
  onTrail,
  onBack,
  onClose,
}: Readonly<{
  item: SearchItem;
  trail: string[];
  data: RulesSearchData;
  rules: PaletteRules;
  onTrail(trail: string[]): void;
  onBack(): void;
  onClose(): void;
}>) {
  const t = useTranslations('search');
  const back = (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground">
      <ArrowLeft />
      {t('back')}
    </Button>
  );

  if (item.creature) {
    const engine = rules.engine;
    const placement = item.placement;
    const place =
      engine && placement ? (
        <Button
          size="sm"
          onClick={() => {
            engine.tools.activate(TOKENS_TOOL_ID);
            tokensStateOf(engine)?.library.setState({ armed: placement });
            onClose();
            toast.info(t('placeHint', { name: placement.name }));
          }}
        >
          <MapPin />
          {t('place')}
        </Button>
      ) : null;
    return (
      <div className="max-h-[60vh] overflow-y-auto">
        <div className="px-3 pt-2">{back}</div>
        <CreatureSheet item={item.creature} inDialog={false} actions={place} />
      </div>
    );
  }

  if (!item.entry) return null;
  const chain: Entree[] = [
    item.entry,
    ...trail.map((id) => data.systeme.entrees.get(id)).filter((e): e is Entree => Boolean(e)),
  ];
  const shown = chain.at(-1)!;
  const inventory = rules.inventory;
  const canStore =
    inventory && data.systeme.sortes.get(shown.sorte)?.pour.length ? inventory : null;
  return (
    <div className="max-h-[60vh] overflow-y-auto p-4">
      {!trail.length && back}
      <EntryDetail
        systeme={data.systeme}
        presentation={data.presentation}
        entry={shown}
        trail={chain.slice(0, -1)}
        onOpen={(id) => onTrail([...trail, id])}
        onBack={trail.length ? onBack : undefined}
        actions={
          canStore && item.market && !trail.length ? (
            <AddButton target={canStore} entry={shown} large />
          ) : undefined
        }
      />
    </div>
  );
}
