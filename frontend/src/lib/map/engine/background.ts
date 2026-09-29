/**
 * Fond de la carte (docs/carte.md § 4, § 10) : une image (png, jpeg, webp, avif, gif — première
 * image) ou une vidéo webm/mp4 muette, en boucle, `playsinline`. Sa taille naturelle est la
 * taille du monde : le moteur la reçoit (`onLoaded`) et le client du MJ l'envoie au serveur si
 * elle manque ou a changé.
 *
 * Vidéo : 30 images par seconde au plus, sans le ticker partagé de Pixi. Chaque nouvelle image
 * de la vidéo (`requestVideoFrameCallback`) met la texture à jour et demande un rendu ; sans
 * cette API, la boucle du moteur tourne tant que la vidéo joue.
 *
 * Chargé avec le rendu (`pixi-view.ts`) : importe Pixi.
 */
import { Assets, Sprite, type Container, type Texture, type VideoSource } from 'pixi.js';

/** Images de la vidéo de fond par seconde, au plus. */
export const VIDEO_FPS = 30;

const VIDEO_EXT = /\.(webm|mp4|m4v|mov)(\?|#|$)/i;
export const isVideoUrl = (url: string) => VIDEO_EXT.test(url);

export interface BackgroundHost {
  /** Plan `background`. */
  plane: Container;
  /** Texture d'une image (cache du rendu, libérée à la destruction). */
  texture(url: string): Promise<Texture>;
  /** Taille naturelle connue : taille du monde. */
  onLoaded(width: number, height: number): void;
  onError(url: string, err: unknown): void;
  invalidate(): void;
  /** Animation du moteur (repli sans `requestVideoFrameCallback`). */
  onFrame(cb: (now: number) => boolean | void): () => void;
}

export class MapBackground {
  private sprite: Sprite | null = null;
  private url: string | null = null;
  private seq = 0;
  private stopVideo: (() => void) | null = null;
  private destroyed = false;

  constructor(private readonly host: BackgroundHost) {}

  /** Change de fond (null : aucun). Un chargement dépassé par un autre est abandonné. */
  set(url: string | null) {
    if (this.destroyed || url === this.url) return;
    this.url = url;
    const seq = ++this.seq;
    this.clear();
    if (!url) return;
    const video = isVideoUrl(url);
    const load = video
      ? Assets.load<Texture>({
          src: url,
          parser: 'video',
          data: {
            autoPlay: true,
            loop: true,
            muted: true,
            playsinline: true,
            preload: true,
            crossorigin: true,
          },
        })
      : this.host.texture(url);
    load.then(
      (texture) => {
        if (this.destroyed || seq !== this.seq) {
          if (video) void Assets.unload(url).catch(() => undefined);
          return;
        }
        const sprite = new Sprite(texture);
        sprite.label = 'background';
        this.sprite = sprite;
        this.host.plane.addChild(sprite);
        if (video) this.driveVideo(texture.source as VideoSource, url);
        this.host.onLoaded(Math.round(texture.width), Math.round(texture.height));
        this.host.invalidate();
      },
      (err: unknown) => {
        if (seq === this.seq) this.host.onError(url, err);
      },
    );
  }

  private driveVideo(source: VideoSource, url: string) {
    source.autoUpdate = false;
    const video = source.resource as HTMLVideoElement;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
    let last = 0;
    /** Nouvelle image si la précédente date d'au moins 1/30 s. */
    const frame = (now: number) => {
      if (now - last < 1000 / VIDEO_FPS - 2) return;
      last = now;
      source.update();
      this.host.invalidate();
    };
    let stop: () => void;
    if (typeof video.requestVideoFrameCallback === 'function') {
      let handle: number | null = null;
      const onFrame = (now: number) => {
        if (this.destroyed) return;
        frame(now);
        handle = video.requestVideoFrameCallback(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      stop = () => {
        if (handle !== null) video.cancelVideoFrameCallback(handle);
      };
    } else {
      stop = this.host.onFrame((now) => {
        if (!video.paused) frame(now);
        return !video.paused;
      });
    }
    this.stopVideo = () => {
      stop();
      video.pause();
      void Assets.unload(url).catch(() => undefined);
    };
  }

  private clear() {
    this.stopVideo?.();
    this.stopVideo = null;
    if (this.sprite) {
      this.sprite.removeFromParent();
      this.sprite.destroy();
      this.sprite = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.clear();
  }
}
