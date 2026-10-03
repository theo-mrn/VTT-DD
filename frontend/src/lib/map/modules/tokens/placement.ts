/**
 * Pose de PNJ depuis la bibliothèque (docs/carte.md § 10) : N exemplaires en grille serrée
 * autour du point, en **un** appel (`POST …/npcs`), avec des fantômes tout de suite (brouillons
 * optimistes), remplacés par les tokens du serveur. Échec : les fantômes disparaissent et un
 * message clair s'affiche (commande du moteur).
 */
import type { CreateMapNpcs, MapTokenShape, MapTokenVisibility } from '@vtt/contracts';
import type { KindContext } from '../../engine/entities/entity-kind';
import { snapGeometryToGrid, type GridSpec } from '../../engine/interaction/snapping';
import type { Point } from '../../engine/geometry';
import { tempId } from '../../store/commands';
import { placeNpcsCommand } from './commands';
import { cellSize, clampCount, DEFAULT_VISION_RADIUS, gridAround, type TokenData } from './model';
import type { LibraryState, PlacementSource, TokensState } from './state';

export interface PlacementPlan {
  body: CreateMapNpcs;
  drafts: TokenData[];
  /** Centre de la grille (aimanté). */
  center: Point;
}

/**
 * Centre de la pose : aimanté pour que le premier exemplaire tombe au centre d'une case
 * (comme un token qu'on glisse), sauf sans grille ou avec Alt.
 */
export function snapPlacement(
  world: Point,
  count: number,
  ctx: Pick<KindContext, 'pixelsPerUnit' | 'tokenScale'>,
  grid: GridSpec | null,
): Point {
  if (!grid) return { x: world.x, y: world.y };
  const step = cellSize(ctx);
  const first = gridAround(world, count, step)[0]!;
  const snapped = snapGeometryToGrid(
    { x: first.x, y: first.y, width: step, height: step, rotation: 0 },
    grid,
  );
  return { x: world.x + (snapped.x - first.x), y: world.y + (snapped.y - first.y) };
}

/** Corps de l'appel et brouillons (fantômes) d'une pose, sans rien écrire. */
export function planPlacement(o: {
  source: PlacementSource;
  count: number;
  side: LibraryState['side'];
  visibility: MapTokenVisibility;
  shape: MapTokenShape;
  center: Point;
  ctx: Pick<KindContext, 'pixelsPerUnit' | 'tokenScale'>;
  mapId: string;
  layerId: string | null;
  /** `z` au-dessus de la pile du calque. */
  z: number;
}): PlacementPlan {
  const count = clampCount(o.count);
  const center = { x: Math.round(o.center.x * 100) / 100, y: Math.round(o.center.y * 100) / 100 };
  const places = gridAround(center, count, cellSize(o.ctx));
  const drafts: TokenData[] = places.map((pos, i) => ({
    id: tempId(),
    version: 0,
    mapId: o.mapId,
    characterId: `draft:${o.source.key}:${i}`,
    layerId: o.layerId ?? '',
    z: o.z + i,
    pos,
    scale: 1,
    shape: o.shape,
    imageUrl: o.source.imageUrl,
    visibility: o.visibility,
    visibleTo: [],
    visionRadius: DEFAULT_VISION_RADIUS,
    visionBoost: false,
    notes: null,
    audio: null,
    interactions: null,
    updatedAt: '',
    draft: {
      name: count > 1 && i > 0 ? `${o.source.name} ${i + 1}` : o.source.name,
      imageUrl: o.source.imageUrl,
      side: o.side,
    },
  }));
  return {
    center,
    drafts,
    body: {
      source: o.source.source,
      count,
      pos: center,
      side: o.side,
      visibility: o.visibility,
      shape: o.shape,
      ...(o.layerId ? { layerId: o.layerId } : {}),
    },
  };
}

/** `z` au-dessus de tout ce que contient le calque. */
function topZ(tokens: TokensState, layerId: string | null): number {
  if (!layerId) return 0;
  let z = 0;
  for (const e of tokens.engine.layerContent(layerId)) z = Math.max(z, e.z + 1);
  return z;
}

/**
 * Pose la source armée au point du monde (clic sur la carte, ou dépôt d'une carte de la
 * bibliothèque). Renvoie la promesse de la commande, ou null si rien n'est armé.
 */
export function placeArmed(
  tokens: TokensState,
  world: Point,
  opts: { snap?: boolean; keepArmed?: boolean } = {},
): Promise<boolean> | null {
  const lib = tokens.library.getState();
  const source = lib.armed;
  if (!source || lib.placing) return null;
  const engine = tokens.engine;
  const ctx = engine.kindContext();
  const count = clampCount(lib.count);
  const center = snapPlacement(world, count, ctx, engine.snapGrid(opts.snap === false));
  // Le calque actif s'il y en a un, sinon « Personnages » (comme les objets) : envoyé au service,
  // et les fantômes y sont aussi, pour ne pas changer de calque à la réponse
  const layerId = engine.targetLayer('tokens');
  const { body, drafts } = planPlacement({
    source,
    count,
    side: lib.side,
    visibility: lib.visibility,
    shape: lib.shape,
    center,
    ctx,
    mapId: engine.store.getState().mapId,
    layerId,
    z: topZ(tokens, layerId),
  });
  const label = count > 1 ? `Poser ${count} × ${source.name}` : `Poser ${source.name}`;
  tokens.library.setState({ placing: true, armed: opts.keepArmed ? source : null });
  const result = engine.execute(placeNpcsCommand({ label, api: tokens.api, body, drafts }));
  // Les nouveaux tokens sont sélectionnés (la sélection suit leurs identifiants définitifs)
  engine.selection.replace(drafts.map((d) => d.id));
  return result.finally(() => tokens.library.setState({ placing: false }));
}
