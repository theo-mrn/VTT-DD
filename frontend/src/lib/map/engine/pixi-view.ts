/**
 * Rendu PixiJS v8 du moteur (docs/carte.md § 4, § 5). Chargé à la demande par
 * `MapEngine.mount` : c'est le seul fichier du moteur qui importe `pixi.js`.
 *
 * - `Application` en WebGL (jamais WebGPU), ticker arrêté : le moteur rend à la demande.
 *   `resolution = min(devicePixelRatio, 2)`, 1,5 au plus sous Windows et sans MSAA (plantages
 *   GPU relevés sur les dés 3D).
 * - Le système d'événements de Pixi est coupé : le toucher est celui du moteur (index spatial).
 * - Un conteneur par plan (`planes.ts`) ; le plan `content` contient un conteneur par calque du
 *   MJ, trié par `sortOrder`, et chaque calque trie ses entités par `z` (tri refait seulement
 *   quand un `z` change).
 * - Fond : `background.ts` (image ou vidéo muette en boucle, 30 i/s au plus, taille du monde).
 * - Destruction complète : scène, textures chargées, contexte WebGL rendu au navigateur.
 */
import * as PIXI from 'pixi.js';
import { Application, Assets, Container, Graphics, Text, type Texture } from 'pixi.js';
import { MapBackground } from './background';
import { destroyDisplay } from './destroy-display';
import type { EntityChange, MapTheme, RenderContext } from './entities/entity-kind';
import type { MapEntity } from './entities/entity';
import { geometryCorners, toWorld, type Point } from './geometry';
import { CORNERS, handlePositions, HANDLE_RADIUS } from './interaction/transform-gizmo';
import { IMPLICIT_LAYER_ID } from './layers';
import type { EngineView, MapEngine } from './map-engine';
import { MAP_PLANES, type PlaneId } from './planes';
import { SelectTool } from './tools/select-tool';
import type { Tool } from './tools/tool';
import type { MapDto } from '../store/map-store';

const PING_MS = 1_400;
/** Opacité des calques estompés quand un calque est isolé. */
const ISOLATED_DIM = 0.2;

const isWindows = () => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return (
    /win/i.test(nav.userAgentData?.platform ?? nav.platform ?? '') || /Windows/i.test(nav.userAgent)
  );
};

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

// ─── Hachures (entité masquée aux joueurs, vue du MJ) ────────────────────────

/** Segments de hachures à 45° dans un rectangle centré (demi-largeur, demi-hauteur). */
function hatchSegments(hw: number, hh: number, step: number): [Point, Point][] {
  const out: [Point, Point][] = [];
  // Droites y = x + c, c de -(hw + hh) à (hw + hh)
  for (let c = -(hw + hh) + step / 2; c < hw + hh; c += step) {
    const x0 = Math.max(-hw, -hh - c);
    const x1 = Math.min(hw, hh - c);
    if (x1 > x0)
      out.push([
        { x: x0, y: x0 + c },
        { x: x1, y: x1 + c },
      ]);
  }
  return out;
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

export async function createPixiView(engine: MapEngine, host: HTMLElement): Promise<EngineView> {
  const app = new Application();
  const windows = isWindows();
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  await app.init({
    width,
    height,
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio || 1, windows ? 1.5 : 2),
    autoDensity: true,
    antialias: !windows,
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

interface CursorSprite {
  root: Container;
  arrow: Graphics;
  label: Text;
  name: string;
}

class PixiView implements EngineView {
  readonly canvas: HTMLCanvasElement;
  readonly pixi = PIXI;
  private readonly world = new Container({ label: 'world' });
  private readonly planes = new Map<PlaneId, Container>();
  private readonly layerContainers = new Map<string, Container>();
  readonly theme: MapTheme;
  private destroyed = false;

  private readonly background: MapBackground;

  // Textures chargées par le moteur et les sortes (libérées à la destruction)
  private readonly textures = new Map<string, Promise<Texture>>();

  // Surcouches
  private readonly adorn = new Graphics({ label: 'adornments' });
  private readonly tooltip: Text;
  private readonly tooltipBack = new Graphics({ label: 'tooltip' });
  private readonly lassoGfx = new Graphics({ label: 'lasso' });
  private readonly pingGfx = new Graphics({ label: 'pings' });
  private readonly cursors = new Map<string, CursorSprite>();
  private pings: Ping[] = [];
  private pingFrame: (() => void) | null = null;

  constructor(
    private readonly engine: MapEngine,
    private readonly app: Application,
    host: HTMLElement,
  ) {
    this.canvas = app.canvas;
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.theme = readTheme(host);

    app.stage.eventMode = 'none';
    app.stage.addChild(this.world);
    for (const id of MAP_PLANES) {
      const plane = new Container({ label: `plane:${id}`, sortableChildren: id === 'content' });
      this.planes.set(id, plane);
      this.world.addChild(plane);
    }
    this.plane('adornments').addChild(this.adorn, this.tooltipBack);
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
      texture: (url) => this.texture(url),
      onLoaded: (w, h) => engine.backgroundLoaded(w, h),
      onError: (url, err) => {
        console.warn('[carte] fond illisible', url, err);
        engine.notify('Le fond de la carte n’a pas pu être chargé.');
      },
      invalidate: () => engine.invalidate(),
      onFrame: (cb) => engine.onFrame(cb),
    });
    this.applyCamera();
  }

  plane(id: PlaneId): Container {
    return this.planes.get(id)!;
  }

  get renderer() {
    return this.app.renderer;
  }

  resize(width: number, height: number) {
    if (this.destroyed) return;
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
  }

  // ─── Contexte de rendu des sortes ──────────────────────────────────────────

  renderContext(): RenderContext {
    return {
      ...this.engine.kindContext(),
      pixi: PIXI,
      zoom: this.engine.camera.zoom,
      theme: this.theme,
      screenSpace: this.engine.screenSpace,
      texture: (url) => this.texture(url),
      invalidate: () => this.engine.invalidate(),
    };
  }

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
    // Dessins propres des enfants libérés, dessins et textures partagés gardés
    if (d) destroyDisplay(d);
  }

  placeEntity(e: MapEntity) {
    const d = e.display;
    if (!d) return;
    const parent = this.containerFor(e);
    if (d.parent !== parent) parent.addChild(d);
    if (d.zIndex !== e.z) d.zIndex = e.z;
  }

  syncTransform(e: MapEntity) {
    const d = e.display;
    if (!d) return;
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
    if (e.display && e.display.visible !== visible) e.display.visible = visible;
  }

  /** Opacité commune : masqué aux joueurs (vue MJ) à 50 %, fantôme d'un autre à 85 %. */
  private applyStateVisual(e: MapEntity) {
    const d = e.display;
    if (!d) return;
    const hidden = e.state.hiddenForPlayers && this.engine.viewer.role === 'gm';
    d.alpha = hidden ? 0.5 : e.state.remote ? 0.85 : 1;
  }

  // ─── Calques ───────────────────────────────────────────────────────────────

  syncLayers() {
    if (this.destroyed) return;
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
    this.world.scale.set(cam.zoom);
    this.world.position.set(width / 2 - cam.x * cam.zoom, height / 2 - cam.y * cam.zoom);
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

  private drawAdornments() {
    const g = this.adorn;
    const engine = this.engine;
    const zoom = engine.camera.zoom;
    const px = 1 / zoom;
    const { primary, muted, background, foreground } = this.theme;
    g.clear();

    const gm = engine.viewer.role === 'gm';
    const selected = engine.selectedEntities();
    const hovered = engine.hovered;

    // Masqués aux joueurs (vue du MJ) : hachures et badge « œil barré »
    if (gm)
      for (const e of engine.entities()) {
        if (!e.state.hiddenForPlayers || !e.display?.visible) continue;
        const c = e.current;
        for (const [a, b] of hatchSegments(c.width / 2, c.height / 2, 10 * px)) {
          const wa = toWorld(c, a);
          const wb = toWorld(c, b);
          g.moveTo(wa.x, wa.y).lineTo(wb.x, wb.y);
        }
        g.stroke({ width: px, color: foreground, alpha: 0.35 });
        const corner = geometryCorners(c)[1];
        const r = 8 * px;
        g.circle(corner.x, corner.y, r)
          .fill({ color: background, alpha: 0.9 })
          .stroke({ width: px, color: muted });
        g.ellipse(corner.x, corner.y, r * 0.55, r * 0.32).stroke({
          width: 1.2 * px,
          color: foreground,
        });
        g.moveTo(corner.x - r * 0.55, corner.y + r * 0.5)
          .lineTo(corner.x + r * 0.55, corner.y - r * 0.5)
          .stroke({ width: 1.2 * px, color: foreground });
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
      return;
    }
    if (this.tooltip.text !== name) this.tooltip.text = name;
    const zoom = this.engine.camera.zoom;
    const b = e.bounds();
    const x = b.x + b.width / 2;
    const y = b.y - 6 / zoom;
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
    g.clear();
    this.pings = this.pings.filter((p) => now - p.start < PING_MS);
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
    const positions = live ? live.cursorPositions(now) : [];
    const seen = new Set<string>();
    for (const c of positions) {
      seen.add(c.userId);
      let s = this.cursors.get(c.userId);
      const name = this.engine.directory.userName(c.userId) ?? 'Joueur';
      if (!s) {
        const root = new Container({ label: `cursor:${c.userId}` });
        const arrow = new Graphics()
          .poly([0, 0, 0, 16, 4.5, 12, 8, 19, 10.5, 18, 7, 11, 12, 11], true)
          .fill({ color: this.theme.primary })
          .stroke({ width: 1.2, color: this.theme.background });
        const label = new Text({
          text: name,
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fill: this.theme.foreground,
          },
          resolution: 2,
        });
        label.position.set(14, 14);
        root.addChild(arrow, label);
        this.plane('live').addChild(root);
        s = { root, arrow, label, name };
        this.cursors.set(c.userId, s);
      }
      if (s.name !== name) {
        s.name = name;
        s.label.text = name;
      }
      s.root.position.set(c.x, c.y);
      s.root.scale.set(1 / zoom);
    }
    for (const [userId, s] of this.cursors) {
      if (seen.has(userId)) continue;
      destroyDisplay(s.root);
      this.cursors.delete(userId);
    }
  }

  /** Aperçu de l'outil actif : lasso de la sélection, ou dessin de l'outil. */
  private drawTool() {
    const tool = this.engine.tools.active;
    const g = this.lassoGfx;
    g.clear();
    if (tool instanceof SelectTool && tool.lasso) {
      const r = tool.lasso;
      const px = 1 / this.engine.camera.zoom;
      g.rect(r.x, r.y, r.width, r.height)
        .fill({ color: this.theme.primary, alpha: 0.08 })
        .stroke({ width: px, color: this.theme.primary, alpha: 0.9 });
    }
    (tool as Tool).renderPreview?.(this.plane('tool'), this.renderContext());
  }

  // ─── Destruction ───────────────────────────────────────────────────────────

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.background.destroy();
    this.pingFrame?.();
    const gl = (this.app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    // Textures du cache Assets : libérées par `unload`, pas par la destruction de la scène
    this.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    for (const url of this.textures.keys()) void Assets.unload(url).catch(() => undefined);
    this.textures.clear();
    this.layerContainers.clear();
    this.cursors.clear();
    // Rendre le contexte WebGL tout de suite (HMR, changement de scène) : pas de fuite
    try {
      if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // Contexte déjà rendu par Pixi
    }
  }
}
