'use client';

/**
 * Bibliothèque des PNJ du MJ (docs/carte.md § 10 ; outil « Personnages », touche A) :
 * - « Modèles » : les modèles de PNJ de la campagne (`npc-templates`), par catégorie ;
 * - « Bestiaire » : les créatures de référence du système de la campagne ;
 * - « Création rapide » : nom, image, type d'entité et valeurs clés.
 * Recherche ; une carte se glisse sur la scène (point de dépôt converti en coordonnées du
 * monde par la caméra du moteur), ou se choisit puis se pose d'un clic sur la carte. Nombre
 * d'exemplaires, camp et visibilité à la pose ; un seul appel au serveur, fantômes pendant la
 * pose, message clair en cas d'échec.
 */
import type { MapTokenVisibility } from '@vtt/contracts';
import { AlertTriangle, Loader2, Minus, Plus, SearchX, Skull, UserRoundPlus } from 'lucide-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  creatureItem,
  templateItem,
  type BestiaryItem,
} from '@/components/resources/model/bestiary';
import { normaliser } from '@/components/resources/model/catalogue';
import { ListSkeleton, Notice, SearchField } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { SelectField } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageErreur } from '@/lib/api';
import { useNpcTemplates, useSystemBestiary } from '@/lib/bestiary';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCampagne } from '@/lib/campagnes';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { clampCount, MAX_COPIES, VISIBILITY_LABELS } from '@/lib/map/modules/tokens/model';
import { TOKENS_TOOL_ID } from '@/lib/map/modules/tokens/place-tool';
import type {
  LibraryState,
  LibraryTab,
  PlacementSource,
  TokensState,
} from '@/lib/map/modules/tokens/state';
import { cn } from '@/lib/utils';
import { useActiveToolId, useMapUi } from '../engine-context';
import { LibraryCard, NPC_DRAG_TYPE, type CardDrag } from './library-card';
import { QuickCreate } from './quick-create';
import { useLibrary, useTokens } from './use-tokens';
import { MapPanel } from '../map-panel';

const PAGE = 40;
const ALL = '';

/** Visibilités proposées à la pose (« pour certains joueurs » se règle ensuite). */
const PLACE_VISIBILITIES: readonly MapTokenVisibility[] = [
  'visible',
  'hidden',
  'ally',
  'invisible',
];

export function TokenLibraryPanel({ engine }: Readonly<{ engine: MapEngine }>) {
  const active = useActiveToolId() === TOKENS_TOOL_ID;
  if (!active || engine.viewer.role !== 'gm') return null;
  return <Library engine={engine} />;
}

function Library({ engine }: Readonly<{ engine: MapEngine }>) {
  const tokens = useTokens(engine);
  const campaignId = engine.store.getState().campaignId;
  const campagne = useCampagne(campaignId);
  const systemId = campagne.data?.system ?? null;
  const sys = useCampaignSystem(systemId, campaignId);
  const tab = useLibrary(tokens, (s) => s.tab);
  const armed = useLibrary(tokens, (s) => s.armed);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);

  const arm = useCallback(
    (source: PlacementSource | null) => tokens.library.setState({ armed: source }),
    [tokens],
  );
  const drag = useSceneDrop(engine, tokens);

  return (
    <MapPanel
      id="token-library"
      label="Bibliothèque des personnages"
      icon={UserRoundPlus}
      title="Personnages"
      shortcut="A"
      closeLabel="Fermer la bibliothèque"
      onClose={() => engine.tools.activate(SELECT_TOOL_ID)}
      onKeyDown={(e) => {
        // Échap dans le panneau : la carte choisie est rendue (la carte n'a pas le focus)
        if (e.key === 'Escape' && tokens.library.getState().armed) {
          e.stopPropagation();
          arm(null);
        }
      }}
      className="w-80"
    >
      <Tabs
        value={tab}
        onValueChange={(v) => tokens.library.setState({ tab: v as LibraryTab })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="space-y-2 px-3 pt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="templates">Modèles</TabsTrigger>
            <TabsTrigger value="bestiary">Bestiaire</TabsTrigger>
            <TabsTrigger value="quick">Nouveau</TabsTrigger>
          </TabsList>
          {tab !== 'quick' && (
            <SearchField
              value={query}
              onChange={setQuery}
              label="Rechercher un PNJ"
              placeholder="Rechercher…"
              className="sm:w-full"
            />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {!sys.data && sys.isError && (
            <Notice
              tone="error"
              icon={AlertTriangle}
              title="Règles indisponibles"
              description={messageErreur(
                sys.error,
                'Le système de la campagne n’a pas pu être chargé.',
              )}
            />
          )}
          {!sys.data && !sys.isError && <ListSkeleton rows={5} />}
          {sys.data && (
            <>
              <TabsContent value="templates" className="mt-0">
                <TemplatesTab
                  campaignId={campaignId}
                  sys={sys.data}
                  search={search}
                  armedKey={armed?.key ?? null}
                  drag={drag}
                  onArm={arm}
                  onQuick={() => tokens.library.setState({ tab: 'quick' })}
                />
              </TabsContent>
              <TabsContent value="bestiary" className="mt-0">
                <BestiaryTab
                  systemId={systemId}
                  sys={sys.data}
                  search={search}
                  armedKey={armed?.key ?? null}
                  drag={drag}
                  onArm={arm}
                />
              </TabsContent>
              <TabsContent value="quick" className="mt-0">
                {systemId && (
                  <QuickCreate
                    campaignId={campaignId}
                    systemId={systemId}
                    systeme={sys.data.systeme}
                    presentation={sys.data.presentation}
                    onArm={arm}
                    onCreated={() => tokens.library.setState({ tab: 'templates' })}
                  />
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      <PlacementOptions tokens={tokens} />
    </MapPanel>
  );
}

type Sys = NonNullable<ReturnType<typeof useCampaignSystem>['data']>;

interface TabProps {
  sys: Sys;
  search: string;
  armedKey: string | null;
  drag: CardDrag;
  onArm(source: PlacementSource | null): void;
}

// ─── Modèles de la campagne ──────────────────────────────────────────────────

function TemplatesTab({
  campaignId,
  sys,
  search,
  armedKey,
  drag,
  onArm,
  onQuick,
}: TabProps & { campaignId: string; onQuick(): void }) {
  const templates = useNpcTemplates(campaignId);
  const [category, setCategory] = useState(ALL);
  const items = useMemo(() => {
    const data = templates.data;
    if (!data) return [];
    return data.templates
      .map((t) => ({
        item: templateItem(sys.systeme, sys.presentation, t, data.categories),
        categoryId: t.categoryId,
        source: {
          key: `template:${t.id}`,
          name: t.name,
          imageUrl: t.tokenUrl ?? t.imageUrl,
          source: { templateId: t.id },
        } satisfies PlacementSource,
      }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'fr'));
  }, [templates.data, sys]);
  const categories = templates.data?.categories ?? [];
  const q = normaliser(search);
  const shown = items.filter(
    (i) => (!q || i.item.text.includes(q)) && (!category || i.categoryId === category),
  );

  if (templates.isPending) return <ListSkeleton rows={5} />;
  if (templates.isError)
    return (
      <Notice
        tone="error"
        icon={AlertTriangle}
        title="Modèles indisponibles"
        description={messageErreur(templates.error, 'Réessayez dans un instant.')}
        action={
          <Button variant="secondary" size="sm" onClick={() => void templates.refetch()}>
            Réessayer
          </Button>
        }
      />
    );
  if (!items.length)
    return (
      <Notice
        icon={Skull}
        title="Aucun modèle de PNJ"
        description="Créez vos PNJ dans « Mes PNJ » (U), ou ici en quelques secondes : chacun reste un modèle, à poser autant de fois qu’il le faut."
        action={
          <Button variant="secondary" size="sm" onClick={onQuick}>
            Nouveau PNJ
          </Button>
        }
      />
    );
  return (
    <div className="space-y-3">
      {categories.length > 0 && (
        <SelectField
          value={category}
          onValueChange={setCategory}
          aria-label="Filtrer par catégorie"
          className="h-9"
          options={[
            { valeur: ALL, nom: 'Toutes les catégories' },
            ...categories.map((c) => ({ valeur: c.id, nom: c.name })),
          ]}
        />
      )}
      <CardList
        entries={shown.map((i) => ({ item: i.item, source: i.source }))}
        search={search}
        armedKey={armedKey}
        drag={drag}
        onArm={onArm}
      />
    </div>
  );
}

// ─── Bestiaire du système ────────────────────────────────────────────────────

function BestiaryTab({
  systemId,
  sys,
  search,
  armedKey,
  drag,
  onArm,
}: TabProps & { systemId: string | null }) {
  const bestiary = useSystemBestiary(systemId);
  const [category, setCategory] = useState(ALL);
  const items = useMemo(
    () =>
      systemId && bestiary.data
        ? bestiary.data.creatures.map((c) => ({
            item: creatureItem(sys.systeme, sys.presentation, c),
            source: {
              key: `bestiary:${c.id}`,
              name: c.nom,
              imageUrl: c.image ?? null,
              source: { bestiary: { systemeId: systemId, key: c.id } },
            } satisfies PlacementSource,
          }))
        : [],
    [bestiary.data, sys, systemId],
  );
  const categories = useMemo(
    () =>
      [...new Set(items.map((i) => i.item.category).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    [items],
  );
  const q = normaliser(search);
  const shown = items.filter(
    (i) => (!q || i.item.text.includes(q)) && (!category || i.item.category === category),
  );

  if (bestiary.isPending) return <ListSkeleton rows={5} />;
  if (bestiary.isError)
    return (
      <Notice
        tone="error"
        icon={AlertTriangle}
        title="Bestiaire indisponible"
        description={messageErreur(bestiary.error, 'Réessayez dans un instant.')}
      />
    );
  if (!items.length)
    return (
      <Notice
        icon={Skull}
        title="Pas de bestiaire"
        description="Le système de cette campagne n’a pas de créatures de référence."
      />
    );
  return (
    <div className="space-y-3">
      {categories.length > 1 && (
        <SelectField
          value={category}
          onValueChange={setCategory}
          aria-label="Filtrer par catégorie"
          className="h-9"
          options={[
            { valeur: ALL, nom: 'Toutes les catégories' },
            ...categories.map((c) => ({ valeur: c, nom: c })),
          ]}
        />
      )}
      <CardList entries={shown} search={search} armedKey={armedKey} drag={drag} onArm={onArm} />
    </div>
  );
}

function CardList({
  entries,
  search,
  armedKey,
  drag,
  onArm,
}: Readonly<{
  entries: readonly { item: BestiaryItem; source: PlacementSource }[];
  search: string;
  armedKey: string | null;
  drag: CardDrag;
  onArm(source: PlacementSource | null): void;
}>) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [search]);
  if (!entries.length)
    return (
      <Notice
        icon={SearchX}
        title="Aucun résultat"
        description={search ? `Aucun PNJ ne correspond à « ${search} ».` : undefined}
      />
    );
  return (
    <>
      <ul className="space-y-1.5">
        {entries.slice(0, limit).map(({ item, source }) => (
          <li key={source.key}>
            <LibraryCard
              source={source}
              subtitle={item.subtitle ?? item.category}
              stats={item.stats[0]?.items.slice(0, 3) ?? []}
              armed={armedKey === source.key}
              drag={drag}
              onArm={() => onArm(armedKey === source.key ? null : source)}
            />
          </li>
        ))}
      </ul>
      {entries.length > limit && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="xs" onClick={() => setLimit((l) => l + PAGE)}>
            Afficher plus ({entries.length - limit} restants)
          </Button>
        </div>
      )}
    </>
  );
}

// ─── Options de pose ─────────────────────────────────────────────────────────

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
}>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-flow-col gap-1 rounded-lg border border-border bg-surface p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            value === o.value
              ? 'bg-surface-3 text-foreground shadow-surface'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlacementOptions({ tokens }: Readonly<{ tokens: TokensState }>) {
  const count = useLibrary(tokens, (s) => s.count);
  const side = useLibrary(tokens, (s) => s.side);
  const visibility = useLibrary(tokens, (s) => s.visibility);
  const armed = useLibrary(tokens, (s) => s.armed);
  const placing = useLibrary(tokens, (s) => s.placing);
  const set = (patch: Partial<LibraryState>) => tokens.library.setState(patch);

  return (
    <footer className="space-y-2.5 border-t border-border px-3 py-3">
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <span className="text-xs text-muted-foreground">Nombre</span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Un exemplaire de moins"
            disabled={count <= 1}
            onClick={() => set({ count: clampCount(count - 1) })}
          >
            <Minus />
          </Button>
          <output
            aria-live="polite"
            className="w-7 text-center font-mono text-sm font-semibold tabular-nums"
          >
            {count}
          </output>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Un exemplaire de plus"
            disabled={count >= MAX_COPIES}
            onClick={() => set({ count: clampCount(count + 1) })}
          >
            <Plus />
          </Button>
          <span className="ml-auto text-[11px] text-subtle">
            <Kbd>1</Kbd>–<Kbd>9</Kbd> sur la carte
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Camp</span>
        <Segmented
          label="Camp des PNJ posés"
          value={side}
          onChange={(v) => set({ side: v })}
          options={[
            { value: 'enemies', label: 'Ennemis' },
            { value: 'allies', label: 'Alliés' },
          ]}
        />
        <span className="text-xs text-muted-foreground">Visibilité</span>
        <SelectField
          value={visibility}
          onValueChange={(v) => set({ visibility: v as MapTokenVisibility })}
          aria-label="Visibilité à la pose"
          className="h-8 text-[13px]"
          options={PLACE_VISIBILITIES.map((v) => ({ valeur: v, nom: VISIBILITY_LABELS[v].label }))}
        />
      </div>
      <p aria-live="polite" className="flex items-start gap-1.5 text-xs text-muted-foreground">
        {placing && (
          <>
            <Loader2 className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden />
            Pose en cours…
          </>
        )}
        {!placing && armed && (
          <span>
            Cliquez sur la scène pour poser{' '}
            <strong className="text-foreground">{armed.name}</strong>
            {count > 1 ? ` × ${count}` : ''}. <Kbd>⇧</Kbd> : en poser d’autres, <Kbd>Échap</Kbd> :
            annuler.
          </span>
        )}
        {!placing &&
          !armed &&
          'Glissez une carte sur la scène, ou choisissez-la puis cliquez sur la carte.'}
      </p>
    </footer>
  );
}

// ─── Glisser une carte sur la scène ──────────────────────────────────────────

/**
 * Glisser-déposer d'une carte vers la scène : pendant le survol, le fantôme suit le pointeur
 * (point de l'écran converti en point du monde par la caméra) ; au dépôt, la carte est posée.
 */
function useSceneDrop(engine: MapEngine, tokens: TokensState): CardDrag {
  const dragging = useRef<{ source: PlacementSource; before: PlacementSource | null } | null>(null);
  const mounted = useMapUi((s) => s.mounted);

  useEffect(() => {
    const host = engine.canvas?.parentElement;
    if (!host || !mounted) return;
    const world = (e: globalThis.DragEvent) => {
      const r = host.getBoundingClientRect();
      return engine.camera.screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const over = (e: globalThis.DragEvent) => {
      if (!dragging.current || !e.dataTransfer?.types.includes(NPC_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      tokens.tool?.hoverAt(world(e), engine, e.altKey);
    };
    const leave = (e: globalThis.DragEvent) => {
      if (e.target === host || !host.contains(e.relatedTarget as Node | null))
        tokens.tool?.hoverAt(null, engine);
    };
    const drop = (e: globalThis.DragEvent) => {
      const d = dragging.current;
      if (!d || !e.dataTransfer?.types.includes(NPC_DRAG_TYPE)) return;
      e.preventDefault();
      dragging.current = null;
      host.focus({ preventScroll: true });
      void tokens.tool?.dropAt(d.source, world(e), { free: e.altKey });
    };
    host.addEventListener('dragover', over);
    host.addEventListener('dragleave', leave);
    host.addEventListener('drop', drop);
    return () => {
      host.removeEventListener('dragover', over);
      host.removeEventListener('dragleave', leave);
      host.removeEventListener('drop', drop);
    };
  }, [engine, tokens, mounted]);

  return useMemo<CardDrag>(
    () => ({
      onDragStart(e: DragEvent, source: PlacementSource) {
        e.dataTransfer.setData(NPC_DRAG_TYPE, source.key);
        e.dataTransfer.setData('text/plain', source.name);
        e.dataTransfer.effectAllowed = 'copy';
        const before = tokens.library.getState().armed;
        dragging.current = { source, before };
        // Le fantôme de l'outil suit le glisser
        tokens.library.setState({ armed: source });
      },
      onDragEnd() {
        const d = dragging.current;
        dragging.current = null;
        tokens.tool?.hoverAt(null, engine);
        // Lâché ailleurs que sur la scène : rien n'est posé, le choix d'avant revient
        if (d) tokens.library.setState({ armed: d.before });
      },
    }),
    [engine, tokens],
  );
}
