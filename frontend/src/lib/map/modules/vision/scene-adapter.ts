/**
 * Adaptateur contrat → `@vtt/vision` (docs/carte.md § 9) : ce que le magasin de la carte tient
 * (`MapObstacle`, `MapRoom`, `MapFogZone`, `MapLight`, `MapToken`, `MapObject`, calques)
 * devient les entrées des règles (`rules.ts`, miroir du serveur).
 *
 * Données du magasin telles que le serveur les rend : les champs absents prennent la valeur
 * par défaut du contrat, sans jamais inventer de visibilité.
 */
import { scenePixelsPerUnit, type MapGrid } from '@vtt/contracts';
import type { Vec } from '@vtt/vision';
import { displayOf } from '../../engine/planes';
import { collectionOf, type MapDto, type MapStoreState } from '../../store/map-store';
import type {
  FogZoneInput,
  GeometryInput,
  LightInput,
  ObjectVisibility,
  ObstacleInput,
  RoomInput,
  TokenVisibility,
  VisionObject,
  VisionToken,
} from './rules';

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const point = (v: unknown): Vec | null => {
  const p = v as { x?: unknown; y?: unknown } | null | undefined;
  return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null;
};

const points = (v: unknown): Vec[] =>
  Array.isArray(v) ? v.flatMap((p) => (point(p) ? [point(p)!] : [])) : [];

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export const OBSTACLE_KINDS = ['wall', 'one_way_wall', 'door', 'window'] as const;

export function obstacleInput(o: MapDto): ObstacleInput {
  const kind = OBSTACLE_KINDS.includes(o.kind as never)
    ? (o.kind as ObstacleInput['kind'])
    : 'wall';
  return {
    id: o.id,
    kind,
    points: points(o.points),
    blocksFrom: o.blocksFrom === 'right' ? 'right' : o.blocksFrom === 'left' ? 'left' : null,
    isOpen: o.isOpen === true,
    opacity: num(o.opacity, 1),
  };
}

export const roomInput = (r: MapDto): RoomInput => ({ id: r.id, points: points(r.points) });

export function fogZoneInput(z: MapDto): FogZoneInput {
  const shape = z.shape === 'circle' || z.shape === 'rect' ? z.shape : 'polygon';
  return {
    id: z.id,
    shape,
    mode: z.mode === 'clear' ? 'clear' : 'fog',
    points: points(z.points),
    center: point(z.center),
    radius: typeof z.radius === 'number' ? z.radius : null,
    order: num(z.order, 0),
  };
}

export const lightInput = (l: MapDto): LightInput => ({
  id: l.id,
  pos: point(l.pos) ?? { x: 0, y: 0 },
  radius: num(l.radius, 0),
  visible: l.visible !== false,
  falloff: num(l.falloff, 0.5),
  attachedTokenId: typeof l.attachedTokenId === 'string' ? l.attachedTokenId : null,
});

/** Tout ce dont la géométrie dépend, lu dans le magasin. */
export function geometryInput(state: MapStoreState): GeometryInput {
  const scene = state.scene;
  return {
    width: typeof scene?.width === 'number' ? scene.width : null,
    height: typeof scene?.height === 'number' ? scene.height : null,
    fogFull: scene?.fogFull === true,
    display: displayOf(scene),
    obstacles: [...collectionOf(state, 'obstacles').values()].map(obstacleInput),
    rooms: [...collectionOf(state, 'rooms').values()].map(roomInput),
    fogZones: [...collectionOf(state, 'fogZones').values()].map(fogZoneInput),
  };
}

/**
 * Clé de la géométrie : les couches sont des `Map` immuables (même référence : rien n'a
 * changé), la scène compte par ses seuls champs utiles.
 */
export function geometryKey(state: MapStoreState): readonly unknown[] {
  const scene = state.scene;
  return [
    scene?.width ?? null,
    scene?.height ?? null,
    scene?.fogFull === true,
    displayOf(scene).obstacles !== false,
    collectionOf(state, 'obstacles'),
    collectionOf(state, 'rooms'),
    collectionOf(state, 'fogZones'),
  ];
}

export const sameKey = (a: readonly unknown[] | null, b: readonly unknown[]) =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i]);

/** Calques masqués aux joueurs. */
export function hiddenLayers(state: MapStoreState): Set<string> {
  const out = new Set<string>();
  for (const l of collectionOf(state, 'layers').values())
    if (l.visibleToPlayers === false) out.add(l.id);
  return out;
}

/** Échelle de la carte : case de la scène (grille de jeu, sinon `map_settings`), comme le serveur. */
export function scaleOf(state: MapStoreState) {
  const s = state.settings;
  return {
    pixelsPerUnit: scenePixelsPerUnit(
      state.scene as { grids?: MapGrid[] } | null,
      s as { pixelsPerUnit?: number } | null,
    ),
    tokenScale: num(s?.tokenScale, 1) > 0 ? num(s?.tokenScale, 1) : 1,
  };
}

/** Token du contrat vu par les règles, à la position donnée (direct, aperçu). */
export function visionToken(
  t: MapDto,
  pos: Vec | null,
  playerCharacters: ReadonlySet<string>,
): VisionToken {
  const characterId = typeof t.characterId === 'string' ? t.characterId : '';
  const visibility = (
    ['visible', 'hidden', 'ally', 'custom', 'invisible'].includes(t.visibility as string)
      ? t.visibility
      : 'visible'
  ) as TokenVisibility;
  return {
    id: t.id,
    characterId,
    pos: pos ?? point(t.pos) ?? { x: 0, y: 0 },
    scale: num(t.scale, 1),
    visionRadius: num(t.visionRadius, 0),
    visibility,
    visibleTo: ids(t.visibleTo),
    layerId: typeof t.layerId === 'string' ? t.layerId : null,
    playerSide: playerCharacters.has(characterId),
  };
}

/**
 * Objet du contrat vu par les règles ; `rect` (centre, taille, rotation de l'entité affichée)
 * remplace sa géométrie pendant un geste.
 */
export function visionObject(
  o: MapDto,
  rect: { x: number; y: number; width: number; height: number; rotation: number } | null,
): VisionObject {
  const pos = point(o.pos) ?? { x: 0, y: 0 };
  const width = rect ? rect.width : num(o.width, 0);
  const height = rect ? rect.height : num(o.height, 0);
  return {
    id: o.id,
    kind: typeof o.kind === 'string' ? o.kind : 'decor',
    pos: rect ? { x: rect.x - rect.width / 2, y: rect.y - rect.height / 2 } : pos,
    width,
    height,
    rotation: rect ? rect.rotation : num(o.rotation, 0),
    visibility: (['visible', 'hidden', 'custom'].includes(o.visibility as string)
      ? o.visibility
      : 'visible') as ObjectVisibility,
    visibleTo: ids(o.visibleTo),
    layerId: typeof o.layerId === 'string' ? o.layerId : null,
  };
}
