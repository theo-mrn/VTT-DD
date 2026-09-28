/**
 * Lecture d'un canal (musique, ambiance) : l'état du serveur est planifié
 * (`planChannel`, @vtt/contracts/audio-sync) à l'heure du serveur estimée ;
 * chaque voix prévue est créée, calée et corrigée, les autres s'éteignent en
 * fondu. La ligne de temps fait foi : un client qui a bufferisé accélère ou
 * saute en avant, il ne ralentit jamais les autres (`driftAction`).
 *
 * Fichiers : `MediaVoice` dans le graphe (fondus, gain de normalisation).
 * YouTube : lecteur IFrame caché (`YoutubeVoice`), volume seulement, recalé
 * au-delà de 2 s d'écart ; en fin de vidéo sans durée connue, `onYoutubeEnded`
 * (le client du MJ envoie `next` avec `expectedVersion`).
 */
import type { ChannelName, ChannelState } from '@vtt/contracts';
import {
  dbToGain,
  driftAction,
  planChannel,
  YOUTUBE_SEEK_ABOVE_MS,
  type PlannedVoice,
} from '@vtt/contracts/audio-sync';
import type { EngineHost } from './host';
import { MediaVoice } from './voices';
import { YoutubeVoice } from './youtube';

/** Fondus de calage : pause, seek (docs/audio.md § 3.7). */
export const PAUSE_FADE_MS = 150;
export const SEEK_FADE_MS = 60;
const DRIFT_EVERY_MS = 1_000;
/** Durée pendant laquelle un lecteur YouTube en pause est gardé pour une reprise instantanée. */
const PARKED_FOR_MS = 120_000;

type Live =
  | { kind: 'media'; key: string; plan: PlannedVoice; voice: MediaVoice; correcting: boolean }
  | { kind: 'youtube'; key: string; plan: PlannedVoice; voice: YoutubeVoice };

const keyOf = (v: PlannedVoice) => `${v.asset.id}@${v.startAtMs}`;

export class ChannelPlayer {
  private state: ChannelState | null = null;
  private readonly voices = new Map<string, Live>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private drift: ReturnType<typeof setInterval> | null = null;
  private preloaded: HTMLAudioElement | null = null;
  /**
   * Lecteurs YouTube mis de côté (pause, recalage) plutôt que détruits : la reprise réutilise
   * le même lecteur, déjà chargé et déjà autorisé par le navigateur, au lieu d'en recréer un.
   */
  private readonly parked = new Map<
    string,
    { voice: YoutubeVoice; timer: ReturnType<typeof setTimeout> }
  >();
  onYoutubeEnded: ((state: ChannelState) => void) | null = null;

  constructor(
    private readonly host: EngineHost,
    readonly channel: ChannelName,
  ) {}

  get bus() {
    return this.channel;
  }

  /** Nouvel état du serveur (déjà filtré par version). */
  setState(state: ChannelState | null) {
    const previous = this.state;
    this.state = state;
    // Changement de position (pause, seek) : fondu court avant le recalage
    const fade =
      previous && state && previous.status === 'playing' && state.status !== 'playing'
        ? PAUSE_FADE_MS
        : SEEK_FADE_MS;
    this.reconcile(fade);
  }

  /** Recalcule ce qui doit sonner (déverrouillage, horloge resynchronisée, mixeur). */
  reconcile(fadeOutMs = SEEK_FADE_MS) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    const now = this.host.clock.now();
    const plan =
      s && this.host.running()
        ? planChannel(s, now)
        : { voices: [], preload: null, nextChangeAtMs: null };

    const wanted = new Set(plan.voices.map(keyOf));
    for (const [key, live] of this.voices) {
      if (wanted.has(key)) continue;
      if (live.kind === 'media') live.voice.dispose(fadeOutMs);
      else this.park(live.plan.asset.id, live.voice);
      this.voices.delete(key);
    }
    for (const planned of plan.voices) {
      const key = keyOf(planned);
      const live = this.voices.get(key);
      if (live) {
        live.plan = planned;
        this.applyGain(live, now);
        this.correct(live, now, true);
      } else this.startVoice(planned, now);
    }
    this.preload(plan.preload?.url ?? null);
    if (plan.nextChangeAtMs !== null) {
      const delay = Math.max(0, plan.nextChangeAtMs - now);
      this.timer = setTimeout(() => this.reconcile(), Math.min(delay, 2 ** 31 - 1));
    }
    this.ensureDriftLoop();
  }

  private volumeOf(planned: PlannedVoice): number {
    const s = this.state;
    return planned.asset.volume * (s?.volume ?? 1);
  }

  /** Met un lecteur YouTube de côté (en pause) ; libéré s'il n'est pas repris sous 2 min. */
  private park(assetId: string, voice: YoutubeVoice) {
    voice.pause();
    const previous = this.parked.get(assetId);
    if (previous && previous.voice !== voice) {
      clearTimeout(previous.timer);
      previous.voice.dispose();
    }
    voice.owned = () => this.parked.get(assetId)?.voice === voice;
    const timer = setTimeout(() => {
      if (this.parked.get(assetId)?.voice !== voice) return;
      this.parked.delete(assetId);
      voice.dispose();
    }, PARKED_FOR_MS);
    this.parked.set(assetId, { voice, timer });
    // Un seul lecteur de côté par canal : les autres morceaux sont libérés
    for (const [id, p] of this.parked) {
      if (id === assetId) continue;
      clearTimeout(p.timer);
      p.voice.dispose();
      this.parked.delete(id);
    }
  }

  private startVoice(planned: PlannedVoice, now: number) {
    const key = keyOf(planned);
    const delay = Math.max(0, planned.startAtMs - now);
    if (planned.asset.source === 'youtube' && planned.asset.youtubeId) {
      const kept = this.parked.get(planned.asset.id);
      if (kept) {
        this.parked.delete(planned.asset.id);
        clearTimeout(kept.timer);
      }
      const voice =
        kept && !kept.voice.disposed ? kept.voice : new YoutubeVoice(planned.asset.youtubeId);
      this.tag(voice, key, planned);
      const live: Live = { kind: 'youtube', key, plan: planned, voice };
      voice.onEnded = () => {
        if (this.state && planned.asset.durationMs === null) this.onYoutubeEnded?.(this.state);
      };
      voice.onError = () => this.host.reportError?.(`YouTube indisponible : ${planned.asset.name}`);
      this.voices.set(key, live);
      this.applyGain(live, now);
      voice.start(planned.positionMs, delay);
      return;
    }
    const ctx = this.host.context();
    if (!ctx || !planned.asset.url) return;
    const voice = new MediaVoice(
      ctx,
      this.host.pool(),
      planned.asset.url,
      this.host.bus(this.bus),
      {
        loop: planned.loop,
      },
    );
    this.tag(voice, key, planned);
    const live: Live = { kind: 'media', key, plan: planned, voice, correcting: false };
    // Après une mise en mémoire tampon : recalage immédiat
    voice.onPlaying = () => this.correct(live, this.host.clock.now(), false);
    this.voices.set(key, live);
    this.applyGain(live, now);
    voice.start(planned.positionMs, delay);
  }

  /** Nom et type pour le relevé ; la voix n'est voulue que tant que ce canal la garde. */
  private tag(voice: MediaVoice | YoutubeVoice, key: string, planned: PlannedVoice) {
    voice.label = planned.asset.name;
    voice.kind = this.channel;
    voice.owned = () => this.voices.get(key)?.voice === voice;
  }

  /** Gain cible : asset × normalisation × canal ; fondus d'entrée et de sortie à l'heure prévue. */
  private applyGain(live: Live, now: number) {
    const p = live.plan;
    if (live.kind === 'youtube') {
      live.voice.setVolume(this.volumeOf(p) * this.host.externalGain(this.bus));
      return;
    }
    const ctx = this.host.context();
    if (!ctx) return;
    const target = this.volumeOf(p) * dbToGain(p.asset.gainDb);
    const toCtx = (serverMs: number) => ctx.currentTime + (serverMs - now) / 1000;
    const sinceStart = now - p.startAtMs;
    if (p.fadeInMs > 0 && sinceStart < p.fadeInMs) {
      // Fondu d'entrée déjà entamé : on reprend là où il en est
      const done = Math.max(0, sinceStart) / p.fadeInMs;
      live.voice.setGain(target * done, 0);
      live.voice.setGain(target, p.fadeInMs * (1 - done), toCtx(Math.max(now, p.startAtMs)));
    } else live.voice.setGain(target, SEEK_FADE_MS);
    if (p.fadeOutAtMs !== null && this.state) {
      const fadeMs = Math.max(0, this.state.crossfadeMs);
      if (p.fadeOutAtMs > now) live.voice.setGain(0, fadeMs, toCtx(p.fadeOutAtMs));
      else live.voice.setGain(0, Math.max(0, p.fadeOutAtMs + fadeMs - now));
    }
  }

  /** Correction de dérive d'une voix (ou recalage franc si `hard`). */
  private correct(live: Live, now: number, hard: boolean) {
    const s = this.state;
    if (!s || live.voice.disposed) return;
    const planned = planChannel(s, now).voices.find((v) => keyOf(v) === live.key);
    if (!planned || planned.startAtMs > now) return;
    const expected = planned.positionMs;
    if (live.kind === 'youtube') {
      const actual = live.voice.positionMs;
      if (actual === null) return;
      if (Math.abs(expected - actual) > YOUTUBE_SEEK_ABOVE_MS) live.voice.seek(expected);
      return;
    }
    const voice = live.voice;
    let actual = voice.positionMs;
    const d = planned.asset.durationMs ?? voice.durationMs;
    // Boucle : l'écart se mesure modulo la durée (fin de boucle contre début)
    if (planned.loop && d) {
      const diff = ((((expected - actual) % d) + 1.5 * d) % d) - d / 2;
      actual = expected - diff;
    }
    const action = driftAction(expected, actual, live.correcting && !hard);
    if (action.type === 'seek') {
      voice.seek(action.positionMs);
      voice.setRate(1);
      live.correcting = false;
      if (voice.paused) voice.start(action.positionMs);
    } else if (action.type === 'rate') {
      voice.setRate(action.rate);
      live.correcting = true;
    } else {
      if (live.correcting) voice.setRate(1);
      live.correcting = false;
      if (voice.paused) voice.start(expected);
    }
  }

  private ensureDriftLoop() {
    if (this.voices.size && !this.drift) {
      this.drift = setInterval(() => {
        const now = this.host.clock.now();
        for (const live of this.voices.values()) this.correct(live, now, false);
      }, DRIFT_EVERY_MS);
    } else if (!this.voices.size && this.drift) {
      clearInterval(this.drift);
      this.drift = null;
    }
  }

  /** Piste suivante mise en cache HTTP 20 s avant l'enchaînement (hors graphe). */
  private preload(url: string | null) {
    if (!url) {
      if (this.preloaded) {
        this.preloaded.removeAttribute('src');
        this.preloaded = null;
      }
      return;
    }
    if (this.preloaded?.getAttribute('src') === url || typeof Audio === 'undefined') return;
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.muted = true;
    el.src = url;
    this.preloaded = el;
  }

  /** Volume du mixeur changé : YouTube suit (les fichiers suivent par leur bus). */
  mixerChanged() {
    const now = this.host.clock.now();
    for (const live of this.voices.values()) if (live.kind === 'youtube') this.applyGain(live, now);
  }

  /** Nombre de voix actives (tests, diagnostic). */
  get activeVoices() {
    return this.voices.size;
  }

  dispose() {
    this.state = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.drift) clearInterval(this.drift);
    this.timer = null;
    this.drift = null;
    for (const live of this.voices.values()) live.voice.dispose();
    this.voices.clear();
    for (const p of this.parked.values()) {
      clearTimeout(p.timer);
      p.voice.dispose();
    }
    this.parked.clear();
    this.preload(null);
  }
}
