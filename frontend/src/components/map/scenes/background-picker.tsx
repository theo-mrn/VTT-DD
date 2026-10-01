'use client';

/**
 * Sélecteur du fond d'une scène (docs/carte.md § 10) : la bibliothèque de cartes (dossiers,
 * cartes, cartes animées, illustrations, recherche), ou un fichier importé (image, ou vidéo
 * réencodée avant l'envoi). Vignettes légères : images redimensionnées par le CDN, affiche WebP
 * pour une carte animée, qui ne joue (variante 1080p) qu'au survol.
 */
import { Film, ImageOff, Images, Map as MapIcon, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { DotsBackdrop } from '@/components/combat/backdrop';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageDrop } from '@/components/uploads/image-drop';
import { useAssets, vignette, type Asset } from '@/lib/assets';
import { videoVariant } from '@/lib/map/engine/background-prefs';
import { cn } from '@/lib/utils';

type Kind = 'all' | 'map' | 'animated' | 'illustration';

interface BackgroundItem {
  url: string;
  name: string;
  folder: string;
  animated: boolean;
  illustration: boolean;
  /** Version avec quadrillage dessiné. */
  grid: boolean;
  /** Vignette (CDN redimensionné) ; null : aucune (icône). */
  poster: string | null;
  /** Aperçu animé au survol (variante 1080p). */
  preview: string | null;
}

const PAGE = 48;

/** Noms des dossiers de la bibliothèque, en français. */
const FOLDERS: Record<string, string> = {
  Foret: 'Forêt',
  Tavern: 'Taverne',
  Cimetiere: 'Cimetière',
  Chateau: 'Château',
  Lake: 'Lac',
  Cave: 'Grotte',
};

/** « Camp_Day_Fog_Audio_NoGrid » → « Camp Day Fog » : mots techniques retirés. */
function prettyName(file: string): string {
  return (
    file
      .replace(/\.[^.]+$/, '')
      .split(/[_\-\s]+/)
      .filter((w) => w && !/^(audio|nogrid|grid|vp8|vp9|uhd|4k|hd|map)$/i.test(w))
      .join(' ')
      .replace(/\b\w/, (c) => c.toUpperCase()) || file
  );
}

function toItem(a: Asset): BackgroundItem {
  const parts = a.category.split('/');
  const folder = parts[1] ?? 'Autres';
  const animated = a.type === 'video';
  const variant = animated ? videoVariant(a.path) : null;
  const base = a.name.replace(/\.[^.]+$/, '');
  return {
    url: a.path,
    name: prettyName(a.name),
    folder,
    animated,
    illustration: /illustration/i.test(a.category) || /illustration/i.test(a.name),
    grid: /(^|_)grid(_|$)/i.test(base) && !/nogrid/i.test(base),
    poster: animated
      ? variant
        ? vignette(variant.replace(/\.mp4$/, '.webp'), 480)
        : null
      : vignette(a.path, 480),
    preview: variant,
  };
}

export function BackgroundPicker({
  open,
  onOpenChange,
  campaignId,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  /** Fond actuel de la scène. */
  current: string | null;
  /** Fond choisi (null : aucun). */
  onPick(url: string | null): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="isolate flex h-[min(100dvh,52rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[80rem] sm:rounded-[1.75rem]">
          <Body
            campaignId={campaignId}
            current={current}
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

function Body({
  campaignId,
  current,
  onPick,
  onClose,
}: {
  campaignId: string;
  current: string | null;
  onPick(url: string | null): void;
  onClose(): void;
}) {
  const assets = useAssets();
  const items = useMemo(
    () =>
      (assets.data ?? [])
        .filter((a) => a.category.startsWith('Map/') && (a.type === 'image' || a.type === 'video'))
        .map(toItem),
    [assets.data],
  );
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.folder, (counts.get(i.folder) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, n]) => ({ id, name: FOLDERS[id] ?? id, n }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [items]);

  const [folder, setFolder] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(query.trim().toLowerCase());

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (!folder || i.folder === folder) &&
          (kind === 'all' ||
            (kind === 'animated' && i.animated) ||
            (kind === 'illustration' && i.illustration) ||
            (kind === 'map' && !i.illustration)) &&
          (!q || i.name.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)),
      ),
    [items, folder, kind, q],
  );
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <DotsBackdrop />
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="grid size-9 place-items-center rounded-xl border border-border-strong bg-card text-primary">
          <MapIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <DialogTitle className="text-base">Fond de la scène</DialogTitle>
          <DialogDescription className="sr-only">
            Choisir une carte de la bibliothèque ou importer un fichier.
          </DialogDescription>
        </div>
        <div className="relative ml-auto w-full max-w-xs sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => reset(setQuery)(e.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher une carte"
            className="h-9 pl-8"
          />
        </div>
        {current && (
          <Button variant="ghost" size="sm" onClick={() => onPick(null)}>
            <ImageOff /> Sans fond
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
          <X />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[15rem_1fr]">
        {/* Dossiers et import */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-border p-4 [scrollbar-width:thin] md:border-b-0 md:border-r">
          <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            <FolderButton
              active={folder === null}
              label="Toutes"
              count={items.length}
              onClick={() => reset(setFolder)(null)}
            />
            {folders.map((f) => (
              <FolderButton
                key={f.id}
                active={folder === f.id}
                label={f.name}
                count={f.n}
                onClick={() => reset(setFolder)(f.id)}
              />
            ))}
          </nav>
          <div className="mt-auto hidden md:block">
            <ImageDrop
              target={{ kind: 'campaign', id: campaignId }}
              usage="map-background"
              value={null}
              onChange={(url) => url && onPick(url)}
              label="Importer un fond"
              cropAspect={null}
            />
          </div>
        </aside>

        {/* Bibliothèque */}
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
            <div
              role="tablist"
              className="flex rounded-xl border border-border bg-background/50 p-1"
            >
              {(
                [
                  ['all', 'Toutes', null],
                  ['map', 'Cartes', MapIcon],
                  ['animated', 'Animées', Film],
                  ['illustration', 'Illustrations', Images],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={kind === id}
                  onClick={() => reset(setKind)(id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    kind === id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {Icon && <Icon className="size-3.5" aria-hidden />}
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs tabular-nums text-subtle">{shown.length}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin] sm:p-5">
            {assets.isLoading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                {Array.from({ length: 12 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Aucune carte</p>
            ) : (
              <>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                  {shown.slice(0, page * PAGE).map((i) => (
                    <li key={i.url}>
                      <Tile item={i} selected={i.url === current} onPick={() => onPick(i.url)} />
                    </li>
                  ))}
                </ul>
                {shown.length > page * PAGE && (
                  <div className="mt-5 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>
                      Voir plus ({shown.length - page * PAGE})
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Import sur petit écran (la colonne de gauche est repliée) */}
          <div className="border-t border-border p-4 md:hidden">
            <ImageDrop
              target={{ kind: 'campaign', id: campaignId }}
              usage="map-background"
              value={null}
              onChange={(url) => url && onPick(url)}
              label="Importer un fond"
              cropAspect={null}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function FolderButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'bg-primary/15 text-primary-strong'
          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs tabular-nums text-subtle">{count}</span>
    </button>
  );
}

/** Une carte : vignette, nom, badges ; une carte animée joue au survol. */
function Tile({
  item,
  selected,
  onPick,
}: {
  item: BackgroundItem;
  selected: boolean;
  onPick(): void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={selected}
      className={cn(
        'group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border bg-surface-2 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary shadow-glow' : 'border-border hover:border-border-strong',
      )}
    >
      {item.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.poster}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-subtle">
          <Film className="size-6" aria-hidden />
        </span>
      )}
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
      <span className="absolute inset-x-0 bottom-0 flex items-end gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-8">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{item.name}</span>
        {item.grid && (
          <span className="shrink-0 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
            Grille
          </span>
        )}
        {item.animated && <Film className="size-3.5 shrink-0 text-white/80" aria-label="Animée" />}
      </span>
    </button>
  );
}
