/**
 * Canvas de la météo (docs/carte.md § 10, Météo ; docs/performances.md) : un second rendu
 * WebGL, transparent, posé juste au-dessus du canvas de la carte.
 *
 * - Une image de météo ne rend que ce canvas : la carte (fond, grille, contenu, vision…) n'est
 *   redessinée qu'à ses propres changements.
 * - Un `WebGLRenderer` nu (ni `Application`, ni ticker, ni redimensionnement automatique) : la
 *   boucle est celle du module. Un seul renderer WebGL ne peut pas dessiner dans deux canvas
 *   sans recopie : le mode `multiView` de Pixi rend dans un canvas caché puis copie chaque image
 *   (`drawImage`) dans le canvas cible, la carte comprise.
 * - Créé à la première météo active seulement : sans météo, la page garde ses deux contextes
 *   (carte, dés). Caché (`display: none`) quand la météo s'arrête : le navigateur ne le compose
 *   plus.
 * - Même taille (pixels CSS) et même résolution que la carte ; `pointer-events: none` : le
 *   toucher reste celui du canvas de la carte.
 * - Destruction : scène, renderer, canvas retiré ; Pixi rend le contexte au navigateur
 *   (`WEBGL_lose_context`).
 */
import type * as Pixi from 'pixi.js';

export interface WeatherOverlayOptions {
  /** Résolution du canvas de la carte (pixels physiques par pixel CSS). */
  resolution: number;
  width: number;
  height: number;
}

export class WeatherOverlay {
  /** Racine de la scène de la météo, en pixels d'écran (aucune caméra). */
  readonly stage: Pixi.Container;
  readonly canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private shown = false;
  private destroyed = false;
  private onRestored: (() => void) | null = null;
  private readonly restored = () => this.onRestored?.();

  private constructor(
    pixi: typeof Pixi,
    private readonly renderer: Pixi.Renderer,
    above: HTMLCanvasElement,
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
    this.stage = new pixi.Container({ label: 'weather:stage' });
    this.stage.eventMode = 'none';
    const canvas = renderer.canvas;
    this.canvas = canvas;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      display: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    canvas.addEventListener('webglcontextrestored', this.restored);
    // Juste après le canvas de la carte : sous les éditeurs DOM posés ensuite dans l'hôte
    above.after(canvas);
  }

  /** Crée le renderer (asynchrone) et pose son canvas au-dessus de `above`. */
  static async create(
    pixi: typeof Pixi,
    above: HTMLCanvasElement,
    options: WeatherOverlayOptions,
  ): Promise<WeatherOverlay> {
    const width = Math.max(1, options.width);
    const height = Math.max(1, options.height);
    const renderer = new pixi.WebGLRenderer();
    await renderer.init({
      width,
      height,
      resolution: options.resolution,
      autoDensity: true,
      antialias: false,
      backgroundAlpha: 0,
      powerPreference: 'low-power',
      // Aucun toucher : le système d'événements ne sert à rien ici
      eventMode: 'none',
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    return new WeatherOverlay(pixi, renderer as unknown as Pixi.Renderer, above, width, height);
  }

  /** Contexte WebGL restauré par Pixi : textures de canevas à renvoyer, image à refaire. */
  setRestoreHandler(cb: (() => void) | null) {
    this.onRestored = cb;
  }

  /** Suit la taille de la vue (pixels CSS) ; rien si elle n'a pas changé. */
  resize(width: number, height: number) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.destroyed || (w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.resize(w, h);
  }

  /** Affiche ou cache le canvas (caché : plus composé par le navigateur). */
  setShown(shown: boolean) {
    if (this.destroyed || shown === this.shown) return;
    this.shown = shown;
    this.canvas.style.display = shown ? 'block' : 'none';
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Une image de la météo, et elle seule. */
  render() {
    if (this.destroyed) return;
    this.renderer.render({ container: this.stage });
  }

  /** Scène, renderer et canvas libérés ; le contexte est rendu au navigateur par Pixi. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.onRestored = null;
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.stage.destroy({ children: true });
    // Pas de `releaseGlobalResources` : les réserves globales de Pixi servent encore à la carte
    this.renderer.destroy({ removeView: true });
  }
}
