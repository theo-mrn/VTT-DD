'use client';

/**
 * Sélecteur du fond d'une scène (docs/carte.md § 10, docs/bibliotheque.md), en un seul écran :
 * deux usages en onglets (plans de carte vus du dessus, pour poser les jetons ; illustrations,
 * décors vus de face, pour l'ambiance), la recherche au centre (« grotte illuminée »), les
 * filtres dessous ; sans recherche, les
 * collections puis tous les fonds. Le premier carreau importe un fichier (et un fichier glissé
 * n'importe où ouvre l'import) ; un clic sur un fond l'ouvre en grand, avec ses versions.
 * Le fond actuel reste en haut, avec « Retirer ».
 */
import { translate } from '@/i18n/runtime';
import {
  BACKGROUND_MOODS,
  BACKGROUND_PLACES,
  BACKGROUND_SETTINGS,
  BACKGROUND_TIMES,
  type Background,
} from '@vtt/contracts';
import {
  ArrowLeft,
  Check,
  Film,
  Grid3x3,
  ImagePlus,
  Image as ImageIcon,
  Layers,
  Map as MapIcon,
  Search,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { Button } from '@/components/ui/button';
import { FilterMenu } from '@/components/ui/filter-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { ImageDrop } from '@/components/uploads/image-drop';
import {
  NO_FILTERS,
  useBackgroundByUrl,
  useBackgroundFacets,
  useBackgrounds,
  type BackgroundFilters,
} from '@/lib/library';
import { cn } from '@/lib/utils';
import { fileItem } from './background-library';
import { BackgroundPreview, thumbOf } from './background-preview';

export function BackgroundPicker({
  open,
  onOpenChange,
  campaignId,
  current,
  onPick,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  /** Fond actuel de la scène. */
  current: string | null;
  /** Fond choisi (null : aucun). */
  onPick(url: string | null): void;
}>) {
  /** Échap ferme d'abord l'aperçu ou l'import, puis le sélecteur. */
  const escape = useRef<(() => boolean) | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => {
            if (escape.current?.()) e.preventDefault();
          }}
          className="isolate flex h-[min(100dvh,60rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[90rem] sm:rounded-[1.75rem]"
        >
          <Picker
            campaignId={campaignId}
            current={current}
            escape={escape}
            onPick={(url) => {
              onPick(url);
              onOpenChange(false);
            }}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Les deux usages d'un fond, en onglets. */
const KINDS = [
  { kind: 'map', Icon: MapIcon },
  { kind: 'illustration', Icon: ImageIcon },
] as const;

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5';

function Picker({
  campaignId,
  current,
  escape,
  onPick,
  onClose,
}: Readonly<{
  campaignId: string;
  current: string | null;
  escape: RefObject<(() => boolean) | null>;
  onPick(url: string | null): void;
  onClose(): void;
}>) {
  const [filters, setFilters] = useState<BackgroundFilters>(NO_FILTERS);
  const [text, setText] = useState('');
  const q = useDeferredValue(text);
  const list = useBackgrounds({ ...filters, q });
  const facets = useBackgroundFacets(filters.kind);
  // Le sélecteur s'ouvre sur l'usage du fond actuel, tant qu'on n'a pas changé d'onglet
  const currentKind = useBackgroundByUrl(current).data?.kind;
  const chosenKind = useRef(false);
  useEffect(() => {
    if (currentKind && !chosenKind.current) setFilters((f) => ({ ...f, kind: currentKind }));
  }, [currentKind]);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered = Object.entries(filters).some(
    ([k, v]) => k !== 'kind' && k !== 'q' && v !== null,
  );
  const browsing = !q.trim() && !filtered;
  const [opened, setOpened] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const set = <K extends keyof BackgroundFilters>(key: K, value: BackgroundFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  // Échap : l'aperçu ou l'import se ferme avant le sélecteur
  useEffect(() => {
    escape.current = () => {
      if (opened !== null) {
        setOpened(null);
        return true;
      }
      if (importing) {
        setImporting(false);
        return true;
      }
      return false;
    };
  });

  // Page suivante quand le bas de la grille approche
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '800px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Aperçu au bout des fonds chargés : la page suivante arrive
  useEffect(() => {
    if (opened !== null && opened >= items.length - 2 && hasNextPage && !isFetchingNextPage)
      void fetchNextPage();
  }, [opened, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // « / » : la recherche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const options = <T extends string>(
    values: readonly T[],
    counts: Record<string, number> | undefined,
    label: (v: T) => string,
  ) => [
    { value: '', label: translate('map.scenes.filters.all') },
    ...values
      .filter((v) => (counts?.[v] ?? 0) > 0)
      .map((v) => ({ value: v, label: label(v), count: counts?.[v] })),
  ];
  const collections = useMemo(
    () =>
      Object.entries(facets.data?.collections ?? {})
        .map(([name, count]) => ({ name, count, cover: facets.data?.covers[name] ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
    [facets.data],
  );
  const openedItem = opened === null ? null : (items[opened] ?? null);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) setImporting(true); // i18n-ignore
      }}
    >
      {/* En-tête : titre, fond actuel, fermeture */}
      <header className="flex items-center gap-3 px-4 pt-3 sm:px-6">
        <DialogTitle className="text-sm font-semibold text-muted-foreground">
          {translate('map.scenes.background')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {translate('map.scenes.backgroundHint')}
        </DialogDescription>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {current && <CurrentBackground url={current} onRemove={() => onPick(null)} />}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={translate('common.actions.close')}
            className="-mr-1.5"
          >
            <X />
          </Button>
        </div>
      </header>

      {/* L'usage en onglets, la recherche au centre, les filtres dessous */}
      <section className="px-4 pb-5 pt-3 sm:px-6 sm:pt-4">
        <PillGroup>
          <div
            role="tablist"
            aria-label={translate('map.scenes.background')}
            className="mx-auto mb-4 flex w-fit rounded-2xl border border-border bg-surface p-1 shadow-surface"
          >
            {KINDS.map(({ kind, Icon }) => (
              <Info key={kind} texte={translate(`map.scenes.kindHints.${kind}`)}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filters.kind === kind}
                  onClick={() => {
                    chosenKind.current = true;
                    // Les collections et les filtres d'un usage ne valent pas pour l'autre
                    setFilters({ ...NO_FILTERS, kind });
                    setOpened(null);
                  }}
                  className={cn(
                    'relative isolate flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5',
                    filters.kind === kind
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {filters.kind === kind && (
                    <ActivePill className="bg-surface-3 shadow-sm ring-1 ring-border-strong" />
                  )}
                  <Icon
                    className={cn('size-4', filters.kind === kind && 'text-primary')}
                    aria-hidden
                  />
                  {translate(`map.scenes.kinds.${kind}`)}
                  {facets.data?.kinds[kind] !== undefined && (
                    <span className="text-xs font-medium tabular-nums text-subtle">
                      {facets.data.kinds[kind]}
                    </span>
                  )}
                </button>
              </Info>
            ))}
          </div>
        </PillGroup>
        <label className="group relative mx-auto block w-full max-w-2xl">
          <Search
            className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-subtle transition-colors group-focus-within:text-primary"
            aria-hidden
          />
          <input
            ref={search}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={translate(`map.scenes.searchPlaceholders.${filters.kind}`)}
            aria-label={translate('map.scenes.searchMap')}
            autoFocus
            className="h-14 w-full rounded-2xl border border-border bg-surface pl-14 pr-12 text-base shadow-elevated outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-primary/60 focus:ring-4 focus:ring-primary/15"
          />
          {text && (
            <button
              type="button"
              onClick={() => {
                setText('');
                search.current?.focus();
              }}
              aria-label={translate('map.scenes.clearSearch')}
              className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>
        <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-center gap-2">
          <FilterMenu
            label={translate('map.scenes.filters.collection')}
            value={filters.collection ?? ''}
            allValue=""
            onChange={(v) => set('collection', v || null)}
            options={[
              { value: '', label: translate('map.scenes.filters.all') },
              ...collections.map((c) => ({ value: c.name, label: c.name, count: c.count })),
            ]}
          />
          <FilterMenu
            label={translate('map.scenes.filters.place')}
            value={filters.place ?? ''}
            allValue=""
            onChange={(v) => set('place', (v || null) as BackgroundFilters['place'])}
            options={options(BACKGROUND_PLACES, facets.data?.places, (v) =>
              translate(`map.scenes.places.${v}`),
            )}
          />
          <FilterMenu
            label={translate('map.scenes.filters.setting')}
            value={filters.setting ?? ''}
            allValue=""
            onChange={(v) => set('setting', (v || null) as BackgroundFilters['setting'])}
            options={options(BACKGROUND_SETTINGS, facets.data?.settings, (v) =>
              translate(`map.scenes.settings.${v}`),
            )}
          />
          <FilterMenu
            label={translate('map.scenes.filters.time')}
            value={filters.time ?? ''}
            allValue=""
            onChange={(v) => set('time', (v || null) as BackgroundFilters['time'])}
            options={options(BACKGROUND_TIMES, facets.data?.times, (v) =>
              translate(`map.scenes.times.${v}`),
            )}
          />
          <FilterMenu
            label={translate('map.scenes.filters.mood')}
            value={filters.mood ?? ''}
            allValue=""
            onChange={(v) => set('mood', (v || null) as BackgroundFilters['mood'])}
            options={options(BACKGROUND_MOODS, facets.data?.moods, (v) =>
              translate(`map.scenes.moods.${v}`),
            )}
          />
          <FilterMenu
            label={translate('map.scenes.filters.type')}
            value={filters.animated === null ? '' : filters.animated ? 'animated' : 'still'}
            allValue=""
            icon={Film}
            onChange={(v) => set('animated', v === '' ? null : v === 'animated')}
            options={[
              { value: '', label: translate('map.scenes.filters.all') },
              { value: 'still', label: translate('map.scenes.types.still') },
              {
                value: 'animated',
                label: translate('map.scenes.types.animated'),
                count: facets.data?.animated,
              },
            ]}
          />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ ...NO_FILTERS, kind: filters.kind })}
            >
              {translate('map.scenes.filters.reset')}
            </Button>
          )}
        </div>
      </section>

      {/* Collections, puis les fonds */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-5 [scrollbar-width:thin] sm:px-6">
        {browsing && collections.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-3 text-[15px] font-semibold tracking-tight">
              {translate('map.scenes.collections')}
            </h3>
            <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
              {collections.map((c) => (
                <li key={c.name} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => set('collection', c.name)}
                    className="group relative block aspect-[16/10] w-44 overflow-hidden rounded-xl bg-surface-2 text-left ring-1 ring-border transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-elevated hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {c.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.cover}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
                      <span className="block truncate text-sm font-semibold text-white">
                        {c.name}
                      </span>
                      <span className="block text-[11px] tabular-nums text-white/70">
                        {translate('map.scenes.libraryCount', { count: c.count })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mb-3 flex items-baseline gap-2">
          {!browsing && filters.collection === null && (
            <h3 className="text-[15px] font-semibold tracking-tight">
              {translate('map.scenes.results')}
            </h3>
          )}
          {browsing && (
            <h3 className="text-[15px] font-semibold tracking-tight">
              {translate('map.scenes.allBackgrounds')}
            </h3>
          )}
          {filters.collection !== null && (
            <button
              type="button"
              onClick={() => set('collection', null)}
              className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight hover:text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {filters.collection}
            </button>
          )}
          <span className="text-xs tabular-nums text-subtle">
            {list.data ? translate('map.scenes.libraryCount', { count: total }) : ''}
          </span>
        </div>

        <ul className={cn(GRID, list.isPlaceholderData && 'opacity-60 transition-opacity')}>
          <li>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="group grid aspect-video w-full place-items-center rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] text-primary transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/70 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex flex-col items-center gap-2">
                <ImagePlus
                  className="size-7 transition-transform duration-300 group-hover:scale-110"
                  aria-hidden
                />
                <span className="text-[13px] font-semibold">
                  {translate('map.scenes.importBackground')}
                </span>
              </span>
            </button>
            <p className="mt-2 h-6 px-0.5 text-[13px] text-subtle">
              {translate('map.scenes.importFormats')}
            </p>
          </li>
          {list.isPending &&
            Array.from({ length: 11 }, (_, i) => (
              <li key={i} className="space-y-2">
                <Skeleton className="aspect-video rounded-xl" />
                <Skeleton className="h-3 w-2/3" />
              </li>
            ))}
          {items.map((b, i) => (
            <li
              key={b.id}
              className="[contain-intrinsic-size:auto_12rem] [content-visibility:auto]"
            >
              <Tile
                background={b}
                current={current !== null && b.variants.some((v) => v.url === current)}
                onOpen={() => setOpened(i)}
              />
            </li>
          ))}
          {isFetchingNextPage &&
            Array.from({ length: 5 }, (_, i) => (
              <li key={`suite-${i}`}>
                <Skeleton className="aspect-video rounded-xl" />
              </li>
            ))}
        </ul>
        {!list.isPending && items.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {translate('map.scenes.noMap')}
          </p>
        )}
        <div ref={sentinel} aria-hidden className="h-px" />
      </div>

      {openedItem && opened !== null && (
        <BackgroundPreview
          key={openedItem.id}
          background={openedItem}
          position={opened + 1}
          total={total}
          current={current}
          onPrevious={opened > 0 ? () => setOpened(opened - 1) : null}
          onNext={opened < items.length - 1 ? () => setOpened(opened + 1) : null}
          onPick={onPick}
          onClose={() => setOpened(null)}
        />
      )}

      {importing && (
        <div className="absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-xl">
          <header className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <Button variant="ghost" size="sm" onClick={() => setImporting(false)} className="-ml-2">
              <ArrowLeft /> {translate('common.actions.back')}
            </Button>
            <h3 className="mx-auto text-sm font-semibold">
              {translate('map.scenes.importBackground')}
            </h3>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={translate('common.actions.close')}
              className="-mr-1.5"
            >
              <X />
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 items-stretch justify-center px-4 pb-6 sm:px-6">
            <ImageDrop
              target={{ kind: 'campaign', id: campaignId }}
              usage="map-background"
              value={null}
              onChange={(url) => url && onPick(url)}
              label={translate('map.scenes.importBackground')}
              cropAspect={null}
              className="h-full w-full max-w-4xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Fond actuel, en haut du sélecteur : vignette, nom, « Retirer ». */
function CurrentBackground({ url, onRemove }: Readonly<{ url: string; onRemove(): void }>) {
  const library = useBackgroundByUrl(url);
  const file = fileItem(url);
  const name = library.data?.title ?? file.name;
  const thumb = library.data
    ? thumbOf(library.data.variants.find((v) => v.url === url) ?? library.data.variants[0])
    : file.poster;
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card/60 py-1 pl-1 pr-1">
      <span className="relative aspect-video w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <Film className="absolute inset-0 m-auto size-3.5 text-subtle" aria-hidden />
        )}
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
          {translate('map.scenes.currentBackground')}
        </span>
        <span className="block max-w-[14rem] truncate text-xs font-medium">{name}</span>
      </span>
      <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 px-2 text-xs">
        {translate('common.actions.remove')}
      </Button>
    </div>
  );
}

/** Un fond : vignette (l'animation joue au survol), titre, versions, grille. */
function Tile({
  background: b,
  current,
  onOpen,
}: Readonly<{ background: Background; current: boolean; onOpen(): void }>) {
  const [hover, setHover] = useState(false);
  const main = b.variants[0];
  const thumb = thumbOf(main);
  const versions = b.variants.filter((v) => !v.grid).length;
  return (
    <div
      className="group"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onOpen}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={b.title}
        className={cn(
          'relative block aspect-video w-full overflow-hidden rounded-xl bg-surface-2 ring-1 transition-[box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:-translate-y-0.5 group-hover:shadow-elevated',
          current
            ? 'shadow-glow ring-2 ring-primary'
            : 'ring-border group-hover:ring-border-strong',
        )}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <Film className="absolute inset-0 m-auto size-6 text-subtle" aria-hidden />
        )}
        {b.animated && hover && main?.previewUrl && (
          <video
            src={main.previewUrl}
            muted
            loop
            autoPlay
            playsInline
            preload="none"
            className="absolute inset-0 size-full object-cover"
          />
        )}
        {current && (
          <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Check className="size-3.5" aria-hidden />
          </span>
        )}
        {versions > 1 && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            <Layers className="size-3" aria-hidden />
            {versions}
          </span>
        )}
      </button>
      <div className="mt-2 flex h-6 items-center gap-1.5 px-0.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">
          {b.title}
        </span>
        {b.animated && (
          <Film
            className="size-3.5 shrink-0 text-subtle"
            aria-label={translate('map.scenes.animated')}
          />
        )}
        {b.variants.some((v) => v.grid) && (
          <Grid3x3
            className="size-3.5 shrink-0 text-subtle"
            aria-label={translate('map.scenes.withGrid')}
          />
        )}
      </div>
    </div>
  );
}
