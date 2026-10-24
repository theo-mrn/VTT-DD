'use client';

/**
 * Panneau « Scènes » du MJ (touche E ; ex-CitiesManager, docs/carte.md § 10) : les scènes de la
 * campagne rangées en dossiers, la scène affichée et celle du groupe.
 *
 * - Ouvrir une scène pour soi (`?scene=` : les joueurs restent où ils sont) ;
 * - faire venir le groupe, ou une sélection de personnages (`travel`) ;
 * - scène du groupe (`partyMapId`), visible des joueurs, point d'apparition (sur la scène
 *   affichée) ;
 * - créer, modifier (nom, description, dossier, fond image ou vidéo), supprimer ;
 * - dossiers : créer, renommer, supprimer (leurs scènes restent, sans dossier) ;
 * - ranger : glisser une scène sur un dossier, ou « Déplacer vers » ;
 * - filtrer sur un dossier (menu des dossiers, retenu par campagne le temps de la session).
 */
import { translate } from '@/i18n/runtime';
import type { MapGroup, MapScene } from '@vtt/contracts';
import {
  Check,
  ChevronDown,
  Crown,
  Ellipsis,
  Eye,
  EyeOff,
  Film,
  Folder,
  FolderInput,
  FolderPlus,
  FolderX,
  GripVertical,
  LayoutGrid,
  MapPin,
  MapPinned,
  Navigation,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  Fragment,
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { EtatVide } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { useTable } from '@/components/table/contexte';
import { usePanels } from '@/components/table/panels/navigation';
import { messageErreur } from '@/lib/api';
import { useActiveMap } from '@/lib/map/active-map';
import { SPAWN_TOOL_ID } from '@/lib/map/features/scene';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { videoVariant } from '@/lib/map/engine/background-prefs';
import { cn } from '@/lib/utils';
import { openScene } from '../use-table-map';
import { SceneDialog } from './scene-dialog';
import { TravelDialog } from './travel-dialog';
import {
  isVideoBackground,
  sceneFolderFilter,
  useScenesActions,
  useScenesData,
  type SceneFolderFilter,
  type ScenesActions,
} from './use-scenes';

type Editing = { scene: MapScene | null; groupId?: string | null } | null;
/** Dossier créé ou renommé ; `moving` : la scène à y ranger une fois créé. */
type FolderState = { group: MapGroup | null; moving?: MapScene } | null;

/** Type du glisser d'une scène : seules les zones du panneau l'acceptent (rien d'autre n'est transporté). */
const SCENE_DRAG = 'application/x-vtt-scene';
const carriesScene = (e: DragEvent) => e.dataTransfer.types.includes(SCENE_DRAG);

/**
 * Zone de dépôt d'une scène. Le compteur suit les entrées et sorties des enfants (pas de
 * clignotement au passage d'un élément à l'autre) ; remis à zéro à la fin du glisser.
 */
function useSceneDrop(dragging: boolean, onDrop: (sceneId: string) => void) {
  const [depth, setDepth] = useState(0);
  const [wasDragging, setWasDragging] = useState(dragging);
  if (dragging !== wasDragging) {
    setWasDragging(dragging);
    if (!dragging) setDepth(0);
  }
  return {
    over: dragging && depth > 0,
    zone: {
      onDragEnter: (e: DragEvent) => {
        if (!carriesScene(e)) return;
        e.preventDefault();
        setDepth((d) => d + 1);
      },
      onDragOver: (e: DragEvent) => {
        if (!carriesScene(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDragLeave: (e: DragEvent) => {
        if (carriesScene(e)) setDepth((d) => Math.max(0, d - 1));
      },
      onDrop: (e: DragEvent) => {
        if (!carriesScene(e)) return;
        e.preventDefault();
        setDepth(0);
        const id = e.dataTransfer.getData(SCENE_DRAG);
        if (id) onDrop(id);
      },
    },
  };
}

export function ScenesPanel() {
  const { campagne } = useTable();
  const campaignId = campagne.id;
  const { maps, groups, settings } = useScenesData(campaignId);
  const actions = useScenesActions(campaignId);
  const active = useActiveMap(campaignId);
  const personnages = usePersonnagesCampagne(campaignId);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [travelTo, setTravelTo] = useState<MapScene | null>(null);
  const [folder, setFolder] = useState<FolderState>(null);
  const [deleting, setDeleting] = useState<MapScene | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const filter = useStore(sceneFolderFilter, (s) => s[campaignId] ?? 'all');
  const setFilter = (f: SceneFolderFilter) => sceneFolderFilter.setState({ [campaignId]: f });

  const partyMapId = settings.data?.partyMapId ?? null;
  const characters = useMemo(() => {
    const names = new Map((personnages.data ?? []).map((p) => [p.id, p.name]));
    return campagne.characters
      .filter((c) => c.side === 'players')
      .map((c) => ({
        id: c.characterId,
        name: names.get(c.characterId) ?? translate('map.common.character'),
      }));
  }, [campagne.characters, personnages.data]);

  const folders = useMemo(
    () =>
      [...(groups.data ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'),
      ),
    [groups.data],
  );
  // Dossier d'une scène ; celui d'un dossier disparu ne compte pas (scène « sans dossier »)
  const folderOf = useMemo(() => {
    const known = new Set(folders.map((g) => g.id));
    return (m: MapScene) => (m.groupId && known.has(m.groupId) ? m.groupId : null);
  }, [folders]);
  // Filtre sur un dossier supprimé depuis : toutes les scènes
  const shownFilter =
    filter === 'all' || filter === 'none' || folders.some((g) => g.id === filter) ? filter : 'all';

  const counts = useMemo(() => {
    const n = new Map<string | null, number>();
    for (const m of maps.data ?? []) n.set(folderOf(m), (n.get(folderOf(m)) ?? 0) + 1);
    return n;
  }, [maps.data, folderOf]);

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    const list = (maps.data ?? []).filter((m) => !q || m.name.toLocaleLowerCase('fr').includes(q));
    const byName = (a: MapScene, b: MapScene) => a.name.localeCompare(b.name, 'fr');
    const all = [
      ...folders.map((g) => ({
        group: g as MapGroup | null,
        scenes: list.filter((m) => folderOf(m) === g.id).sort(byName),
      })),
      { group: null, scenes: list.filter((m) => !folderOf(m)).sort(byName) },
    ];
    if (shownFilter === 'none') return all.filter((s) => !s.group);
    if (shownFilter !== 'all') return all.filter((s) => s.group?.id === shownFilter);
    return all.filter((s) => s.group || s.scenes.length || !q);
  }, [maps.data, folders, folderOf, query, shownFilter]);

  /** Range une scène dans un dossier (null : sans dossier) ; rien si elle y est déjà. */
  const move = (sceneId: string, groupId: string | null) => {
    // Rangée, la ligne change de liste : son dragend peut ne jamais arriver
    setDragging(null);
    const scene = maps.data?.find((m) => m.id === sceneId);
    if (scene && folderOf(scene) !== groupId) actions.moveScene.mutate({ scene, groupId });
  };

  if (maps.isLoading)
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  if (maps.isError)
    return (
      <div className="p-4">
        <EtatVide
          icone={MapPin}
          titre={translate('map.scenes.unavailable')}
          description={messageErreur(maps.error)}
        />
      </div>
    );

  const count = maps.data?.length ?? 0;
  const newSceneGroup = shownFilter === 'all' || shownFilter === 'none' ? null : shownFilter;
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <FolderFilter
          value={shownFilter}
          folders={folders}
          total={count}
          counts={counts}
          onChange={setFilter}
          onNewFolder={() => setFolder({ group: null })}
        />
        <InputGroup
          avant={<Search className="size-4 text-subtle" aria-hidden />}
          placeholder={translate('map.scenes.search')}
          aria-label={translate('map.scenes.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button onClick={() => setEditing({ scene: null, groupId: newSceneGroup })}>
          <Plus />
          {translate('map.scenes.scene')}
        </Button>
      </div>

      {active.mapId && partyMapId && active.mapId !== partyMapId && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{translate('map.scenes.elsewhere')}</span>
          <Button variant="ghost" size="sm" onClick={() => openScene(null)}>
            <Undo2 />
            {translate('map.scenes.backToParty')}
          </Button>
        </div>
      )}

      {!count ? (
        <EtatVide
          icone={MapPinned}
          titre={translate('map.scenes.none')}
          description={translate('map.scenes.noneHint')}
          action={
            <Button onClick={() => setEditing({ scene: null })}>
              <Plus />
              {translate('map.scenes.createFirst')}
            </Button>
          }
        />
      ) : (
        sections.map((section) => (
          <FolderSection
            key={section.group?.id ?? 'none'}
            group={section.group}
            count={section.scenes.length}
            dragging={!!dragging}
            onDropScene={(id) => move(id, section.group?.id ?? null)}
            menu={
              section.group && (
                <GroupMenu
                  group={section.group}
                  actions={actions}
                  onRename={() => setFolder({ group: section.group })}
                  onAdd={() => setEditing({ scene: null, groupId: section.group!.id })}
                />
              )
            }
          >
            {section.scenes.length ? (
              <ul className="space-y-1.5">
                {section.scenes.map((scene) => (
                  <SceneRow
                    key={scene.id}
                    scene={scene}
                    folderId={folderOf(scene)}
                    folders={folders}
                    party={scene.id === partyMapId}
                    shown={scene.id === active.mapId}
                    dragged={dragging === scene.id}
                    actions={actions}
                    onDragStart={() => setDragging(scene.id)}
                    onDragEnd={() => setDragging(null)}
                    onMove={(groupId) => move(scene.id, groupId)}
                    onMoveToNew={() => setFolder({ group: null, moving: scene })}
                    onEdit={() => setEditing({ scene })}
                    onTravel={() => setTravelTo(scene)}
                    onDelete={() => setDeleting(scene)}
                    onSpawn={
                      scene.id === active.mapId && active.engine
                        ? () => active.engine!.tools.activate(SPAWN_TOOL_ID)
                        : null
                    }
                    onParty={() =>
                      actions.updateSettings.mutate({
                        partyMapId: scene.id,
                        version: settings.data?.version,
                      })
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                {translate('map.scenes.emptyFolder')}
              </p>
            )}
          </FolderSection>
        ))
      )}

      <SceneDialog
        campaignId={campaignId}
        open={editing !== null}
        scene={editing?.scene ?? null}
        defaultGroupId={editing?.groupId ?? null}
        groups={folders}
        actions={actions}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <TravelDialog
        scene={travelTo}
        characters={characters}
        actions={actions}
        onClose={() => setTravelTo(null)}
      />
      <FolderDialog
        state={folder}
        count={folders.length}
        actions={actions}
        onClose={() => setFolder(null)}
      />
      <DeleteSceneDialog scene={deleting} actions={actions} onClose={() => setDeleting(null)} />
    </div>
  );
}

/** Filtre de dossier : toutes les scènes, un dossier ou celles sans dossier ; et créer un dossier. */
function FolderFilter({
  value,
  folders,
  total,
  counts,
  onChange,
  onNewFolder,
}: Readonly<{
  value: SceneFolderFilter;
  folders: readonly MapGroup[];
  total: number;
  counts: ReadonlyMap<string | null, number>;
  onChange(filter: SceneFolderFilter): void;
  onNewFolder(): void;
}>) {
  const options: { id: SceneFolderFilter; name: string; count: number; icon: typeof Folder }[] = [
    { id: 'all', name: translate('map.scenes.allScenes'), count: total, icon: LayoutGrid },
    ...folders.map((g) => ({ id: g.id, name: g.name, count: counts.get(g.id) ?? 0, icon: Folder })),
    {
      id: 'none',
      name: translate('map.scenes.noFolder'),
      count: counts.get(null) ?? 0,
      icon: FolderX,
    },
  ];
  const current = options.find((o) => o.id === value) ?? options[0]!;
  const CurrentIcon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          aria-label={translate('map.scenes.filterByFolder')}
          className={cn(
            'min-w-0 max-w-[11rem] shrink-0 justify-start gap-1.5 px-2.5',
            value !== 'all' && 'text-primary',
          )}
        >
          <CurrentIcon />
          <span className="truncate">{current.name}</span>
          <ChevronDown className="ml-auto opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60">
        {options.map((o, i) => {
          const Icon = o.icon;
          return (
            <Fragment key={o.id}>
              {i === options.length - 1 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => onChange(o.id)}
                className={cn(o.id === value && 'text-foreground')}
              >
                <Icon />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="text-[11px] tabular-nums text-subtle">{o.count}</span>
                <Check className={cn(o.id !== value && 'invisible')} />
              </DropdownMenuItem>
            </Fragment>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNewFolder}>
          <FolderPlus />
          {translate('map.scenes.newFolderEllipsis')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Un dossier (ou « sans dossier ») : en-tête et scènes ; toute la section reçoit le dépôt. */
function FolderSection({
  group,
  count,
  dragging,
  onDropScene,
  menu,
  children,
}: Readonly<{
  group: MapGroup | null;
  count: number;
  dragging: boolean;
  onDropScene(sceneId: string): void;
  menu: ReactNode;
  children: ReactNode;
}>) {
  const { over, zone } = useSceneDrop(dragging, onDropScene);
  return (
    <section
      {...zone}
      className={cn(
        '-mx-1.5 space-y-2 rounded-xl px-1.5 py-1 transition-colors',
        dragging && 'outline-dashed outline-1 outline-border',
        over && 'bg-primary/10 outline-primary/60',
      )}
    >
      <header className="flex items-center gap-2">
        <Folder className={cn('size-4 text-subtle', over && 'text-primary')} aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-subtle">
          {group?.name ?? translate('map.scenes.noFolder')}
        </h3>
        <span className="text-[11px] tabular-nums text-subtle">{count}</span>
        {menu}
      </header>
      {children}
    </section>
  );
}

function SceneRow({
  scene,
  folderId,
  folders,
  party,
  shown,
  dragged,
  actions,
  onDragStart,
  onDragEnd,
  onMove,
  onMoveToNew,
  onEdit,
  onTravel,
  onDelete,
  onSpawn,
  onParty,
}: Readonly<{
  scene: MapScene;
  /** Dossier où la scène est rangée (null : sans dossier). */
  folderId: string | null;
  folders: readonly MapGroup[];
  party: boolean;
  shown: boolean;
  /** Scène en cours de glisser. */
  dragged: boolean;
  actions: ScenesActions;
  onDragStart(): void;
  onDragEnd(): void;
  onMove(groupId: string | null): void;
  onMoveToNew(): void;
  onEdit(): void;
  onTravel(): void;
  onDelete(): void;
  onSpawn: (() => void) | null;
  onParty(): void;
}>) {
  const { close } = usePanels();
  const video = isVideoBackground(scene.backgroundUrl);
  // Carte animée de la bibliothèque : son affiche (la vidéo n'est jamais chargée ici)
  const variant = video && scene.backgroundUrl ? videoVariant(scene.backgroundUrl) : null;
  const poster = variant ? variant.replace(/\.mp4$/, '.webp') : null;
  const toggleVisible = () =>
    actions.updateScene.mutate({
      mapId: scene.id,
      patch: { visibleToPlayers: !scene.visibleToPlayers, version: scene.version },
    });
  const openOnKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openScene(scene.id);
  };
  const destinations = [{ id: null, name: translate('map.scenes.noFolder') }, ...folders];

  return (
    <li
      draggable
      onDragStart={(e) => {
        // La scène seule : ni l'image ni son adresse (la carte accepterait une image déposée)
        e.dataTransfer.clearData();
        e.dataTransfer.setData(SCENE_DRAG, scene.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(e.currentTarget, 24, 24);
        // Après le dragstart : Chrome annule un glisser dont la page change pendant celui-ci
        requestAnimationFrame(onDragStart);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex items-center gap-2 rounded-xl border p-1.5 pr-2 transition-[background-color,border-color,opacity]',
        shown
          ? 'border-primary/50 bg-primary/10'
          : 'border-border bg-background hover:bg-surface-2',
        dragged && 'opacity-40',
      )}
    >
      <GripVertical
        className="-ml-0.5 -mr-1 size-3.5 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      {/* Pas un <button> : Firefox ne laisse pas glisser la ligne depuis un bouton */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => openScene(scene.id)}
        onKeyDown={openOnKey}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-current={shown ? 'true' : undefined}
        title={translate('map.scenes.openForMe')}
      >
        <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
          {video && !poster ? (
            <span className="grid size-full place-items-center bg-surface-3 text-muted-foreground">
              <Film className="size-5" aria-hidden />
            </span>
          ) : (
            <Illustration
              src={poster ?? scene.backgroundUrl}
              graine={scene.name}
              initiale={false}
              largeur={80}
              className="size-full"
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn('block truncate text-sm font-semibold', shown && 'text-primary-strong')}
          >
            {scene.name}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {party && (
              <Badge ton="primaire">
                <Crown />
                {translate('map.scenes.party')}
              </Badge>
            )}
            {shown && <Badge ton="info">{translate('map.scenes.shown')}</Badge>}
            {!scene.visibleToPlayers && (
              <Badge>
                <EyeOff />
                {translate('map.portals.hidden')}
              </Badge>
            )}
          </span>
        </span>
      </div>

      <Info texte={translate('map.scenes.bringParty')}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('map.scenes.bringPartyTo', { name: scene.name })}
          onClick={onTravel}
        >
          <Navigation />
        </Button>
      </Info>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate('map.scenes.optionsOf', { name: scene.name })}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{scene.name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => openScene(scene.id)}>
            <Eye />
            {translate('map.scenes.openForMeShort')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTravel}>
            <Navigation />
            {translate('map.scenes.bringPartyEllipsis')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onParty} disabled={party}>
            <Crown />
            {translate('map.scenes.partyScene')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleVisible}>
            {scene.visibleToPlayers ? <EyeOff /> : <Eye />}
            {scene.visibleToPlayers
              ? translate('map.scenes.hideFromPlayers')
              : translate('map.scenes.showToPlayers')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onSpawn}
            onSelect={() => {
              onSpawn?.();
              close();
            }}
          >
            <MapPin />
            {onSpawn ? translate('map.scenes.placeSpawn') : translate('map.scenes.spawnOpenFirst')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-[13px] text-muted-foreground focus:text-foreground data-[state=open]:text-foreground">
              <FolderInput />
              {translate('map.scenes.moveTo')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
              {destinations.map((g) => (
                <DropdownMenuItem
                  key={g.id ?? 'none'}
                  disabled={g.id === folderId}
                  onSelect={() => onMove(g.id)}
                >
                  {g.id === folderId ? <Check /> : <Folder />}
                  <span className="truncate">{g.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onMoveToNew}>
                <FolderPlus />
                {translate('map.scenes.newFolderEllipsis')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            {translate('map.scenes.editEllipsis')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive"
          >
            <Trash2 />
            {translate('map.scenes.deleteEllipsis')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function GroupMenu({
  group,
  actions,
  onRename,
  onAdd,
}: Readonly<{
  group: MapGroup;
  actions: ScenesActions;
  onRename(): void;
  onAdd(): void;
}>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('map.scenes.folderOptionsOf', { name: group.name })}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onAdd}>
          <Plus />
          {translate('map.scenes.newSceneHere')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          {translate('map.objects.rename')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => actions.removeGroup.mutate(group.id)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive"
        >
          <Trash2 />
          {translate('map.scenes.deleteFolder')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Créer ou renommer un dossier. */
function FolderDialog({
  state,
  count,
  actions,
  onClose,
}: Readonly<{
  state: FolderState;
  count: number;
  actions: ScenesActions;
  onClose(): void;
}>) {
  const [name, setName] = useState('');
  const [openedFor, setOpenedFor] = useState<typeof state>(null);
  if (state !== openedFor) {
    setOpenedFor(state);
    setName(state?.group?.name ?? '');
  }
  const group = state?.group ?? null;
  const save = async () => {
    if (!name.trim()) return;
    try {
      if (group)
        await actions.updateGroup.mutateAsync({
          groupId: group.id,
          patch: { name: name.trim(), version: group.version },
        });
      else {
        const created = await actions.createGroup.mutateAsync({
          name: name.trim(),
          sortOrder: count,
        });
        if (state?.moving) actions.moveScene.mutate({ scene: state.moving, groupId: created.id });
      }
      onClose();
    } catch {
      // Toast déjà affiché
    }
  };
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {group ? translate('map.scenes.renameFolder') : translate('map.scenes.newFolder')}
            </DialogTitle>
            <DialogDescription>{translate('map.scenes.folderPlaceholder')}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label={translate('map.scenes.folderName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {translate('common.actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              loading={actions.createGroup.isPending || actions.updateGroup.isPending}
            >
              {group ? translate('map.objects.rename') : translate('map.scenes.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSceneDialog({
  scene,
  actions,
  onClose,
}: Readonly<{
  scene: MapScene | null;
  actions: ScenesActions;
  onClose(): void;
}>) {
  const remove = async () => {
    if (!scene) return;
    try {
      await actions.removeScene.mutateAsync(scene.id);
      onClose();
    } catch {
      // Toast déjà affiché (409 : des personnages de joueurs s'y trouvent)
    }
  };
  return (
    <Dialog open={!!scene} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('map.scenes.deleteTitle', { name: scene?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>{translate('map.scenes.deleteMessage')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {translate('common.actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void remove()}
            loading={actions.removeScene.isPending}
          >
            <Trash2 />
            {translate('map.common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
