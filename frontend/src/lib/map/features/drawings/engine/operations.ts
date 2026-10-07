/**
 * Écritures du module « dessins » : toutes passent par des commandes annulables (optimistes,
 * envoyées au serveur, défaites en cas de refus), comme le reste de la carte (docs/carte.md § 7).
 *
 * - Où poser : annotation (hors calque, au-dessus de l'ombre) ou calque du MJ, avec un `z` pris
 *   au-dessus de ce qui s'y trouve (calculé ici pour que l'ordre soit juste dès l'affichage
 *   optimiste, textes et dessins confondus).
 * - Créer un dessin, un texte ; modifier, supprimer ; gommer ; effacer mes dessins ou tout (MJ).
 */
import { translate } from '@/i18n/runtime';
import type { Point } from '@/lib/map/engine/geometry';
import type { LayerLike } from '@/lib/map/engine/layers';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  arrangeCommand,
  createCommand,
  deleteCommand,
  groupCommands,
  tempId,
  updateCommand,
  type Command,
  type Persistence,
} from '@/lib/map/store/commands';
import { collectionOf, type MapDto } from '@/lib/map/store/map-store';
import type { DrawingsRuntime } from './runtime';
import type { DrawTarget } from './settings';
import {
  DRAWING_KIND,
  DRAWINGS_COLLECTION,
  NOTE_KIND,
  NOTES_COLLECTION,
  type DrawingData,
  type NoteData,
} from './types';

// ─── Où poser ────────────────────────────────────────────────────────────────

export interface Placement {
  /** Null : annotation. */
  layerId: string | null;
  z: number;
}

/**
 * Calque qui reçoit un dessin ou un texte (option « Dans le calque ») : le calque actif, sinon
 * « Sol », sinon le plus haut ; jamais un calque verrouillé. Null : aucun (la carte n'a pas de
 * calques, ou tous sont verrouillés).
 */
export function drawingLayer(engine: MapEngine): LayerLike | null {
  const layers = engine.layersBottomUp();
  if (!layers.length) return null;
  const usable = (l: LayerLike | undefined): l is LayerLike => !!l && !l.locked;
  const active = engine.layer(engine.ui.getState().activeLayerId);
  if (usable(active)) return active;
  const ground = layers.find((l) => l.role === 'ground');
  if (usable(ground)) return ground;
  for (let i = layers.length - 1; i >= 0; i--) if (usable(layers[i])) return layers[i]!;
  return null;
}

/** `z` juste au-dessus des annotations. */
export function annotationTop(engine: MapEngine): number {
  let top = 0;
  for (const e of engine.annotationContent()) if (e.z > top) top = e.z;
  return top;
}

/** `z` juste au-dessus du contenu d'un calque. */
export function layerTop(engine: MapEngine, layerId: string): number {
  let top = 0;
  for (const e of engine.layerContent(layerId)) if (e.z > top) top = e.z;
  return top;
}

/** Calque et `z` de ce qu'on pose maintenant. */
export function placement(engine: MapEngine, target: DrawTarget): Placement {
  if (target === 'layer') {
    const layer = drawingLayer(engine);
    if (layer) return { layerId: layer.id, z: Math.floor(layerTop(engine, layer.id)) + 1 };
  }
  return { layerId: null, z: Math.floor(annotationTop(engine)) + 1 };
}

/** Le calque est masqué aux joueurs : rien de ce qui s'y passe ne part en direct public. */
export const isSecretLayer = (engine: MapEngine, layerId: string | null) =>
  !!layerId && engine.layer(layerId)?.visibleToPlayers === false;

// ─── Dessins ─────────────────────────────────────────────────────────────────

export type DrawingFields = Pick<
  DrawingData,
  'tool' | 'points' | 'color' | 'width' | 'fill' | 'closed' | 'smooth'
>;

/** Brouillon d'un dessin (identifiant provisoire, remplacé par celui du serveur). */
export function drawingDraft(
  engine: MapEngine,
  fields: DrawingFields,
  place: Placement,
  id = tempId(),
): DrawingData {
  return {
    id,
    version: 0,
    mapId: engine.store.getState().mapId,
    updatedAt: '',
    createdBy: engine.viewer.userId,
    layerId: place.layerId,
    z: place.z,
    ...fields,
  };
}

/** Pose un dessin : une commande annulable. */
export function createDrawing(rt: DrawingsRuntime, draft: DrawingData): Promise<boolean> {
  return rt.engine.execute(
    createCommand({
      label: translate('map.drawings.draw'),
      collection: DRAWINGS_COLLECTION,
      persistence: rt.drawings,
      items: [draft],
    }),
  );
}

/** Supprime des éléments d'une couche en une commande (gomme, effacer). */
function removeCommand<D extends MapDto>(
  label: string,
  collection: string,
  persistence: Persistence<D>,
  items: readonly D[],
): Command | null {
  return items.length ? deleteCommand({ label, collection, persistence, items }) : null;
}

/** Gomme : les dessins touchés disparaissent en une commande. */
export function eraseDrawings(rt: DrawingsRuntime, items: readonly DrawingData[]) {
  const cmd = removeCommand(translate('map.drawings.rub'), DRAWINGS_COLLECTION, rt.drawings, items);
  return cmd ? rt.engine.execute(cmd) : null;
}

/** Dessins de la carte que je peux effacer : les miens, ou tous (MJ). */
export function clearableDrawings(engine: MapEngine, scope: 'mine' | 'all'): DrawingData[] {
  const all = [...collectionOf(engine.store.getState(), DRAWINGS_COLLECTION).values()];
  const mine = (d: MapDto) => d.createdBy === engine.viewer.userId;
  if (scope === 'all' && engine.viewer.role === 'gm') return all as DrawingData[];
  return all.filter(mine) as DrawingData[];
}

/**
 * « Effacer mes dessins », « Tout effacer » (MJ, après confirmation) : une commande, donc
 * annulable (⌘Z les fait revenir), plutôt que `DELETE …/drawings` qui ne se défait pas.
 */
export async function clearDrawings(rt: DrawingsRuntime, scope: 'mine' | 'all'): Promise<boolean> {
  const engine = rt.engine;
  const items = clearableDrawings(engine, scope);
  if (!items.length) return false;
  if (scope === 'all') {
    const ok = await engine.confirm({
      title: translate('map.obstacles.clearAllTitle'),
      message: translate('map.drawings.eraseAllMessage', { count: items.length }),
      confirmLabel: translate('map.obstacles.clearAll'),
      danger: true,
    });
    if (!ok) return false;
  }
  const cmd = removeCommand(
    scope === 'all' ? translate('map.obstacles.clearAll') : translate('map.drawings.eraseMine'),
    DRAWINGS_COLLECTION,
    rt.drawings,
    items,
  );
  return cmd ? engine.execute(cmd) : false;
}

// ─── Textes ──────────────────────────────────────────────────────────────────

export type NoteFields = Pick<NoteData, 'text' | 'pos' | 'color' | 'fontSize' | 'fontFamily'>;

export function noteDraft(engine: MapEngine, fields: NoteFields, place: Placement): NoteData {
  return {
    id: tempId(),
    version: 0,
    mapId: engine.store.getState().mapId,
    updatedAt: '',
    createdBy: engine.viewer.userId,
    layerId: place.layerId,
    z: place.z,
    rotation: 0,
    ...fields,
    pos: { x: fields.pos.x, y: fields.pos.y },
  };
}

export function createNote(rt: DrawingsRuntime, draft: NoteData): Promise<boolean> {
  return rt.engine.execute(
    createCommand({
      label: translate('map.drawings.write'),
      collection: NOTES_COLLECTION,
      persistence: rt.notes,
      items: [draft],
    }),
  );
}

// ─── Modifier ────────────────────────────────────────────────────────────────

/**
 * Modifie des dessins ou des textes (couleur, épaisseur, taille…) en une commande ; seuls ceux
 * que je peux modifier sont touchés.
 */
export function updateItems(
  rt: DrawingsRuntime,
  label: string,
  entities: readonly MapEntity[],
  change: (data: MapDto) => MapDto,
): Promise<boolean> | null {
  const engine = rt.engine;
  const groups = new Map<string, { before: MapDto; after: MapDto }[]>();
  for (const e of entities) {
    if (e.kind.id !== DRAWING_KIND && e.kind.id !== NOTE_KIND) continue;
    if (!e.kind.can('move', e, engine.viewer)) continue;
    const after = change(e.data);
    if (after === e.data) continue;
    const list = groups.get(e.kind.collection) ?? [];
    list.push({ before: e.data, after });
    groups.set(e.kind.collection, list);
  }
  const cmds = [...groups.entries()].map(([collection, changes]) =>
    updateCommand({
      label,
      collection,
      persistence: (collection === NOTES_COLLECTION
        ? rt.notes
        : rt.drawings) as Persistence<MapDto>,
      changes,
    }),
  );
  return cmds.length ? engine.execute(groupCommands(label, cmds)) : null;
}

/** Remet des dessins et des textes rangés dans un calque en annotations (au-dessus de l'ombre). */
export function moveToAnnotations(engine: MapEngine, entities: readonly MapEntity[]) {
  const targets = entities.filter(
    (e) => e.kind.stacking?.optional && e.layerId !== null && e.kind.can('order', e, engine.viewer),
  );
  if (!targets.length || !engine.backend) return null;
  const top = Math.floor(annotationTop(engine));
  const sorted = [...targets].sort((a, b) => engine.compareStack(a, b));
  return engine.execute(
    arrangeCommand({
      label: translate('map.drawings.toAnnotation'),
      send: engine.backend.arrange,
      changes: sorted.map((e, i) => ({
        collection: e.kind.collection,
        kind: e.kind.stacking!.arrangeKind,
        before: e.data,
        after: engine.placed(e, null, top + 1 + i),
        from: { layerId: e.kind.stacking!.layerId.get(e.data), z: e.z },
        to: { layerId: null, z: top + 1 + i },
      })),
    }),
  );
}

/** Point du monde arrondi (charges plus courtes). */
export const roundPoint = (p: Point): Point => ({
  x: Math.round(p.x * 100) / 100,
  y: Math.round(p.y * 100) / 100,
});
