/**
 * `MapEngine` (docs/carte.md § 2 à § 8) : le moteur de la carte, hors de React.
 *
 * Il relie le magasin (`map-store.ts`), les sortes d'entités des modules, l'index spatial, la
 * caméra, la sélection, les outils, le contrôleur d'interaction, les commandes et le direct.
 * Le rendu PixiJS (`pixi-view.ts`) n'est chargé qu'au montage (`mount`) : sans lui, le moteur
 * fonctionne « à blanc », ce qui permet de le tester sans WebGL et de le construire côté
 * serveur sans rien casser.
 *
 * Cycle de vie : `new MapEngine(…)`, `use(module)` pour chaque module (`modules/index.ts`),
 * `mount(host)`, puis `destroy()` au démontage (aucun contexte WebGL ne survit, HMR compris).
 *
 * Rendu à la demande : une image n'est rendue que si quelque chose l'a demandée
 * (`invalidate()`) ; la boucle ne tourne en continu que pendant un geste, une animation de
 * caméra, le direct des autres, ou un fond vidéo (30 i/s au plus).
 *
 * API des modules (voir `modules/index.ts` pour un exemple complet) :
 * - `registerKind(kind)` : une sorte d'entité (`EntityKind`) ;
 * - `registerTool(def)` : un outil et son entrée de barre d'outils (`ToolDefinition`) ;
 * - `registerInspectorSection(section)` : une section de l'inspecteur ;
 * - `registerToolbarItem(item)` : un composant dans la barre (emplacement « Vue » ou fin) ;
 * - `registerOverlay(overlay)` : une surcouche React (panneau flottant, composant sans rendu) ;
 * - `registerMenuProvider(provider)` : des entrées du menu contextuel (vide ou sélection) ;
 * - `onFrame(cb)` : une animation (renvoyer vrai tant qu'elle continue) ;
 * - `plane(id)` : le conteneur Pixi d'un plan (vision, gm…), après le montage.
 */
import { Crosshair, Focus, MousePointer2, Radio } from 'lucide-react';
import type { ComponentType } from 'react';
import type * as Pixi from 'pixi.js';
import type { Container } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { CURSOR_KEEPALIVE_MS, LIVE_EXPIRE_MS, type LiveChannel } from '../live/live-channel';
import {
  arrangeCommand,
  createCommand,
  deleteCommand,
  groupCommands,
  tempId,
  updateCommand,
  type ArrangeChange,
  type ArrangeSender,
  type Command,
  type CommandManager,
  type Persistence,
} from '../store/commands';
import {
  collectionOf,
  type MapDto,
  type MapStore,
  type MapStoreState,
  type SceneLike,
  unitNameOf,
} from '../store/map-store';
import { Camera, cameraStorageKey, loadCamera, saveCamera } from './camera';
import { commonActions } from './entities/common-actions';
import { MapEntity, type EntityState } from './entities/entity';
import {
  hasCapability,
  planeOf,
  type EntityChange,
  type EntityKind,
  type KindContext,
  type LiveAudience,
  type MapTheme,
  type MapViewer,
  type MenuItem,
} from './entities/entity-kind';
import { KindRegistry } from './entities/registry';
import {
  inflateRect,
  normalizeDegrees,
  rectsIntersect,
  type EntityGeometry,
  type Point,
  type Rect,
} from './geometry';
import { InteractionController, type ControllerTimers } from './interaction/controller';
import { Selection } from './interaction/selection';
import type { GridSpec } from './interaction/snapping';
import { hitHandle, type HandleId } from './interaction/transform-gizmo';
import {
  assignZ,
  IMPLICIT_LAYER_ID,
  reorderStack,
  sortLayers,
  sortStack,
  zAtBottom,
  zOnTop,
  type LayerLike,
  type OrderOp,
} from './layers';
import { displayOf, isDisplayed, PLANE_RANK, type PlaneId } from './planes';
import { ScreenSpace } from './screen-space';
import { SpatialIndex } from './spatial-index';
import { SelectTool } from './tools/select-tool';
import type { ToolDefinition } from './tools/tool';
import { SELECT_TOOL_ID, ToolManager } from './tools/tool-manager';

// ─── Extensions des modules ──────────────────────────────────────────────────

/** Un module de la carte (`modules/<nom>/index.ts`). */
export interface MapModule {
  readonly id: string;
  /** Enregistre sortes, outils, sections… ; peut renvoyer un nettoyage. */
  register(engine: MapEngine): void | (() => void);
}

export interface InspectorSectionProps {
  engine: MapEngine;
  /** Entités inspectées (données à jour : relire `entity.data` à chaque rendu). */
  entities: readonly MapEntity[];
}

export interface InspectorSection {
  id: string;
  title: string;
  order?: number;
  /** La section s'applique à cette sélection. */
  appliesTo(entities: readonly MapEntity[], viewer: MapViewer): boolean;
  component: ComponentType<InspectorSectionProps>;
}

export interface ToolbarItem {
  id: string;
  /** `view` : emplacement « Vue » (module vision) ; `end` : après les outils. */
  slot: 'view' | 'end';
  order?: number;
  available?(viewer: MapViewer): boolean;
  component: ComponentType<{ engine: MapEngine }>;
}

/**
 * Surcouche React d'un module, montée sur la carte tant qu'elle est prête : panneau flottant
 * (bibliothèque des PNJ, fiche), ou composant sans rendu qui relie des données React (liste de
 * la campagne, fiches) au module.
 */
export interface MapOverlay {
  id: string;
  /** `left` : colonne de gauche de la carte ; `none` : sans emplacement (rendu libre ou nul). */
  slot: 'left' | 'none';
  order?: number;
  available?(viewer: MapViewer): boolean;
  component: ComponentType<{ engine: MapEngine }>;
}

export interface MenuContext {
  engine: MapEngine;
  /** Entités visées (vide : clic droit dans le vide). */
  entities: readonly MapEntity[];
  world: Point;
  viewer: MapViewer;
}

export type MenuProvider = (ctx: MenuContext) => MenuItem[];

/** Extensions enregistrées, observables par React (instantané stable). */
export interface EngineExtensions {
  inspectorSections: readonly InspectorSection[];
  toolbarItems: readonly ToolbarItem[];
  overlays: readonly MapOverlay[];
}

// ─── État de l'interface (React) ─────────────────────────────────────────────

export interface MenuRequest {
  /** Point de l'écran (pixels CSS dans le canevas) où ancrer le menu. */
  screen: Point;
  world: Point;
  ids: readonly string[];
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  resolve(ok: boolean): void;
}

/**
 * Aimantation des gestes (poser, glisser, tracer) : libre, ou une grille d'une case, d'une
 * demi-case ou d'un quart de case. Préférence de chacun (navigateur), libre par défaut.
 */
export type SnapStep = 'off' | 1 | 0.5 | 0.25;
export const SNAP_STEPS: readonly SnapStep[] = ['off', 1, 0.5, 0.25];
const SNAP_KEY = 'vtt:map:snap';

function readSnap(): SnapStep {
  try {
    const raw = globalThis.localStorage?.getItem(SNAP_KEY);
    const value = raw === 'off' ? raw : Number(raw);
    return SNAP_STEPS.includes(value as SnapStep) ? (value as SnapStep) : 'off';
  } catch {
    return 'off';
  }
}

export interface MapUiState {
  /** Rendu monté (Pixi prêt). */
  mounted: boolean;
  /** Le rendu n'a pas pu démarrer (WebGL indisponible…). */
  failure: string | null;
  menu: MenuRequest | null;
  /** Entités de l'inspecteur ouvert. */
  inspector: readonly string[] | null;
  confirm: ConfirmRequest | null;
  /** Panneau des calques (MJ, touche K). */
  layersPanel: boolean;
  /** Calque actif : ce qui est posé y va. */
  activeLayerId: string | null;
  /** Calques cachés sur mon écran seulement (œil local). */
  hiddenLayers: ReadonlySet<string>;
  /** Calque isolé : les autres sont estompés et ne se touchent plus. */
  isolatedLayer: string | null;
  /** « Montrer mon curseur » (désactivé par défaut). */
  shareCursor: boolean;
  /** MJ : vue simulée d'un joueur (module vision), null : vue du MJ. */
  viewAs: string | null;
  /** Aimantation des gestes (libre par défaut). */
  snap: SnapStep;
}

const NO_LAYERS: ReadonlySet<string> = new Set();

// ─── Rendu (pixi-view.ts) ────────────────────────────────────────────────────

/** Ce que le moteur demande au rendu Pixi, chargé au montage. */
export interface EngineView {
  readonly canvas: HTMLCanvasElement;
  /** Module `pixi.js` chargé (pour les modules qui dessinent dans un plan). */
  readonly pixi: typeof Pixi;
  /** Couleurs du thème, lues dans les variables CSS. */
  readonly theme: MapTheme;
  resize(width: number, height: number): void;
  addEntity(entity: MapEntity): void;
  updateEntity(entity: MapEntity, change: EntityChange<MapDto>): void;
  removeEntity(entity: MapEntity): void;
  /** Plan, calque ou `z` changé : l'entité change de conteneur ou de rang. */
  placeEntity(entity: MapEntity): void;
  syncTransform(entity: MapEntity): void;
  setEntityVisible(entity: MapEntity, visible: boolean): void;
  /** Calques changés (ordre, opacité, œil local, isolement). */
  syncLayers(): void;
  /** Rendu Pixi (module vision : rendu dans des textures avant l'image). */
  readonly renderer?: Pixi.Renderer;
  setBackground(url: string | null): void;
  showPing(p: Point, color: 'mine' | 'other'): void;
  setCursor(css: string): void;
  plane(id: PlaneId): Container;
  render(now: number): void;
  destroy(): void;
}

// ─── Serveur ─────────────────────────────────────────────────────────────────

/** Ce que le moteur écrit lui-même (calques, ordre, scène) ; fourni par `api.ts`. */
export interface EngineBackend {
  arrange: ArrangeSender;
  /** Persistance d'une couche (`objects`, `layers`…) : `/batch`. */
  collection(key: string): Persistence<MapDto>;
  /** Supprime un calque ; son contenu descend (ou va dans `moveTo`). */
  deleteLayer(id: string, moveTo?: string): Promise<void>;
  updateScene(patch: Record<string, unknown>, version?: number): Promise<SceneLike>;
  rescale(sx: number, sy: number): Promise<void>;
}

/** Membre non MJ de la campagne et les personnages qu'il possède ou incarne. */
export interface MapPlayer {
  userId: string;
  name: string;
  characterIds: readonly string[];
}

/** Joueurs et personnages de la campagne (menus « Visible pour… », noms des curseurs). */
export interface MapDirectory {
  characters(): readonly { id: string; name: string }[];
  userName(userId: string): string | null;
  /** Joueurs et spectateurs (module vision : vue de chacun, audience du direct). */
  players?(): readonly MapPlayer[];
}

const EMPTY_DIRECTORY: MapDirectory = { characters: () => [], userName: () => null };

export interface MapEngineOptions {
  store: MapStore;
  viewer: MapViewer;
  commands: CommandManager;
  backend?: EngineBackend | null;
  live?: LiveChannel | null;
  directory?: MapDirectory;
  /** Toast d'erreur ou d'information. */
  notify?(message: string): void;
  /** Mémoire de la vue (localStorage) ; false : aucune. */
  rememberCamera?: boolean;
  /** Aimantation de départ (tests) ; sinon la préférence du navigateur. */
  snap?: SnapStep;
  now?(): number;
  timers?: ControllerTimers;
}

/** Couche des calques du MJ dans le magasin. */
export const LAYERS_COLLECTION = 'layers';

/** Taille du monde d'une scène sans fond ni taille connue. */
export const DEFAULT_WORLD = 2048;

/** Tolérance du test de toucher, en pixels d'écran. */
export const HIT_TOLERANCE_PX = 4;
/** Délai de l'info-bulle du nom au survol. */
export const TOOLTIP_DELAY_MS = 400;

type Change = { entity: MapEntity; next: EntityGeometry };

export class MapEngine {
  readonly store: MapStore;
  viewer: MapViewer;
  readonly commands: CommandManager;
  readonly backend: EngineBackend | null;
  readonly live: LiveChannel | null;
  readonly directory: MapDirectory;
  readonly camera = new Camera();
  readonly kinds = new KindRegistry();
  readonly selection = new Selection();
  readonly screenSpace = new ScreenSpace();
  readonly tools: ToolManager;
  readonly controller: InteractionController;
  readonly ui: StoreApi<MapUiState>;
  readonly now: () => number;

  private readonly notifyFn: (message: string) => void;
  private readonly entityMap = new Map<string, MapEntity>();
  private readonly byCollection = new Map<string, Set<string>>();
  private readonly index = new SpatialIndex();
  private sequence = 0;
  private kindCtx: KindContext;
  private layerList: LayerLike[] = [];
  private layerRank = new Map<string, number>();
  private view: EngineView | null = null;
  private destroyed = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly moduleCleanups: (() => void)[] = [];

  // Extensions
  private inspectorSections: InspectorSection[] = [];
  private toolbarItems: ToolbarItem[] = [];
  private overlays: MapOverlay[] = [];
  private readonly menuProviders = new Set<MenuProvider>();
  private extensionsSnapshot: EngineExtensions = {
    inspectorSections: [],
    toolbarItems: [],
    overlays: [],
  };
  private readonly extensionListeners = new Set<() => void>();

  // Rendu à la demande
  private frameHandle: number | null = null;
  private continuous = 0;
  private readonly frameCallbacks = new Set<(now: number) => boolean | void>();
  private readonly frameList: ((now: number) => boolean | void)[] = [];
  private cullDirty = true;
  private inView = new Set<string>();
  private readonly remoteIds = new Set<string>();

  // Survol et info-bulle
  private hoveredId: string | null = null;
  private hoverWorld: Point | null = null;
  /** Entité dont le nom s'affiche (après 400 ms de survol). */
  tooltipId: string | null = null;
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private currentCursor = '';
  private cameraSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cameraKey: string | null;

  constructor(opts: MapEngineOptions) {
    this.store = opts.store;
    this.viewer = opts.viewer;
    this.commands = opts.commands;
    this.backend = opts.backend ?? null;
    this.live = opts.live ?? null;
    this.directory = opts.directory ?? EMPTY_DIRECTORY;
    this.notifyFn = opts.notify ?? (() => undefined);
    this.now = opts.now ?? (() => performance.now());
    this.ui = createStore<MapUiState>()(() => ({
      mounted: false,
      failure: null,
      menu: null,
      inspector: null,
      confirm: null,
      layersPanel: false,
      activeLayerId: null,
      hiddenLayers: NO_LAYERS,
      isolatedLayer: null,
      shareCursor: false,
      viewAs: null,
      snap: opts.snap ?? readSnap(),
    }));
    this.tools = new ToolManager(this);
    this.controller = new InteractionController(this, opts.timers);
    const s = this.store.getState();
    this.cameraKey =
      opts.rememberCamera === false ? null : cameraStorageKey(this.viewer.userId, s.mapId);
    this.kindCtx = this.computeKindContext(s);

    // Outil par défaut : la sélection (V)
    this.tools.register({
      id: SELECT_TOOL_ID,
      label: 'Sélection',
      icon: selectIcon,
      shortcut: { code: 'KeyV', label: 'V' },
      order: 0,
      available: () => true,
      create: () => new SelectTool(),
    });

    this.cleanups.push(
      this.store.subscribe((state, prev) => this.onStore(state, prev)),
      this.camera.onChange(() => this.onCamera()),
      this.selection.subscribe(() => this.onSelection()),
      this.commands.onAlias((from, to) => this.selection.rename(from, to)),
    );
    if (this.live) {
      this.cleanups.push(
        this.live.onActivity(() => {
          this.invalidate();
          // Un fantôme ou un curseur muet doit disparaître, même si plus rien ne bouge
          if (this.expiryTimer) clearTimeout(this.expiryTimer);
          this.expiryTimer = setTimeout(
            () => {
              this.expiryTimer = null;
              this.invalidate();
            },
            LIVE_EXPIRE_MS + CURSOR_KEEPALIVE_MS + 50,
          );
        }),
        this.live.onPing((p) => {
          this.view?.showPing({ x: p.x, y: p.y }, 'other');
          if (p.focus) this.camera.flyTo({ x: p.x, y: p.y }, this.now());
          this.invalidate();
        }),
      );
    }
    this.syncLayers(s);
    this.applyScene(s.scene, null);
    for (const key of Object.keys(s.collections)) this.syncCollection(key);
  }

  // ─── Modules et extensions ─────────────────────────────────────────────────

  /** Charge un module (une fois). */
  use(module: MapModule) {
    const cleanup = module.register(this);
    if (typeof cleanup === 'function') this.moduleCleanups.push(cleanup);
  }

  registerKind<D extends MapDto>(kind: EntityKind<D>): () => void {
    const unregister = this.kinds.register(kind);
    // Les éléments déjà chargés de sa couche deviennent des entités
    this.syncCollection(kind.collection);
    return () => {
      unregister();
      this.syncCollection(kind.collection);
    };
  }

  registerTool(def: ToolDefinition): () => void {
    return this.tools.register(def);
  }

  registerInspectorSection(section: InspectorSection): () => void {
    this.inspectorSections = [...this.inspectorSections, section].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    );
    this.extensionsChanged();
    return () => {
      this.inspectorSections = this.inspectorSections.filter((s) => s !== section);
      this.extensionsChanged();
    };
  }

  registerToolbarItem(item: ToolbarItem): () => void {
    this.toolbarItems = [...this.toolbarItems, item].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    );
    this.extensionsChanged();
    return () => {
      this.toolbarItems = this.toolbarItems.filter((i) => i !== item);
      this.extensionsChanged();
    };
  }

  registerMenuProvider(provider: MenuProvider): () => void {
    this.menuProviders.add(provider);
    return () => void this.menuProviders.delete(provider);
  }

  subscribeExtensions = (listener: () => void) => {
    this.extensionListeners.add(listener);
    return () => void this.extensionListeners.delete(listener);
  };

  getExtensions = (): EngineExtensions => this.extensionsSnapshot;

  registerOverlay(overlay: MapOverlay): () => void {
    this.overlays = [...this.overlays, overlay].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    this.extensionsChanged();
    return () => {
      this.overlays = this.overlays.filter((o) => o !== overlay);
      this.extensionsChanged();
    };
  }

  private extensionsChanged() {
    this.extensionsSnapshot = {
      inspectorSections: this.inspectorSections,
      toolbarItems: this.toolbarItems,
      overlays: this.overlays,
    };
    for (const l of this.extensionListeners) l();
  }

  /**
   * Appelé quand le rendu est prêt (tout de suite s'il l'est déjà) : un module y crée ses objets
   * Pixi dans un plan. Le nettoyage renvoyé est appelé à la destruction.
   */
  whenMounted(cb: () => void | (() => void)): () => void {
    const entry = { cb, cleanup: null as null | (() => void) };
    this.mountedCallbacks.add(entry);
    if (this.view) entry.cleanup = cb() ?? null;
    return () => {
      this.mountedCallbacks.delete(entry);
      entry.cleanup?.();
      entry.cleanup = null;
    };
  }

  private readonly mountedCallbacks = new Set<{
    cb: () => void | (() => void);
    cleanup: (() => void) | null;
  }>();

  /** Animation d'un module : appelée à chaque image, tant qu'elle renvoie vrai. */
  onFrame(cb: (now: number) => boolean | void): () => void {
    this.frameCallbacks.add(cb);
    this.invalidate();
    return () => void this.frameCallbacks.delete(cb);
  }

  // ─── Montage ───────────────────────────────────────────────────────────────

  /** Montage en cours : un second appel (mode strict de React) attend le même, sans second canvas. */
  private mounting: Promise<void> | null = null;

  /** Monte le rendu Pixi dans `host` (client seulement). */
  mount(host: HTMLElement): Promise<void> {
    if (this.view || this.destroyed) return Promise.resolve();
    this.mounting ??= this.mountView(host).finally(() => {
      this.mounting = null;
    });
    return this.mounting;
  }

  private async mountView(host: HTMLElement): Promise<void> {
    try {
      const { createPixiView } = await import('./pixi-view');
      const view = await createPixiView(this, host);
      if (this.destroyed) {
        view.destroy();
        return;
      }
      this.view = view;
      for (const e of this.entityMap.values()) view.addEntity(e);
      view.syncLayers();
      view.setBackground(this.store.getState().scene?.backgroundUrl ?? null);
      this.restoreCamera();
      this.cullDirty = true;
      this.ui.setState({ mounted: true, failure: null });
      for (const entry of this.mountedCallbacks) entry.cleanup = entry.cb() ?? null;
      this.refreshCursor();
      this.invalidate();
    } catch (err) {
      console.error('[carte] rendu impossible', err);
      this.ui.setState({
        failure: 'Impossible d’afficher la carte : le navigateur refuse WebGL.',
      });
    }
  }

  /** Tout libérer : rendu, contexte WebGL, abonnements, minuteries. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    if (this.cameraSaveTimer) {
      clearTimeout(this.cameraSaveTimer);
      this.saveCameraNow();
    }
    this.controller.dispose();
    this.tools.dispose();
    for (const c of this.moduleCleanups.splice(0)) c();
    for (const c of this.cleanups.splice(0)) c();
    for (const e of this.entityMap.values()) e.kind.dispose?.(e);
    for (const entry of this.mountedCallbacks) entry.cleanup?.();
    this.mountedCallbacks.clear();
    this.view?.destroy();
    this.view = null;
    this.screenSpace.clear();
    this.frameCallbacks.clear();
    const confirm = this.ui.getState().confirm;
    confirm?.resolve(false);
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  get mounted(): boolean {
    return this.view !== null;
  }

  /** Taille de la vue (ResizeObserver du composant). */
  resize(width: number, height: number) {
    this.view?.resize(width, height);
    this.camera.setViewport(width, height);
    this.invalidate();
  }

  /** Conteneur d'un plan (null avant le montage). */
  plane(id: PlaneId): Container | null {
    return this.view?.plane(id) ?? null;
  }

  /** Module `pixi.js` (null avant le montage) : les modules y prennent `Graphics`, `Sprite`… */
  get pixi(): typeof Pixi | null {
    return this.view?.pixi ?? null;
  }

  /** Couleurs du thème (null avant le montage). */
  get theme(): MapTheme | null {
    return this.view?.theme ?? null;
  }

  /** Rendu Pixi (null avant le montage) : rendu dans une texture avant l'image (vision). */
  get renderer(): Pixi.Renderer | null {
    return this.view?.renderer ?? null;
  }

  /** Élément DOM du canevas (null avant le montage). */
  get canvas(): HTMLCanvasElement | null {
    return this.view?.canvas ?? null;
  }

  // ─── Rendu à la demande ────────────────────────────────────────────────────

  /** Demande une image. */
  invalidate() {
    if (!this.view || this.destroyed || this.frameHandle !== null) return;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  /** Garde la boucle active (geste, animation) ; renvoie la fin de la demande. */
  requestFrames(): () => void {
    this.continuous += 1;
    this.invalidate();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.continuous -= 1;
    };
  }

  private readonly frame = (now: number) => {
    this.frameHandle = null;
    const again = this.tick(now);
    this.view?.render(now);
    if (again) this.invalidate();
  };

  /**
   * Une étape de la boucle, sans le dessin : caméra, direct, animations des modules, culling.
   * Renvoie vrai si une autre image est nécessaire. Appelée directement par les tests.
   */
  tick(now: number): boolean {
    let again = this.continuous > 0;
    if (this.camera.animating) again = this.camera.step(now) || again;
    if (this.live) again = this.applyLive(now) || again;
    // Liste figée avant les appels (un rappel ajouté attend l'image suivante), dans un tableau
    // réutilisé : aucune allocation par image
    const list = this.frameList;
    for (const cb of this.frameCallbacks) list.push(cb);
    try {
      for (let i = 0; i < list.length; i++) {
        const cb = list[i]!;
        // Retiré par un rappel précédent de cette image : plus appelé
        if (this.frameCallbacks.has(cb) && cb(now) === true) again = true;
      }
    } finally {
      list.length = 0;
    }
    if (this.cullDirty) this.cull();
    return again;
  }

  // ─── Magasin → entités ─────────────────────────────────────────────────────

  private computeKindContext(s: MapStoreState): KindContext {
    const settings = s.settings;
    return {
      viewer: this.viewer,
      scene: s.scene,
      settings,
      pixelsPerUnit:
        typeof settings?.pixelsPerUnit === 'number' && settings.pixelsPerUnit > 0
          ? settings.pixelsPerUnit
          : 50,
      tokenScale:
        typeof settings?.tokenScale === 'number' && settings.tokenScale > 0
          ? settings.tokenScale
          : 1,
      unitName: unitNameOf(settings),
    };
  }

  /** Contexte des sortes (réglages, scène, qui regarde). */
  kindContext(): KindContext {
    return this.kindCtx;
  }

  private onStore(state: MapStoreState, prev: MapStoreState) {
    if (this.destroyed) return;
    const settingsChanged = state.settings !== prev.settings;
    if (settingsChanged || state.scene !== prev.scene)
      this.kindCtx = this.computeKindContext(state);
    if (state.scene !== prev.scene) this.applyScene(state.scene, prev.scene);
    if (state.collections[LAYERS_COLLECTION] !== prev.collections[LAYERS_COLLECTION])
      this.syncLayers(state);

    // Toutes les couches connues du moteur ou du magasin : au premier chargement, les réglages
    // arrivent avec les couches, et le moteur ne connaît encore aucune entité
    const keys = new Set([
      ...this.byCollection.keys(),
      ...Object.keys(state.collections),
      ...Object.keys(prev.collections),
    ]);
    for (const key of keys) {
      // Échelle ou taille des cases : toutes les géométries changent
      if (settingsChanged) this.syncCollection(key, true);
      else if (state.collections[key] !== prev.collections[key]) this.syncCollection(key);
    }
    if (state.pending !== prev.pending) this.syncPending(state.pending, prev.pending);
  }

  /** Aligne les entités d'une couche sur le magasin (ajouts, changements, retraits). */
  private syncCollection(key: string, force = false) {
    const items = collectionOf(this.store.getState(), key);
    const known = this.byCollection.get(key) ?? new Set<string>();
    for (const [id, data] of items) {
      const entity = this.entityMap.get(id);
      const kind = this.kinds.forItem(key, data);
      if (!kind) {
        if (entity) this.removeEntity(entity);
        continue;
      }
      if (!entity) this.addEntity(key, kind, data);
      else if (entity.kind !== kind) {
        this.removeEntity(entity);
        this.addEntity(key, kind, data);
      } else if (force || entity.data !== data) this.updateEntityData(entity, data);
    }
    for (const id of [...known]) if (!items.has(id)) this.removeEntity(this.entityMap.get(id));
  }

  private addEntity(collection: string, kind: EntityKind, data: MapDto) {
    const ctx = this.kindCtx;
    const entity = new MapEntity(
      kind,
      data,
      kind.geometry(data, ctx),
      planeOf(kind, data),
      this.sequence++,
    );
    this.place(entity);
    this.applyFlags(entity);
    entity.state.selected = this.selection.has(entity.id);
    entity.state.pending = this.store.getState().pending.has(entity.id);
    this.entityMap.set(entity.id, entity);
    let set = this.byCollection.get(collection);
    if (!set) {
      set = new Set();
      this.byCollection.set(collection, set);
    }
    set.add(entity.id);
    this.index.set(entity.id, entity.bounds());
    this.view?.addEntity(entity);
    this.cullDirty = true;
    this.invalidate();
  }

  private updateEntityData(entity: MapEntity, data: MapDto) {
    const previous = entity.data;
    entity.data = data;
    entity.geometry = entity.kind.geometry(data, this.kindCtx);
    const before = { plane: entity.plane, layerId: entity.layerId, z: entity.z };
    this.place(entity);
    this.applyFlags(entity);
    this.index.set(entity.id, entity.bounds());
    // L'état durable est arrivé : le fantôme d'un autre se pose
    this.live?.settle(entity.id);
    if (this.view) {
      if (
        before.plane !== entity.plane ||
        before.layerId !== entity.layerId ||
        before.z !== entity.z
      )
        this.view.placeEntity(entity);
      this.view.updateEntity(entity, { previous });
      this.view.syncTransform(entity);
    }
    this.cullDirty = true;
    this.invalidate();
  }

  private removeEntity(entity: MapEntity | undefined) {
    if (!entity) return;
    this.entityMap.delete(entity.id);
    this.planeOverrides.delete(entity.id);
    for (const set of this.byCollection.values()) set.delete(entity.id);
    this.index.remove(entity.id);
    this.inView.delete(entity.id);
    this.remoteIds.delete(entity.id);
    if (this.hoveredId === entity.id) this.hoveredId = null;
    if (this.tooltipId === entity.id) this.tooltipId = null;
    entity.kind.dispose?.(entity);
    this.view?.removeEntity(entity);
    this.selection.remove([entity.id]);
    const inspector = this.ui.getState().inspector;
    if (inspector?.includes(entity.id)) {
      const rest = inspector.filter((id) => id !== entity.id);
      this.ui.setState({ inspector: rest.length ? rest : null });
    }
    this.invalidate();
  }

  /** Plan, calque et `z` de l'entité d'après sa donnée, puis le plan forcé s'il y en a un. */
  private place(entity: MapEntity) {
    this.placeFromData(entity);
    const forced = this.planeOverrides.get(entity.id);
    if (forced) entity.plane = forced;
  }

  private placeFromData(entity: MapEntity) {
    const stacking = entity.kind.stacking;
    if (!stacking) {
      entity.plane = planeOf(entity.kind, entity.data);
      entity.layerId = null;
      entity.z = 0;
      return;
    }
    const raw = stacking.layerId.get(entity.data);
    entity.z = Number(stacking.z.get(entity.data)) || 0;
    if (raw === null && stacking.optional) {
      entity.plane = planeOf(entity.kind, entity.data);
      entity.layerId = null;
      return;
    }
    entity.plane = 'content';
    entity.layerId = this.resolveLayer(raw, stacking.defaultRole);
  }

  /** Plans forcés par un module (vision : personnage joueur hors de ma vue → `allies`). */
  private readonly planeOverrides = new Map<string, PlaneId>();

  /**
   * Force le plan de rendu d'une entité (null : celui de sa donnée). Elle garde son calque et
   * son `z`, et y revient quand le forçage cesse.
   */
  setPlaneOverride(entity: MapEntity, plane: PlaneId | null) {
    if ((this.planeOverrides.get(entity.id) ?? null) === plane) return;
    if (plane) this.planeOverrides.set(entity.id, plane);
    else this.planeOverrides.delete(entity.id);
    if (this.entityMap.get(entity.id) !== entity) return;
    const before = entity.plane;
    this.place(entity);
    if (before !== entity.plane) {
      this.view?.placeEntity(entity);
      this.invalidate();
    }
  }

  /** Calque connu, sinon celui du rôle, sinon le plus haut, sinon le calque implicite. */
  private resolveLayer(id: string | null | undefined, role?: string): string {
    if (id && this.layerRank.has(id)) return id;
    if (role) {
      const byRole = this.layerList.find((l) => l.role === role);
      if (byRole) return byRole.id;
    }
    return this.layerList[this.layerList.length - 1]?.id ?? IMPLICIT_LAYER_ID;
  }

  private applyFlags(entity: MapEntity) {
    const k = entity.kind;
    entity.state.locked = k.locked?.get(entity.data) === true;
    entity.state.hiddenForPlayers = k.hidden?.get(entity.data) === true;
    const display = displayOf(this.store.getState().scene);
    if (k.display && !isDisplayed(display, k.display)) entity.masks.add('display');
    else entity.masks.delete('display');
  }

  private syncPending(next: ReadonlyMap<string, number>, prev: ReadonlyMap<string, number>) {
    for (const id of new Set([...next.keys(), ...prev.keys()])) {
      const e = this.entityMap.get(id);
      if (!e) continue;
      const pending = next.has(id);
      if (e.state.pending !== pending) {
        e.state.pending = pending;
        this.view?.updateEntity(e, { state: true });
      }
    }
    this.invalidate();
  }

  private applyScene(scene: SceneLike | null, prev: SceneLike | null) {
    if (scene?.width && scene?.height) this.camera.setWorld(scene.width, scene.height);
    else if (scene && !scene.backgroundUrl && !this.camera.world.width)
      // Ni fond ni taille connue : un monde par défaut, pour cadrer quand même
      this.camera.setWorld(DEFAULT_WORLD, DEFAULT_WORLD);
    this.restoreCamera();
    if (scene?.backgroundUrl !== prev?.backgroundUrl)
      this.view?.setBackground(scene?.backgroundUrl ?? null);
    if (displayOf(scene) !== displayOf(prev)) {
      for (const e of this.entityMap.values()) {
        const hidden = e.masks.has('display');
        this.applyFlags(e);
        if (hidden !== e.masks.has('display')) this.cullDirty = true;
      }
    }
    this.invalidate();
  }

  // ─── Calques du MJ ─────────────────────────────────────────────────────────

  private syncLayers(state: MapStoreState) {
    const items = [...collectionOf(state, LAYERS_COLLECTION).values()] as unknown as LayerLike[];
    this.layerList = sortLayers(items);
    this.layerRank = new Map(this.layerList.map((l, i) => [l.id, i]));
    // Les entités d'un calque disparu retombent dans leur calque par défaut
    for (const e of this.entityMap.values()) {
      if (!e.kind.stacking) continue;
      const before = e.layerId;
      this.place(e);
      if (before !== e.layerId) this.view?.placeEntity(e);
    }
    const ui = this.ui.getState();
    if (ui.activeLayerId && !this.layerRank.has(ui.activeLayerId))
      this.ui.setState({ activeLayerId: null });
    this.view?.syncLayers();
    this.invalidate();
  }

  /** Calques du bas vers le haut (vide tant que la carte n'en a pas). */
  layersBottomUp(): readonly LayerLike[] {
    return this.layerList;
  }

  /** Calques du haut vers le bas (ordre du panneau et des menus). */
  layersTopDown(): LayerLike[] {
    return [...this.layerList].reverse();
  }

  layer(id: string | null): LayerLike | undefined {
    return id ? this.layerList.find((l) => l.id === id) : undefined;
  }

  /** Rang d'un calque (0 = le plus bas ; -1 si inconnu ou implicite). */
  layerIndex(id: string | null): number {
    return id ? (this.layerRank.get(id) ?? -1) : -1;
  }

  /** Calque où poser une entité de cette sorte : le calque actif, sinon celui de son rôle. */
  targetLayer(role?: string): string | null {
    const active = this.ui.getState().activeLayerId;
    if (active && this.layerRank.has(active)) return active;
    if (!this.layerList.length) return null;
    return this.resolveLayer(null, role);
  }

  /** Entités rangées dans un calque, du dessous vers le dessus. */
  layerContent(layerId: string): MapEntity[] {
    return sortStack([...this.entityMap.values()].filter((e) => e.layerId === layerId));
  }

  /** Annotations (dessins et textes hors calque, plan `annotations`), du dessous vers le dessus. */
  annotationContent(): MapEntity[] {
    return sortStack([...this.entityMap.values()].filter(isAnnotation));
  }

  // ─── Monde ─────────────────────────────────────────────────────────────────

  entity(id: string): MapEntity | undefined {
    return this.entityMap.get(id);
  }

  entities(): IterableIterator<MapEntity> {
    return this.entityMap.values();
  }

  entitiesOfKind(kindId: string): MapEntity[] {
    return [...this.entityMap.values()].filter((e) => e.kind.id === kindId);
  }

  selectedEntities(): MapEntity[] {
    return this.selection.ids.flatMap((id) => {
      const e = this.entityMap.get(id);
      return e ? [e] : [];
    });
  }

  /** Grille de la carte (une case de `pixelsPerUnit` pixels du monde). */
  grid(): GridSpec | null {
    const size = this.kindCtx.pixelsPerUnit;
    return size > 0 ? { size } : null;
  }

  /**
   * Grille d'aimantation d'un geste (null : placement libre), selon la préférence (`snap`).
   * `invert` (Alt pendant le geste) : libre si l'aimantation est active, une case sinon. Les
   * extrémités des murs restent aimantées à part, toujours.
   */
  snapGrid(invert = false): GridSpec | null {
    const cell = this.grid();
    if (!cell) return null;
    const step = this.ui.getState().snap;
    const on = step !== 'off';
    if (on === invert) return null;
    return { ...cell, size: cell.size * (step === 'off' ? 1 : step) };
  }

  /** Change l'aimantation (gardée dans ce navigateur). */
  setSnap(step: SnapStep) {
    this.ui.setState({ snap: step });
    try {
      globalThis.localStorage?.setItem(SNAP_KEY, String(step));
    } catch {
      // Stockage indisponible (navigation privée) : réglage gardé pour la session
    }
  }

  /**
   * L'entité est touchable par ce viewer : visible, sélectionnable, pas dans un calque
   * verrouillé, caché localement ou estompé (sauf ses propres tokens pour un joueur).
   */
  isInteractive(e: MapEntity): boolean {
    if (e.masks.size) return false;
    // L'outil actif choisit ce qu'il touche ; sinon, une sorte réservée à son outil ne se touche pas
    const tool = this.tools.active;
    if (tool.targets ? !tool.targets(e) : !!e.kind.editTool) return false;
    if (!hasCapability(e.kind, 'select') || !e.kind.can('select', e, this.viewer)) return false;
    if (e.layerId) {
      const ui = this.ui.getState();
      if (ui.hiddenLayers.has(e.layerId)) return false;
      if (ui.isolatedLayer && ui.isolatedLayer !== e.layerId) return false;
      const layer = this.layer(e.layerId);
      if (layer?.locked && !(this.viewer.role !== 'gm' && e.kind.isOwn?.(e.data, this.viewer)))
        return false;
    }
    return true;
  }

  /**
   * Ordre de rendu, du dessous vers le dessus : plan, puis calque, puis `z`, puis arrivée. Le
   * toucher prend le plus grand.
   */
  compareStack(a: MapEntity, b: MapEntity): number {
    return (
      PLANE_RANK[a.plane] - PLANE_RANK[b.plane] ||
      this.layerIndex(a.layerId) - this.layerIndex(b.layerId) ||
      a.z - b.z ||
      a.sequence - b.sequence
    );
  }

  /** Entité touchable la plus haute sous ce point du monde. */
  hitTest(
    world: Point,
    opts: { tolerancePx?: number; filter?: (e: MapEntity) => boolean } = {},
  ): MapEntity | null {
    const tol = this.camera.screenToWorldLength(opts.tolerancePx ?? HIT_TOLERANCE_PX);
    let best: MapEntity | null = null;
    // L'index ne fait que dégrossir : une sorte peut toucher un peu au-delà de sa boîte (trait)
    for (const id of this.index.queryPoint(world, tol * 2)) {
      const e = this.entityMap.get(id);
      // Une sorte à action de clic (porte) reste touchable pour ce clic, même hors de son outil
      if (!e || !(this.isInteractive(e) || this.isClickable(e))) continue;
      if (opts.filter && !opts.filter(e)) continue;
      if (!e.hitTest(world, tol)) continue;
      if (!best || this.compareStack(e, best) > 0) best = e;
    }
    return best;
  }

  /**
   * L'entité se touche pour sa seule action de clic (`EntityKind.click` : ouvrir une porte),
   * sans être sélectionnable : visible, et l'outil actif ne l'exclut pas.
   */
  isClickable(e: MapEntity): boolean {
    if (!e.kind.click || e.masks.size) return false;
    const tool = this.tools.active;
    return !tool.targets || tool.targets(e);
  }

  /** Entités touchables dont la boîte touche le rectangle (lasso). */
  entitiesInRect(rect: Rect): MapEntity[] {
    const out: MapEntity[] = [];
    for (const id of this.index.queryRect(rect)) {
      const e = this.entityMap.get(id);
      if (e && this.isInteractive(e) && rectsIntersect(e.bounds(), rect)) out.push(e);
    }
    return out.sort((a, b) => this.compareStack(a, b));
  }

  /** Sélection déplaçable avec l'entité tenue (vide si celle-ci ne bouge pas). */
  movableSelection(primary: MapEntity): MapEntity[] {
    const canMove = (e: MapEntity) =>
      hasCapability(e.kind, 'move') &&
      !!e.kind.applyGeometry &&
      !e.state.locked &&
      e.kind.can('move', e, this.viewer);
    if (!canMove(primary)) return [];
    return this.selectedEntities().filter(canMove);
  }

  // ─── État d'affichage ──────────────────────────────────────────────────────

  /** Géométrie affichée pendant un geste (null : celle de la donnée). */
  setPreview(entity: MapEntity, geometry: EntityGeometry | null) {
    entity.preview = geometry;
    this.index.set(entity.id, entity.bounds());
    this.view?.syncTransform(entity);
    this.cullDirty = true;
    this.invalidate();
  }

  setEntityState(entities: readonly MapEntity[], patch: Partial<EntityState>) {
    for (const e of entities) {
      Object.assign(e.state, patch);
      this.view?.updateEntity(e, { state: true });
    }
    if (patch.dragging !== undefined) {
      // Pendant un geste, la boucle tourne (direct, aperçu)
      if (patch.dragging) this.dragRelease ??= this.requestFrames();
      else if (![...this.entityMap.values()].some((e) => e.state.dragging)) {
        this.dragRelease?.();
        this.dragRelease = null;
      }
    }
    this.invalidate();
  }

  private dragRelease: (() => void) | null = null;

  private onSelection() {
    const ids = new Set(this.selection.ids);
    for (const e of this.entityMap.values()) {
      const selected = ids.has(e.id);
      if (e.state.selected !== selected) {
        e.state.selected = selected;
        this.view?.updateEntity(e, { state: true });
      }
    }
    this.invalidate();
  }

  /** Entité survolée (contour, curseur, info-bulle après 400 ms). */
  setHovered(id: string | null, pointer?: { world: Point }) {
    this.hoverWorld = pointer?.world ?? null;
    if (id === this.hoveredId) {
      this.refreshCursor();
      return;
    }
    const prev = this.hoveredId ? this.entityMap.get(this.hoveredId) : undefined;
    if (prev) {
      prev.state.hovered = false;
      this.view?.updateEntity(prev, { state: true });
    }
    this.hoveredId = id;
    const next = id ? this.entityMap.get(id) : undefined;
    if (next) {
      next.state.hovered = true;
      this.view?.updateEntity(next, { state: true });
    }
    if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
    this.tooltipTimer = null;
    if (this.tooltipId) {
      this.tooltipId = null;
      this.invalidate();
    }
    if (next && next.kind.name?.(next.data, this.kindCtx) && this.view) {
      this.tooltipTimer = setTimeout(() => {
        this.tooltipTimer = null;
        if (this.hoveredId === id) {
          this.tooltipId = id;
          this.invalidate();
        }
      }, TOOLTIP_DELAY_MS);
    }
    this.refreshCursor();
    this.invalidate();
  }

  get hovered(): MapEntity | null {
    return this.hoveredId ? (this.entityMap.get(this.hoveredId) ?? null) : null;
  }

  /** Curseur au survol : poignée, verrouillé, déplaçable, ou simple pointeur. */
  hoverCursor(): string | null {
    if (this.hoverWorld) {
      const handle = this.gizmoAt(this.hoverWorld);
      if (handle) return handle.handle === 'rotate' ? 'grab' : 'nwse-resize';
    }
    const e = this.hovered;
    if (!e) return null;
    if (e.state.locked) return 'not-allowed';
    if (hasCapability(e.kind, 'move') && e.kind.can('move', e, this.viewer)) return 'grab';
    return 'pointer';
  }

  /** Recalcule le curseur (contrôleur, puis outil actif). */
  refreshCursor() {
    const css = this.controller.cursor() ?? this.tools.active.cursor?.(this) ?? 'default';
    if (css === this.currentCursor) return;
    this.currentCursor = css;
    this.view?.setCursor(css);
  }

  /** Poignée sous ce point, si une seule entité transformable est sélectionnée. */
  gizmoAt(world: Point): { entity: MapEntity; handle: HandleId } | null {
    const e = this.gizmoTarget();
    if (!e) return null;
    const opts = this.gizmoOptions(e);
    const handle = hitHandle(e.current, world, this.camera.zoom, opts);
    return handle ? { entity: e, handle } : null;
  }

  /** Entité qui porte les poignées (sélection d'un seul élément, non verrouillé). */
  gizmoTarget(): MapEntity | null {
    if (this.selection.size !== 1) return null;
    const e = this.entityMap.get(this.selection.ids[0]!);
    if (!e || e.state.locked || !e.kind.applyGeometry) return null;
    const opts = this.gizmoOptions(e);
    return opts.rotate || opts.resize ? e : null;
  }

  gizmoOptions(e: MapEntity): { rotate: boolean; resize: boolean } {
    const can = (cap: 'rotate' | 'resize') =>
      hasCapability(e.kind, cap) && e.kind.can(cap, e, this.viewer);
    return { rotate: can('rotate'), resize: can('resize') };
  }

  // ─── Caméra ────────────────────────────────────────────────────────────────

  private onCamera() {
    this.screenSpace.setZoom(this.camera.zoom);
    this.cullDirty = true;
    this.invalidate();
  }

  private cameraRestored = false;

  /**
   * Première vue de cette carte, dès que le rendu est monté et la taille du monde connue : la
   * dernière vue gardée, sinon le cadrage « contenir ».
   */
  private restoreCamera() {
    if (this.cameraRestored || !this.view || !this.camera.world.width) return;
    this.cameraRestored = true;
    const saved = this.cameraKey ? loadCamera(this.cameraKey) : null;
    if (saved) this.camera.set(saved);
    else this.camera.fit();
  }

  /** Recadre toute la carte (double clic du milieu, bouton « Recadrer »). */
  fitView() {
    this.camera.fit();
    this.cameraSettled();
  }

  /** Va à un point (et un zoom) en douceur. */
  focusOn(world: Point, zoom?: number) {
    this.camera.flyTo({ ...world, ...(zoom ? { zoom } : {}) }, this.now());
    this.invalidate();
    this.cameraSettled();
  }

  /** La vue a fini de bouger : on la garde (un peu plus tard, en une fois). */
  cameraSettled() {
    if (!this.cameraKey) return;
    if (this.cameraSaveTimer) clearTimeout(this.cameraSaveTimer);
    this.cameraSaveTimer = setTimeout(() => {
      this.cameraSaveTimer = null;
      this.saveCameraNow();
    }, 400);
  }

  private saveCameraNow() {
    if (!this.cameraKey) return;
    saveCamera(this.cameraKey, this.camera.fitted ? null : this.camera.snapshot());
  }

  /** Le fond a sa taille naturelle : c'est la taille du monde (le MJ la corrige au serveur). */
  backgroundLoaded(width: number, height: number) {
    this.camera.setWorld(width, height);
    this.restoreCamera();
    const scene = this.store.getState().scene;
    if (!scene || this.viewer.role !== 'gm' || !this.backend) return;
    if (scene.width === width && scene.height === height) return;
    const previous =
      scene.width && scene.height ? { width: scene.width, height: scene.height } : null;
    void this.adoptBackgroundSize(width, height, previous);
  }

  private async adoptBackgroundSize(
    width: number,
    height: number,
    previous: { width: number; height: number } | null,
  ) {
    const backend = this.backend!;
    try {
      if (previous && this.entityMap.size) {
        const ok = await this.confirm({
          title: 'Le fond a changé de taille',
          message: `Adapter les éléments posés à la nouvelle taille (${previous.width} × ${previous.height} → ${width} × ${height}) ?`,
          confirmLabel: 'Adapter les éléments',
        });
        if (ok) await backend.rescale(width / previous.width, height / previous.height);
      }
      const scene = this.store.getState().scene;
      const saved = await backend.updateScene({ width, height }, scene?.version);
      this.store.getState().setScene(saved);
    } catch {
      // Un autre client du MJ l'a peut-être déjà fait ; la relecture suivante le dira
    }
  }

  // ─── Culling ───────────────────────────────────────────────────────────────

  private cull() {
    this.cullDirty = false;
    if (!this.view) return;
    const rect = this.camera.visibleRect();
    const margin = Math.max(rect.width, rect.height) * 0.1;
    const now = new Set(this.index.queryRect(inflateRect(rect, margin)));
    for (const id of this.inView) {
      if (now.has(id)) continue;
      const e = this.entityMap.get(id);
      if (e) this.view.setEntityVisible(e, false);
    }
    for (const id of now) {
      const e = this.entityMap.get(id);
      if (e) this.view.setEntityVisible(e, e.masks.size === 0);
    }
    this.inView = now;
    this.screenSpace.flush();
  }

  /** Une entité est-elle dans la vue (après le dernier culling) ? */
  isInView(id: string): boolean {
    return this.inView.has(id);
  }

  /** Ajoute ou retire un masque d'une entité (vision, module…). */
  setMask(entity: MapEntity, key: string, masked: boolean) {
    const had = entity.masks.has(key);
    if (had === masked) return;
    if (masked) entity.masks.add(key);
    else entity.masks.delete(key);
    this.view?.setEntityVisible(entity, entity.masks.size === 0 && this.inView.has(entity.id));
    this.invalidate();
  }

  // ─── Direct (§ 8) ──────────────────────────────────────────────────────────

  /** Positions des fantômes des autres ; renvoie vrai tant qu'il y en a. */
  private applyLive(now: number): boolean {
    const live = this.live!;
    const seen = new Set<string>();
    for (const pose of live.poses(now)) {
      const e = this.entityMap.get(pose.entityId);
      // Élément inconnu, ou que je tiens moi-même : ignoré
      if (!e || e.state.dragging) continue;
      seen.add(e.id);
      if (!e.state.remote) {
        e.state.remote = true;
        this.view?.updateEntity(e, { state: true });
      }
      const g = e.geometry;
      this.setPreview(e, {
        x: pose.x,
        y: pose.y,
        rotation: pose.rotation ?? g.rotation,
        width: pose.width ?? g.width,
        height: pose.height ?? g.height,
      });
    }
    for (const id of [...this.remoteIds]) {
      if (seen.has(id)) continue;
      const e = this.entityMap.get(id);
      if (e && !e.state.dragging) {
        e.state.remote = false;
        this.setPreview(e, null);
        this.view?.updateEntity(e, { state: true });
      }
    }
    this.remoteIds.clear();
    for (const id of seen) this.remoteIds.add(id);
    return live.animating(now);
  }

  /** Audience du direct d'une entité (§ 8) : jamais de fuite d'un élément caché. */
  liveAudience(id: string): LiveAudience {
    const e = this.entityMap.get(id);
    if (!e) return 'gm';
    if (this.audienceResolver) return this.audienceResolver(e);
    if (e.kind.liveAudience) return e.kind.liveAudience(e, this.viewer);
    if (e.state.hiddenForPlayers) return 'gm';
    if (e.layerId && this.layer(e.layerId)?.visibleToPlayers === false) return 'gm';
    return 'public';
  }

  private audienceResolver: ((e: MapEntity) => LiveAudience) | null = null;

  /** Le module vision affine l'audience (PNJ visible derrière un mur pour certains). */
  setLiveAudienceResolver(resolver: ((e: MapEntity) => LiveAudience) | null) {
    this.audienceResolver = resolver;
  }

  /** Ping (Alt+clic) ; `focus` (MJ) : « amener tout le monde ici ». */
  ping(world: Point, focus = false) {
    this.view?.showPing(world, 'mine');
    this.live?.ping(world, focus && this.viewer.role === 'gm');
    this.invalidate();
  }

  /** Position du pointeur : partagée si « Montrer mon curseur » est actif. */
  shareCursor(world: Point) {
    if (this.ui.getState().shareCursor) this.live?.cursor(world);
  }

  private cursorTimer: ReturnType<typeof setInterval> | null = null;

  /** « Montrer mon curseur » : un curseur immobile est rappelé chaque seconde aux autres. */
  setShareCursor(on: boolean) {
    this.ui.setState({ shareCursor: on });
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.cursorTimer = null;
    if (on && this.live) this.cursorTimer = setInterval(() => this.live?.keepAlive(), 1_000);
    if (!on) this.live?.cursor(null);
  }

  // ─── Commandes ─────────────────────────────────────────────────────────────

  execute(cmd: Command, options?: { undoable?: boolean }): Promise<boolean> {
    return this.commands.execute(cmd, options);
  }

  notify(message: string) {
    this.notifyFn(message);
  }

  /** Commande de modification, groupée par couche (une par persistance). */
  private updateEntities(
    label: string,
    pairs: readonly { entity: MapEntity; after: MapDto }[],
  ): Command | null {
    const groups = new Map<
      string,
      { kind: EntityKind; changes: { before: MapDto; after: MapDto }[] }
    >();
    for (const { entity, after } of pairs) {
      if (after === entity.data) continue;
      const key = entity.kind.collection;
      const g = groups.get(key) ?? { kind: entity.kind, changes: [] };
      g.changes.push({ before: entity.data, after });
      groups.set(key, g);
    }
    const cmds = [...groups.entries()].map(([collection, g]) =>
      updateCommand({ label, collection, persistence: g.kind.persistence, changes: g.changes }),
    );
    return cmds.length ? groupCommands(label, cmds) : null;
  }

  /** Déplacer, pivoter, redimensionner : une commande pour toute la sélection. */
  transformEntities(changes: readonly Change[], label: string): Promise<boolean> | null {
    const pairs = changes.flatMap(({ entity, next }) =>
      entity.kind.applyGeometry
        ? [{ entity, after: entity.kind.applyGeometry(entity.data, next, this.kindCtx) }]
        : [],
    );
    const cmd = this.updateEntities(label, pairs);
    return cmd ? this.execute(cmd) : null;
  }

  /** Entités où l'action commune est permise. */
  private allowed(
    entities: readonly MapEntity[],
    cap: 'lock' | 'hide' | 'restrictTo' | 'rotate' | 'duplicate' | 'delete' | 'order',
  ) {
    return entities.filter((e) => hasCapability(e.kind, cap) && e.kind.can(cap, e, this.viewer));
  }

  setLocked(entities: readonly MapEntity[], locked: boolean) {
    const pairs = this.allowed(entities, 'lock').flatMap((e) =>
      e.kind.locked ? [{ entity: e, after: e.kind.locked.set(e.data, locked) }] : [],
    );
    const cmd = this.updateEntities(locked ? 'Verrouiller' : 'Déverrouiller', pairs);
    return cmd ? this.execute(cmd) : null;
  }

  setHidden(entities: readonly MapEntity[], hidden: boolean) {
    const pairs = this.allowed(entities, 'hide').flatMap((e) =>
      e.kind.hidden ? [{ entity: e, after: e.kind.hidden.set(e.data, hidden) }] : [],
    );
    const cmd = this.updateEntities(hidden ? 'Masquer aux joueurs' : 'Montrer', pairs);
    return cmd ? this.execute(cmd) : null;
  }

  setRestrictedTo(entities: readonly MapEntity[], characterIds: readonly string[] | null) {
    const pairs = this.allowed(entities, 'restrictTo').flatMap((e) =>
      e.kind.restrictedTo
        ? [{ entity: e, after: e.kind.restrictedTo.set(e.data, characterIds) }]
        : [],
    );
    const cmd = this.updateEntities('Visible pour…', pairs);
    return cmd ? this.execute(cmd) : null;
  }

  rotateEntities(entities: readonly MapEntity[], degrees: number) {
    const changes = this.allowed(entities, 'rotate')
      .filter((e) => !e.state.locked)
      .map((e) => ({
        entity: e,
        next: { ...e.geometry, rotation: normalizeDegrees(e.geometry.rotation + degrees) },
      }));
    return this.transformEntities(changes, 'Pivoter');
  }

  /** Flèches : déplace la sélection (une case, ⇧ : cinq). */
  nudgeSelection(dx: number, dy: number) {
    const entities = this.selectedEntities().filter(
      (e) => hasCapability(e.kind, 'move') && !e.state.locked && e.kind.can('move', e, this.viewer),
    );
    return this.transformEntities(
      entities.map((e) => ({
        entity: e,
        next: { ...e.geometry, x: e.geometry.x + dx, y: e.geometry.y + dy },
      })),
      'Déplacer',
    );
  }

  /** Duplique (décalé d'une case) et sélectionne les copies. */
  duplicateEntities(entities: readonly MapEntity[]) {
    const cell = this.grid()?.size ?? 50;
    const groups = new Map<string, { kind: EntityKind; items: MapDto[] }>();
    for (const e of this.allowed(entities, 'duplicate')) {
      if (!e.kind.duplicate || !e.kind.persistence.create) continue;
      const copy = {
        ...e.kind.duplicate(e.data, { x: cell, y: cell }, this.kindCtx),
        id: tempId(),
      };
      const g = groups.get(e.kind.collection) ?? { kind: e.kind, items: [] };
      g.items.push(copy);
      groups.set(e.kind.collection, g);
    }
    const cmds = [...groups.entries()].map(([collection, g]) =>
      createCommand({
        label: 'Dupliquer',
        collection,
        persistence: g.kind.persistence,
        items: g.items,
      }),
    );
    if (!cmds.length) return null;
    const result = this.execute(groupCommands('Dupliquer', cmds));
    this.selection.replace([...groups.values()].flatMap((g) => g.items.map((i) => i.id)));
    return result;
  }

  duplicateSelection() {
    return this.duplicateEntities(this.selectedEntities());
  }

  /** Supprime (confirmation si une sorte la demande : instance de PNJ). */
  async deleteEntities(entities: readonly MapEntity[]): Promise<boolean> {
    const targets = this.allowed(entities, 'delete');
    if (!targets.length) return false;
    const byKind = new Map<EntityKind, MapEntity[]>();
    for (const e of targets) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
    for (const [kind, list] of byKind) {
      const message = kind.confirmDelete?.(list);
      if (message) {
        const ok = await this.confirm({
          title: 'Supprimer ?',
          message,
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!ok) return false;
      }
    }
    // Sortes qui suppriment elles-mêmes (instance de PNJ, définitive) : à part
    const own = [...byKind].filter(([kind]) => kind.remove);
    const common = targets.filter((e) => !e.kind.remove);
    const runs = own.map(([kind, list]) => kind.remove!(list));
    const groups = new Map<string, { kind: EntityKind; items: MapDto[] }>();
    for (const e of common) {
      const g = groups.get(e.kind.collection) ?? { kind: e.kind, items: [] };
      g.items.push(e.data);
      groups.set(e.kind.collection, g);
    }
    const label = common.length > 1 ? `Supprimer ${common.length} éléments` : 'Supprimer';
    const cmds = [...groups.entries()].map(([collection, g]) =>
      deleteCommand({ label, collection, persistence: g.kind.persistence, items: g.items }),
    );
    if (cmds.length) runs.push(this.execute(groupCommands(label, cmds)));
    return (await Promise.all(runs)).every(Boolean);
  }

  deleteSelection() {
    return this.deleteEntities(this.selectedEntities());
  }

  /**
   * Modifie la scène (point d'apparition, affichage…) : une commande annulable, optimiste,
   * envoyée par `PATCH /maps/:mapId`.
   */
  updateScene(label: string, patch: Record<string, unknown>): Promise<boolean> | null {
    const cmd = this.sceneCommand(label, patch);
    return cmd ? this.execute(cmd) : null;
  }

  /**
   * Commande de modification de la scène, sans l'exécuter : un module la groupe avec d'autres
   * (« Tout découvrir » : `fogFull` et suppression des zones, en une commande).
   */
  sceneCommand(label: string, patch: Record<string, unknown>): Command | null {
    const scene = this.store.getState().scene;
    const backend = this.backend;
    if (!scene || !backend) return null;
    const before: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) before[k] = scene[k] ?? null;
    const make = (from: Record<string, unknown>, to: Record<string, unknown>): Command => ({
      label,
      targets: () => [{ collection: 'scene', id: scene.id }],
      apply: (ctx) => {
        const cur = ctx.store.getState().scene;
        if (cur) ctx.store.getState().setScene({ ...cur, ...to }, { force: true });
      },
      revert: (ctx) => {
        const cur = ctx.store.getState().scene;
        if (cur) ctx.store.getState().setScene({ ...cur, ...from }, { force: true });
      },
      send: async (ctx) => {
        const saved = await backend.updateScene(to, ctx.store.getState().scene?.version);
        ctx.store.getState().setScene(saved, { force: true });
      },
      inverse: () => make(to, from),
    });
    return make(before, patch);
  }

  // ── Ordre et calque (§ 5, Calques) ──

  /** Donnée d'une entité rangée à cette place (calque, `z`). */
  placed(e: MapEntity, layerId: string | null, z: number): MapDto {
    const s = e.kind.stacking!;
    return s.z.set(s.layerId.set(e.data, layerId), z);
  }

  private arrangeChanges(
    moves: readonly { entity: MapEntity; layerId: string | null; z: number }[],
  ): ArrangeChange[] {
    return moves.map(({ entity: e, layerId, z }) => ({
      collection: e.kind.collection,
      kind: e.kind.stacking!.arrangeKind,
      before: e.data,
      after: this.placed(e, layerId, z),
      from: { layerId: e.kind.stacking!.layerId.get(e.data), z: e.z },
      to: { layerId, z },
    }));
  }

  private runArrange(
    label: string,
    moves: { entity: MapEntity; layerId: string | null; z: number }[],
  ) {
    const real = moves.filter((m) => m.layerId !== IMPLICIT_LAYER_ID);
    if (!real.length || !this.backend) return null;
    return this.execute(
      arrangeCommand({ label, changes: this.arrangeChanges(real), send: this.backend.arrange }),
    );
  }

  /** Avancer, reculer, premier plan, arrière-plan, dans le calque de chacun (ordre relatif gardé). */
  arrange(entities: readonly MapEntity[], op: OrderOp) {
    // Dans un calque, ou parmi les annotations (dessins et textes hors calque)
    const targets = this.allowed(entities, 'order').filter(
      (e) => e.kind.stacking && (e.layerId || isAnnotation(e)),
    );
    if (!targets.length) return null;
    const moves: { entity: MapEntity; layerId: string | null; z: number }[] = [];
    for (const layerId of new Set(targets.map((e) => e.layerId))) {
      const stack = layerId ? this.layerContent(layerId) : this.annotationContent();
      const selected = new Set(targets.filter((e) => e.layerId === layerId).map((e) => e.id));
      const order = reorderStack(
        stack.map((e) => e.id),
        selected,
        op,
      );
      const zs = assignZ(order, new Map(stack.map((e) => [e.id, e.z])), selected);
      for (const [id, z] of zs) {
        const e = this.entityMap.get(id)!;
        moves.push({ entity: e, layerId, z });
      }
    }
    const labels: Record<OrderOp, string> = {
      forward: 'Avancer',
      backward: 'Reculer',
      front: 'Premier plan',
      back: 'Arrière-plan',
    };
    return this.runArrange(labels[op], moves);
  }

  /**
   * Change de calque : un calque précis, celui du dessus ou celui du dessous. Les éléments
   * gardent leur ordre relatif et restent au plus près de leur place à l'écran : en bas du
   * calque du dessus quand ils montent, en haut du calque visé sinon.
   */
  moveToLayer(entities: readonly MapEntity[], target: string | 'above' | 'below') {
    const targets = this.allowed(entities, 'order')
      .filter((e) => e.kind.stacking)
      .sort((a, b) => this.compareStack(a, b));
    if (!targets.length || !this.layerList.length) return null;
    const moves: { entity: MapEntity; layerId: string; z: number }[] = [];
    const byDestination = new Map<string, MapEntity[]>();
    for (const e of targets) {
      let dest: string | undefined;
      if (target === 'above' || target === 'below') {
        const i = this.layerIndex(e.layerId);
        dest = this.layerList[i + (target === 'above' ? 1 : -1)]?.id;
        if (i < 0) dest = undefined;
      } else dest = target;
      if (!dest || dest === e.layerId || !this.layerRank.has(dest)) continue;
      byDestination.set(dest, [...(byDestination.get(dest) ?? []), e]);
    }
    for (const [dest, list] of byDestination) {
      const stack = this.layerContent(dest);
      // Monter : en bas du calque du dessus ; sinon : en haut du calque visé
      const below = target === 'above';
      const zs = below ? zAtBottom(stack, list.length) : zOnTop(stack, list.length);
      list.forEach((e, i) => moves.push({ entity: e, layerId: dest, z: zs[i]! }));
    }
    const label =
      target === 'above'
        ? 'Calque au-dessus'
        : target === 'below'
          ? 'Calque en dessous'
          : 'Changer de calque';
    return this.runArrange(label, moves);
  }

  // ─── Menus, inspecteur, confirmation ───────────────────────────────────────

  /** Entrées du menu : actions communes, de la sorte, puis des modules. */
  menuItems(ids: readonly string[], world: Point): MenuItem[] {
    const entities = ids.flatMap((id) => {
      const e = this.entityMap.get(id);
      return e && e.kind.can('view', e, this.viewer) ? [e] : [];
    });
    const items: MenuItem[] = [];
    // « Supprimer » (action dangereuse) toujours en dernier, après les actions de la sorte
    let remove: MenuItem | undefined;
    if (entities.length) {
      const common = commonActions(this, entities);
      remove = common.find((i) => i.id === 'delete');
      items.push(...common.filter((i) => i !== remove));
      // Sélection mixte (token, objet, dessin…) : les seules actions communes
      const kinds = new Set(entities.map((e) => e.kind));
      if (kinds.size === 1) {
        const kind = [...kinds][0]!;
        const own = kind.actions?.(entities, { viewer: this.viewer, engine: this }) ?? [];
        if (own.length) items.push(separator('kind'), ...own);
      }
    }
    for (const provider of this.menuProviders) {
      const extra = provider({ engine: this, entities, world, viewer: this.viewer });
      if (extra.length) items.push(separator(`provider-${items.length}`), ...extra);
    }
    if (remove) items.push(separator('delete'), remove);
    if (!entities.length) items.push(...this.mapMenu(world));
    return trimSeparators(items);
  }

  /** Menu du vide : ping, amener tout le monde ici (MJ), recadrer. */
  private mapMenu(world: Point): MenuItem[] {
    return [
      separator('map'),
      {
        id: 'map:ping',
        label: 'Signaler ici',
        icon: pingIcon,
        shortcut: '⌥ clic',
        run: () => this.ping(world),
      },
      ...(this.viewer.role === 'gm'
        ? [
            {
              id: 'map:focus',
              label: 'Amener tout le monde ici',
              icon: focusIcon,
              run: () => this.ping(world, true),
            },
          ]
        : []),
      { id: 'map:fit', label: 'Recadrer la vue', icon: fitIcon, run: () => this.fitView() },
    ];
  }

  openMenu(request: MenuRequest) {
    this.ui.setState({ menu: request });
  }

  closeMenu() {
    if (this.ui.getState().menu) this.ui.setState({ menu: null });
  }

  openInspector(ids: readonly string[]) {
    this.ui.setState({ inspector: ids.length ? [...ids] : null, menu: null });
  }

  closeInspector() {
    if (this.ui.getState().inspector) this.ui.setState({ inspector: null });
  }

  /** Échap : ferme menu et inspecteur ; renvoie vrai s'il y en avait un. */
  closeOverlays(): boolean {
    const s = this.ui.getState();
    if (!s.menu && !s.inspector) return false;
    this.ui.setState({ menu: null, inspector: null });
    return true;
  }

  /** Demande une confirmation à l'interface (fenêtre du design system). */
  confirm(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    return new Promise((resolve) => {
      this.ui.getState().confirm?.resolve(false);
      this.ui.setState({
        confirm: {
          ...req,
          resolve: (ok) => {
            this.ui.setState({ confirm: null });
            resolve(ok);
          },
        },
      });
    });
  }

  // ─── Calques : état local (panneau) ────────────────────────────────────────

  toggleLayersPanel(open?: boolean) {
    this.ui.setState((s) => ({ layersPanel: open ?? !s.layersPanel }));
  }

  setActiveLayer(id: string | null) {
    this.ui.setState({ activeLayerId: id });
  }

  /** Œil local : cache un calque sur mon écran seulement. */
  setLayerHiddenLocally(id: string, hidden: boolean) {
    const next = new Set(this.ui.getState().hiddenLayers);
    if (hidden) next.add(id);
    else next.delete(id);
    this.ui.setState({ hiddenLayers: next });
    this.view?.syncLayers();
    this.invalidate();
  }

  /** Isoler un calque : les autres sont estompés et ne se touchent plus. */
  setIsolatedLayer(id: string | null) {
    this.ui.setState({ isolatedLayer: id });
    this.view?.syncLayers();
    this.invalidate();
  }

  setViewAs(userId: string | null) {
    this.ui.setState({ viewAs: userId });
    this.invalidate();
  }

  /** Change de viewer (droits relus, rendu mis à jour). */
  setViewer(viewer: MapViewer) {
    this.viewer = viewer;
    this.kindCtx = this.computeKindContext(this.store.getState());
    for (const key of this.byCollection.keys()) this.syncCollection(key, true);
  }
}

const selectIcon = MousePointer2;
const pingIcon = Radio;
const focusIcon = Crosshair;
const fitIcon = Focus;

/** Dessin ou texte hors calque : une annotation, ordonnée parmi les autres annotations. */
const isAnnotation = (e: MapEntity) =>
  e.layerId === null && e.plane === 'annotations' && e.kind.stacking?.optional === true;

function separator(id: string): MenuItem {
  return { id: `sep:${id}`, label: '' };
}

/** Pas de séparateur en tête, en fin, ni deux de suite. */
function trimSeparators(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    const sep = item.id.startsWith('sep:');
    if (sep && (!out.length || out[out.length - 1]!.id.startsWith('sep:'))) continue;
    out.push(item);
  }
  while (out.length && out[out.length - 1]!.id.startsWith('sep:')) out.pop();
  return out;
}
