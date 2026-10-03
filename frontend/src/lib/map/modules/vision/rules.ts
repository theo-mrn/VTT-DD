/**
 * Règles de visibilité de la carte sur `@vtt/vision` (docs/carte.md § 9) : conversion des
 * éléments de la carte en scène de visibilité, observateurs d'un joueur, et ce qu'il voit
 * (tokens, objets). Miroir exact du serveur
 * (`backend/campaign/src/modules/maps/vision-rules.ts`) : mêmes entrées, mêmes réponses, mêmes
 * tests. Ce qui est affiché est donc ce qui est envoyé.
 *
 * Ce qu'un joueur voit :
 * - ses observateurs : ses tokens (possédés ou incarnés, sauf `invisible`) et les tokens `ally`
 *   hors d'un calque masqué ; rayon `visionRadius` tel qu'enregistré (déjà triplé par
 *   « Vision augmentée ») ;
 * - `Vu(joueur) = ⋃ Vu(O)` (paquet `@vtt/vision`) ; un token `hidden` n'est vu que dans un rayon
 *   de vision ou une zone éclairée : même formule sur la scène entièrement sous le brouillard ;
 * - sans observateur sur la carte (spectateur, personnage ailleurs) : vue « d'en haut », hors
 *   du brouillard et des pièces fermées, plus les zones éclairées ; aucune ombre de mur ;
 * - réglage d'affichage `obstacles: false` (MJ) : murs et pièces sans effet, comme avant.
 */
import {
  inFog,
  innermostRoom,
  playerView,
  pointInPolygon,
  sampleCircle,
  sampleRect,
  segmentsFromPolyline,
  type FogZone,
  type Light,
  type LightArea,
  type PreparedScene,
  type Room,
  type Segment,
  type Vec,
  type View,
  type Viewer,
  type VisionScene,
} from '@vtt/vision';
import { compareCodeUnits } from '@vtt/contracts';

/** Taille de la carte tant que son fond n'est pas connu (la vue y est bornée). */
export const DEFAULT_MAP_SIZE = 100_000;

export type TokenVisibility = 'visible' | 'hidden' | 'ally' | 'custom' | 'invisible';
export type ObjectVisibility = 'visible' | 'hidden' | 'custom';

// ─── Scène ───────────────────────────────────────────────────────────────────

export interface ObstacleInput {
  readonly id: string;
  readonly kind: 'wall' | 'one_way_wall' | 'door' | 'window';
  readonly points: readonly Vec[];
  readonly blocksFrom: 'left' | 'right' | null;
  readonly isOpen: boolean;
  readonly opacity: number;
}

export interface RoomInput {
  readonly id: string;
  readonly points: readonly Vec[];
}

export interface FogZoneInput {
  readonly id: string;
  readonly shape: 'circle' | 'rect' | 'polygon';
  readonly mode: 'fog' | 'clear';
  readonly points: readonly Vec[];
  readonly center: Vec | null;
  readonly radius: number | null;
  readonly order: number;
}

export interface LightInput {
  readonly id: string;
  readonly pos: Vec;
  /** En unités de jeu (× `pixelsPerUnit`). */
  readonly radius: number;
  /** Allumée. */
  readonly visible: boolean;
  readonly falloff: number;
  readonly attachedTokenId: string | null;
}

/** Ce dont la géométrie de la visibilité dépend (hors lumières et observateurs). */
export interface GeometryInput {
  readonly width: number | null | undefined;
  readonly height: number | null | undefined;
  readonly fogFull: boolean;
  /** Réglage d'affichage (`map.display`) : `obstacles: false` coupe murs et pièces. */
  readonly display: Readonly<Record<string, unknown>> | null | undefined;
  readonly obstacles: readonly ObstacleInput[];
  readonly rooms: readonly RoomInput[];
  readonly fogZones: readonly FogZoneInput[];
}

const positive = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** Bornes de la vue : la taille du fond, sinon une très grande carte. */
export function mapBounds(width: number | null | undefined, height: number | null | undefined) {
  const w = positive(width);
  const h = positive(height);
  return w && h ? { width: w, height: h } : { width: DEFAULT_MAP_SIZE, height: DEFAULT_MAP_SIZE };
}

/** Occlusion active (murs et pièces) : réglage d'affichage `obstacles` non désactivé. */
export const occlusionOn = (display: GeometryInput['display']) => display?.obstacles !== false;

/** Segments d'un obstacle (ligne brisée du contrat). */
export function obstacleSegments(o: ObstacleInput): Segment[] {
  return segmentsFromPolyline(
    {
      id: o.id,
      kind: o.kind,
      open: o.isOpen,
      blocksFrom: o.blocksFrom ?? 'left',
      opacity: o.opacity,
    },
    o.points,
  );
}

/** Zones de brouillard dans l'ordre d'application (`order` croissant). */
export function fogZonesOf(zones: readonly FogZoneInput[]): FogZone[] {
  const out: FogZone[] = [];
  for (const z of [...zones].sort((a, b) => a.order - b.order)) {
    if (z.shape === 'circle') {
      if (!z.center || !(typeof z.radius === 'number' && z.radius > 0)) continue;
      out.push({ id: z.id, mode: z.mode, shape: 'circle', center: z.center, radius: z.radius });
    } else if (z.points.length >= 3) {
      out.push({ id: z.id, mode: z.mode, shape: z.shape, points: z.points });
    }
  }
  return out;
}

/** Scène de visibilité sans lumières (celles-ci passent par `withLights`). */
export function geometryScene(input: GeometryInput): VisionScene {
  const occlusion = occlusionOn(input.display);
  return {
    bounds: mapBounds(input.width, input.height),
    segments: occlusion ? input.obstacles.flatMap(obstacleSegments) : [],
    rooms: occlusion
      ? input.rooms.map((r): Room => ({ id: r.id, points: r.points }))
      : ([] as Room[]),
    fogFull: input.fogFull,
    fogZones: fogZonesOf(input.fogZones),
  };
}

/** Même scène, toute sous le brouillard : pour les tokens `hidden` (rayon de vision ou lumière). */
export const foggedScene = (scene: VisionScene): VisionScene => ({
  ...scene,
  fogFull: true,
  fogZones: [],
});

/**
 * Lumières en pixels du monde : rayon × `pixelsPerUnit` ; une lumière attachée à un token
 * présent sur la carte est là où il est.
 */
export function lightsOf(
  lights: readonly LightInput[],
  tokenPos: (tokenId: string) => Vec | undefined,
  pixelsPerUnit: number,
): Light[] {
  return lights.map((l) => ({
    id: l.id,
    pos: (l.attachedTokenId ? tokenPos(l.attachedTokenId) : undefined) ?? l.pos,
    radius: Math.max(0, l.radius) * pixelsPerUnit,
    falloff: l.falloff,
    on: l.visible,
  }));
}

/** Clé d'un jeu de lumières (même clé : `withLights` inutile). */
export const lightsKey = (lights: readonly Light[]) =>
  lights
    .map((l) => `${l.id}:${l.pos.x},${l.pos.y}:${l.radius}:${l.on ? 1 : 0}:${l.falloff ?? 0}`)
    .join('|');

// ─── Entités ─────────────────────────────────────────────────────────────────

export interface VisionToken {
  readonly id: string;
  readonly characterId: string;
  /** Centre du token. */
  readonly pos: Vec;
  readonly scale: number;
  /** En pixels du monde, tel qu'enregistré (déjà triplé par « Vision augmentée »). */
  readonly visionRadius: number;
  readonly visibility: TokenVisibility;
  readonly visibleTo: readonly string[];
  readonly layerId: string | null;
  /** Personnage du camp des joueurs : toujours vu (sauf `invisible` ou calque masqué). */
  readonly playerSide: boolean;
}

export interface VisionObject {
  readonly id: string;
  readonly kind: string;
  /** Coin haut gauche avant rotation. */
  readonly pos: Vec;
  readonly width: number;
  readonly height: number;
  /** Degrés, autour du centre. */
  readonly rotation: number;
  readonly visibility: ObjectVisibility;
  readonly visibleTo: readonly string[];
  readonly layerId: string | null;
}

/** Membre non MJ et les personnages qu'il possède ou incarne. */
export interface VisionMember {
  readonly userId: string;
  readonly characterIds: readonly string[];
}

/** Rayon d'échantillonnage d'un token : la moitié de `pixelsPerUnit × scale × tokenScale`. */
export const tokenRadius = (
  t: Pick<VisionToken, 'scale'>,
  pixelsPerUnit: number,
  tokenScale: number,
) => 0.5 * pixelsPerUnit * (Number.isFinite(t.scale) && t.scale > 0 ? t.scale : 1) * tokenScale;

/** Le token est-il un observateur de ce joueur ? */
export function isObserver(
  t: VisionToken,
  characterIds: readonly string[],
  hiddenLayers: ReadonlySet<string>,
): boolean {
  if (t.visibility === 'invisible') return false;
  if (characterIds.includes(t.characterId)) return true;
  return t.visibility === 'ally' && !(t.layerId && hiddenLayers.has(t.layerId));
}

export interface MapVisionOptions {
  /** Scène avec ses lumières. */
  readonly prep: PreparedScene;
  /** Même scène toute sous le brouillard (tokens `hidden`), calculée à la demande. */
  readonly fogged: () => PreparedScene;
  readonly tokens: readonly VisionToken[];
  readonly hiddenLayers: ReadonlySet<string>;
  readonly pixelsPerUnit: number;
  readonly tokenScale: number;
  /** Vu(joueur) (défaut `playerView`) : le client y met des vues par observateur gardées. */
  readonly view?: (prep: PreparedScene, observers: readonly Viewer[]) => View;
}

/** Visibilité d'une carte : une vue par joueur, calculée à la demande et gardée. */
export class MapVision {
  private readonly members = new Map<string, MemberVision>();
  constructor(readonly opts: MapVisionOptions) {}

  get tokens() {
    return this.opts.tokens;
  }

  /** Ce que voit ce joueur (clé : ses personnages). */
  forMember(member: VisionMember): MemberVision {
    const key = `${member.userId}:${[...member.characterIds].sort(compareCodeUnits).join(',')}`;
    let m = this.members.get(key);
    if (!m) {
      m = new MemberVision(this, member.characterIds);
      this.members.set(key, m);
    }
    return m;
  }

  inHiddenLayer(layerId: string | null) {
    return !!layerId && this.opts.hiddenLayers.has(layerId);
  }

  tokenSamples(t: VisionToken) {
    return sampleCircle(t.pos, tokenRadius(t, this.opts.pixelsPerUnit, this.opts.tokenScale));
  }
}

/** Échantillons vus « d'en haut » (sans observateur) : hors pièces fermées, hors brouillard ou éclairés. */
function topDownSees(
  prep: PreparedScene,
  lights: readonly LightArea[],
  samples: Float64Array,
  litOnly: boolean,
): boolean {
  for (let i = 0; i + 1 < samples.length; i += 2) {
    const p = { x: samples[i]!, y: samples[i + 1]! };
    if (innermostRoom(prep, p, { closedOnly: true })) continue;
    if (!litOnly && !inFog(prep, p)) return true;
    for (const l of lights) {
      const dx = p.x - l.center.x;
      const dy = p.y - l.center.y;
      if (dx * dx + dy * dy <= l.radius * l.radius && pointInPolygon(p, l.polygon)) return true;
    }
  }
  return false;
}

/** Ce qu'un joueur voit sur une carte. */
export class MemberVision {
  readonly observers: readonly Viewer[];
  private viewCache: View | null = null;
  private hiddenCache: View | null = null;
  private lightsCache: readonly LightArea[] | null = null;

  constructor(
    readonly map: MapVision,
    readonly characterIds: readonly string[],
  ) {
    const hidden = map.opts.hiddenLayers;
    this.observers = map.tokens
      .filter((t) => isObserver(t, characterIds, hidden))
      .map((t) => ({ id: t.id, pos: t.pos, visionRadius: Math.max(0, t.visionRadius) }));
  }

  /** Vu(joueur) sur la scène (null : aucun observateur). */
  view(): View | null {
    if (!this.observers.length) return null;
    const make = this.map.opts.view ?? playerView;
    return (this.viewCache ??= make(this.map.opts.prep, this.observers));
  }

  /** Même vue, toute la carte sous le brouillard (tokens `hidden`). */
  hiddenView(): View | null {
    if (!this.observers.length) return null;
    const make = this.map.opts.view ?? playerView;
    return (this.hiddenCache ??= make(this.map.opts.fogged(), this.observers));
  }

  private lights() {
    return (this.lightsCache ??= playerView(this.map.opts.prep, []).lights);
  }

  /** Des échantillons sont-ils vus (`hidden` : seulement dans un rayon de vision ou éclairés) ? */
  seesSamples(samples: Float64Array, hiddenRule = false): boolean {
    const view = hiddenRule ? this.hiddenView() : this.view();
    if (view) return view.containsAny(samples);
    return topDownSees(this.map.opts.prep, this.lights(), samples, hiddenRule);
  }

  /** Le joueur reçoit-il ce token ? */
  seesToken(t: VisionToken): boolean {
    if (t.visibility === 'invisible') return false;
    const own = this.characterIds.includes(t.characterId);
    if (own) return true;
    if (this.map.inHiddenLayer(t.layerId)) return false;
    if (t.playerSide || t.visibility === 'ally') return true;
    if (t.visibility === 'custom') return t.visibleTo.some((id) => this.characterIds.includes(id));
    return this.seesSamples(this.map.tokenSamples(t), t.visibility === 'hidden');
  }

  /** Tokens de la carte que le joueur reçoit. */
  visibleTokens(): VisionToken[] {
    return this.map.tokens.filter((t) => this.seesToken(t));
  }

  /** Le joueur reçoit-il cet objet ? Un décor visible n'est pas filtré (l'obscurité le couvre). */
  seesObject(o: VisionObject): boolean {
    if (this.map.inHiddenLayer(o.layerId)) return false;
    if (o.visibility === 'hidden') return false;
    if (o.visibility === 'custom') return o.visibleTo.some((id) => this.characterIds.includes(id));
    if (o.kind === 'decor') return true;
    return this.seesSamples(sampleRect(o.pos.x, o.pos.y, o.width, o.height, o.rotation));
  }
}
