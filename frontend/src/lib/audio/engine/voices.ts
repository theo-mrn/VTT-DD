/**
 * Voix du moteur (docs/audio.md § 3.8) :
 * - `MediaVoice` : un `HTMLAudioElement` du pool (16 au plus), branché une
 *   seule fois sur le graphe (`createMediaElementSource`), réutilisé en
 *   changeant `src` : musique, ambiance, zones, effets longs ;
 * - `BufferVoice` : `AudioBufferSourceNode` depuis le cache, pour les effets
 *   courts (latence minimale, superposition).
 * `dispose()` est idempotent : arrêt, `disconnect()` de tous les nœuds,
 * `removeAttribute('src')` + `load()` pour libérer le décodeur, retour au pool.
 */
import { nodeStats, rampGain } from './graph';

export const POOL_SIZE = 16;

export interface Voice {
  readonly id: string;
  readonly disposed: boolean;
  /** Gain de la voix (fondu en `ms`). */
  setGain(value: number, ms?: number, atCtx?: number): void;
  dispose(fadeMs?: number): void;
}

interface PooledElement {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  owner: MediaVoice | null;
}

/** Pool d'éléments audio d'un contexte : un `MediaElementAudioSourceNode` par élément, à vie. */
export class ElementPool {
  private readonly items: PooledElement[] = [];
  /** Voix actives, de la plus ancienne à la plus récente (vol de voix). */
  private readonly active: MediaVoice[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly createElement: () => HTMLAudioElement = () => new Audio(),
    readonly size = POOL_SIZE,
  ) {}

  /** Sources créées (au plus une par élément). */
  get sources(): number {
    return this.items.length;
  }

  acquire(voice: MediaVoice): PooledElement {
    let item = this.items.find((i) => !i.owner);
    if (!item && this.items.length < this.size) {
      const el = this.createElement();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      item = {
        el,
        source: (this.ctx as AudioContext).createMediaElementSource(el),
        owner: null,
      };
      this.items.push(item);
    }
    if (!item) {
      // Plus d'élément libre : la voix la plus ancienne est volée
      this.active[0]?.dispose();
      item = this.items.find((i) => !i.owner)!;
    }
    item.owner = voice;
    this.active.push(voice);
    return item;
  }

  release(item: PooledElement) {
    const i = this.active.indexOf(item.owner!);
    if (i >= 0) this.active.splice(i, 1);
    item.owner = null;
  }
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export class MediaVoice implements Voice {
  readonly id = nextId('media');
  disposed = false;
  private readonly item: PooledElement;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode | null;
  onEnded: (() => void) | null = null;
  onPlaying: (() => void) | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly pool: ElementPool,
    readonly url: string,
    destination: AudioNode,
    o: { pan?: boolean; loop?: boolean; initialGain?: number } = {},
  ) {
    this.item = pool.acquire(this);
    const el = this.item.el;
    this.gain = ctx.createGain();
    nodeStats.live += 1;
    this.gain.gain.value = o.initialGain ?? 0;
    this.panner = o.pan ? ctx.createStereoPanner() : null;
    if (this.panner) nodeStats.live += 1;
    this.item.source.connect(this.gain);
    if (this.panner) {
      this.gain.connect(this.panner);
      this.panner.connect(destination);
    } else this.gain.connect(destination);
    el.loop = !!o.loop;
    el.playbackRate = 1;
    el.onended = () => this.onEnded?.();
    el.onplaying = () => this.onPlaying?.();
    if (el.getAttribute?.('src') !== url) {
      el.src = url;
      el.load?.();
    }
  }

  get element(): HTMLAudioElement {
    return this.item.el;
  }

  /** Position lue sur l'élément (ms). */
  get positionMs(): number {
    return this.item.el.currentTime * 1000;
  }

  get durationMs(): number | null {
    const d = this.item.el.duration;
    return Number.isFinite(d) && d > 0 ? d * 1000 : null;
  }

  get paused(): boolean {
    return this.item.el.paused;
  }

  /** Démarre à `positionMs` après `delayMs` (0 : tout de suite). */
  start(positionMs: number, delayMs = 0) {
    if (this.disposed) return;
    if (this.startTimer) clearTimeout(this.startTimer);
    const go = () => {
      this.startTimer = null;
      if (this.disposed) return;
      this.seek(positionMs);
      this.item.el.play().catch(() => undefined);
    };
    if (delayMs > 4) {
      this.seek(positionMs);
      this.startTimer = setTimeout(go, delayMs);
    } else go();
  }

  seek(positionMs: number) {
    try {
      this.item.el.currentTime = Math.max(0, positionMs / 1000);
    } catch {
      // Métadonnées pas encore chargées : la correction de dérive recalera
    }
  }

  pause() {
    this.item.el.pause();
  }

  setRate(rate: number) {
    const el = this.item.el;
    el.preservesPitch = true;
    el.playbackRate = rate;
  }

  setGain(value: number, ms = 0, atCtx?: number) {
    if (this.disposed) return;
    rampGain(this.gain.gain, this.ctx, value, ms, atCtx);
  }

  /** Glissement continu du gain (spatialisation, à chaque image) : jamais `.value =`. */
  glideGain(value: number, timeConstantS = 0.05) {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(Math.max(0, value), t, timeConstantS);
  }

  setPan(value: number) {
    if (!this.panner || this.disposed) return;
    const t = this.ctx.currentTime;
    this.panner.pan.cancelScheduledValues(t);
    this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), t, 0.05);
  }

  dispose(fadeMs = 0) {
    if (this.disposed) return;
    this.disposed = true;
    if (this.startTimer) clearTimeout(this.startTimer);
    const release = () => {
      const el = this.item.el;
      el.pause();
      el.onended = null;
      el.onplaying = null;
      this.item.source.disconnect();
      this.gain.disconnect();
      nodeStats.live -= 1;
      if (this.panner) {
        this.panner.disconnect();
        nodeStats.live -= 1;
      }
      el.removeAttribute('src');
      el.load?.();
      this.pool.release(this.item);
    };
    if (fadeMs > 0) {
      rampGain(this.gain.gain, this.ctx, 0, fadeMs);
      setTimeout(release, fadeMs + 20);
    } else release();
  }
}

export class BufferVoice implements Voice {
  readonly id = nextId('buffer');
  disposed = false;
  private readonly source: AudioBufferSourceNode;
  private readonly gain: GainNode;
  onEnded: (() => void) | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    buffer: AudioBuffer,
    destination: AudioNode,
    gain: number,
    whenCtx: number,
  ) {
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.gain = ctx.createGain();
    nodeStats.live += 2;
    this.gain.gain.value = gain;
    this.source.connect(this.gain);
    this.gain.connect(destination);
    this.source.onended = () => {
      this.onEnded?.();
      this.dispose();
    };
    this.source.start(Math.max(ctx.currentTime, whenCtx));
  }

  setGain(value: number, ms = 0) {
    if (!this.disposed) rampGain(this.gain.gain, this.ctx, value, ms);
  }

  dispose(fadeMs = 0) {
    if (this.disposed) return;
    this.disposed = true;
    const release = () => {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // Déjà arrêtée
      }
      this.source.disconnect();
      this.gain.disconnect();
      nodeStats.live -= 2;
    };
    if (fadeMs > 0) {
      rampGain(this.gain.gain, this.ctx, 0, fadeMs);
      setTimeout(release, fadeMs + 20);
    } else release();
  }
}
