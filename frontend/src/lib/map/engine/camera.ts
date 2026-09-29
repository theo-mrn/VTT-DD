/**
 * Caméra de la carte (docs/carte.md § 4) : `x, y` est le point du monde au centre de la vue,
 * `zoom` le nombre de pixels d'écran par pixel du monde. Du calcul pur, sans Pixi : le moteur
 * applique la caméra au conteneur du monde et la réapplique à chaque changement.
 *
 * - À l'arrivée, cadrage « contenir » avec une marge de 24 px : chacun voit toute la carte,
 *   quelle que soit la taille de son écran. Tant que l'utilisateur n'a pas bougé la vue, elle
 *   reste cadrée quand la fenêtre change de taille (`fitted`).
 * - Zoom borné entre `fit × 0,25` et 8 ; le centre reste sur la carte.
 * - `flyTo` anime la vue (ping « amener tout le monde ici ») ; le moteur appelle `step(now)` à
 *   chaque image tant que `animating` est vrai.
 * - La dernière vue est gardée par utilisateur et par carte (`loadCamera` / `saveCamera`), dans
 *   le `localStorage`, pour le confort seulement : une erreur de stockage est ignorée.
 */
import type { Point, Rect } from './geometry';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Marge du cadrage « contenir », en pixels d'écran. */
export const FIT_MARGIN = 24;
export const MAX_ZOOM = 8;
/** Zoom minimal : cette fraction du cadrage « contenir ». */
export const MIN_ZOOM_FACTOR = 0.25;

interface Flight {
  from: CameraState;
  to: CameraState;
  start: number;
  duration: number;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewport: Size = { width: 0, height: 0 };
  world: Size = { width: 0, height: 0 };
  /** Vue au cadrage « contenir » : elle y reste quand la fenêtre ou le fond change de taille. */
  fitted = true;
  private flight: Flight | null = null;
  private readonly listeners = new Set<() => void>();

  /** Abonnement aux changements (rendu, index de culling, sauvegarde). */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  snapshot(): CameraState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  // ── Bornes ──

  /** Zoom du cadrage « contenir » (1 tant que le monde ou la vue sont inconnus). */
  fitZoom(): number {
    const { width: w, height: h } = this.world;
    const { width: vw, height: vh } = this.viewport;
    if (!w || !h || !vw || !vh) return 1;
    const aw = Math.max(1, vw - 2 * FIT_MARGIN);
    const ah = Math.max(1, vh - 2 * FIT_MARGIN);
    return Math.min(aw / w, ah / h);
  }

  minZoom(): number {
    return Math.min(this.fitZoom() * MIN_ZOOM_FACTOR, MAX_ZOOM);
  }

  maxZoom(): number {
    return Math.max(MAX_ZOOM, this.fitZoom());
  }

  clampZoom(zoom: number): number {
    return Math.min(this.maxZoom(), Math.max(this.minZoom(), zoom));
  }

  /** Garde le zoom dans ses bornes et le centre sur la carte. */
  private clamp() {
    this.zoom = this.clampZoom(this.zoom);
    const { width: w, height: h } = this.world;
    if (w > 0) this.x = Math.min(w, Math.max(0, this.x));
    if (h > 0) this.y = Math.min(h, Math.max(0, this.y));
  }

  // ── Taille de la vue et du monde ──

  setViewport(width: number, height: number) {
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { width, height };
    if (this.fitted) this.applyFit();
    else this.clamp();
    this.emit();
  }

  setWorld(width: number, height: number) {
    if (width === this.world.width && height === this.world.height) return;
    this.world = { width, height };
    if (this.fitted) this.applyFit();
    else this.clamp();
    this.emit();
  }

  private applyFit() {
    this.zoom = this.fitZoom();
    this.x = this.world.width / 2;
    this.y = this.world.height / 2;
  }

  /** Recadre toute la carte (double clic du milieu, bouton « Recadrer »). */
  fit() {
    this.flight = null;
    this.fitted = true;
    this.applyFit();
    this.emit();
  }

  /** Place la vue (restauration, direct) ; elle n'est plus au cadrage « contenir ». */
  set(state: CameraState) {
    this.flight = null;
    this.fitted = false;
    this.x = state.x;
    this.y = state.y;
    this.zoom = state.zoom;
    this.clamp();
    this.emit();
  }

  // ── Conversions ──

  worldToScreen(p: Point): Point {
    return {
      x: (p.x - this.x) * this.zoom + this.viewport.width / 2,
      y: (p.y - this.y) * this.zoom + this.viewport.height / 2,
    };
  }

  screenToWorld(p: Point): Point {
    return {
      x: (p.x - this.viewport.width / 2) / this.zoom + this.x,
      y: (p.y - this.viewport.height / 2) / this.zoom + this.y,
    };
  }

  /** Rectangle du monde visible à l'écran (culling, lasso, direct). */
  visibleRect(): Rect {
    const width = this.viewport.width / this.zoom;
    const height = this.viewport.height / this.zoom;
    return { x: this.x - width / 2, y: this.y - height / 2, width, height };
  }

  /** Pixels d'écran → pixels du monde (tolérances, seuils). */
  screenToWorldLength(px: number): number {
    return px / this.zoom;
  }

  // ── Gestes ──

  /** Zoom autour d'un point de l'écran : ce point du monde reste sous le curseur. */
  zoomAt(screen: Point, factor: number) {
    this.flight = null;
    const before = this.screenToWorld(screen);
    this.zoom = this.clampZoom(this.zoom * factor);
    const after = this.screenToWorld(screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.fitted = false;
    this.clamp();
    this.emit();
  }

  /** Déplace la vue d'un glissé en pixels d'écran (la carte suit le pointeur). */
  panBy(dxScreen: number, dyScreen: number) {
    if (!dxScreen && !dyScreen) return;
    this.flight = null;
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.fitted = false;
    this.clamp();
    this.emit();
  }

  // ── Animation ──

  get animating(): boolean {
    return this.flight !== null;
  }

  /** Anime la vue vers une cible (zoom facultatif) ; `step` la fait avancer. */
  flyTo(target: { x: number; y: number; zoom?: number }, now: number, duration = 450) {
    const to = { x: target.x, y: target.y, zoom: this.clampZoom(target.zoom ?? this.zoom) };
    this.fitted = false;
    if (duration <= 0) {
      this.set(to);
      return;
    }
    this.flight = { from: this.snapshot(), to, start: now, duration };
    this.emit();
  }

  /** Avance l'animation ; renvoie vrai tant qu'elle continue. */
  step(now: number): boolean {
    const f = this.flight;
    if (!f) return false;
    const t = Math.min(1, Math.max(0, (now - f.start) / f.duration));
    const k = easeInOutCubic(t);
    this.x = f.from.x + (f.to.x - f.from.x) * k;
    this.y = f.from.y + (f.to.y - f.from.y) * k;
    // Zoom interpolé en échelle logarithmique : la vitesse perçue reste constante
    this.zoom = Math.exp(Math.log(f.from.zoom) + (Math.log(f.to.zoom) - Math.log(f.from.zoom)) * k);
    if (t >= 1) this.flight = null;
    this.clamp();
    this.emit();
    return this.flight !== null;
  }

  cancelAnimation() {
    this.flight = null;
  }
}

/**
 * Facteur de zoom d'un événement molette. La molette d'une souris zoome par crans ; le
 * pincement du pavé tactile arrive en molette avec `ctrlKey` et de petits deltas, plus
 * sensibles.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  // deltaMode : 0 pixels, 1 lignes, 2 pages
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const sensitivity = ctrlKey ? 0.01 : 0.0015;
  const clamped = Math.max(-100, Math.min(100, pixels));
  return Math.exp(-clamped * sensitivity);
}

// ─── Mémoire de la vue (localStorage, confort) ──────────────────────────────

export const cameraStorageKey = (userId: string, mapId: string) =>
  `vtt:map-camera:${userId}:${mapId}`;

/** Dernière vue gardée pour cet utilisateur et cette carte, ou null. */
export function loadCamera(key: string): CameraState | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CameraState>;
    if (
      typeof v.x === 'number' &&
      typeof v.y === 'number' &&
      typeof v.zoom === 'number' &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y) &&
      v.zoom > 0
    )
      return { x: v.x, y: v.y, zoom: v.zoom };
  } catch {
    // Stockage indisponible (navigation privée, quota) : on cadre la carte
  }
  return null;
}

/** Garde la vue ; `null` l'oublie (vue recadrée). */
export function saveCamera(key: string, state: CameraState | null) {
  try {
    if (state) globalThis.localStorage?.setItem(key, JSON.stringify(state));
    else globalThis.localStorage?.removeItem(key);
  } catch {
    // Confort seulement
  }
}
