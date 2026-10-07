'use client';

/**
 * Bibliothèque d'objets du MJ (docs/carte.md § 10, Objets) : panneau déplaçable à gauche, ouvert
 * avec l'outil « Objets » (I), comme la bibliothèque des personnages.
 *
 * - Deux bibliothèques : les objets du système de la campagne (catégories déclarées par sa
 *   présentation, `references.objets`, images de l'index des actifs) et les modèles d'objets de
 *   la campagne (`object-templates`). Recherche, catégories, grille qui se charge en défilant.
 * - « Envoyer une image » (`/media`, gardée aussi comme modèle) ; « Zone à fouiller » (sans
 *   image, à poser sur un coffre peint dans le fond).
 * - Poser : choisir une carte puis cliquer sur la carte (⇧ : en poser plusieurs ; Échap :
 *   annuler), ou la glisser sur la carte. Une image déposée depuis l'ordinateur est envoyée
 *   puis posée là où elle tombe.
 */
import { formatter, translate } from '@/i18n/runtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, ImagePlus, LoaderCircle, Package, SquareDashed, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { toast } from 'sonner';
import { SearchField } from '@/components/resources/parts';
import { normaliser } from '@/components/resources/model/catalogue';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageErreur } from '@/lib/api';
import { useAssets } from '@/lib/assets';
import { useCampagne } from '@/lib/campagnes';
import { mapsApi } from '@/lib/map/api';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { objectTemplateKeys, objectTemplatesApi, type ObjectTemplate } from '../engine/api';
import { ObjectPlaceTool } from '../engine/place-tool';
import { ZONE_SOURCE, type ObjectSource } from '../engine/placement';
import { systemObjects } from '../engine/system-library';
import { OBJECTS_TOOL_ID } from '../engine/types';
import { useCampaignEvents } from '@/lib/realtime';
import { useSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import { useActiveToolId } from '@/components/map/engine-context';
import { MapPanel } from '@/components/map/map-panel';

/** Type des données glissées depuis la bibliothèque. */
const DRAG_TYPE = 'application/x-vtt-map-object';
export const OBJECT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif';
const ALL = '';
const NO_CATEGORY = '__none';

const templateSource = (t: ObjectTemplate): ObjectSource => ({
  key: `template:${t.id}`,
  name: t.name,
  imageUrl: t.imageUrl ?? '',
  kind: 'item',
});

/** Proportions d'une image déjà affichée (vignette), ou null. */
function aspectOf(img: HTMLImageElement | null | undefined): number | null {
  return img && img.naturalWidth > 0 && img.naturalHeight > 0
    ? img.naturalWidth / img.naturalHeight
    : null;
}

/** Proportions d'un fichier image, lues avant l'envoi. */
async function fileAspect(file: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const a = bitmap.height > 0 ? bitmap.width / bitmap.height : null;
    bitmap.close();
    return a;
  } catch {
    return null;
  }
}

/** Nom d'objet tiré d'un nom de fichier (« coffre_bois-2.png » → « coffre bois 2 »). */
const nameFromFile = (file: File) =>
  file.name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 100) || translate('map.objects.kinds.item');

/** Outil « Objets » actif (la bibliothèque n'existe que sous lui). */
function useObjectTool(engine: MapEngine): ObjectPlaceTool | null {
  const tool = engine.tools.active;
  return tool instanceof ObjectPlaceTool ? tool : null;
}

const noSource = () => null;
const noSubscribe = () => () => undefined;

/**
 * Envoie une image (`/media`), la garde comme modèle de la campagne et rend de quoi la poser.
 * L'image reste posable même si le modèle n'a pas pu être enregistré.
 */
async function uploadSource(
  campaignId: string,
  file: File,
  onTemplate: () => void,
  onProgress?: (p: number) => void,
): Promise<ObjectSource> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image (png, jpeg, webp…).');
  const [url, aspect] = await Promise.all([
    mapsApi.upload(campaignId, file, 'map-object', (p) => onProgress?.(p.progress)),
    fileAspect(file),
  ]);
  const name = nameFromFile(file);
  void objectTemplatesApi
    .create(campaignId, { name, imageUrl: url })
    .then(onTemplate)
    .catch(() => undefined);
  return { key: `upload:${url}`, name, imageUrl: url, kind: 'item', aspect };
}

type Tab = 'system' | 'campaign';
/** Vignettes affichées d'un coup ; la suite arrive en défilant. */
const PAGE = 60;

/** Une vignette de la bibliothèque (objet du système ou modèle de la campagne). */
interface Card {
  key: string;
  name: string;
  imageUrl: string;
  category: string | null;
  source: ObjectSource;
  template?: ObjectTemplate;
}

/** Panneau de la bibliothèque (surcouche de gauche) : ouvert tant que l'outil Objets l'est. */
export function ObjectLibraryPanel({ engine }: Readonly<{ engine: MapEngine }>) {
  const active = useActiveToolId() === OBJECTS_TOOL_ID;
  if (!active || engine.viewer.role !== 'gm') return null;
  return <ObjectLibrary engine={engine} />;
}

function ObjectLibrary({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = useObjectTool(engine);
  const campaignId = engine.store.getState().campaignId;
  const client = useQueryClient();
  const key = objectTemplateKeys.list(campaignId);
  const templates = useQuery({
    queryKey: key,
    queryFn: () => objectTemplatesApi.list(campaignId),
    staleTime: 60_000,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: key });
  // Modèles créés, modifiés ou supprimés ailleurs (autre onglet du MJ)
  useCampaignEvents(campaignId, ['object_template.*'], refresh);

  // Bibliothèque du système de la campagne (présentation : `references.objets`)
  const campagne = useCampagne(campaignId);
  const systeme = useSysteme(campagne.data?.system ?? null);
  const assets = useAssets();
  const declared = systeme.data?.presentation?.references.objets ?? null;

  const armed = useSyncExternalStore(
    tool?.subscribe ?? noSubscribe,
    tool?.getSource ?? noSource,
    tool?.getSource ?? noSource,
  );
  const [tab, setTab] = useState<Tab | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const current: Tab = tab ?? (declared ? 'system' : 'campaign');

  const systemCards = useMemo<Card[]>(
    () =>
      declared && assets.data
        ? systemObjects(assets.data, declared.categories).map((o) => ({
            key: o.key,
            name: o.name,
            imageUrl: o.imageUrl,
            category: o.category,
            source: { key: o.key, name: o.name, imageUrl: o.imageUrl, kind: 'item' },
          }))
        : [],
    [declared, assets.data],
  );
  const templateCards = useMemo<Card[]>(
    () =>
      (templates.data ?? [])
        .map((t) => ({
          key: `template:${t.id}`,
          name: t.name,
          imageUrl: t.imageUrl ?? '',
          category: t.category ?? null,
          source: templateSource(t),
          template: t,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [templates.data],
  );
  const cards = current === 'system' ? systemCards : templateCards;
  const loading =
    current === 'system' ? systeme.isPending || assets.isPending : templates.isPending;
  const failed = current === 'system' ? assets.isError : templates.isError;

  const categories = useMemo(() => {
    const names: string[] = [];
    let none = false;
    for (const c of cards) {
      if (!c.category) none = true;
      else if (!names.includes(c.category)) names.push(c.category);
    }
    // Système : l'ordre déclaré ; campagne : l'ordre alphabétique
    if (current === 'campaign') names.sort((a, b) => a.localeCompare(b, 'fr'));
    if (!names.length) return [];
    return none ? [...names, NO_CATEGORY] : names;
  }, [cards, current]);

  const visible = useMemo(() => {
    const q = normaliser(query);
    return cards.filter(
      (c) =>
        (!q || normaliser(c.name).includes(q) || normaliser(c.category ?? '').includes(q)) &&
        (category === ALL || (category === NO_CATEGORY ? !c.category : c.category === category)),
    );
  }, [cards, query, category]);

  // Nouvelle liste : on repart de la première page
  useEffect(() => setLimit(PAGE), [current, query, category]);

  // La suite en défilant (dernière vignette visible dans la grille)
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  const hasMore = visible.length > limit;
  useEffect(() => {
    const more = moreRef.current;
    if (!hasMore || !more) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
      },
      { root: scrollRef.current, rootMargin: '200px' },
    );
    observer.observe(more);
    return () => observer.disconnect();
  }, [hasMore, limit]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setCategory(ALL);
  };

  const arm = (source: ObjectSource) => {
    if (!tool) return;
    if (armed?.key === source.key) tool.disarm(engine);
    else tool.arm(source, engine);
  };

  const upload = async (file: File): Promise<ObjectSource | null> => {
    setUploading(true);
    setProgress(0);
    try {
      return await uploadSource(campaignId, file, refresh, setProgress);
    } catch (err) {
      toast.error(err instanceof Error && !('problem' in err) ? err.message : messageErreur(err));
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Glisser vers la carte : aperçu sous le pointeur, pose au lâcher (fichiers image compris)
  useEffect(() => {
    const host = engine.canvas?.parentElement;
    if (!host || !tool) return;
    const world = (e: globalThis.DragEvent) => {
      const r = host.getBoundingClientRect();
      return engine.camera.screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const accepts = (e: globalThis.DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      return types.includes(DRAG_TYPE) || types.includes('Files'); // i18n-ignore
    };
    const onOver = (e: globalThis.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (tool.source) tool.hoverAt(world(e), engine, { snap: !e.altKey });
    };
    const onLeave = (e: globalThis.DragEvent) => {
      if (e.relatedTarget instanceof Node && host.contains(e.relatedTarget)) return;
      tool.hoverAt(null, engine);
    };
    const onDrop = (e: globalThis.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      const at = world(e);
      const opts = { snap: !e.altKey, keep: e.shiftKey };
      host.focus({ preventScroll: true });
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        void upload(file).then((source) => {
          if (!source) return;
          tool.arm(source, engine);
          tool.place(at, engine, opts);
        });
        return;
      }
      if (tool.source && e.dataTransfer?.getData(DRAG_TYPE) === tool.source.key)
        tool.place(at, engine, opts);
      tool.hoverAt(null, engine);
    };
    host.addEventListener('dragover', onOver);
    host.addEventListener('dragleave', onLeave);
    host.addEventListener('drop', onDrop);
    return () => {
      host.removeEventListener('dragover', onOver);
      host.removeEventListener('dragleave', onLeave);
      host.removeEventListener('drop', onDrop);
    };
    // `upload` ne dépend que de la campagne
  }, [engine, tool, campaignId]);

  const startDrag = (e: DragEvent<HTMLElement>, source: ObjectSource) => {
    if (!tool) return;
    e.dataTransfer.setData(DRAG_TYPE, source.key);
    e.dataTransfer.effectAllowed = 'copy';
    const img = e.currentTarget.querySelector('img');
    if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
    tool.arm({ ...source, aspect: source.aspect ?? aspectOf(img) }, engine);
  };

  const remove = async (t: ObjectTemplate) => {
    const ok = await engine.confirm({
      title: translate('map.objects.library.removeTitle'),
      message: translate('map.objects.library.removeMessage', { name: t.name }),
      confirmLabel: translate('map.objects.remove'),
      danger: true,
    });
    if (!ok) return;
    try {
      await objectTemplatesApi.remove(campaignId, t.id);
      if (armed?.key === `template:${t.id}`) tool?.disarm(engine);
      refresh();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  };

  const tabs = tabsOf(declared, systemCards.length, templateCards.length);

  const etat = etatBibliotheque(loading, failed, !visible.length);

  return (
    <MapPanel
      id="object-library"
      label={translate('map.objects.library.title')}
      icon={Box}
      title={translate('map.objects.library.objects')}
      shortcut="I"
      closeLabel={translate('map.tokens.library.close')}
      onClose={() => engine.tools.activate(SELECT_TOOL_ID)}
      onKeyDown={(e) => {
        // Échap dans le panneau : l'objet choisi est rendu (la carte n'a pas le focus)
        if (e.key === 'Escape' && armed) {
          e.stopPropagation();
          tool?.disarm(engine);
        }
      }}
      className="w-[22rem]"
    >
      <div className="space-y-2 px-3 pt-3">
        {tabs.length > 1 && (
          <Tabs value={current} onValueChange={(v) => switchTab(v as Tab)}>
            <TabsList className="grid w-full grid-cols-2">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                  {t.label}
                  <span className="tabular-nums text-[11px] opacity-60">{t.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <SearchField
          value={query}
          onChange={setQuery}
          label={translate('map.objects.library.search')}
          placeholder={translate('map.tokens.library.searchPlaceholder')}
          className="sm:w-full"
        />
        <CategoryChips categories={categories} value={category} onChange={setCategory} />
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin]"
      >
        <EtatListe
          etat={etat}
          current={current}
          hasCards={cards.length > 0}
          onRetry={() => void (current === 'system' ? assets.refetch() : templates.refetch())}
        />
        {etat === 'grille' && (
          <ul
            aria-label={
              current === 'system'
                ? translate('map.objects.library.systemObjects')
                : translate('map.objects.library.templates')
            }
            className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
          >
            {visible.slice(0, limit).map((card) => {
              const active = armed?.key === card.key;
              return (
                <li key={card.key} className="group relative">
                  <button
                    type="button"
                    draggable
                    aria-pressed={active}
                    title={card.category ? `${card.name} · ${card.category}` : card.name}
                    onDragStart={(e) => startDrag(e, card.source)}
                    onClick={(e) =>
                      arm({
                        ...card.source,
                        aspect: aspectOf(e.currentTarget.querySelector('img')),
                      })
                    }
                    className={cn(
                      'flex w-full flex-col items-center gap-1 rounded-xl border p-1.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      active
                        ? 'border-primary/60 bg-primary/15'
                        : 'border-transparent hover:border-border-strong hover:bg-surface-2',
                    )}
                  >
                    <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-surface-2">
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="size-full object-contain p-0.5"
                        />
                      ) : (
                        <Package className="size-6 text-subtle" aria-hidden />
                      )}
                    </span>
                    <span className="w-full truncate text-center text-[11px] leading-tight text-foreground">
                      {card.name}
                    </span>
                  </button>
                  {card.template && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-xs"
                      aria-label={translate('map.objects.library.removeNamed', { name: card.name })}
                      onClick={() => void remove(card.template!)}
                      className="absolute right-0.5 top-0.5 size-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
            {hasMore && <li ref={moreRef} aria-hidden className="col-span-full h-px" />}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border px-3 py-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant={armed?.key === ZONE_SOURCE.key ? 'default' : 'secondary'}
            size="sm"
            aria-pressed={armed?.key === ZONE_SOURCE.key}
            draggable
            onDragStart={(e) => startDrag(e, ZONE_SOURCE)}
            onClick={() => arm(ZONE_SOURCE)}
          >
            <SquareDashed />
            {translate('map.objects.library.searchZone')}
          </Button>
          <Button type="button" variant="secondary" size="sm" asChild>
            <label
              className={cn(
                'relative cursor-pointer overflow-hidden',
                uploading && 'pointer-events-none',
              )}
            >
              {/* Progression réelle de l'envoi, en fond du bouton */}
              {uploading && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 -z-0 bg-primary/20 transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              )}
              {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              <span className="relative tabular-nums">
                {uploading
                  ? translate('map.objects.library.uploading', {
                      progress: formatter().number(progress, 'percent'),
                    })
                  : translate('map.tokens.inspector.upload')}
              </span>
              <input
                type="file"
                accept={OBJECT_IMAGE_ACCEPT}
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file).then((source) => source && tool?.arm(source, engine));
                }}
              />
            </label>
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {armed
            ? translate.rich('map.objects.library.armed', {
                name: armed.name,
                shift: () => <Kbd>⇧</Kbd>,
                alt: () => <Kbd>Alt</Kbd>,
                esc: () => <Kbd>{translate('map.tokens.library.esc')}</Kbd>,
              })
            : translate('map.objects.library.hint')}
        </p>
      </div>
    </MapPanel>
  );
}

/** Bibliothèque vide : selon qu'on regarde les modèles de la campagne ou le système. */
const aucunObjet = (source: 'campaign' | 'system') =>
  translate(`map.objects.library.empty.${source}`);

function categoryLabel(c: string): string {
  if (c === ALL) return translate('map.objects.library.all');
  return c === NO_CATEGORY ? translate('map.objects.library.uncategorized') : c;
}

type EtatBibliotheque = 'chargement' | 'echec' | 'vide' | 'grille';

/** Ce que montre la liste : chargement, échec, aucun objet, ou la grille. */
function etatBibliotheque(loading: boolean, failed: boolean, empty: boolean): EtatBibliotheque {
  if (loading) return 'chargement';
  if (failed) return 'echec';
  return empty ? 'vide' : 'grille';
}

/** Onglets : la bibliothèque du système quand elle est déclarée, puis la campagne. */
function tabsOf(
  declared: { titre?: string | null } | null,
  systemCount: number,
  templateCount: number,
): { id: Tab; label: string; count: number }[] {
  return [
    ...(declared
      ? [
          {
            id: 'system' as const,
            label: declared.titre ?? translate('map.objects.library.system'),
            count: systemCount,
          },
        ]
      : []),
    { id: 'campaign', label: translate('map.objects.library.campaign'), count: templateCount },
  ];
}

/** Filtre par catégorie (« Tout », chaque catégorie, « Sans catégorie »). */
function CategoryChips({
  categories,
  value,
  onChange,
}: Readonly<{ categories: string[]; value: string; onChange(c: string): void }>) {
  if (categories.length <= 1) return null;
  return (
    <div
      role="group"
      aria-label={translate('map.objects.library.categories')}
      className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]"
    >
      {[ALL, ...categories].map((c) => (
        <button
          key={c || 'all'}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'h-7 shrink-0 rounded-full border px-2.5 text-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            value === c
              ? 'border-primary/50 bg-primary/15 text-primary-strong'
              : 'border-border-strong text-muted-foreground hover:text-foreground',
          )}
        >
          {categoryLabel(c)}
        </button>
      ))}
    </div>
  );
}

/** Liste sans grille : squelette, échec (et réessayer), ou aucun objet. */
function EtatListe({
  etat,
  current,
  hasCards,
  onRetry,
}: Readonly<{ etat: EtatBibliotheque; current: Tab; hasCards: boolean; onRetry(): void }>) {
  if (etat === 'chargement')
    return (
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
        aria-label={translate('map.objects.library.loading')}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5]" />
        ))}
      </div>
    );
  if (etat === 'echec')
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
        {current === 'system'
          ? translate('map.objects.library.systemFailed')
          : translate('map.objects.library.templatesFailed')}
        <Button variant="secondary" size="xs" onClick={onRetry}>
          {translate('map.tokens.library.retry')}
        </Button>
      </div>
    );
  if (etat === 'vide')
    return (
      <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-[13px] text-muted-foreground">
        {hasCards ? translate('map.objects.library.noMatch') : aucunObjet(current)}
      </p>
    );
  return null;
}
