/**
 * Sortes d'entités du module « objets » (docs/carte.md § 6, § 10) : `object` (coffres, armes,
 * butin) et `decor`, choisies par le champ `kind` du contrat. Elles partagent tout (couche
 * `objects`, rendu, droits, menu), sauf leur identifiant : le rendu de la visibilité (§ 9) ne
 * masque jamais un décor derrière un mur (`entity.kind.id === 'decor'`).
 *
 * - Capacités : toutes les communes (sélection, glisser, poignées de rotation et de taille,
 *   verrou, masquage, « Visible pour… », dupliquer, supprimer, inspecter, ordre et calque).
 * - Visibilité du contrat : `visible`, `hidden` (masqué aux joueurs), `custom` (visible pour
 *   les personnages de `visibleTo`). Masquer garde la liste : « Montrer » la rétablit.
 * - Droits, miroir du serveur : le MJ fait tout ; un joueur ne touche qu'un objet à fouiller
 *   (pour le fouiller), les autres ne se sélectionnent pas (le clic passe au travers) ; un
 *   spectateur regarde.
 * - Direct : un objet masqué ou dans un calque masqué aux joueurs ne part qu'au MJ ; un objet
 *   « pour certains », qu'aux joueurs de ces personnages (et au MJ).
 */
import {
  Maximize2,
  Minimize2,
  PackageOpen,
  PackageSearch,
  Scaling,
  Shapes,
  Square,
} from 'lucide-react';
import type { MapObjectKind } from '@vtt/contracts';
import type { MapEntity } from '../../engine/entities/entity';
import {
  field,
  isGm,
  type EntityAction,
  type EntityKind,
  type Field,
  type MapViewer,
  type MenuItem,
} from '../../engine/entities/entity-kind';
import type { MapEngine } from '../../engine/map-engine';
import type { Persistence } from '../../store/commands';
import { disposeObject, renderObject, updateObject } from './object-view';
import { fitObjects, scaleObjects, setObjectKind, setSearchable } from './placement';
import { charactersReach, objectGeometry } from './reach';
import {
  DECOR_KIND_ID,
  isDecor,
  OBJECT_KIND_ID,
  OBJECTS_COLLECTION,
  type ObjectData,
} from './types';

// ─── Champs communs ──────────────────────────────────────────────────────────

/** Masqué aux joueurs (`visibility: 'hidden'`) ; montrer rétablit « pour certains » s'il y en avait. */
export const objectHidden: Field<ObjectData, boolean> = {
  get: (o) => o.visibility === 'hidden',
  set: (o, hidden) => {
    const next = hidden ? 'hidden' : o.visibleTo?.length ? 'custom' : 'visible';
    return o.visibility === next ? o : { ...o, visibility: next };
  },
};

/** « Visible pour… » : les personnages de `visibleTo` (`custom`), null : pour tous. */
export const objectRestrictedTo: Field<ObjectData, readonly string[] | null> = {
  get: (o) => (o.visibility === 'custom' ? (o.visibleTo ?? []) : null),
  set: (o, ids) =>
    ids === null
      ? { ...o, visibility: 'visible', visibleTo: [] }
      : { ...o, visibility: 'custom', visibleTo: [...ids] },
};

/**
 * Droits : le MJ fait tout. Un joueur voit ; il sélectionne et inspecte un objet à fouiller
 * (le reste ne se touche pas). Un spectateur voit seulement.
 */
export function objectCan(
  action: EntityAction,
  entity: MapEntity<ObjectData>,
  viewer: MapViewer,
): boolean {
  if (action === 'view') return true;
  if (isGm(viewer)) return true;
  if (viewer.role !== 'player') return false;
  return (action === 'select' || action === 'inspect') && entity.data.searchable === true;
}

// ─── Menu ────────────────────────────────────────────────────────────────────

export interface ObjectKindOptions {
  persistence: Persistence<ObjectData>;
  /** Ouvre la fenêtre de fouille d'un objet (joueur). */
  openSearch?(objectId: string): void;
}

const KIND_CHOICES: { value: MapObjectKind; label: string }[] = [
  { value: 'item', label: 'Objet' },
  { value: 'weapon', label: 'Arme' },
  { value: 'decor', label: 'Décor (toujours visible, sous l’obscurité)' },
];

/** Personnages de l'utilisateur à portée de fouille de cet objet. */
export function reachOf(engine: MapEngine, o: ObjectData) {
  const tokens = engine.store.getState().collections.tokens?.values() ?? [];
  return charactersReach(o, tokens, engine.viewer.characterIds, engine.kindContext().pixelsPerUnit);
}

function playerActions(
  engine: MapEngine,
  entities: readonly MapEntity[],
  opts: ObjectKindOptions,
): MenuItem[] {
  const e = entities.length === 1 ? entities[0]! : null;
  const o = e?.data as ObjectData | undefined;
  if (!e || !o?.searchable || engine.viewer.role !== 'player') return [];
  const inRange = reachOf(engine, o).some((r) => r.inRange);
  return [
    {
      id: 'object:search',
      label: inRange ? 'Fouiller' : 'Fouiller (trop loin)',
      icon: PackageSearch,
      primary: true,
      forPlayers: true,
      disabled: !inRange,
      run: () => opts.openSearch?.(e.id),
    },
  ];
}

function gmActions(engine: MapEngine, entities: readonly MapEntity[]): MenuItem[] {
  const single = entities.length === 1 ? entities[0]! : null;
  const data = entities.map((e) => e.data as ObjectData);
  const unlocked = entities.some((e) => !e.state.locked);
  const allSearchable = data.every((o) => o.searchable === true);
  const kinds = new Set(data.map((o) => o.kind));
  const items: MenuItem[] = [
    {
      id: 'object:size',
      label: 'Taille',
      icon: Scaling,
      disabled: !unlocked,
      children: [
        {
          id: 'object:grow',
          label: 'Agrandir',
          icon: Maximize2,
          run: () => void scaleObjects(engine, entities, 1.25),
        },
        {
          id: 'object:shrink',
          label: 'Rétrécir',
          icon: Minimize2,
          run: () => void scaleObjects(engine, entities, 0.8),
        },
        {
          id: 'object:fit',
          label: 'Une case (proportions de l’image)',
          icon: Square,
          run: () => void fitObjects(engine, entities),
        },
      ],
    },
    {
      id: 'object:searchable',
      label: 'Les joueurs peuvent fouiller',
      checked: allSearchable,
      run: () => void setSearchable(engine, entities, !allSearchable),
    },
  ];
  if (single)
    items.push({
      id: 'object:contents',
      label: 'Contenu et fouille…',
      icon: PackageOpen,
      run: () => engine.openInspector([single.id]),
    });
  items.push({
    id: 'object:kind',
    label: 'Sorte',
    icon: Shapes,
    children: KIND_CHOICES.map((c) => ({
      id: `object:kind:${c.value}`,
      label: c.label,
      checked: kinds.size === 1 && kinds.has(c.value),
      run: () => void setObjectKind(engine, entities, c.value),
    })),
  });
  return items;
}

// ─── Sortes ──────────────────────────────────────────────────────────────────

/** Les fonctions du moteur prennent une entité générique. */
const asEntity = (e: MapEntity<ObjectData>) => e as unknown as MapEntity;

/** Les deux sortes de la couche `objects` : `object` et `decor`. */
export function createObjectKinds(
  engine: MapEngine,
  opts: ObjectKindOptions,
): [EntityKind<ObjectData>, EntityKind<ObjectData>] {
  const base: Omit<EntityKind<ObjectData>, 'id' | 'label' | 'accepts'> = {
    collection: OBJECTS_COLLECTION,
    capabilities: [
      'select',
      'move',
      'rotate',
      'resize',
      'lock',
      'hide',
      'restrictTo',
      'duplicate',
      'delete',
      'inspect',
      'order',
    ],
    plane: 'content',
    stacking: {
      arrangeKind: 'object',
      layerId: field<ObjectData, string | null>('layerId'),
      z: field<ObjectData, number>('z'),
      defaultRole: 'objects',
    },
    display: 'objects',
    geometry: (o) => objectGeometry(o),
    applyGeometry: (o, g) => ({
      ...o,
      pos: { x: g.x - g.width / 2, y: g.y - g.height / 2 },
      width: g.width,
      height: g.height,
      rotation: g.rotation,
    }),
    locked: field<ObjectData, boolean>('isLocked'),
    hidden: objectHidden,
    restrictedTo: objectRestrictedTo,
    name: (o) => o.name?.trim() || null,
    can: objectCan,
    render: (entity, ctx) => renderObject(asEntity(entity), ctx),
    update: (entity, ctx, change) => updateObject(asEntity(entity), ctx, change),
    dispose: (entity) => disposeObject(asEntity(entity)),
    minSize: 8,
    actions(entities, ctx) {
      const e = ctx.engine as MapEngine;
      const list = entities as unknown as readonly MapEntity[];
      return isGm(ctx.viewer) ? gmActions(e, list) : playerActions(e, list, opts);
    },
    duplicate: (o, offset) => ({ ...o, pos: { x: o.pos.x + offset.x, y: o.pos.y + offset.y } }),
    liveAudience(entity) {
      const o = entity.data;
      if (entity.layerId && engine.layer(entity.layerId)?.visibleToPlayers === false) return 'gm';
      if (o.visibility === 'custom') {
        // Les joueurs dont un personnage le voit (et le MJ)
        const allowed = new Set(o.visibleTo ?? []);
        const users = (engine.directory.players?.() ?? [])
          .filter((p) => p.characterIds.some((id) => allowed.has(id)))
          .map((p) => p.userId);
        return users.length ? { users } : 'gm';
      }
      return o.visibility === 'visible' ? 'public' : 'gm';
    },
    persistence: opts.persistence,
  };
  return [
    { ...base, id: OBJECT_KIND_ID, label: 'Objet', accepts: (o) => !isDecor(o) },
    { ...base, id: DECOR_KIND_ID, label: 'Décor', accepts: (o) => isDecor(o) },
  ];
}
