/**
 * Composeur de pack (docs/marketplace.md § 4.1) : ce que le créateur a choisi dans une de ses
 * campagnes → `PackContent`. Fonctions pures : le composant lit les scènes et les modèles par
 * les routes existantes, puis appelle `buildPack`.
 *
 * Rien de propre à la campagne ne part : ni jetons, ni brouillard, ni dessins, ni notes, ni
 * zones sonores, ni calques (les objets gardent leur ordre d'empilement), ni lumière attachée à
 * un jeton, ni personnages autorisés.
 */
import {
  PACK_FORMAT,
  type MapLight,
  type MapObject,
  type MapObstacle,
  type MapRoom,
  type MapSnapshot,
  type PackContentInput,
} from '@vtt/contracts';

export interface SourceNpcTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  tokenUrl: string | null;
  actions: { name: string; description: string; toHit: number }[];
  /** EtatEntite du système de la campagne ; null : illisible, le modèle est écarté. */
  etat: Record<string, unknown> | null;
}

export interface SourceObjectTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
}

export interface PackSource {
  /** Système de la campagne d'origine (celui des modèles de PNJ). */
  systemId: string | null;
  scenes: MapSnapshot[];
  npcTemplates: SourceNpcTemplate[];
  objectTemplates: SourceObjectTemplate[];
}

const HTTP = /^https?:\/\//;
const ref = (prefix: string, i: number) => `${prefix}${i + 1}`;

function obstacle(o: MapObstacle) {
  return {
    kind: o.kind,
    points: o.points,
    blocksFrom: o.blocksFrom,
    isOpen: o.isOpen,
    isLocked: o.isLocked,
    color: o.color,
    opacity: o.opacity,
    roomMode: o.roomMode,
  };
}

function light(l: MapLight) {
  return {
    name: l.name,
    pos: l.pos,
    radius: l.radius,
    visible: l.visible,
    color: l.color,
    intensity: l.intensity,
    falloff: l.falloff,
  };
}

function room(r: MapRoom) {
  return { name: r.name, points: r.points };
}

/** Objet posé, `z` = sa place dans l'empilement de toute la scène (calques aplatis). */
function object(o: MapObject, z: number) {
  return {
    name: o.name,
    kind: o.kind,
    imageUrl: o.imageUrl,
    pos: o.pos,
    width: o.width,
    height: o.height,
    rotation: o.rotation,
    z,
    isLocked: o.isLocked,
    // Les personnages autorisés ne suivent pas : un objet réservé devient caché
    visibility: o.visibility === 'custom' ? ('hidden' as const) : o.visibility,
    notes: o.notes,
    items: o.items,
    searchable: o.searchable,
    searchRadius: o.searchRadius,
  };
}

/** Objets dans l'ordre d'affichage : calque (du bas vers le haut), puis `z`. */
export function stackedObjects(snapshot: Pick<MapSnapshot, 'layers' | 'objects'>): MapObject[] {
  const order = new Map(snapshot.layers.map((l) => [l.id, l.sortOrder]));
  return [...snapshot.objects].sort(
    (a, b) => (order.get(a.layerId) ?? 0) - (order.get(b.layerId) ?? 0) || a.z - b.z,
  );
}

export function buildPack(source: PackSource): PackContentInput {
  const npcs = source.npcTemplates.filter((t) => t.etat !== null);
  return {
    format: PACK_FORMAT,
    systemId: npcs.length ? source.systemId : null,
    scenes: source.scenes.map((s, i) => ({
      ref: ref('s', i),
      scene: {
        name: s.map.name,
        description: s.map.description,
        backgroundUrl: s.map.backgroundUrl,
        width: s.map.width,
        height: s.map.height,
        weather: s.map.weather,
        display: s.map.display,
        fogFull: s.map.fogFull,
        grids: s.map.grids,
        spawn: s.map.spawn,
      },
      obstacles: s.obstacles.map(obstacle),
      lights: s.lights.filter((l) => !l.attachedTokenId).map(light),
      rooms: s.rooms.map(room),
      objects: stackedObjects(s).map((o, z) => object(o, z)),
    })),
    npcTemplates: npcs.map((t, i) => ({
      ref: ref('n', i),
      name: t.name,
      imageUrl: t.imageUrl && HTTP.test(t.imageUrl) ? t.imageUrl : null,
      tokenUrl: t.tokenUrl && HTTP.test(t.tokenUrl) ? t.tokenUrl : null,
      actions: t.actions,
      etat: t.etat!,
    })),
    objectTemplates: source.objectTemplates.map((t, i) => ({
      ref: ref('o', i),
      name: t.name,
      imageUrl: t.imageUrl && HTTP.test(t.imageUrl) ? t.imageUrl : null,
      category: t.category,
    })),
  };
}

/**
 * Retire du pack les adresses refusées par le service (autre site, fichier disparu) : fond,
 * image d'objet ou de modèle vidés, le reste gardé.
 */
export function withoutUrls(pack: PackContentInput, refused: readonly string[]): PackContentInput {
  const bad = new Set(refused);
  const keep = (u: string | null | undefined) => (u && bad.has(u) ? null : (u ?? null));
  return {
    ...pack,
    scenes: (pack.scenes ?? []).map((s) => ({
      ...s,
      scene: { ...s.scene, backgroundUrl: keep(s.scene.backgroundUrl) },
      objects: (s.objects ?? []).map((o) => ({
        ...o,
        ...(o.imageUrl && bad.has(o.imageUrl) ? { imageUrl: '' } : {}),
        ...(o.items
          ? {
              items: o.items.map(({ imageUrl, ...item }) =>
                imageUrl && !bad.has(imageUrl) ? { ...item, imageUrl } : item,
              ),
            }
          : {}),
      })),
    })),
    npcTemplates: (pack.npcTemplates ?? []).map((t) => ({
      ...t,
      imageUrl: keep(t.imageUrl),
      tokenUrl: keep(t.tokenUrl),
    })),
    objectTemplates: (pack.objectTemplates ?? []).map((t) => ({
      ...t,
      imageUrl: keep(t.imageUrl),
    })),
  };
}
