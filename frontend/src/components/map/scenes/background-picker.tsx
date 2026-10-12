'use client';

/**
 * Sélecteur du fond d'une scène (docs/carte.md § 10). Colonne de gauche : l'import d'un fichier
 * (image, ou vidéo réencodée avant l'envoi), le fond actuel, les collections de la bibliothèque.
 * À droite : une vue d'ensemble (quelques cartes par collection), une collection entière, ou les
 * résultats d'une recherche. Une carte par lieu (`background-library.ts`) ; sa version avec
 * grille se choisit à côté. Vignettes légères : images redimensionnées par le CDN, affiche WebP
 * pour une carte animée, qui ne joue (variante 1080p) qu'au survol.
 */
import { translate } from '@/i18n/runtime';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  Grid3x3,
  ImageOff,
  LayoutGrid,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { ImageDrop } from '@/components/uploads/image-drop';
import { useAssets, vignette } from '@/lib/assets';
import { cn } from '@/lib/utils';
import { fileItem, groupBackgrounds, type BackgroundItem } from './background-library';

type Kind = 'all' | 'map' | 'animated' | 'illustration';
const KINDS: readonly Kind[] = ['all', 'map', 'animated', 'illustration'];

/** Cartes montrées par collection dans la vue d'ensemble (deux rangées). */
const OVERVIEW = 8;

/** Dossiers connus de la bibliothèque (nom affiché : `map.scenes.folders.<dossier>`). */
const FOLDERS = ['Foret', 'Tavern', 'Cimetiere', 'Chateau', 'Lake', 'Cave', 'others'] as const; // i18n-ignore
const isKnownFolder = (id: string): id is (typeof FOLDERS)[number] =>
  (FOLDERS as readonly string[]).includes(id);
const folderName = (id: string) => (isKnownFolder(id) ? translate(`map.scenes.folders.${id}`) : id);

const matchesKind = (i: BackgroundItem, kind: Kind) =>
  kind === 'all' ||
  (kind === 'animated' && i.animated) ||
  (kind === 'illustration' && i.illustration) ||
  (kind === 'map' && !i.illustration);

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
  const [step, setStep] = useState<Step>('choice');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setStep('choice');
        onOpenChange(o);
      }}
    >
      {open && (
        <DialogContent
          showCloseButton={false}
          className={cn(
            'isolate flex max-w-none flex-col gap-0 overflow-hidden p-0',
            step === 'library'
              ? 'h-[min(100dvh,54rem)] sm:max-w-[78rem] sm:rounded-[1.75rem]'
              : 'sm:max-w-xl sm:rounded-3xl',
          )}
        >
          <Body
            step={step}
            onStep={setStep}
            campaignId={campaignId}
            current={current}
            onPick={(url) => {
              onPick(url);
              setStep('choice');
              onOpenChange(false);
            }}
            onClose={() => {
              setStep('choice');
              onOpenChange(false);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

type Step = 'choice' | 'library' | 'import';

function Body({
  step,
  onStep: setStep,
  campaignId,
  current,
  onPick,
  onClose,
}: Readonly<{
  step: Step;
  onStep(step: Step): void;
  campaignId: string;
  current: string | null;
  onPick(url: string | null): void;
  onClose(): void;
}>) {
  const assets = useAssets();
  const items = useMemo(() => groupBackgrounds(assets.data ?? []), [assets.data]);

  const [folder, setFolder] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());

  /** Cartes du type et de la recherche, toutes collections confondues. */
  const matching = useMemo(
    () =>
      items.filter(
        (i) =>
          matchesKind(i, kind) &&
          (!q || i.name.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)),
      ),
    [items, kind, q],
  );
  /** Collections : vignette (première carte) et nombre de cartes du type et de la recherche. */
  const folders = useMemo(() => {
    const byFolder = new Map<string, { cover: BackgroundItem; n: number }>();
    for (const i of items) if (!byFolder.has(i.folder)) byFolder.set(i.folder, { cover: i, n: 0 });
    for (const i of matching) byFolder.get(i.folder)!.n += 1;
    return [...byFolder.entries()]
      .map(([id, f]) => ({ id, name: folderName(id), ...f }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [items, matching]);
  const currentItem = useMemo(
    () => (current ? (items.find((i) => i.urls.includes(current)) ?? fileItem(current)) : null),
    [current, items],
  );

  const choose = (id: string | null) => setFolder(id);
  const overview = !folder && !q;

  if (step === 'choice')
    return (
      <Choice
        items={items}
        currentItem={currentItem}
        onLibrary={() => setStep('library')}
        onImport={() => setStep('import')}
        onNone={() => onPick(null)}
        onClose={onClose}
      />
    );
  if (step === 'import')
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StepHeader
          title={translate('map.scenes.importBackground')}
          onBack={() => setStep('choice')}
          onClose={onClose}
        />
        <div className="p-5">
          <ImageDrop
            target={{ kind: 'campaign', id: campaignId }}
            usage="map-background"
            value={null}
            onChange={(url) => url && onPick(url)}
            label={translate('map.scenes.importBackground')}
            cropAspect={null}
            className="min-h-64"
          />
        </div>
      </div>
    );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Colonne : collections */}
      <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-r border-border bg-background/40 p-4 [scrollbar-width:thin] md:flex">
        <nav className="flex flex-col gap-0.5">
          <PillGroup>
            <RailItem
              active={folder === null}
              label={translate('map.scenes.kinds.all')}
              count={matching.length}
              onClick={() => choose(null)}
              icon={
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted-foreground">
                  <LayoutGrid className="size-4" aria-hidden />
                </span>
              }
            />
            {folders.map((f) => (
              <RailItem
                key={f.id}
                active={folder === f.id}
                label={f.name}
                count={f.n}
                onClick={() => choose(f.id)}
                icon={<Cover item={f.cover} />}
              />
            ))}
          </PillGroup>
        </nav>
      </aside>

      {/* Bibliothèque */}
      <section className="flex min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setStep('choice')}
            aria-label={translate('common.actions.back')}
            className="-ml-1.5"
          >
            <ArrowLeft />
          </Button>
          <DialogTitle className="mr-auto truncate text-base">
            {translate('map.scenes.library')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {translate('map.scenes.backgroundHint')}
          </DialogDescription>
          <div className="relative order-last w-full lg:order-none lg:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate('map.scenes.searchShort')}
              aria-label={translate('map.scenes.searchMap')}
              className="h-9 rounded-xl pl-9"
            />
          </div>
          <PillGroup>
            <div
              role="tablist"
              className="flex rounded-xl border border-border bg-background/50 p-0.5"
            >
              {KINDS.map((id) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={kind === id}
                  onClick={() => setKind(id)}
                  className={cn(
                    'relative isolate rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                    kind === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {kind === id && <ActivePill className="bg-surface-3 shadow-sm" />}
                  {translate(`map.scenes.kinds.${id}`)}
                </button>
              ))}
            </div>
          </PillGroup>
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

        {/* Petit écran : collections en bande */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5 [scrollbar-width:none] md:hidden">
          {[{ id: null, name: translate('map.scenes.kinds.all') }, ...folders].map((f) => (
            <Button
              key={f.id ?? ''}
              size="sm"
              variant={folder === f.id ? 'secondary' : 'ghost'}
              className="shrink-0"
              onClick={() => choose(f.id)}
            >
              {f.name}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:thin] sm:px-6">
          {assets.isLoading && (
            <ul className={GRID}>
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i} className="space-y-2">
                  <Skeleton className="aspect-video rounded-xl" />
                  <Skeleton className="h-3 w-2/3" />
                </li>
              ))}
            </ul>
          )}
          {!assets.isLoading && matching.length === 0 && (
            <p className="py-20 text-center text-sm text-muted-foreground">
              {translate('map.scenes.noMap')}
            </p>
          )}
          {!assets.isLoading && overview && (
            <div className="space-y-9">
              {folders
                .filter((f) => f.n > 0)
                .map((f) => (
                  <section key={f.id} aria-label={f.name}>
                    <div className="mb-3 flex items-baseline gap-2">
                      <h3 className="text-[15px] font-semibold tracking-tight">{f.name}</h3>
                      <span className="text-xs tabular-nums text-subtle">{f.n}</span>
                      {f.n > OVERVIEW && (
                        <button
                          type="button"
                          onClick={() => choose(f.id)}
                          className="group ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                        >
                          {translate('map.scenes.seeAll')}
                          <ArrowRight
                            className="size-3.5 transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </button>
                      )}
                    </div>
                    <Grid
                      items={matching.filter((i) => i.folder === f.id).slice(0, OVERVIEW)}
                      current={current}
                      onPick={onPick}
                    />
                  </section>
                ))}
            </div>
          )}
          {!assets.isLoading && !overview && (
            <Grid
              items={folder ? matching.filter((i) => i.folder === folder) : matching}
              current={current}
              onPick={onPick}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/** En-tête d'une étape : retour, titre, fermeture. */
function StepHeader({
  title,
  onBack,
  onClose,
}: Readonly<{ title: string; onBack?: () => void; onClose(): void }>) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
      {onBack && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label={translate('common.actions.back')}
          className="-ml-1.5"
        >
          <ArrowLeft />
        </Button>
      )}
      <DialogTitle className="mr-auto truncate text-base">{title}</DialogTitle>
      <DialogDescription className="sr-only">
        {translate('map.scenes.backgroundHint')}
      </DialogDescription>
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
  );
}

/** Premier écran : bibliothèque ou fichier à soi ; le fond actuel en dessous. */
function Choice({
  items,
  currentItem,
  onLibrary,
  onImport,
  onNone,
  onClose,
}: Readonly<{
  items: readonly BackgroundItem[];
  currentItem: BackgroundItem | null;
  onLibrary(): void;
  onImport(): void;
  onNone(): void;
  onClose(): void;
}>) {
  /** Mosaïque de la carte Bibliothèque : une carte de chaque collection. */
  const mosaic = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((i) => i.poster && !i.animated && !seen.has(i.folder) && seen.add(i.folder))
      .slice(0, 6);
  }, [items]);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) onImport();
      }}
    >
      <StepHeader title={translate('map.scenes.background')} onClose={onClose} />
      <div className="flex flex-col gap-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onLibrary}
            className="group overflow-hidden rounded-2xl border border-border bg-card text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid aspect-[16/10] grid-cols-3 grid-rows-2 gap-0.5 bg-surface-2 p-0.5">
              {mosaic.map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i.id}
                  src={i.poster!}
                  alt=""
                  loading="lazy"
                  className="size-full rounded-md object-cover opacity-80 transition-opacity duration-300 group-hover:opacity-100"
                />
              ))}
            </span>
            <span className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {translate('map.scenes.library')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate('map.scenes.libraryCount', { count: items.length })}
                </span>
              </span>
              <ArrowRight
                className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden
              />
            </span>
          </button>

          <button
            type="button"
            onClick={onImport}
            className="group flex flex-col overflow-hidden rounded-2xl border border-dashed border-primary/40 bg-primary/[0.04] text-left transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/70 hover:bg-primary/[0.08] hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid aspect-[16/10] place-items-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105">
                <Upload className="size-6" aria-hidden />
              </span>
            </span>
            <span className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {translate('map.scenes.importBackground')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate('map.scenes.importFormats')}
                </span>
              </span>
              <ArrowRight
                className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden
              />
            </span>
          </button>
        </div>

        {currentItem && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-1.5 pr-2">
            <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md">
              <Thumb item={currentItem} zoom={false} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
                {translate('map.scenes.currentBackground')}
              </span>
              <span className="block truncate text-sm font-medium">{currentItem.name}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={onNone}>
              <ImageOff /> {translate('map.scenes.noBackground')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-3 xl:grid-cols-4';

function Grid({
  items,
  current,
  onPick,
}: Readonly<{
  items: readonly BackgroundItem[];
  current: string | null;
  onPick(url: string): void;
}>) {
  return (
    <ul className={GRID}>
      {items.map((i) => (
        <li key={i.id} className="[contain-intrinsic-size:auto_12rem] [content-visibility:auto]">
          <Tile item={i} current={current} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function RailItem({
  active,
  label,
  count,
  icon,
  onClick,
}: Readonly<{
  active: boolean;
  label: string;
  count: number;
  icon: ReactNode;
  onClick(): void;
}>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative isolate flex items-center gap-3 rounded-xl p-1.5 pr-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        count === 0 && !active && 'opacity-50',
      )}
    >
      {active && <ActivePill className="bg-surface-3 ring-1 ring-border-strong" />}
      {icon}
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="text-xs tabular-nums text-subtle">{count}</span>
    </button>
  );
}

/** Vignette d'une collection : sa première carte. */
function Cover({ item }: Readonly<{ item: BackgroundItem }>) {
  const src = item.animated ? item.poster : vignette(item.url, 96);
  return (
    <span className="relative size-8 shrink-0 overflow-hidden rounded-lg bg-surface-3 ring-1 ring-border">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      )}
    </span>
  );
}

/** Image (ou affiche de l'animation) d'une carte, plein cadre. */
function Thumb({ item, zoom }: Readonly<{ item: BackgroundItem; zoom: boolean }>) {
  return item.poster ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.poster}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn(
        'absolute inset-0 size-full object-cover',
        zoom && 'transition-transform duration-500 ease-out group-hover:scale-[1.04]',
      )}
    />
  ) : (
    <span className="absolute inset-0 grid place-items-center text-subtle">
      <Film className="size-6" aria-hidden />
    </span>
  );
}

/** Une carte : vignette (l'animation joue au survol), nom, version avec grille. */
function Tile({
  item,
  current,
  onPick,
}: Readonly<{
  item: BackgroundItem;
  current: string | null;
  onPick(url: string): void;
}>) {
  const [hover, setHover] = useState(false);
  const selected = current !== null && item.urls.includes(current);
  const gridSelected = selected && current === item.gridUrl;
  return (
    <div
      className="group"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => onPick(item.url)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-pressed={selected && !gridSelected}
        aria-label={item.name}
        className={cn(
          'relative block aspect-video w-full overflow-hidden rounded-xl bg-surface-2 ring-1 transition-[box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:-translate-y-0.5 group-hover:shadow-elevated',
          selected
            ? 'shadow-glow ring-2 ring-primary'
            : 'ring-border group-hover:ring-border-strong',
        )}
      >
        <Thumb item={item} zoom />
        {item.animated && hover && item.preview && (
          <video
            src={item.preview}
            muted
            loop
            autoPlay
            playsInline
            preload="none"
            className="absolute inset-0 size-full object-cover"
          />
        )}
        {selected && (
          <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Check className="size-3.5" aria-hidden />
          </span>
        )}
      </button>
      <div className="mt-2 flex h-6 items-center gap-1.5 px-0.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">
          {item.name}
        </span>
        {item.animated && (
          <Film
            className="size-3.5 shrink-0 text-subtle"
            aria-label={translate('map.scenes.animated')}
          />
        )}
        {item.gridUrl && (
          <Info texte={translate('map.scenes.withGrid')}>
            <button
              type="button"
              onClick={() => onPick(item.gridUrl!)}
              aria-pressed={gridSelected}
              aria-label={translate('map.scenes.withGrid')}
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                gridSelected
                  ? 'bg-primary/15 text-primary'
                  : 'text-subtle hover:bg-surface-3 hover:text-foreground',
              )}
            >
              <Grid3x3 className="size-3.5" aria-hidden />
            </button>
          </Info>
        )}
      </div>
    </div>
  );
}
