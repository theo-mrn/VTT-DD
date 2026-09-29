'use client';

/**
 * Bibliothèque d'objets du MJ (docs/carte.md § 10, Objets) : réglages de l'outil « Objets » (I),
 * au-dessus de la barre d'outils.
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, Package, SquareDashed, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { toast } from 'sonner';
import { SearchField } from '@/components/resources/parts';
import { normaliser } from '@/components/resources/model/catalogue';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import { useAssets } from '@/lib/assets';
import { useCampagne } from '@/lib/campagnes';
import { mapsApi } from '@/lib/map/api';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  objectTemplateKeys,
  objectTemplatesApi,
  type ObjectTemplate,
} from '@/lib/map/modules/objects/api';
import { ObjectPlaceTool } from '@/lib/map/modules/objects/place-tool';
import { ZONE_SOURCE, type ObjectSource } from '@/lib/map/modules/objects/placement';
import { systemObjects } from '@/lib/map/modules/objects/system-library';
import { useCampaignEvents } from '@/lib/realtime';
import { useSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';

/** Type des données glissées depuis la bibliothèque. */
const DRAG_TYPE = 'application/x-vtt-map-object';
export const OBJECT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif';
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
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
    .slice(0, 100) || 'Objet';

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
): Promise<ObjectSource> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image (png, jpeg, webp…).');
  if (file.size > IMAGE_MAX_BYTES) throw new Error('Image trop lourde : 10 Mo au plus.');
  const [url, aspect] = await Promise.all([mapsApi.upload(campaignId, file), fileAspect(file)]);
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

export function ObjectLibrary({ engine }: { engine: MapEngine }) {
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
    return names.length ? [...names, ...(none ? [NO_CATEGORY] : [])] : [];
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
  const gridRef = useRef<HTMLUListElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  const hasMore = visible.length > limit;
  useEffect(() => {
    const more = moreRef.current;
    if (!hasMore || !more) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
      },
      { root: gridRef.current, rootMargin: '200px' },
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
    try {
      return await uploadSource(campaignId, file, refresh);
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
      return types.includes(DRAG_TYPE) || types.includes('Files');
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
      title: 'Retirer ce modèle ?',
      message: `« ${t.name} » quittera la bibliothèque. Les objets déjà posés restent sur la carte.`,
      confirmLabel: 'Retirer',
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

  const tabs: { id: Tab; label: string; count: number }[] = [
    ...(declared
      ? [
          {
            id: 'system' as const,
            label: declared.titre ?? 'Objets du système',
            count: systemCards.length,
          },
        ]
      : []),
    { id: 'campaign', label: 'Modèles de la campagne', count: templateCards.length },
  ];

  return (
    <div className="flex w-[min(48rem,calc(100vw-3rem))] flex-col gap-2 p-0.5">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.length > 1 && (
          <div
            role="tablist"
            aria-label="Bibliothèques"
            className="flex items-center rounded-lg border border-border p-0.5"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => switchTab(t.id)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  current === t.id
                    ? 'bg-primary/15 text-primary-strong'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                <span className="tabular-nums text-[11px] opacity-70">{t.count}</span>
              </button>
            ))}
          </div>
        )}
        <SearchField
          value={query}
          onChange={setQuery}
          label="Rechercher un objet"
          placeholder="Rechercher un objet…"
          className="sm:w-52"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant={armed?.key === ZONE_SOURCE.key ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={armed?.key === ZONE_SOURCE.key}
            draggable
            onDragStart={(e) => startDrag(e, ZONE_SOURCE)}
            onClick={() => arm(ZONE_SOURCE)}
          >
            <SquareDashed />
            Zone à fouiller
          </Button>
          <Button type="button" variant="secondary" size="sm" asChild>
            <label className={cn('cursor-pointer', uploading && 'pointer-events-none opacity-60')}>
              {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              {uploading ? 'Envoi…' : 'Envoyer une image'}
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
      </div>

      {categories.length > 1 && (
        <div
          role="group"
          aria-label="Catégories"
          className="flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]"
        >
          {[ALL, ...categories].map((c) => (
            <button
              key={c || 'all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'h-7 shrink-0 rounded-full border px-2.5 text-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                category === c
                  ? 'border-primary/50 bg-primary/15 text-primary-strong'
                  : 'border-border-strong text-muted-foreground hover:text-foreground',
              )}
            >
              {c === ALL ? 'Tout' : c === NO_CATEGORY ? 'Sans catégorie' : c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5"
          aria-label="Chargement des objets"
        >
          {Array.from({ length: 16 }, (_, i) => (
            <Skeleton key={i} className="h-[5.5rem]" />
          ))}
        </div>
      ) : failed ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {current === 'system'
            ? 'La bibliothèque d’objets n’a pas pu être chargée.'
            : 'Les modèles d’objets n’ont pas pu être chargés.'}
          <Button
            variant="secondary"
            size="xs"
            onClick={() => void (current === 'system' ? assets.refetch() : templates.refetch())}
          >
            Réessayer
          </Button>
        </div>
      ) : !visible.length ? (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-3 text-center text-[13px] text-muted-foreground">
          {cards.length
            ? 'Aucun objet ne correspond.'
            : current === 'campaign'
              ? 'Aucun modèle d’objet dans cette campagne : envoyez une image pour en créer un.'
              : 'Ce système ne déclare pas encore d’objets.'}
        </p>
      ) : (
        <ul
          ref={gridRef}
          aria-label={current === 'system' ? 'Objets du système' : 'Modèles d’objets'}
          className="grid max-h-[16.5rem] grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
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
                    arm({ ...card.source, aspect: aspectOf(e.currentTarget.querySelector('img')) })
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
                    aria-label={`Retirer « ${card.name} » de la bibliothèque`}
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

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-0.5 text-xs text-muted-foreground">
        {armed ? (
          <>
            Cliquez sur la carte pour poser « {armed.name} ».
            <span className="inline-flex items-center gap-1">
              <Kbd>⇧</Kbd> en poser plusieurs, <Kbd>Alt</Kbd> aimantation inversée, <Kbd>Échap</Kbd>{' '}
              annuler.
            </span>
          </>
        ) : (
          'Choisissez un objet puis cliquez sur la carte, ou glissez-le dessus. Une image de l’ordinateur peut aussi y être déposée.'
        )}
      </p>
    </div>
  );
}
