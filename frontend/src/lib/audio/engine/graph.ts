/**
 * Graphe Web Audio du moteur (docs/audio.md § 3.8) :
 *
 *   voix ─► gain de voix ─► [panoramique] ─► bus ─► master ─► limiteur ─► destination
 *
 * Un seul AudioContext pour toute l'app. Les paramètres ne sont jamais écrits
 * directement (`.value =`, source de clics) : rampes et `setTargetAtTime`.
 */
import type { BusName } from '@vtt/contracts';

export type AudioBus = BusName | 'preview';
export const AUDIO_BUS_LIST: readonly AudioBus[] = [
  'master',
  'music',
  'ambience',
  'sfx',
  'zones',
  'dice',
  'preview',
];

/** Constante de temps des changements de volume du mixeur (≈ 150 ms pour 95 %). */
export const SMOOTH_S = 0.05;

/** Compteur des nœuds créés par les voix et pas encore libérés (tests, fuites). */
export const nodeStats = { live: 0 };

export class AudioGraph {
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  private readonly buses = new Map<AudioBus, GainNode>();

  constructor(readonly ctx: BaseAudioContext) {
    this.limiter = ctx.createDynamicsCompressor();
    // Limiteur : seuil à −1 dBFS, attaque rapide, pas de pompage audible sur un signal normalisé
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.limiter);
    this.buses.set('master', this.master);
    for (const name of AUDIO_BUS_LIST) {
      if (name === 'master') continue;
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses.set(name, g);
    }
  }

  bus(name: AudioBus): GainNode {
    return this.buses.get(name)!;
  }

  /** Volume d'un bus, lissé. */
  setBusGain(name: AudioBus, value: number) {
    const p = this.bus(name).gain;
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(Math.max(0, value), t, SMOOTH_S);
  }
}

/**
 * Fondu d'un paramètre de gain vers `to` en `ms` (à partir de `atCtx`, heure du contexte) :
 * annule ce qui était prévu, repart de la valeur courante.
 */
export function rampGain(
  param: AudioParam,
  ctx: BaseAudioContext,
  to: number,
  ms: number,
  atCtx = ctx.currentTime,
) {
  const t = Math.max(ctx.currentTime, atCtx);
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  if (ms <= 0) param.setValueAtTime(to, t);
  else param.linearRampToValueAtTime(to, t + ms / 1000);
}
