/**
 * Sources spatiales (zones musicales, sons de token) : la carte fournit la
 * position de l'auditeur et les sources (docs/audio.md § 4.6), le moteur
 * choisit les 8 plus fortes (`selectActiveSources`), applique les courbes du
 * legacy (`zoneMix`) et joue chaque source en boucle déterministe
 * (`loopPosition` sur l'heure du serveur) : deux joueurs dans la même taverne
 * entendent le même passage. Une voix muette depuis 10 s est libérée.
 *
 * Murs (docs/carte.md § 10, Zones sonores) : la carte compte les murs entre
 * l'auditeur et chaque source ; chacun divise le volume par deux et un passe-bas
 * étouffe le son.
 */
import { dbToGain, loopPosition, selectActiveSources, type Point } from '@vtt/contracts/audio-sync';
import type { EngineHost } from './host';
import { MediaVoice, OPEN_CUTOFF_HZ } from './voices';

export const MAX_SPATIAL = 8;
const RELEASE_AFTER_MS = 10_000;
const SMOOTH_S = 0.05;
/** Volume gardé par mur traversé. */
export const WALL_GAIN = 0.5;

/** Étouffement derrière `walls` murs : volume gardé et coupure du passe-bas. */
export function muffle(walls: number): { gain: number; cutoffHz: number } {
  if (!(walls > 0)) return { gain: 1, cutoffHz: OPEN_CUTOFF_HZ };
  return { gain: WALL_GAIN ** walls, cutoffHz: walls === 1 ? 1_200 : 500 };
}

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
  /** Murs entre l'auditeur et la source (0 : son clair). */
  walls: number;
}

/** Voix d'une source : muette depuis quand (null : active), et le fichier qu'elle joue. */
interface SpatialVoice {
  voice: MediaVoice;
  silentSince: number | null;
  url: string;
}

export class SpatialPlayer {
  private readonly voices = new Map<string, SpatialVoice>();
  private active = new Set<string>();

  constructor(private readonly host: EngineHost) {}

  /** Voix tenues (actives ou muettes en attente de libération). */
  get size(): number {
    return this.voices.size;
  }

  /** Des voix muettes attendent leur libération : un passage lent reste nécessaire. */
  get releasing(): boolean {
    for (const entry of this.voices.values()) if (entry.silentSince !== null) return true;
    return false;
  }

  /** Une image : volumes et panoramiques recalculés. */
  update(
    listener: Point | null,
    sources: ResolvedSource[],
    enabled: boolean,
    nowMs = Date.now(),
  ): string[] {
    const ctx = this.host.context();
    if (!ctx) return [];
    // Les murs comptent dans le choix des 8 : une source étouffée cède sa place
    const heard = sources.map((s) =>
      s.walls > 0 ? { ...s, volume: s.volume * muffle(s.walls).gain } : s,
    );
    const chosen =
      enabled && listener ? selectActiveSources(listener, heard, MAX_SPATIAL, this.active) : [];
    if (chosen.length) this.host.wantSound();
    const playing = this.host.running();
    this.active = new Set(chosen.map((c) => c.source.id));
    for (const { source, gain, pan } of chosen) {
      const entry = this.voiceFor(ctx, source, playing);
      if (!entry) continue;
      entry.silentSince = null;
      entry.voice.glideGain(gain * dbToGain(source.gainDb), SMOOTH_S);
      entry.voice.setPan(pan);
      entry.voice.setCutoff(muffle(source.walls).cutoffHz);
    }
    this.silenceInactive(nowMs);
    return [...this.active];
  }

  /** Voix de la source (refaite si son fichier a changé, créée seulement si le son tourne). */
  private voiceFor(
    ctx: BaseAudioContext,
    source: ResolvedSource,
    playing: boolean,
  ): SpatialVoice | undefined {
    let entry = this.voices.get(source.id);
    if (entry && entry.url !== source.url) {
      entry.voice.dispose(100);
      this.voices.delete(source.id);
      entry = undefined;
    }
    if (entry || !playing) return entry;
    const voice = new MediaVoice(ctx, this.host.pool(), source.url, this.host.bus('zones'), {
      loop: true,
      pan: true,
      muffle: true,
    });
    voice.label = source.id;
    voice.kind = 'zones';
    const id = source.id;
    voice.owned = () => this.voices.get(id)?.voice === voice;
    const d = source.durationMs ?? voice.durationMs;
    voice.start(d ? loopPosition(this.host.clock.now(), d) : 0);
    entry = { voice, silentSince: null, url: source.url };
    this.voices.set(source.id, entry);
    return entry;
  }

  /** Sources sorties du lot : silence, puis libération après 10 s. */
  private silenceInactive(nowMs: number) {
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
  }

  dispose() {
    for (const { voice } of this.voices.values()) voice.dispose();
    this.voices.clear();
    this.active.clear();
  }
}
