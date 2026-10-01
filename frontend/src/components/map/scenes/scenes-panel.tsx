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
 * - dossiers : créer, renommer, supprimer (leurs scènes restent, sans dossier).
 */
import type { MapGroup, MapScene } from '@vtt/contracts';
import {
  Crown,
  Ellipsis,
  Eye,
  EyeOff,
  Film,
  Folder,
  FolderPlus,
  MapPin,
  MapPinned,
  Navigation,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { useTable } from '@/components/table/contexte';
import { usePanels } from '@/components/table/panels/navigation';
import { messageErreur } from '@/lib/api';
import { useActiveMap } from '@/lib/map/active-map';
import { SPAWN_TOOL_ID } from '@/lib/map/modules/scene';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { videoVariant } from '@/lib/map/engine/background-prefs';
import { cn } from '@/lib/utils';
import { openScene } from '../use-table-map';
import { SceneDialog } from './scene-dialog';
import { TravelDialog } from './travel-dialog';
import {
  isVideoBackground,
  useScenesActions,
  useScenesData,
  type ScenesActions,
} from './use-scenes';

type Editing = { scene: MapScene | null; groupId?: string | null } | null;

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
  const [folder, setFolder] = useState<{ group: MapGroup | null } | null>(null);
  const [deleting, setDeleting] = useState<MapScene | null>(null);

  const partyMapId = settings.data?.partyMapId ?? null;
  const characters = useMemo(() => {
    const names = new Map((personnages.data ?? []).map((p) => [p.id, p.name]));
    return campagne.characters
      .filter((c) => c.side === 'players')
      .map((c) => ({ id: c.characterId, name: names.get(c.characterId) ?? 'Personnage' }));
  }, [campagne.characters, personnages.data]);

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    const list = (maps.data ?? []).filter((m) => !q || m.name.toLocaleLowerCase('fr').includes(q));
    const sorted = [...(groups.data ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'),
    );
    const byName = (a: MapScene, b: MapScene) => a.name.localeCompare(b.name, 'fr');
    return [
      ...sorted.map((g) => ({
        group: g as MapGroup | null,
        scenes: list.filter((m) => m.groupId === g.id).sort(byName),
      })),
      {
        group: null,
        scenes: list
          .filter((m) => !m.groupId || !sorted.some((g) => g.id === m.groupId))
          .sort(byName),
      },
    ].filter((s) => s.group || s.scenes.length || !q);
  }, [maps.data, groups.data, query]);

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
          titre="Scènes indisponibles"
          description={messageErreur(maps.error)}
        />
      </div>
    );

  const count = maps.data?.length ?? 0;
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <InputGroup
          avant={<Search className="size-4 text-subtle" aria-hidden />}
          placeholder="Rechercher une scène"
          aria-label="Rechercher une scène"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Info texte="Nouveau dossier">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Nouveau dossier"
            onClick={() => setFolder({ group: null })}
          >
            <FolderPlus />
          </Button>
        </Info>
        <Button onClick={() => setEditing({ scene: null })}>
          <Plus />
          Scène
        </Button>
      </div>

      {active.mapId && partyMapId && active.mapId !== partyMapId && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">Vous regardez une autre scène que celle du groupe.</span>
          <Button variant="ghost" size="sm" onClick={() => openScene(null)}>
            <Undo2 />
            Revenir au groupe
          </Button>
        </div>
      )}

      {!count ? (
        <EtatVide
          icone={MapPinned}
          titre="Aucune scène"
          description="Une scène, c’est un fond (image ou vidéo) où poser personnages, objets et murs."
          action={
            <Button onClick={() => setEditing({ scene: null })}>
              <Plus />
              Créer la première scène
            </Button>
          }
        />
      ) : (
        sections.map((section) => (
          <section key={section.group?.id ?? 'none'} className="space-y-2">
            <header className="flex items-center gap-2">
              <Folder className="size-4 text-subtle" aria-hidden />
              <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-subtle">
                {section.group?.name ?? 'Sans dossier'}
              </h3>
              <span className="text-[11px] tabular-nums text-subtle">{section.scenes.length}</span>
              {section.group && (
                <GroupMenu
                  group={section.group}
                  actions={actions}
                  onRename={() => setFolder({ group: section.group })}
                  onAdd={() => setEditing({ scene: null, groupId: section.group!.id })}
                />
              )}
            </header>
            {section.scenes.length ? (
              <ul className="space-y-1.5">
                {section.scenes.map((scene) => (
                  <SceneRow
                    key={scene.id}
                    scene={scene}
                    party={scene.id === partyMapId}
                    shown={scene.id === active.mapId}
                    actions={actions}
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
                Aucune scène dans ce dossier.
              </p>
            )}
          </section>
        ))
      )}

      <SceneDialog
        campaignId={campaignId}
        open={editing !== null}
        scene={editing?.scene ?? null}
        defaultGroupId={editing?.groupId ?? null}
        groups={groups.data ?? []}
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
        count={groups.data?.length ?? 0}
        actions={actions}
        onClose={() => setFolder(null)}
      />
      <DeleteSceneDialog scene={deleting} actions={actions} onClose={() => setDeleting(null)} />
    </div>
  );
}

function SceneRow({
  scene,
  party,
  shown,
  actions,
  onEdit,
  onTravel,
  onDelete,
  onSpawn,
  onParty,
}: {
  scene: MapScene;
  party: boolean;
  shown: boolean;
  actions: ScenesActions;
  onEdit(): void;
  onTravel(): void;
  onDelete(): void;
  onSpawn: (() => void) | null;
  onParty(): void;
}) {
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

  return (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-xl border p-1.5 pr-2 transition-colors',
        shown ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-surface-2',
      )}
    >
      <button
        type="button"
        onClick={() => openScene(scene.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-current={shown ? 'true' : undefined}
        title="Ouvrir cette scène pour moi"
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
                Groupe
              </Badge>
            )}
            {shown && <Badge ton="info">Affichée</Badge>}
            {!scene.visibleToPlayers && (
              <Badge>
                <EyeOff />
                Cachée
              </Badge>
            )}
          </span>
        </span>
      </button>

      <Info texte="Faire venir le groupe">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Faire venir le groupe sur ${scene.name}`}
          onClick={onTravel}
        >
          <Navigation />
        </Button>
      </Info>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options de ${scene.name}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{scene.name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => openScene(scene.id)}>
            <Eye />
            Ouvrir pour moi
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTravel}>
            <Navigation />
            Faire venir le groupe…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onParty} disabled={party}>
            <Crown />
            Scène du groupe
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleVisible}>
            {scene.visibleToPlayers ? <EyeOff /> : <Eye />}
            {scene.visibleToPlayers ? 'Cacher aux joueurs' : 'Rendre visible des joueurs'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onSpawn}
            onSelect={() => {
              onSpawn?.();
              close();
            }}
          >
            <MapPin />
            {onSpawn ? 'Placer le point d’apparition' : 'Point d’apparition (ouvrez la scène)'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Modifier…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive"
          >
            <Trash2 />
            Supprimer…
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
}: {
  group: MapGroup;
  actions: ScenesActions;
  onRename(): void;
  onAdd(): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Options du dossier ${group.name}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onAdd}>
          <Plus />
          Nouvelle scène ici
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Renommer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => actions.removeGroup.mutate(group.id)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive"
        >
          <Trash2 />
          Supprimer le dossier
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
}: {
  state: { group: MapGroup | null } | null;
  count: number;
  actions: ScenesActions;
  onClose(): void;
}) {
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
      else await actions.createGroup.mutateAsync({ name: name.trim(), sortOrder: count });
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
            <DialogTitle>{group ? 'Renommer le dossier' : 'Nouveau dossier'}</DialogTitle>
            <DialogDescription>Villes, donjons, étages…</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Nom du dossier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              loading={actions.createGroup.isPending || actions.updateGroup.isPending}
            >
              {group ? 'Renommer' : 'Créer'}
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
}: {
  scene: MapScene | null;
  actions: ScenesActions;
  onClose(): void;
}) {
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
          <DialogTitle>Supprimer « {scene?.name} » ?</DialogTitle>
          <DialogDescription>
            Tout ce qui est posé dessus disparaît avec elle (personnages, objets, murs, dessins).
            Les personnages eux-mêmes restent dans la campagne.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => void remove()}
            loading={actions.removeScene.isPending}
          >
            <Trash2 />
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
