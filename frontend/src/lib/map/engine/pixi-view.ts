/**
 * Rendu PixiJS v8 du moteur (docs/carte.md § 4, § 5). Chargé à la demande par
 * `MapEngine.mount` : c'est le seul fichier du moteur qui importe `pixi.js`.
 *
 * - `Application` en WebGL (jamais WebGPU), ticker arrêté : le moteur rend à la demande.
 *   `resolution = min(devicePixelRatio, 2)`, 1 au plus sur une machine économe (Windows :
 *   plantages GPU relevés sur les dés 3D ; machine modeste). MSAA seulement sous 1,5 et hors
 *   machine économe : au-delà, la densité de pixels lisse déjà les bords.
 * - Le système d'événements de Pixi est coupé : le toucher est celui du moteur (index spatial).
 * - Groupes de rendu : le monde (la caméra est sa seule transformation) et le plan `content`.
 * - Un conteneur par plan (`planes.ts`) ; le plan `content` contient un conteneur par calque du
 *   MJ, trié par `sortOrder`, et chaque calque trie ses entités par `z` (tri refait seulement
 *   quand un `z` change).
 * - Fond : `background.ts` (image avec mipmaps dans le plan `background`, ou vidéo native dans un
 *   calque sous le canvas, transformée comme la caméra ; taille du monde).
 * - Destruction complète : scène, textures chargées, contexte WebGL rendu au navigateur.
 */
import * as PIXI from 'pixi.js';
import { Application, Assets, Container, Graphics, ImageSource, Text, Texture } from 'pixi.js';
import { surCdn, vignette } from '@/lib/assets';
import { prefersEconomy } from '@/lib/perf/device';
import { MapBackground } from './background';
import { backgroundPrefs } from './background-prefs';
import { CursorLayer } from './cursors';
import { destroyDisplay } from './destroy-display';
import type { EntityChange, MapTheme, RenderContext } from './entities/entity-kind';
import type { MapEntity } from './entities/entity';
import { geometryCorners, toWorld, type Point } from './geometry';
import { CORNERS, handlePositions, HANDLE_RADIUS } from './interaction/transform-gizmo';
import { IMPLICIT_LAYER_ID } from './layers';
import type { EngineView, MapEngine } from './map-engine';
import { MAP_PLANES, type PlaneId } from './planes';
import { drawVisibilityBadge, HIDDEN_VEIL, WHITE } from './visibility-badge';

/** Opacité d'un élément mis de côté après un choix entre éléments superposés. */
const SIDELINED_ALPHA = 0.3;
import { SelectTool } from './tools/select-tool';
import type { Tool } from './tools/tool';
import type { MapDto } from '../store/map-store';

const PING_MS = 1_400;
const NO_CURSORS: readonly never[] = [];
/** Opacité des calques estompés quand un calque est isolé. */
const ISOLATED_DIM = 0.2;

// ─── Couleurs du thème (variables CSS « h s% l% ») ───────────────────────────

function hslToNumber(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

function readThemeColor(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const raw = style.getPropertyValue(name).trim();
  const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(raw);
  return m ? hslToNumber(Number(m[1]), Number(m[2]), Number(m[3])) : fallback;
}

function readTheme(host: HTMLElement): MapTheme {
  const style = getComputedStyle(host);
  return {
    primary: readThemeColor(style, '--primary', 0xd4b16a),
    foreground: readThemeColor(style, '--foreground', 0xf4f2ee),
    background: readThemeColor(style, '--background', 0x09090b),
    muted: readThemeColor(style, '--muted-foreground', 0x9f9fa9),
    destructive: readThemeColor(style, '--destructive', 0xe5484d),
    success: readThemeColor(style, '--success', 0x30a46c),
  };
}

/** Côté maximal d'une texture pour ce GPU (8192 si la question échoue). */
function maxTextureSize(app: Application): number {
  const gl = (app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
  try {
    const n = gl?.getParameter(gl.MAX_TEXTURE_SIZE);
    return typeof n === 'number' && n > 0 ? n : 8192;
  } catch {
    return 8192;
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

export async function createPixiView(engine: MapEngine, host: HTMLElement): Promise<EngineView> {
  const app = new Application();
  const economy = prefersEconomy();
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const resolution = Math.min(window.devicePixelRatio || 1, economy ? 1 : 2);
  await app.init({
    width,
    height,
    preference: 'webgl',
    resolution,
    autoDensity: true,
    antialias: !economy && resolution < 1.5,
    backgroundAlpha: 0,
    autoStart: false,
    sharedTicker: false,
    // Toucher maison : le système d'événements de Pixi ne sert à rien ici
    eventMode: 'none',
    eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
  });
  app.ticker.stop();
  return new PixiView(engine, app, host);
}

interface Ping {
  x: number;
  y: number;
  start: number;
  color: number;
}

class PixiView implements EngineView {
  readonly canvas: HTMLCanvasElement;
  readonly pixi = PIXI;
  /**
   * Monde : un groupe de rendu. La caméra n'est que sa transformation (appliquée par le GPU) :
   * un déplacement ou un zoom ne recalcule pas la transformation de chaque entité.
   */
  private readonly world = new Container({ label: 'world', isRenderGroup: true });
  private readonly planes = new Map<PlaneId, Container>();
  private readonly layerContainers = new Map<string, Container>();
  readonly theme: MapTheme;
  private destroyed = false;

  private readonly background: MapBackground;
  /** Calque DOM sous le canvas : le fond vidéo, composé par le navigateur. */
  private readonly underlay: HTMLDivElement;

  // Textures chargées par le moteur et les sortes (libérées à la destruction)
  private readonly textures = new Map<string, Promise<Texture>>();
  /** Textures réduites décodées ici (hors cache Assets), détruites avec la vue. */
  private readonly thumbnails = new Map<string, Promise<Texture>>();
  private readonly ownTextures = new Set<Texture>();

  // Surcouches
  private readonly adorn = new Graphics({ label: 'adornments' });
  private readonly tooltip: Text;
  private readonly tooltipBack = new Graphics({ label: 'tooltip' });
  private readonly lassoGfx = new Graphics({ label: 'lasso' });
  private readonly pingGfx = new Graphics({ label: 'pings' });
  private readonly cursorLayer: CursorLayer;
  private pings: Ping[] = [];
  /** Surcouches communes à refaire (voir `drawAdornments`). */
  private adornDirty = true;
  private adornZoom = 0;
  private pingFrame: (() => void) | null = null;
  /** Clés de ce qui est déjà dessiné : une image sans changement ne retesselle rien. */
  private tooltipKey = '';
  private pingsDrawn = false;
  private lassoKey = '';
  private cursorCss = '';
  private rc: RenderContext | null = null;
  private rcKey: { kind: unknown; zoom: number } = { kind: null, zoom: 0 };

  constructor(
    private readonly engine: MapEngine,
    private readonly app: Application,
    host: HTMLElement,
  ) {
    this.canvas = app.canvas;
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-hidden', 'true');
    // Contexte WebGL restauré par Pixi après une perte (GPU réinitialisé) : rien ne bouge, mais
    // l'image est à refaire (rendu à la demande)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    // Le canvas (transparent) passe au-dessus du calque du fond vidéo
    this.canvas.style.position = 'relative';
    this.underlay = document.createElement('div');
    this.underlay.setAttribute('aria-hidden', 'true');
    Object.assign(this.underlay.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    host.appendChild(this.underlay);
    host.appendChild(this.canvas);
    this.theme = readTheme(host);

    app.stage.eventMode = 'none';
    app.stage.addChild(this.world);
    for (const id of MAP_PLANES) {
      // Contenu (calques du MJ) : son propre groupe de rendu, ses instructions ne sont pas
      // refaites quand un autre plan change (météo, vision, aperçus)
      const content = id === 'content';
      const plane = new Container({
        label: `plane:${id}`,
        sortableChildren: content,
        isRenderGroup: content,
      });
      this.planes.set(id, plane);
      this.world.addChild(plane);
    }
    this.plane('adornments').addChild(this.adorn, this.tooltipBack);
    this.cursorLayer = new CursorLayer(PIXI, this.plane('live'));
    this.tooltip = new Text({
      text: '',
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fill: this.theme.foreground,
      },
      resolution: 2,
    });
    this.tooltip.anchor.set(0.5, 1);
    this.tooltip.visible = false;
    this.tooltipBack.visible = false;
    this.plane('adornments').addChild(this.tooltip);
    this.plane('live').addChild(this.pingGfx);
    this.plane('tool').addChild(this.lassoGfx);
    this.background = new MapBackground({
      plane: this.plane('background'),
      underlay: this.underlay,
      prefs: backgroundPrefs(engine),
      texture: (url) => this.texture(url),
      maxTextureSize: maxTextureSize(app),
      onLoaded: (w, h) => engine.backgroundLoaded(w, h),
      onError: (url, err) => {
        console.warn('[carte] fond illisible', url, err);
        engine.notify('Le fond de la carte n’a pas pu être chargé.');
      },
      invalidate: () => engine.invalidate(),
    });
    this.applyCamera();
  }

  private readonly onContextRestored = () => this.engine.invalidate();

  plane(id: PlaneId): Container {
    return this.planes.get(id)!;
  }

  get renderer() {
    return this.app.renderer;
  }

  resize(width: number, height: number) {
    if (this.destroyed) return;
    this.adornDirty = true;
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
  }

  // ─── Contexte de rendu des sortes ──────────────────────────────────────────

  /** Contexte des sortes et des outils, refait seulement si le contexte du moteur ou le zoom change. */
  renderContext(): RenderContext {
    const kind = this.engine.kindContext();
    const zoom = this.engine.camera.zoom;
    if (this.rc && this.rcKey.kind === kind && this.rcKey.zoom === zoom) return this.rc;
    this.rcKey = { kind, zoom };
    this.rc = {
      ...kind,
      pixi: PIXI,
      zoom,
      theme: this.theme,
      screenSpace: this.engine.screenSpace,
      texture: this.textureFn,
      thumbnail: this.thumbnailFn,
      invalidate: this.invalidateFn,
    };
    return this.rc;
  }

  private readonly thumbnailFn = (url: string, size: number) => this.thumbnail(url, size);

  /**
   * Texture réduite d'une image : redimensionnée par le CDN quand il la sert, sinon décodée
   * ici au plus `size` pixels de petit côté (mipmaps compris). L'original en cas d'échec.
   */
  thumbnail(url: string, size: number): Promise<Texture> {
    if (surCdn(url)) return this.texture(vignette(url, size));
    const key = `${size}:${url}`;
    let t = this.thumbnails.get(key);
    if (!t) {
      t = this.decodeThumbnail(url, size).catch(() => this.texture(url));
      this.thumbnails.set(key, t);
    }
    return t;
  }

  private async decodeThumbnail(url: string, size: number): Promise<Texture> {
    if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap absent');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image illisible (${res.status})`);
    let bitmap = await createImageBitmap(await res.blob());
    const k = size / Math.min(bitmap.width, bitmap.height);
    if (k < 1) {
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * k)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * k)),
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = resized;
    }
    if (this.destroyed) {
      bitmap.close();
      throw new Error('Vue détruite');
    }
    const texture = new Texture({
      source: new ImageSource({
        resource: bitmap,
        alphaMode: 'premultiply-alpha-on-upload',
        autoGenerateMipmaps: true,
      }),
    });
    this.ownTextures.add(texture);
    return texture;
  }

  private readonly textureFn = (url: string) => this.texture(url);
  private readonly invalidateFn = () => this.engine.invalidate();

  /** Texture d'une image, chargée une fois (même URL pour plusieurs entités). */
  texture(url: string): Promise<Texture> {
    let t = this.textures.get(url);
    if (!t) {
      t = Assets.load<Texture>({ src: url, parser: 'texture' });
      this.textures.set(url, t);
      t.catch(() => this.textures.delete(url));
    }
    return t;
  }

  // ─── Entités ───────────────────────────────────────────────────────────────

  /** Conteneur d'accueil d'une entité : son calque (plan `content`) ou son plan. */
  private containerFor(e: MapEntity): Container {
    if (e.plane !== 'content') return this.plane(e.plane);
    return this.layerContainer(e.layerId ?? IMPLICIT_LAYER_ID);
  }

  private layerContainer(id: string): Container {
    let c = this.layerContainers.get(id);
    if (!c) {
      c = new Container({ label: `layer:${id}`, sortableChildren: true });
      c.zIndex = id === IMPLICIT_LAYER_ID ? -1 : this.engine.layerIndex(id);
      this.layerContainers.set(id, c);
      this.plane('content').addChild(c);
    }
    return c;
  }

  addEntity(e: MapEntity) {
    if (this.destroyed || e.display) return;
    this.adornDirty = true;
    const d = new Container({ label: `${e.kind.id}:${e.id}` });
    e.display = d;
    d.zIndex = e.z;
    this.containerFor(e).addChild(d);
    e.kind.render?.(e, this.renderContext());
    this.syncTransform(e);
    this.applyStateVisual(e);
    d.visible = e.masks.size === 0;
  }

  updateEntity(e: MapEntity, change: EntityChange<MapDto>) {
    const d = e.display;
    if (!d || this.destroyed) return;
    this.adornDirty = true;
    if (change.previous !== undefined && !e.kind.update) {
      // Sans mise à jour incrémentale : on vide et on redessine
      for (const child of d.removeChildren()) destroyDisplay(child);
      e.kind.render?.(e, this.renderContext());
    } else {
      e.kind.update?.(e, this.renderContext(), change);
    }
    this.applyStateVisual(e);
  }

  removeEntity(e: MapEntity) {
    const d = e.display;
    e.display = null;
    this.adornDirty = true;
    // Dessins propres des enfants libérés, dessins et textures partagés gardés
    if (d) destroyDisplay(d);
  }

  placeEntity(e: MapEntity) {
    const d = e.display;
    if (!d) return;
    this.adornDirty = true;
    const parent = this.containerFor(e);
    if (d.parent !== parent) parent.addChild(d);
    if (d.zIndex !== e.z) d.zIndex = e.z;
  }

  syncTransform(e: MapEntity) {
    const d = e.display;
    if (!d) return;
    this.adornDirty = true;
    const g = e.geometry;
    const c = e.current;
    const sx = g.width ? c.width / g.width : 1;
    const sy = g.height ? c.height / g.height : 1;
    if (e.kind.transformDisplay === false) {
      // Dessin en coordonnées du monde : seulement l'écart de l'aperçu
      d.pivot.set(g.x, g.y);
      d.position.set(c.x, c.y);
      d.angle = c.rotation - g.rotation;
    } else {
      d.pivot.set(0, 0);
      d.position.set(c.x, c.y);
      d.angle = c.rotation;
    }
    d.scale.set(sx, sy);
  }

  setEntityVisible(e: MapEntity, visible: boolean) {
    if (e.display && e.display.visible !== visible) {
      e.display.visible = visible;
      this.adornDirty = true;
    }
  }

  /** Opacité commune : masqué aux joueurs (vue MJ) à 50 %, fantôme d'un autre à 85 %. */
  private applyStateVisual(e: MapEntity) {
    const d = e.display;
    if (!d) return;
    const hidden = e.state.hiddenForPlayers && this.engine.viewer.role === 'gm';
    d.alpha =
      (hidden ? 0.5 : e.state.remote ? 0.85 : 1) * (e.state.sidelined ? SIDELINED_ALPHA : 1);
  }

  // ─── Calques ───────────────────────────────────────────────────────────────

  syncLayers() {
    if (this.destroyed) return;
    this.adornDirty = true;
    const ui = this.engine.ui.getState();
    const layers = this.engine.layersBottomUp();
    const alive = new Set(layers.map((l) => l.id));
    layers.forEach((l, i) => {
      const c = this.layerContainer(l.id);
      c.zIndex = i;
      const dim = ui.isolatedLayer && ui.isolatedLayer !== l.id ? ISOLATED_DIM : 1;
      c.alpha = Math.max(0, Math.min(1, l.opacity ?? 1)) * dim;
      c.visible = !ui.hiddenLayers.has(l.id);
    });
    for (const [id, c] of this.layerContainers) {
      if (id === IMPLICIT_LAYER_ID || alive.has(id)) continue;
      // Calque disparu : ses entités ont déjà été replacées ; on ne garde pas un conteneur vide
      if (c.children.length) continue;
      this.layerContainers.delete(id);
      c.removeFromParent();
      c.destroy();
    }
  }

  // ─── Fond ──────────────────────────────────────────────────────────────────

  setBackground(url: string | null) {
    if (!this.destroyed) this.background.set(url);
  }

  // ─── Curseur, pings ────────────────────────────────────────────────────────

  setCursor(css: string) {
    if (css === this.cursorCss) return;
    this.cursorCss = css;
    this.canvas.style.cursor = css;
  }

  showPing(p: Point, who: 'mine' | 'other') {
    this.pings.push({
      x: p.x,
      y: p.y,
      start: this.engine.now(),
      color: who === 'mine' ? this.theme.primary : this.theme.foreground,
    });
    this.pingFrame ??= this.engine.onFrame(() => this.pings.length > 0);
  }

  // ─── Image ─────────────────────────────────────────────────────────────────

  private applyCamera() {
    const cam = this.engine.camera;
    const { width, height } = cam.viewport;
    const x = width / 2 - cam.x * cam.zoom;
    const y = height / 2 - cam.y * cam.zoom;
    this.world.scale.set(cam.zoom);
    this.world.position.set(x, y);
    this.background.setCamera(cam.zoom, x, y);
  }

  render(now: number) {
    if (this.destroyed) return;
    this.applyCamera();
    this.drawAdornments();
    this.drawTooltip();
    this.drawLive(now);
    this.drawTool();
    this.app.render();
  }

  /**
   * Contours, hachures et poignées : refaits seulement si une entité, son état, sa place ou sa
   * visibilité ont changé (le moteur passe par les méthodes de la vue), ou le zoom. Une image
   * demandée par autre chose (fond vidéo, brume animée, curseurs, fondus) ne les retesselle pas.
   */
  private drawAdornments() {
    const g = this.adorn;
    const engine = this.engine;
    const zoom = engine.camera.zoom;
    if (!this.adornDirty && zoom === this.adornZoom) return;
    this.adornDirty = false;
    this.adornZoom = zoom;
    const px = 1 / zoom;
    const { primary, muted, background, foreground } = this.theme;
    g.clear();

    const gm = engine.viewer.role === 'gm';
    const selected = engine.selectedEntities();
    const hovered = engine.hovered;

    // Masqués aux joueurs (vue du MJ) : voile blanc et badge « œil barré » (commun aux sortes
    // qui ne dessinent pas le leur, `selfHiddenMark`)
    if (gm)
      for (const e of engine.entities()) {
        if (!e.state.hiddenForPlayers || !e.display?.visible || e.kind.selfHiddenMark) continue;
        const c = e.current;
        const corners = geometryCorners(c);
        g.poly(
          corners.flatMap((p) => [p.x, p.y]),
          true,
        ).fill({
          color: WHITE,
          alpha: HIDDEN_VEIL.hidden,
        });
        drawVisibilityBadge(g, this.theme, 'hidden', corners[1]!.x, corners[1]!.y, px);
      }

    // Une sorte qui dessine elle-même son survol et sa sélection (mur, zone) n'a pas de contour
    if (hovered && !hovered.state.selected && hovered.display?.visible && !hovered.kind.selfOutline)
      this.outline(g, hovered.current, 1.5 * px, primary, 0.6);

    for (const e of selected) {
      if (e.kind.selfOutline) continue;
      if (!e.display?.visible && !e.state.dragging) continue;
      this.outline(g, e.current, 1.5 * px, e.state.locked ? muted : primary, 1);
    }

    // Poignées de l'entité seule sélectionnée
    const target = engine.gizmoTarget();
    if (target && !target.state.remote) {
      const opts = engine.gizmoOptions(target);
      const pos = handlePositions(target.current, zoom, opts);
      const s = HANDLE_RADIUS * px;
      if (pos.rotate) {
        const top = toWorld(target.current, { x: 0, y: -target.current.height / 2 });
        g.moveTo(top.x, top.y)
          .lineTo(pos.rotate.x, pos.rotate.y)
          .stroke({ width: px, color: primary });
        g.circle(pos.rotate.x, pos.rotate.y, s * 0.8)
          .fill({ color: background })
          .stroke({ width: 1.5 * px, color: primary });
      }
      for (const corner of CORNERS) {
        const p = pos[corner];
        if (!p) continue;
        g.rect(p.x - s * 0.7, p.y - s * 0.7, s * 1.4, s * 1.4)
          .fill({ color: background })
          .stroke({ width: 1.5 * px, color: primary });
      }
    }
  }

  private outline(
    g: Graphics,
    geo: MapEntity['current'],
    width: number,
    color: number,
    alpha: number,
  ) {
    const [a, b, c, d] = geometryCorners(geo);
    if (geo.width === 0 && geo.height === 0) {
      g.circle(geo.x, geo.y, 6 / this.engine.camera.zoom).stroke({ width, color, alpha });
      return;
    }
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y], true).stroke({ width, color, alpha });
  }

  /** Nom de l'entité survolée, au-dessus d'elle, à taille constante. */
  private drawTooltip() {
    const id = this.engine.tooltipId;
    const e = id ? this.engine.entity(id) : undefined;
    const name = e?.kind.name?.(e.data, this.engine.kindContext()) ?? null;
    if (!e || !name || !e.display?.visible || e.state.dragging) {
      this.tooltip.visible = false;
      this.tooltipBack.visible = false;
      this.tooltipKey = '';
      return;
    }
    const zoom = this.engine.camera.zoom;
    const b = e.bounds();
    const x = b.x + b.width / 2;
    const y = b.y - 6 / zoom;
    const key = `${name}|${x}|${y}|${zoom}`;
    if (key === this.tooltipKey) return;
    this.tooltipKey = key;
    if (this.tooltip.text !== name) this.tooltip.text = name;
    this.tooltip.visible = true;
    this.tooltip.scale.set(1 / zoom);
    this.tooltip.position.set(x, y - 3 / zoom);
    const w = (this.tooltip.width + 12 / zoom) / 1;
    const h = this.tooltip.height + 6 / zoom;
    this.tooltipBack.visible = true;
    this.tooltipBack
      .clear()
      .roundRect(x - w / 2, y - h, w, h, 6 / zoom)
      .fill({ color: this.theme.background, alpha: 0.85 })
      .stroke({ width: 1 / zoom, color: this.theme.muted, alpha: 0.5 });
  }

  /** Pings (ondes) et curseurs des autres. */
  private drawLive(now: number) {
    const zoom = this.engine.camera.zoom;
    const g = this.pingGfx;
    if (this.pings.length) this.pings = this.pings.filter((p) => now - p.start < PING_MS);
    // Sans ping : rien à effacer une fois l'onde partie
    if (this.pings.length || this.pingsDrawn) g.clear();
    this.pingsDrawn = this.pings.length > 0;
    for (const p of this.pings) {
      const t = (now - p.start) / PING_MS;
      for (const delay of [0, 0.25]) {
        const k = t - delay;
        if (k <= 0 || k >= 1) continue;
        const r = (12 + 60 * k) / zoom;
        g.circle(p.x, p.y, r).stroke({ width: 3 / zoom, color: p.color, alpha: 1 - k });
      }
      g.circle(p.x, p.y, 4 / zoom).fill({ color: p.color, alpha: 1 - t });
    }
    if (!this.pings.length && this.pingFrame) {
      this.pingFrame();
      this.pingFrame = null;
    }

    const live = this.engine.live;
    this.cursorLayer.sync(
      live ? live.cursorPositions(now) : NO_CURSORS,
      zoom,
      (userId) => this.engine.directory.userName(userId) ?? 'Joueur',
    );
  }

  /** Aperçu de l'outil actif : lasso de la sélection, ou dessin de l'outil. */
  private drawTool() {
    const tool = this.engine.tools.active;
    const g = this.lassoGfx;
    const r = tool instanceof SelectTool ? tool.lasso : null;
    const zoom = this.engine.camera.zoom;
    const key = r ? `${r.x}:${r.y}:${r.width}:${r.height}:${zoom}` : '';
    if (key !== this.lassoKey) {
      this.lassoKey = key;
      g.clear();
      if (r)
        g.rect(r.x, r.y, r.width, r.height)
          .fill({ color: this.theme.primary, alpha: 0.08 })
          .stroke({ width: 1 / zoom, color: this.theme.primary, alpha: 0.9 });
    }
    (tool as Tool).renderPreview?.(this.plane('tool'), this.renderContext());
  }

  // ─── Destruction ───────────────────────────────────────────────────────────

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.background.destroy();
    this.underlay.remove();
    this.pingFrame?.();
    const gl = (this.app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    // Textures du cache Assets : libérées par `unload`, pas par la destruction de la scène
    this.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    for (const url of this.textures.keys()) void Assets.unload(url).catch(() => undefined);
    this.textures.clear();
    for (const t of this.ownTextures) {
      const bitmap = t.source.resource as ImageBitmap | undefined;
      t.destroy(true);
      bitmap?.close?.();
    }
    this.ownTextures.clear();
    this.thumbnails.clear();
    this.layerContainers.clear();
    this.cursorLayer.destroy();
    // Rendre le contexte WebGL tout de suite (HMR, changement de scène) : pas de fuite
    try {
      if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // Contexte déjà rendu par Pixi
    }
  }
}
