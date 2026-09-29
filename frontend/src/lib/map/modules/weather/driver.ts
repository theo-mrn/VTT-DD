/**
 * Cadence de la météo (docs/carte.md § 10, Météo), sans Pixi ni DOM, testée à blanc.
 *
 * - La simulation avance à chaque image rendue (un glisser rend déjà à 60 i/s) ; la météo ne
 *   demande elle-même une image que ~33 ms après la précédente : 30 i/s au plus.
 * - En pause (animation coupée, onglet caché, vue nulle) ou à l'arrêt (aucune météo) : aucun
 *   minuteur, aucun pas de simulation.
 * - Le rappel du minuteur est créé une fois : aucune allocation par image.
 */
import { WEATHER_FPS } from './model';

/** Pas de simulation le plus long (retour sur l'onglet, image lente). */
export const MAX_STEP_S = 0.1;
/**
 * Image suivante demandée à ce délai après le début de l'image (horodatage de
 * `requestAnimationFrame`) : un peu moins de 33 ms, pour qu'elle tombe sur la synchronisation
 * verticale de 33 ms (60, 90, 120 Hz) ou juste après (144 Hz), jamais avant. Un minuteur de
 * 33 ms pile ferait attendre la synchronisation suivante : 20 i/s à 60 Hz.
 */
export const FRAME_TARGET_MS = 1000 / WEATHER_FPS - 5;

export interface DriverEnv {
  now(): number;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Onglet en arrière-plan. */
  hidden(): boolean;
}

export interface DriverState {
  /** Une météo à dessiner. */
  active: boolean;
  /** Animation permise (préférence, « mouvement réduit »). */
  animate: boolean;
  /** Vue de taille non nulle. */
  visible: boolean;
}

export const browserEnv = (): DriverEnv => ({
  now: () => performance.now(),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
});

export class WeatherDriver {
  private timer: unknown = null;
  private last = 0;
  /** Vrai tant que la météo s'anime (minuteur armé à chaque image). */
  running = false;
  private readonly tick = () => {
    this.timer = null;
    this.request();
  };

  constructor(
    private readonly request: () => void,
    private readonly env: DriverEnv = browserEnv(),
  ) {}

  /**
   * Appelé à chaque image rendue : renvoie le pas de simulation (secondes), 0 en pause ; arme
   * l'image suivante si la météo s'anime.
   */
  frame(now: number, state: DriverState): number {
    const running = state.active && state.animate && state.visible && !this.env.hidden();
    if (!running) {
      this.stop();
      return 0;
    }
    const dt = this.running ? Math.min(MAX_STEP_S, (now - this.last) / 1000) : 0;
    this.last = now;
    this.running = true;
    if (this.timer === null)
      this.timer = this.env.setTimeout(
        this.tick,
        Math.max(0, now + FRAME_TARGET_MS - this.env.now()),
      );
    return Math.max(0, dt);
  }

  /** Pause ou arrêt : plus de minuteur ; la reprise repart d'un pas nul. */
  stop() {
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    this.last = 0;
  }

  /** Une minuterie est-elle armée (tests, mesures) ? */
  get scheduled(): boolean {
    return this.timer !== null;
  }
}
