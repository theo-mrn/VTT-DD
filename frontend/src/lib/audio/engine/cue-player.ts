/**
 * Effets ponctuels (docs/audio.md § 3.6) : un effet reçu est joué depuis le
 * début à son `startAt` (heure du serveur) s'il a moins de 3 s (`cueDecision`) ;
 * rejoué après reconnexion ou onglet endormi, il est ignoré. Chaque `cueId`
 * ne sonne qu'une fois (le lanceur et l'écho du serveur). 16 voix au plus,
 * la plus ancienne est volée. Effets courts : buffer décodé (cache) ;
 * longs : élément média ; YouTube : lecteur caché.
 */
import type { CuePlayedPayload, PlaybackAsset } from '@vtt/contracts';
import { cueDecision, dbToGain } from '@vtt/contracts/audio-sync';
import type { EngineHost } from './host';
import { BufferVoice, MediaVoice } from './voices';
import { YoutubeVoice } from './youtube';

export const MAX_CUE_VOICES = 16;
/** Au-delà, un effet passe par un élément média (pas de décodage complet en mémoire). */
export const BUFFER_MAX_MS = 30_000;

type CueVoice = BufferVoice | MediaVoice | YoutubeVoice;

export class CuePlayer {
  private readonly active = new Map<string, { assetId: string; voice: CueVoice | null }>();
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: EngineHost) {}

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  private emit() {
    this.snapshot = null;
    for (const l of this.listeners) l();
  }

  /** Dernière liste calculée : la même référence tant que rien ne change (useSyncExternalStore). */
  private snapshot: { cueId: string; assetId: string }[] | null = null;

  get list(): { cueId: string; assetId: string }[] {
    this.snapshot ??= [...this.active].map(([cueId, c]) => ({ cueId, assetId: c.assetId }));
    return this.snapshot;
  }

  /** Précharge un effet court (bibliothèque du MJ, sons d'armes). */
  preload(asset: PlaybackAsset) {
    if (!asset.url || asset.source === 'youtube') return;
    if (asset.durationMs !== null && asset.durationMs > BUFFER_MAX_MS) return;
    if (!this.host.context()) return;
    this.host
      .cache()
      .get(asset.url)
      .catch(() => undefined);
  }

  /** Effet reçu (événement ou réponse de notre propre lancement). */
  play(cue: Pick<CuePlayedPayload, 'cueId' | 'asset' | 'startAt' | 'volume'>) {
    if (this.seen.has(cue.cueId)) return;
    this.seen.add(cue.cueId);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
    const decision = cueDecision(Date.parse(cue.startAt), this.host.clock.now());
    if (!decision.play) return;
    this.host.wantSound();
    if (!this.host.running()) return;
    // Plafond : la plus ancienne voix est volée
    while (this.active.size >= MAX_CUE_VOICES) {
      const [oldest] = this.active.keys();
      this.stop(oldest!);
    }
    this.active.set(cue.cueId, { assetId: cue.asset.id, voice: null });
    this.emit();
    void this.start(cue, decision.delayMs).catch(() => this.finish(cue.cueId));
  }

  private async start(cue: Pick<CuePlayedPayload, 'cueId' | 'asset' | 'volume'>, delayMs: number) {
    const { asset } = cue;
    const entry = this.active.get(cue.cueId);
    if (!entry) return;
    const gain = cue.volume * asset.volume;
    if (asset.source === 'youtube' && asset.youtubeId) {
      const voice = new YoutubeVoice(asset.youtubeId);
      this.tag(voice, cue.cueId, asset.name);
      voice.setVolume(gain * this.host.externalGain('sfx'));
      voice.onEnded = () => this.finish(cue.cueId);
      entry.voice = voice;
      voice.start(0, delayMs);
      return;
    }
    const ctx = this.host.context();
    if (!ctx || !asset.url) return this.finish(cue.cueId);
    const normalized = gain * dbToGain(asset.gainDb);
    const short = asset.durationMs !== null && asset.durationMs <= BUFFER_MAX_MS;
    const loadStart = this.host.clock.now();
    if (short || this.host.cache().has(asset.url)) {
      const buffer = await this.host.cache().get(asset.url);
      if (!this.active.has(cue.cueId)) return;
      // Le chargement a pris du temps : on garde l'heure de départ commune si possible
      const remaining = Math.max(0, delayMs - (this.host.clock.now() - loadStart));
      const voice = new BufferVoice(
        ctx,
        buffer,
        this.host.bus('sfx'),
        normalized,
        ctx.currentTime + remaining / 1000,
      );
      this.tag(voice, cue.cueId, asset.name);
      voice.onEnded = () => this.finish(cue.cueId);
      entry.voice = voice;
      return;
    }
    const voice = new MediaVoice(ctx, this.host.pool(), asset.url, this.host.bus('sfx'), {
      initialGain: normalized,
    });
    this.tag(voice, cue.cueId, asset.name);
    voice.onEnded = () => this.finish(cue.cueId);
    entry.voice = voice;
    voice.start(0, delayMs);
  }

  /** Nom et type pour le relevé ; la voix n'est voulue que tant que l'effet est actif. */
  private tag(voice: CueVoice, cueId: string, name: string) {
    voice.label = name;
    voice.kind = 'sfx';
    voice.owned = () => {
      const entry = this.active.get(cueId);
      return !!entry && (entry.voice === null || entry.voice === voice);
    };
  }

  private finish(cueId: string) {
    const entry = this.active.get(cueId);
    if (!entry) return;
    this.active.delete(cueId);
    entry.voice?.dispose();
    this.emit();
  }

  stop(cueId: string) {
    const entry = this.active.get(cueId);
    if (!entry) return;
    this.active.delete(cueId);
    if (entry.voice instanceof YoutubeVoice) entry.voice.dispose();
    else entry.voice?.dispose(80);
    this.emit();
  }

  stopAll() {
    for (const id of [...this.active.keys()]) this.stop(id);
  }

  dispose() {
    this.stopAll();
    this.seen.clear();
  }
}
