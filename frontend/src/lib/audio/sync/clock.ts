/**
 * Horloge du serveur vue du navigateur (docs/audio.md § 3.7) : décalage
 * estimé par 5 allers-retours à 200 ms d'intervalle (le plus court gagne,
 * `estimateOffset`), mesurés avec une horloge monotone
 * (`performance.timeOrigin + performance.now()`, insensible aux changements
 * d'heure du système). Nouvel échantillonnage toutes les 5 min, au retour
 * de visibilité et à la reconnexion.
 */
import { estimateOffset, type ClockSample } from '@vtt/contracts/audio-sync';

export const SAMPLES = 5;
export const SAMPLE_GAP_MS = 200;
export const RESYNC_EVERY_MS = 5 * 60_000;

export type ClockFetch = () => Promise<{ serverTime: number }>;

/** Horloge locale monotone, en millisecondes depuis l'époque Unix. */
export const monotonicNow = (): number =>
  typeof performance !== 'undefined' && performance.timeOrigin
    ? performance.timeOrigin + performance.now()
    : Date.now();

export class ServerClock {
  offsetMs = 0;
  rttMs: number | null = null;
  synced = false;
  private syncing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly fetchClock: ClockFetch,
    private readonly localNow: () => number = monotonicNow,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Heure du serveur estimée, en millisecondes. */
  now(): number {
    return this.localNow() + this.offsetMs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Estimation grossière (heure d'une réponse REST), tant qu'aucune mesure n'est faite. */
  hint(serverTime: number) {
    if (this.synced) return;
    this.offsetMs = serverTime - this.localNow();
    this.emit();
  }

  /** Échantillonne l'horloge ; un seul échantillonnage à la fois. */
  resync(): Promise<void> {
    this.syncing ??= this.sample().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async sample() {
    const samples: ClockSample[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      if (i) await this.wait(SAMPLE_GAP_MS);
      const t0 = this.localNow();
      try {
        const { serverTime } = await this.fetchClock();
        samples.push({ t0, t1: this.localNow(), serverTime });
      } catch {
        // Un échantillon perdu n'empêche pas les autres
      }
    }
    const estimate = estimateOffset(samples);
    if (!estimate) return;
    this.offsetMs = estimate.offsetMs;
    this.rttMs = estimate.rttMs;
    this.synced = true;
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}
