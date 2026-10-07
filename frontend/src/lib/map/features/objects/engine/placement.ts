/**
 * Pose et retouches des objets (docs/carte.md § 10, Objets) : ce que la bibliothèque, l'outil
 * « Objets » (I), le menu et l'inspecteur écrivent. Tout passe par des commandes du moteur :
 * optimistes, annulables, une seule par geste.
 *
 * - Pose : un brouillon complet (rendu tout de suite), centré sur le point visé, aimanté à la
 *   grille comme un glisser (Alt : sans), dans le calque actif ou celui des objets, en haut de
 *   sa pile. Taille par défaut : une case sur le petit côté, l'autre selon les proportions de
 *   l'image (bornées à 6 cases).
 * - Retouches : agrandir, rétrécir, remettre à une case, changer de sorte, rendre fouillable,
 *   et tout champ de l'inspecteur (une commande par modification validée).
 */
import { translate } from '@/i18n/runtime';
import type { MapObjectKind } from '@vtt/contracts';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { EntityGeometry, Point } from '@/lib/map/engine/geometry';
import { snapGeometryToGrid, type GridSpec } from '@/lib/map/engine/interaction/snapping';
import { zOnTop } from '@/lib/map/engine/layers';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { createCommand, tempId, updateCommand } from '@/lib/map/store/commands';
import type { Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import { imageAspect } from './object-view';
import {
  DECOR_KIND_ID,
  DEFAULT_SEARCH_RADIUS,
  OBJECT_KIND_ID,
  OBJECTS_COLLECTION,
  type ObjectData,
} from './types';

/** Ce que la bibliothèque propose de poser : un modèle, une image envoyée, une zone sans image. */
export interface ObjectSource {
  /** Identifiant stable dans la bibliothèque (`template:<id>`, `upload:<url>`, `zone`). */
  key: string;
  name: string;
  /** Adresse de l'image ; vide : zone sans image (vue du MJ seulement, repère de fouille). */
  imageUrl: string;
  kind: MapObjectKind;
  /** Largeur / hauteur de l'image, si elle est connue. */
  aspect?: number | null;
  /** Posé déjà « à fouiller » (zone). */
  searchable?: boolean;
}

/** Zone à fouiller sans image, à poser sur un coffre peint dans le fond de la carte. */
export const ZONE_SOURCE: ObjectSource = {
  key: 'zone',
  /** Lu à l'usage : traduire au chargement du module casse le rendu serveur. */
  get name() {
    return translate('map.objects.library.searchZone');
  },
  imageUrl: '',
  kind: 'item',
  aspect: 1,
  searchable: true,
};

/** Proportions extrêmes acceptées pour la taille par défaut (une bannière, une colonne). */
export const MAX_ASPECT = 6;

/** Taille par défaut : une case sur le petit côté, l'autre selon les proportions de l'image. */
export function defaultObjectSize(
  pixelsPerUnit: number,
  aspect?: number | null,
): { width: number; height: number } {
  const cell = pixelsPerUnit > 0 ? pixelsPerUnit : 50;
  const a =
    aspect && Number.isFinite(aspect) && aspect > 0
      ? Math.min(MAX_ASPECT, Math.max(1 / MAX_ASPECT, aspect))
      : 1;
  return a >= 1 ? { width: cell * a, height: cell } : { width: cell, height: cell / a };
}

/** Centre de l'objet posé en ce point : aimanté comme un glisser (`grid` nul : tel quel). */
export function placementCenter(
  world: Point,
  size: { width: number; height: number },
  grid: GridSpec | null,
): Point {
  if (!grid) return { x: world.x, y: world.y };
  return snapGeometryToGrid({ x: world.x, y: world.y, ...size, rotation: 0 }, grid);
}

export interface DraftOptions {
  mapId: string;
  pixelsPerUnit: number;
  grid: GridSpec | null;
  /** Calque d'accueil ; null : celui des objets, choisi par le serveur. */
  layerId: string | null;
  z: number;
}

/** Brouillon complet d'un objet posé (identifiant provisoire, remplacé par celui du serveur). */
export function objectDraft(source: ObjectSource, world: Point, opts: DraftOptions): ObjectData {
  const size = defaultObjectSize(opts.pixelsPerUnit, source.aspect);
  const c = placementCenter(world, size, opts.grid);
  const draft = {
    id: tempId(),
    mapId: opts.mapId,
    version: 0,
    updatedAt: new Date(0).toISOString(),
    name: source.name.trim().slice(0, 200),
    kind: source.kind,
    imageUrl: source.imageUrl,
    pos: { x: c.x - size.width / 2, y: c.y - size.height / 2 },
    width: size.width,
    height: size.height,
    rotation: 0,
    z: opts.z,
    isLocked: false,
    visibility: 'visible',
    visibleTo: [],
    notes: null,
    items: [],
    linkedId: null,
    groupEntityId: null,
    searchable: source.searchable === true,
    searchRadius: DEFAULT_SEARCH_RADIUS,
  } as unknown as ObjectData;
  if (opts.layerId) draft.layerId = opts.layerId;
  return draft;
}

/** Persistance des objets (partagée par les sortes « objet » et « décor »). */
export function objectsPersistence(engine: MapEngine): Persistence<MapDto> | null {
  const kind = engine.kinds.get(OBJECT_KIND_ID) ?? engine.kinds.get(DECOR_KIND_ID);
  return kind?.persistence ?? null;
}

/**
 * Pose un objet en ce point (commande annulable « Poser un objet ») et le sélectionne. Renvoie
 * l'identifiant provisoire, ou null si les objets ne sont pas chargés.
 */
export function placeObject(
  engine: MapEngine,
  source: ObjectSource,
  world: Point,
  opts: { snap: boolean },
): string | null {
  const persistence = objectsPersistence(engine);
  if (!persistence?.create) return null;
  const layerId = engine.targetLayer('objects');
  const z = layerId ? zOnTop(engine.layerContent(layerId), 1)[0]! : 0;
  const draft = objectDraft(source, world, {
    mapId: engine.store.getState().mapId,
    pixelsPerUnit: engine.kindContext().pixelsPerUnit,
    grid: engine.snapGrid(!opts.snap),
    layerId,
    z,
  });
  void engine.execute(
    createCommand({
      label: translate('map.objects.place'),
      collection: OBJECTS_COLLECTION,
      persistence,
      items: [draft],
    }),
  );
  engine.selection.replace([draft.id]);
  return draft.id;
}

/** Entités de la sélection qui sont des objets (ou des décors). */
export const isObjectEntity = (e: MapEntity) =>
  e.kind.id === OBJECT_KIND_ID || e.kind.id === DECOR_KIND_ID;

/**
 * Modifie des objets en une commande (verrou, fouille, contenu, nom…). `patch` rend la donnée
 * modifiée ; une donnée inchangée n'est pas envoyée.
 */
export function updateObjects(
  engine: MapEngine,
  label: string,
  entities: readonly MapEntity[],
  patch: (o: ObjectData) => ObjectData,
): Promise<boolean> | null {
  const persistence = objectsPersistence(engine);
  if (!persistence) return null;
  const changes = entities
    .filter(isObjectEntity)
    .map((e) => ({ before: e.data, after: patch(e.data as ObjectData) as MapDto }))
    .filter((c) => c.after !== c.before);
  if (!changes.length) return null;
  return engine.execute(
    updateCommand({ label, collection: OBJECTS_COLLECTION, persistence, changes }),
  );
}

/** Objets qu'on peut retailler (MJ, non verrouillés). */
const resizable = (engine: MapEngine, entities: readonly MapEntity[]) =>
  entities.filter(
    (e) => isObjectEntity(e) && !e.state.locked && e.kind.can('resize', e, engine.viewer),
  );

/** Agrandir (× 1,25) ou rétrécir (× 0,8), autour du centre de chacun. */
export function scaleObjects(engine: MapEngine, entities: readonly MapEntity[], factor: number) {
  const minSize = 8;
  const changes = resizable(engine, entities).map((e) => {
    const g = e.geometry;
    const k = Math.max(factor, minSize / Math.max(1, Math.min(g.width, g.height)));
    return { entity: e, next: { ...g, width: g.width * k, height: g.height * k } };
  });
  return engine.transformEntities(
    changes,
    factor > 1 ? translate('map.objects.enlarge') : translate('map.objects.shrink'),
  );
}

/** Taille par défaut : une case sur le petit côté, proportions de l'image (ou actuelles). */
export function fitObjects(engine: MapEngine, entities: readonly MapEntity[]) {
  const ppu = engine.kindContext().pixelsPerUnit;
  const changes = resizable(engine, entities).map((e) => {
    const g = e.geometry;
    const aspect = imageAspect(e) ?? (g.height > 0 ? g.width / g.height : 1);
    const size = defaultObjectSize(ppu, aspect);
    return { entity: e, next: { ...g, ...size } satisfies EntityGeometry };
  });
  return engine.transformEntities(changes, translate('map.objects.oneSquareSize'));
}

/** Rendre fouillable ou non. */
export function setSearchable(engine: MapEngine, entities: readonly MapEntity[], on: boolean) {
  return updateObjects(
    engine,
    on ? translate('map.objects.makeSearchable') : translate('map.objects.unsearchable'),
    entities,
    (o) => (o.searchable === on ? o : { ...o, searchable: on }),
  );
}

/**
 * Change de sorte (objet, arme, décor). Passer de « décor » à « objet » change de sorte
 * d'entité : la sélection et l'inspecteur sont rétablis sur les mêmes éléments.
 */
export function setObjectKind(
  engine: MapEngine,
  entities: readonly MapEntity[],
  kind: MapObjectKind,
) {
  const ids = entities.map((e) => e.id);
  const inspector = engine.ui.getState().inspector;
  const result = updateObjects(engine, translate('map.objects.changeKind'), entities, (o) =>
    o.kind === kind ? o : { ...o, kind },
  );
  const alive = ids.filter((id) => engine.entity(id));
  if (alive.length) engine.selection.replace(alive);
  if (inspector && alive.length && !engine.ui.getState().inspector)
    engine.openInspector(inspector.filter((id) => engine.entity(id)));
  return result;
}
