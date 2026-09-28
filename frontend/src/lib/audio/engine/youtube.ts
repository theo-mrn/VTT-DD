/**
 * Lecteur YouTube (décision Q1 : comme l'ancienne app) : lecteur IFrame
 * officiel caché (0×0), hôte youtube-nocookie.com, jamais de téléchargement
 * ni d'extraction de l'audio. Hors graphe Web Audio (iframe cross-origin) :
 * ni panoramique, ni limiteur ; seul le volume suit le mixeur, et la
 * synchronisation est grossière (seek au-delà de 2 s d'écart). Publicités et
 * vidéos non intégrables échappent à notre contrôle (`onError`).
 */
import { registerVoice, unregisterVoice, type LiveKind, type Registered } from './registry';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    options: {
      host?: string;
      videoId: string;
      width?: number;
      height?: number;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;
/** Au-delà, un lecteur qui devait jouer et ne joue pas est bloqué (lecture automatique refusée). */
const STALL_AFTER_MS = 2_000;

let apiPromise: Promise<YTNamespace> | null = null;

/** Charge l'API IFrame de YouTube une seule fois. */
function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve(w.YT);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube injoignable'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** Conteneur caché des lecteurs (hors de l'arbre React). */
function hiddenHost(): HTMLElement {
  let host = document.getElementById('vtt-youtube-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'vtt-youtube-host';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;left:0;bottom:0';
    document.body.appendChild(host);
  }
  return host;
}

let counter = 0;

export class YoutubeVoice implements Registered {
  readonly id = `youtube-${++counter}`;
  disposed = false;
  label = '';
  kind: LiveKind = 'music';
  owned: () => boolean = () => true;
  private player: YTPlayer | null = null;
  private readonly el: HTMLElement;
  private volume = 0;
  private pending: { positionMs: number; play: boolean } | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  onEnded: (() => void) | null = null;
  onError: ((code: number) => void) | null = null;
  onPlaying: (() => void) | null = null;

  constructor(readonly videoId: string) {
    this.el = document.createElement('div');
    hiddenHost().appendChild(this.el);
    registerVoice(this);
    loadApi()
      .then((YT) => {
        if (this.disposed) return;
        this.player = new YT.Player(this.el, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: 0,
          height: 0,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              this.player?.setVolume(Math.round(this.volume * 100));
              if (this.pending) {
                const p = this.pending;
                this.pending = null;
                this.apply(p.positionMs, p.play);
              }
            },
            onStateChange: (e) => {
              if (e.data === ENDED) {
                this.wantPlaying = false;
                this.onEnded?.();
              }
              if (e.data === PLAYING) this.onPlaying?.();
            },
            onError: (e) => this.onError?.(e.data),
          },
        });
      })
      .catch(() => this.onError?.(-1));
  }

  /** Le lecteur doit-il jouer (demandé par le moteur), et depuis quand. */
  private wantPlaying = false;
  private playRequestedAt = 0;

  private get ready() {
    return !!this.player && typeof this.player.seekTo === 'function';
  }

  private apply(positionMs: number, play: boolean) {
    this.wantPlaying = play;
    if (play) this.playRequestedAt = Date.now();
    if (!this.ready) {
      this.pending = { positionMs, play };
      return;
    }
    this.player!.seekTo(Math.max(0, positionMs / 1000), true);
    if (play) this.player!.playVideo();
    else this.player!.pauseVideo();
  }

  start(positionMs: number, delayMs = 0) {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (delayMs > 4) {
      this.startTimer = setTimeout(() => this.apply(positionMs, true), delayMs);
    } else this.apply(positionMs, true);
  }

  seek(positionMs: number) {
    if (this.ready) this.player!.seekTo(Math.max(0, positionMs / 1000), true);
  }

  pause() {
    this.wantPlaying = false;
    if (this.ready) this.player!.pauseVideo();
    else if (this.pending) this.pending.play = false;
  }

  /** Volume linéaire 0..1 (mixeur × canal × asset). */
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.ready) this.player!.setVolume(Math.round(this.volume * 100));
  }

  /** Position lue sur le lecteur (ms), null tant qu'il n'est pas prêt. */
  get positionMs(): number | null {
    if (!this.ready) return null;
    return this.player!.getCurrentTime() * 1000;
  }

  get durationMs(): number | null {
    if (!this.ready) return null;
    const d = this.player!.getDuration();
    return d > 0 ? d * 1000 : null;
  }

  get playing(): boolean {
    return this.ready && this.player!.getPlayerState() === PLAYING;
  }

  /**
   * Devait jouer depuis un moment mais ne joue pas : le navigateur a refusé la lecture
   * automatique (onglet sans clic). Le moteur affiche alors « Activer le son ».
   */
  stalled(): boolean {
    if (this.disposed || !this.wantPlaying || !this.ready) return false;
    if (Date.now() - this.playRequestedAt < STALL_AFTER_MS) return false;
    const state = this.player!.getPlayerState();
    return state !== PLAYING && state !== BUFFERING;
  }

  /** Relance la lecture pendant un geste de l'utilisateur (le recalage suit au relevé). */
  kick() {
    if (this.disposed || !this.wantPlaying || !this.ready) return;
    if (this.player!.getPlayerState() !== PLAYING) this.player!.playVideo();
  }

  /** Lu sur le lecteur : en lecture avec un volume audible. */
  sounding(): boolean {
    return !this.disposed && this.volume > 0 && this.playing;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.startTimer) clearTimeout(this.startTimer);
    try {
      this.player?.destroy();
    } catch {
      // Lecteur jamais prêt
    }
    this.el.remove();
    unregisterVoice(this.id);
  }
}
