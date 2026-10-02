/**
 * État de la visibilité côté client (docs/carte.md § 9), sans Pixi ni DOM : testable à blanc.
 *
 * À chaque image où quelque chose a pu changer, `sync()` compare ses entrées aux précédentes
 * et ne refait que le nécessaire :
 * - géométrie (murs, portes, pièces, zones, `fogFull`, taille, occlusion) : `prepareScene`,
 *   seulement quand une de ces couches change (même référence de `Map` : rien à refaire) ;
 * - lumières : `withLights` (torche qui suit un token, même pendant un glisser) ;
 * - observateurs : une vue par observateur, gardée tant qu'il ne bouge pas (un glisser ne
 *   refait que la sienne) ; positions en direct (aperçu local, direct interpolé des autres).
 *
 * Il en tire : le mode (joueur, MJ, « Vue de… »), ce que le rendu dessine (`picture`), ce qui
 * est masqué (`decisions`) et l'audience du direct (`audience`).
 */
import {
  closedRooms,
  playerView,
  pointInPolygon,
  prepareScene,
  translucentShadows,
  viewerView,
  withLights,
  type FogZone,
  type Light,
  type LightArea,
  type Polygon,
  type PreparedScene,
  type Segment as VisionSegment,
  type Vec,
  type View,
  type Viewer,
  type ViewerTerms,
} from '@vtt/vision';
import type { MapEntity } from '../../engine/entities/entity';
import type { LiveAudience } from '../../engine/entities/entity-kind';
import type { MapEngine, MapPlayer } from '../../engine/map-engine';
import { displayOf } from '../../engine/planes';
import { collectionOf, type MapDto } from '../../store/map-store';
import {
  foggedScene,
  geometryScene,
  lightsKey,
  lightsOf,
  MapVision,
  type MemberVision,
  type VisionMember,
} from './rules';
import {
  geometryInput,
  geometryKey,
  hiddenLayers,
  lightInput,
  sameKey,
  scaleOf,
  visionObject,
  visionToken,
} from './scene-adapter';
import { VisionStats } from './stats';

export type VisionMode = 'player' | 'gm' | 'view-as';

/** Voile du MJ : l'ombre des joueurs, montrée légère. */
export const GM_VEIL = 0.25;
/** Opacité du brouillard au plus (au-dessus de l'obscurité). */
export const FOG_ALPHA = 0.9;

/** Observateur prêt à dessiner : ses termes (§ 9) et ses ombres partielles. */
export interface ViewerLayer {
  readonly id: string;
  /** Position du token (centre du disque de vision). */
  readonly pos: Vec;
  readonly terms: ViewerTerms;
  readonly translucent: readonly { readonly polygon: Polygon; readonly opacity: number }[];
}

export interface LightLayer {
  readonly area: LightArea;
  /** Couleur (donnée de la lumière, chaîne CSS). */
  readonly color: string;
  readonly intensity: number;
}

/** Ce que le rendu dessine. */
export interface VisionPicture {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly viewers: readonly ViewerLayer[];
  /** Sans observateur : vue d'en haut, pièces fermées retirées. */
  readonly topDown: readonly Polygon[] | null;
  readonly fogFull: boolean;
  readonly fogZones: readonly FogZone[];
  readonly lights: readonly LightLayer[];
  /** Opacité de l'obscurité hors de la vue. */
  readonly darkness: number;
  readonly fogAlpha: number;
  /** Part des lueurs gardée hors de la vue (MJ : on les voit presque toutes). */
  readonly glowFloor: number;
  readonly showFog: boolean;
  readonly showGlow: boolean;
  /**
   * Murs qui bloquent la vue (murs, portes fermées, sens unique), `[ax, ay, bx, by, …]`, tracés
   * en sombre pour les joueurs : les limites des salles restent lisibles dans l'ombre. Null pour
   * le MJ (il a son propre tracé).
   */
  readonly walls: Float64Array | null;
  /** Épaisseur de ce tracé, en pixels du monde (un dixième de case). */
  readonly wallWidth: number;
  /**
   * Salles fermées où le joueur n'a aucun observateur : leur intérieur est noir opaque, quel que
   * soit `darkness` (on devine le terrain hors de vue, jamais l'intérieur d'une salle). Vide pour
   * le MJ. `key` change quand la liste change.
   */
  readonly hiddenRooms: { readonly key: string; readonly polygons: readonly Polygon[] };
  /** Versions : un terme qui change fait refaire ce qui en dépend. */
  readonly versions: { readonly fog: number; readonly lights: number; readonly viewers: number };
}

/** Segments opaques d'une scène (murs, portes fermées, sens unique, translucides compris). */
export function blockingWalls(scene: { segments: readonly VisionSegment[] }): Float64Array {
  const out: number[] = [];
  for (const s of scene.segments) {
    if (s.kind === 'window' || (s.kind === 'door' && s.open === true)) continue;
    if (!((s.opacity ?? 1) > 0)) continue;
    out.push(s.a.x, s.a.y, s.b.x, s.b.y);
  }
  return Float64Array.from(out);
}

/** Décision d'affichage d'une entité (PNJ, objet, personnage joueur). */
export interface EntityDecision {
  /** Non vu : masqué (fondu de 150 ms). */
  readonly masked: boolean;
  /** Toujours vu mais hors de ma vue : au-dessus de l'ombre (plan `allies`). */
  readonly allies: boolean;
}

// ─── Vues par observateur ────────────────────────────────────────────────────

interface ObserverEntry {
  x: number;
  y: number;
  r: number;
  view: View;
  shadows: readonly { polygon: Polygon; opacity: number }[] | null;
}

/** Union de vues d'observateurs (Vu(joueur) = ⋃ Vu(O)), sans rien recalculer. */
class UnionView implements View {
  constructor(
    private readonly parts: readonly View[],
    readonly lights: readonly LightArea[],
  ) {}
  get viewers() {
    return this.parts.flatMap((p) => p.viewers);
  }
  contains(p: Vec) {
    return this.containsXY(p.x, p.y);
  }
  containsXY(x: number, y: number) {
    for (const part of this.parts) if (part.containsXY(x, y)) return true;
    return false;
  }
  containsAny(points: Float64Array | readonly Vec[]) {
    for (const part of this.parts) if (part.containsAny(points)) return true;
    return false;
  }
}

/** Vues gardées par scène préparée et par observateur (un glisser ne refait que la sienne). */
class ObserverViews {
  private readonly byPrep = new Map<PreparedScene, Map<string, ObserverEntry>>();
  /** Vues calculées depuis la création (tests, compteur). */
  computed = 0;

  entry(prep: PreparedScene, o: Viewer): ObserverEntry {
    let cache = this.byPrep.get(prep);
    if (!cache) {
      cache = new Map();
      this.byPrep.set(prep, cache);
    }
    const known = cache.get(o.id);
    if (known && known.x === o.pos.x && known.y === o.pos.y && known.r === o.visionRadius)
      return known;
    this.computed += 1;
    const entry: ObserverEntry = {
      x: o.pos.x,
      y: o.pos.y,
      r: o.visionRadius,
      view: viewerView(prep, o),
      shadows: null,
    };
    cache.set(o.id, entry);
    return entry;
  }

  union(prep: PreparedScene, observers: readonly Viewer[]): View {
    const parts = observers.map((o) => this.entry(prep, o).view);
    return new UnionView(parts, parts[0]?.lights ?? []);
  }

  /** Ombres partielles d'un observateur (gardées avec sa vue). */
  shadows(prep: PreparedScene, o: Viewer) {
    const e = this.entry(prep, o);
    return (e.shadows ??= translucentShadows(prep, e.view.viewers[0]?.origin ?? o.pos));
  }

  /** Oublie les scènes qui ne servent plus. */
  keep(preps: readonly (PreparedScene | null)[]) {
    for (const prep of [...this.byPrep.keys()]) if (!preps.includes(prep)) this.byPrep.delete(prep);
  }
}

// ─── État ────────────────────────────────────────────────────────────────────

/** Parties de `geometryKey` dont dépendent les murs : largeur, hauteur, occlusion, obstacles. */
const WALL_KEYS = [0, 1, 3, 4];

const TOKENS = 'tokens';
const OBJECTS = 'objects';

export class VisionState {
  readonly stats: VisionStats;
  private readonly views = new ObserverViews();

  // Géométrie
  private geoKey: readonly unknown[] | null = null;
  private geoPrep: PreparedScene | null = null;
  private geoScene: ReturnType<typeof geometryScene> | null = null;
  private wallCache: { scene: unknown; walls: Float64Array } | null = null;
  private hiddenCache: { key: string; prep: unknown; polygons: Polygon[] } | null = null;
  private foggedGeo: PreparedScene | null = null;
  private fogVersion = 0;

  // Lumières
  private lights: Light[] = [];
  private lightKey = '';
  private litPrep: PreparedScene | null = null;
  private foggedLit: PreparedScene | null = null;
  private lightVersion = 0;

  // Tokens, calques, joueurs
  private tokensRef: ReadonlyMap<string, MapDto> | null = null;
  private positions: number[] = [];
  private layersRef: unknown = null;
  private hidden = new Set<string>();
  private playersKey = '';
  private playerCharacters = new Set<string>();
  private scaleKey = '';
  private map: MapVision | null = null;

  // Sorties
  private modeKey = '';
  private viewersVersion = 0;
  private lastLayers: readonly ViewerLayer[] = [];
  private pictureCache: VisionPicture | null = null;
  private decisionMap = new Map<string, EntityDecision>();
  private entityRefs: MapEntity[] = [];

  constructor(
    private readonly engine: MapEngine,
    opts: { stats?: VisionStats } = {},
  ) {
    this.stats = opts.stats ?? new VisionStats();
  }

  /** Vues d'observateurs calculées depuis le début (tests). */
  get viewsComputed() {
    return this.views.computed;
  }

  get mode(): VisionMode {
    if (this.engine.viewer.role !== 'gm') return 'player';
    return this.engine.ui.getState().viewAs ? 'view-as' : 'gm';
  }

  /** Joueurs et spectateurs (annuaire), et leurs personnages. */
  players(): readonly MapPlayer[] {
    return this.engine.directory.players?.() ?? [];
  }

  /** Le joueur dont on montre la vue (moi, ou le joueur choisi par le MJ) ; null : MJ. */
  member(): VisionMember | null {
    const viewer = this.engine.viewer;
    if (viewer.role !== 'gm') return { userId: viewer.userId, characterIds: viewer.characterIds };
    const viewAs = this.engine.ui.getState().viewAs;
    if (!viewAs) return null;
    const p = this.players().find((x) => x.userId === viewAs);
    return { userId: viewAs, characterIds: p?.characterIds ?? [] };
  }

  /** Position affichée d'une entité (aperçu local, direct des autres). */
  private livePos(id: string): Vec | null {
    const e = this.engine.entity(id);
    return e ? { x: e.current.x, y: e.current.y } : null;
  }

  /** Visibilité de la carte, à jour (null avant la première synchronisation). */
  vision(): MapVision | null {
    return this.map;
  }

  /** Ce que voit ce joueur. */
  memberVision(m: VisionMember): MemberVision | null {
    return this.map?.forMember(m) ?? null;
  }

  /**
   * Met à jour ce qui a changé. Renvoie vrai si la vue, le rendu ou les décisions ont
   * changé depuis l'appel précédent.
   */
  sync(): boolean {
    const t0 = performance.now();
    const state = this.engine.store.getState();
    let changed = false;

    // Géométrie
    const key = geometryKey(state);
    let wallsChanged = false;
    if (!sameKey(this.geoKey, key)) {
      const tp = performance.now();
      // Les aires des lumières ne dépendent que des murs et des bornes (pas des zones ni des
      // pièces) : sans eux, les lueurs restent telles quelles
      wallsChanged = !this.geoKey || WALL_KEYS.some((i) => this.geoKey![i] !== key[i]);
      this.geoKey = key;
      this.geoScene = geometryScene(geometryInput(state));
      this.geoPrep = prepareScene(this.geoScene);
      this.foggedGeo = null;
      this.litPrep = null;
      this.fogVersion += 1;
      this.stats.record('prepare', performance.now() - tp);
      changed = true;
    }

    // Tokens (positions en direct)
    const tokens = collectionOf(state, TOKENS);
    const positions: number[] = [];
    for (const t of tokens.values()) {
      const p = this.livePos(t.id);
      const pos = p ?? (t.pos as Vec | undefined);
      positions.push(pos?.x ?? NaN, pos?.y ?? NaN);
    }
    const moved =
      tokens !== this.tokensRef ||
      positions.length !== this.positions.length ||
      positions.some((v, i) => !Object.is(v, this.positions[i]));
    this.tokensRef = tokens;
    this.positions = positions;

    // Lumières (une torche suit la position affichée de son token)
    const scale = scaleOf(state);
    const lights = lightsOf(
      [...collectionOf(state, 'lights').values()].map(lightInput),
      (id) => this.livePos(id) ?? (tokens.get(id)?.pos as Vec | undefined) ?? undefined,
      scale.pixelsPerUnit,
    );
    const lk = lightsKey(lights);
    if (lk !== this.lightKey || !this.litPrep) {
      if (lk !== this.lightKey || wallsChanged) this.lightVersion += 1;
      this.lights = lights;
      this.lightKey = lk;
      this.litPrep = withLights(this.geoPrep!, lights);
      this.foggedLit = null;
      changed = true;
    }

    // Calques masqués, joueurs, échelle
    const layers = collectionOf(state, 'layers');
    if (layers !== this.layersRef) {
      this.layersRef = layers;
      this.hidden = hiddenLayers(state);
      changed = true;
    }
    const characters = this.engine.directory.characters().map((c) => c.id);
    const pk = [
      characters.join(','),
      ...this.players().map((p) => `${p.userId}:${p.characterIds.join(',')}`),
    ].join('|');
    if (pk !== this.playersKey) {
      this.playersKey = pk;
      this.playerCharacters = new Set(characters);
      changed = true;
    }
    const sk = `${scale.pixelsPerUnit}:${scale.tokenScale}`;
    if (sk !== this.scaleKey) {
      this.scaleKey = sk;
      changed = true;
    }

    if (changed || moved || !this.map) {
      const byId = new Map<string, Vec>();
      const list = [...tokens.values()].map((t, i) => {
        const x = positions[2 * i]!;
        const y = positions[2 * i + 1]!;
        const pos = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        const vt = visionToken(t, pos, this.playerCharacters);
        byId.set(t.id, vt.pos);
        return vt;
      });
      const geo = this.geoScene!;
      this.map = new MapVision({
        prep: this.litPrep!,
        fogged: () => {
          this.foggedGeo ??= prepareScene(foggedScene(geo));
          return (this.foggedLit ??= withLights(this.foggedGeo, this.lights));
        },
        tokens: list,
        hiddenLayers: this.hidden,
        pixelsPerUnit: scale.pixelsPerUnit,
        tokenScale: scale.tokenScale,
        view: (prep, observers) => this.views.union(prep, observers),
      });
      changed = true;
    }

    // Mode (joueur, MJ, « Vue de… ») et observateurs dessinés
    const member = this.member();
    const modeKey = `${this.mode}:${member?.userId ?? ''}:${member?.characterIds.join(',') ?? ''}`;
    if (modeKey !== this.modeKey) {
      this.modeKey = modeKey;
      changed = true;
    }

    // Entités décidées (une entité arrivée, partie ou remplacée compte)
    // Tokens et objets ; en « Vue de… », aussi ce qui est rangé dans un calque (dessins, textes) ;
    // pour un joueur, aussi les sortes à points d'échantillon (icônes de porte)
    const viewAs = this.mode === 'view-as';
    const player = this.mode === 'player';
    const entities = [...this.engine.entities()].filter(
      (e) =>
        e.kind.collection === TOKENS ||
        e.kind.collection === OBJECTS ||
        (viewAs && e.layerId !== null) ||
        (player && e.kind.visionSamples?.(e) != null),
    );
    const entitiesChanged =
      entities.length !== this.entityRefs.length ||
      entities.some((e, i) => e !== this.entityRefs[i]);
    this.entityRefs = entities;

    if (changed) {
      const tv = performance.now();
      this.refreshPicture();
      this.stats.record('views', performance.now() - tv);
    }
    if (changed || entitiesChanged) {
      const tm = performance.now();
      this.refreshDecisions(entities);
      this.stats.record('masking', performance.now() - tm);
    }
    this.views.keep([this.litPrep, this.foggedLit]);
    if (changed) this.stats.record('sync', performance.now() - t0);
    return changed || entitiesChanged;
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  /** Observateurs à dessiner : ceux du joueur montré, ou tous ceux des joueurs (voile du MJ). */
  private drawnObservers(): Viewer[] {
    const map = this.map!;
    const member = this.member();
    if (member) return [...map.forMember(member).observers];
    const seen = new Map<string, Viewer>();
    for (const p of this.players())
      for (const o of map.forMember(p).observers) if (!seen.has(o.id)) seen.set(o.id, o);
    return [...seen.values()];
  }

  private refreshPicture() {
    const map = this.map!;
    const prep = map.opts.prep;
    const state = this.engine.store.getState();
    const observers = this.drawnObservers();
    const layers: ViewerLayer[] = observers.map((o) => {
      const view = this.views.entry(prep, o).view;
      return {
        id: o.id,
        pos: o.pos,
        terms: view.viewers[0]!,
        translucent: this.views.shadows(prep, o),
      };
    });
    const same =
      layers.length === this.lastLayers.length &&
      layers.every(
        (l, i) =>
          l.terms === this.lastLayers[i]!.terms &&
          l.translucent === this.lastLayers[i]!.translucent &&
          l.pos.x === this.lastLayers[i]!.pos.x &&
          l.pos.y === this.lastLayers[i]!.pos.y,
      );
    if (!same) this.viewersVersion += 1;
    this.lastLayers = layers;

    const closed = closedRooms(prep);
    const topDown = observers.length
      ? null
      : prep.rooms.filter((r) => closed.has(r.id)).map((r) => flat(r.room.points));
    const byId = collectionOf(state, 'lights');
    const lights = this.lightAreas(prep).map((area) => {
      const dto = byId.get(area.id);
      return {
        area,
        color: typeof dto?.color === 'string' ? dto.color : '',
        intensity: typeof dto?.intensity === 'number' ? dto.intensity : 1,
      };
    });
    const display = displayOf(state.scene);
    const shadow =
      typeof state.settings?.shadowOpacity === 'number' ? state.settings.shadowOpacity : 1;
    const gm = this.mode === 'gm';
    const scene = this.geoScene!;
    // Salles fermées sans observateur du joueur montré (MJ : aucune)
    const hidden = gm
      ? []
      : prep.rooms.filter(
          (r) => r.closed && !observers.some((o) => pointInPolygon(o.pos, r.room.points)),
        );
    const hiddenKey = hidden.map((r) => r.id).join('|');
    if (this.hiddenCache?.key !== hiddenKey || this.hiddenCache.prep !== prep)
      this.hiddenCache = {
        key: hiddenKey,
        prep,
        polygons: hidden.map((r) => Float64Array.from(r.room.points.flatMap((p) => [p.x, p.y]))),
      };
    if (this.wallCache?.scene !== scene) this.wallCache = { scene, walls: blockingWalls(scene) };
    this.pictureCache = {
      walls: gm ? null : this.wallCache.walls,
      hiddenRooms: { key: `${this.fogVersion}:${hiddenKey}`, polygons: this.hiddenCache.polygons },
      wallWidth: Math.max(2, scaleOf(state).pixelsPerUnit * 0.1),
      bounds: scene.bounds,
      viewers: layers,
      topDown,
      fogFull: scene.fogFull === true,
      fogZones: scene.fogZones ?? [],
      lights,
      darkness: Math.max(0, Math.min(1, shadow)) * (gm ? GM_VEIL : 1),
      fogAlpha: FOG_ALPHA * (gm ? GM_VEIL : 1),
      glowFloor: gm ? 1 - GM_VEIL : 0,
      showFog: display.fog !== false,
      showGlow: display.lights !== false,
      versions: { fog: this.fogVersion, lights: this.lightVersion, viewers: this.viewersVersion },
    };
  }

  private lightAreasCache: { prep: PreparedScene; areas: readonly LightArea[] } | null = null;

  /** Aires éclairées (disque ∩ vue depuis la lumière), gardées par scène. */
  private lightAreas(prep: PreparedScene): readonly LightArea[] {
    if (this.lightAreasCache?.prep !== prep)
      this.lightAreasCache = { prep, areas: playerView(prep, []).lights };
    return this.lightAreasCache.areas;
  }

  /** Ce que le rendu dessine (après `sync`). */
  picture(): VisionPicture | null {
    return this.pictureCache;
  }

  // ─── Masquage ───────────────────────────────────────────────────────────────

  private refreshDecisions(entities: readonly MapEntity[]) {
    const next = new Map<string, EntityDecision>();
    const member = this.member();
    const mv = member && this.map ? this.map.forMember(member) : null;
    if (mv) {
      const tokens = new Map(this.map!.tokens.map((t) => [t.id, t]));
      for (const e of entities) {
        if (e.kind.collection === TOKENS) {
          const t = tokens.get(e.id);
          if (!t) continue;
          const seen = mv.seesToken(t);
          // Toujours vu (personnage joueur, allié, le mien, custom) : hors de ma vue, au-dessus
          const always =
            seen &&
            (t.playerSide ||
              t.visibility === 'ally' ||
              t.visibility === 'custom' ||
              member!.characterIds.includes(t.characterId));
          const inView = always ? mv.seesSamples(this.map!.tokenSamples(t)) : seen;
          next.set(e.id, { masked: !seen, allies: always && !inView });
        } else if (e.kind.collection === OBJECTS) {
          const o = visionObject(e.data, e.current);
          next.set(e.id, { masked: !mv.seesObject(o), allies: false });
        } else if (this.mode === 'player' && e.kind.visionSamples) {
          // Icône de porte : montrée (et cliquable) seulement si la porte est dans ma vue. En
          // « Vue de… », les portes restent aux surcouches du MJ, comme les murs
          const samples = e.kind.visionSamples(e);
          if (samples) next.set(e.id, { masked: !mv.seesSamples(samples), allies: false });
        } else if (e.layerId && this.hidden.has(e.layerId)) {
          // « Vue de… » : un calque masqué aux joueurs ne leur est jamais envoyé
          next.set(e.id, { masked: true, allies: false });
        }
      }
    }
    this.decisionMap = next;
  }

  /** Décision pour une entité (aucune : ni masquée, ni forcée ; le MJ voit tout). */
  decision(id: string): EntityDecision | undefined {
    return this.decisionMap.get(id);
  }

  decisions(): ReadonlyMap<string, EntityDecision> {
    return this.decisionMap;
  }

  // ─── Audience du direct ─────────────────────────────────────────────────────

  /**
   * Audience du direct d'une entité (§ 8) : cachée → MJ seulement ; PNJ ou objet vu de
   * certains joueurs seulement → ceux-là (`toUsers`), calculé avec la vue de chacun, à sa
   * position affichée ; vu de tous → public.
   */
  audience(e: MapEntity): LiveAudience {
    const viewer = this.engine.viewer;
    const fallback = (): LiveAudience => {
      if (e.kind.liveAudience) return e.kind.liveAudience(e, viewer);
      if (e.state.hiddenForPlayers) return 'gm';
      if (e.layerId && this.engine.layer(e.layerId)?.visibleToPlayers === false) return 'gm';
      return 'public';
    };
    const isToken = e.kind.collection === TOKENS;
    if (!isToken && e.kind.collection !== OBJECTS) return fallback();
    // Tokens et objets : les règles tranchent (`hidden` d'un token se voit dans un rayon)
    if (!this.engine.directory.players) return fallback();
    if (!this.map) this.sync();
    const map = this.map;
    if (!map) return fallback();
    const players = this.players();
    if (!players.length) return fallback();
    let sees: (m: MemberVision) => boolean;
    if (isToken) {
      const t =
        map.tokens.find((x) => x.id === e.id) ??
        visionToken(e.data, { x: e.current.x, y: e.current.y }, this.playerCharacters);
      const live = { ...t, pos: { x: e.current.x, y: e.current.y } };
      sees = (m) => m.seesToken(live);
    } else {
      const o = visionObject(e.data, e.current);
      sees = (m) => m.seesObject(o);
    }
    const users = players.filter((p) => sees(map.forMember(p))).map((p) => p.userId);
    if (users.length === players.length) return 'public';
    if (!users.length) return 'gm';
    return { users };
  }
}

/** Contour `Vec[]` → polygone à plat. */
function flat(points: readonly Vec[]): Polygon {
  const out = new Float64Array(points.length * 2);
  points.forEach((p, i) => {
    out[2 * i] = p.x;
    out[2 * i + 1] = p.y;
  });
  return out;
}
