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
import { registerVoice, unregisterVoice, type LiveKind, type Registered } from './registry';

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
  /** Absent en mode direct : l'élément n'est pas branché sur le graphe. */
  source: MediaElementAudioSourceNode | null;
  owner: MediaVoice | null;
}

/** Lecture directe (Safari) : volume de l'élément, multiplié par le gain hors graphe du bus. */
export interface DirectMode {
  /** Gain du mixeur pour la destination voulue (bus du graphe) : volume × général. */
  gainFor(destination: AudioNode): number;
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
    /** Présent : les éléments ne sont jamais branchés sur Web Audio (voir compat.ts). */
    readonly direct: DirectMode | null = null,
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
        source: this.direct ? null : (this.ctx as AudioContext).createMediaElementSource(el),
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

/** Gain au-dessous duquel une voix est considérée muette. */
const AUDIBLE = 0.001;
/** Passe-bas grand ouvert : rien n'est coupé dans l'audible. */
export const OPEN_CUTOFF_HZ = 20_000;

/** Nœuds d'une voix branchée sur le graphe. */
interface VoiceChain {
  gain: GainNode;
  panner: StereoPannerNode | null;
  filter: BiquadFilterNode | null;
}

/** Graphe d'une voix : source → gain → [passe-bas] → [panoramique] → bus ; null sans source. */
function buildChain(
  ctx: BaseAudioContext,
  source: MediaElementAudioSourceNode | null,
  destination: AudioNode,
  o: { pan?: boolean; muffle?: boolean; initialGain?: number },
): VoiceChain | null {
  if (!source) return null;
  const gain = ctx.createGain();
  nodeStats.live += 1;
  gain.gain.value = o.initialGain ?? 0;
  const panner = o.pan ? ctx.createStereoPanner() : null;
  if (panner) nodeStats.live += 1;
  const filter = o.muffle ? ctx.createBiquadFilter() : null;
  if (filter) {
    nodeStats.live += 1;
    filter.type = 'lowpass';
    filter.frequency.value = OPEN_CUTOFF_HZ;
  }
  source.connect(gain);
  let tail: AudioNode = gain;
  for (const node of [filter, panner]) {
    if (!node) continue;
    tail.connect(node);
    tail = node;
  }
  tail.connect(destination);
  return { gain, panner, filter };
}

export class MediaVoice implements Voice, Registered {
  readonly id = nextId('media');
  disposed = false;
  label = '';
  kind: LiveKind = 'music';
  owned: () => boolean = () => true;
  private lastScanTime = -1;
  /** Dernier refus de `play()` (lecture automatique bloquée, fichier illisible…). */
  lastPlayError: string | null = null;
  private readonly item: PooledElement;
  /** Absents en mode direct (volume de l'élément). */
  private readonly gain: GainNode | null;
  private readonly panner: StereoPannerNode | null;
  /** Passe-bas des sons étouffés (zones derrière un mur). */
  private readonly filter: BiquadFilterNode | null;
  private readonly destination: AudioNode;
  /** Mode direct : gain voulu de la voix (hors mixeur) et fondu en cours. */
  private directGain = 0;
  private directRamp: ReturnType<typeof setInterval> | null = null;
  private directDelay: ReturnType<typeof setTimeout> | null = null;
  onEnded: (() => void) | null = null;
  onPlaying: (() => void) | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly pool: ElementPool,
    readonly url: string,
    destination: AudioNode,
    o: { pan?: boolean; muffle?: boolean; loop?: boolean; initialGain?: number } = {},
  ) {
    this.item = pool.acquire(this);
    this.destination = destination;
    const el = this.item.el;
    const chain = pool.direct ? null : buildChain(ctx, this.item.source, destination, o);
    if (chain) {
      this.gain = chain.gain;
      this.panner = chain.panner;
      this.filter = chain.filter;
    } else {
      // Lecture directe : ni nœud ni panoramique, le volume de l'élément fait tout
      this.gain = null;
      this.panner = null;
      this.filter = null;
      this.directGain = o.initialGain ?? 0;
      this.applyDirect();
    }
    el.loop = !!o.loop;
    el.playbackRate = 1;
    el.onended = () => this.onEnded?.();
    el.onplaying = () => this.onPlaying?.();
    if (el.getAttribute?.('src') !== url) {
      el.src = url;
      el.load?.();
    }
    registerVoice(this);
  }

  /** Volume effectif en mode direct : gain de la voix × mixeur du bus visé. */
  private applyDirect() {
    const out = this.pool.direct?.gainFor(this.destination) ?? 1;
    this.item.el.volume = Math.max(0, Math.min(1, this.directGain * out));
  }

  /** Mixeur changé : le volume direct suit (sans effet dans le graphe, où le bus s'en charge). */
  refreshOutput() {
    if (!this.gain && !this.disposed) this.applyDirect();
  }

  /** Gain actuel de la voix (hors mixeur). */
  private get currentGain(): number {
    return this.gain ? this.gain.gain.value : this.directGain;
  }

  describe(): string {
    const el = this.item.el;
    return [
      this.gain ? 'graphe' : 'direct',
      el.paused ? 'élément en pause' : 'élément en lecture',
      `t=${el.currentTime.toFixed(1)}s`,
      `prêt=${el.readyState}`,
      `gain=${this.currentGain.toFixed(2)}`,
      this.gain ? null : `volume=${el.volume.toFixed(2)}`,
      `contexte=${this.ctx.state}`,
      el.error ? `erreur média ${el.error.code}` : null,
      this.lastPlayError ? `lecture refusée (${this.lastPlayError})` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** Lu sur l'élément : en lecture, temps qui avance, contexte actif, gain audible. */
  sounding(): boolean {
    const el = this.item.el;
    const t = el.currentTime;
    const moved = t !== this.lastScanTime;
    this.lastScanTime = t;
    if (!this.gain)
      return !this.disposed && !el.paused && !el.ended && moved && el.volume > AUDIBLE;
    return (
      !this.disposed &&
      !el.paused &&
      !el.ended &&
      moved &&
      this.ctx.state === 'running' &&
      this.gain.gain.value > AUDIBLE
    );
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
      this.item.el.play().then(
        () => {
          this.lastPlayError = null;
        },
        (e: unknown) => {
          this.lastPlayError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        },
      );
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
    if (this.gain) {
      rampGain(this.gain.gain, this.ctx, value, ms, atCtx);
      return;
    }
    // Mode direct : même fondu, piloté par minuterie (heure du contexte convertie en délai)
    if (this.directDelay) clearTimeout(this.directDelay);
    this.directDelay = null;
    const delayMs = atCtx !== undefined ? Math.max(0, (atCtx - this.ctx.currentTime) * 1000) : 0;
    if (delayMs > 4) this.directDelay = setTimeout(() => this.rampDirect(value, ms), delayMs);
    else this.rampDirect(value, ms);
  }

  private rampDirect(to: number, ms: number) {
    if (this.directRamp) clearInterval(this.directRamp);
    this.directRamp = null;
    const from = this.directGain;
    if (ms <= 0) {
      this.directGain = to;
      this.applyDirect();
      return;
    }
    const start = Date.now();
    this.directRamp = setInterval(() => {
      const k = Math.min(1, (Date.now() - start) / ms);
      this.directGain = from + (to - from) * k;
      this.applyDirect();
      if (k >= 1 && this.directRamp) {
        clearInterval(this.directRamp);
        this.directRamp = null;
      }
    }, 25);
  }

  /** Glissement continu du gain (spatialisation, à chaque image) : jamais `.value =`. */
  glideGain(value: number, timeConstantS = 0.05) {
    if (this.disposed) return;
    if (!this.gain) {
      this.rampDirect(Math.max(0, value), timeConstantS * 3000);
      return;
    }
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

  /** Fréquence de coupure du passe-bas (étouffement), glissée comme le panoramique. */
  setCutoff(hz: number) {
    if (!this.filter || this.disposed) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(Math.max(20, Math.min(OPEN_CUTOFF_HZ, hz)), t, 0.05);
  }

  dispose(fadeMs = 0) {
    if (this.disposed) return;
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.directDelay) clearTimeout(this.directDelay);
    // Fondu de sortie avant de marquer la voix libérée (setGain l'ignorerait ensuite)
    if (fadeMs > 0) {
      if (this.gain) rampGain(this.gain.gain, this.ctx, 0, fadeMs);
      else this.rampDirect(0, fadeMs);
    }
    this.disposed = true;
    const release = () => {
      if (this.directRamp) clearInterval(this.directRamp);
      this.directRamp = null;
      const el = this.item.el;
      el.pause();
      el.onended = null;
      el.onplaying = null;
      if (this.gain) {
        this.item.source?.disconnect();
        this.gain.disconnect();
        nodeStats.live -= 1;
      }
      if (this.panner) {
        this.panner.disconnect();
        nodeStats.live -= 1;
      }
      if (this.filter) {
        this.filter.disconnect();
        nodeStats.live -= 1;
      }
      el.removeAttribute('src');
      el.load?.();
      this.pool.release(this.item);
      unregisterVoice(this.id);
    };
    if (fadeMs > 0) setTimeout(release, fadeMs + 20);
    else release();
  }
}

export class BufferVoice implements Voice, Registered {
  readonly id = nextId('buffer');
  disposed = false;
  label = '';
  kind: LiveKind = 'sfx';
  owned: () => boolean = () => true;
  private readonly startCtx: number;
  private readonly endCtx: number;
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
    this.startCtx = Math.max(ctx.currentTime, whenCtx);
    this.endCtx = this.startCtx + buffer.duration;
    this.source.start(this.startCtx);
    registerVoice(this);
  }

  describe(): string {
    return `tampon · t=${this.ctx.currentTime.toFixed(1)}s (de ${this.startCtx.toFixed(1)} à ${this.endCtx.toFixed(1)}) · gain=${this.gain.gain.value.toFixed(2)} · contexte=${this.ctx.state}`;
  }

  /** Dans sa fenêtre de lecture sur un contexte actif, avec un gain audible. */
  sounding(): boolean {
    const t = this.ctx.currentTime;
    return (
      !this.disposed &&
      this.ctx.state === 'running' &&
      t >= this.startCtx &&
      t < this.endCtx &&
      this.gain.gain.value > AUDIBLE
    );
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
      unregisterVoice(this.id);
    };
    if (fadeMs > 0) {
      rampGain(this.gain.gain, this.ctx, 0, fadeMs);
      setTimeout(release, fadeMs + 20);
    } else release();
  }
}
