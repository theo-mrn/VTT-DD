/**
 * Sources spatiales (zones musicales, sons de token) : la carte fournit la
 * position de l'auditeur et les sources (docs/audio.md § 4.6), le moteur
 * choisit les 8 plus fortes (`selectActiveSources`), applique les courbes du
 * legacy (`zoneMix`) et joue chaque source en boucle déterministe
 * (`loopPosition` sur l'heure du serveur) : deux joueurs dans la même taverne
 * entendent le même passage. Une voix muette depuis 10 s est libérée.
 */
import { dbToGain, loopPosition, selectActiveSources, type Point } from '@vtt/contracts/audio-sync';
import type { EngineHost } from './host';
import { MediaVoice } from './voices';

export const MAX_SPATIAL = 8;
const RELEASE_AFTER_MS = 10_000;
const SMOOTH_S = 0.05;

export interface ResolvedSource {
  id: string;
  url: string;
  x: number;
  y: number;
  radius: number;
  volume: number;
  /** Normalisation de l'asset (0 pour une URL brute). */
  gainDb: number;
  durationMs: number | null;
}

export class SpatialPlayer {
  private readonly voices = new Map<
    string,
    { voice: MediaVoice; silentSince: number | null; url: string }
  >();
  private active = new Set<string>();

  constructor(private readonly host: EngineHost) {}

  /** Une image : volumes et panoramiques recalculés. */
  update(
    listener: Point | null,
    sources: ResolvedSource[],
    enabled: boolean,
    nowMs = Date.now(),
  ): string[] {
    const ctx = this.host.context();
    if (!ctx) return [];
    const chosen =
      enabled && listener ? selectActiveSources(listener, sources, MAX_SPATIAL, this.active) : [];
    if (chosen.length) this.host.wantSound();
    const playing = this.host.running();
    this.active = new Set(chosen.map((c) => c.source.id));
    for (const { source, gain, pan } of chosen) {
      let entry = this.voices.get(source.id);
      if (entry && entry.url !== source.url) {
        entry.voice.dispose(100);
        this.voices.delete(source.id);
        entry = undefined;
      }
      if (!entry && playing) {
        const voice = new MediaVoice(ctx, this.host.pool(), source.url, this.host.bus('zones'), {
          loop: true,
          pan: true,
        });
        const d = source.durationMs ?? voice.durationMs;
        voice.start(d ? loopPosition(this.host.clock.now(), d) : 0);
        entry = { voice, silentSince: null, url: source.url };
        this.voices.set(source.id, entry);
      }
      if (!entry) continue;
      entry.silentSince = null;
      entry.voice.glideGain(gain * dbToGain(source.gainDb), SMOOTH_S);
      entry.voice.setPan(pan);
    }
    // Sources sorties du lot : silence, puis libération après 10 s
    for (const [id, entry] of this.voices) {
      if (this.active.has(id)) continue;
      if (entry.silentSince === null) {
        entry.silentSince = nowMs;
        entry.voice.setGain(0, 200);
      } else if (nowMs - entry.silentSince > RELEASE_AFTER_MS) {
        entry.voice.dispose();
        this.voices.delete(id);
      }
    }
    return [...this.active];
  }

  dispose() {
    for (const { voice } of this.voices.values()) voice.dispose();
    this.voices.clear();
    this.active.clear();
  }
}
