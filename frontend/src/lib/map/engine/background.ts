/**
 * Fond de la carte (docs/carte.md § 4, § 10) : une image (png, jpeg, webp, avif, gif — première
 * image) ou une vidéo webm/mp4 muette, en boucle, `playsinline`. Sa taille naturelle est la
 * taille du monde : le moteur la reçoit (`onLoaded`) et le client du MJ l'envoie au serveur si
 * elle manque ou a changé.
 *
 * Image : décodée hors du fil principal (`createImageBitmap`), avec mipmaps (pas de
 * scintillement en vue d'ensemble). Plus grande que ce que le GPU accepte, ou que 4096 px sur une
 * machine économe, elle est réduite au décodage ; le sprite garde la taille naturelle (le monde
 * ne change pas).
 *
 * Vidéo : 24 images par seconde au plus (15 sur une machine économe), sans le ticker partagé de
 * Pixi. Chaque nouvelle image de la vidéo (`requestVideoFrameCallback`) met la texture à jour et
 * demande un rendu ; sans cette API, la boucle du moteur tourne tant que la vidéo joue. Onglet
 * caché : en pause (reprise au retour). « Mouvement réduit » : la première image, figée.
 *
 * Chargé avec le rendu (`pixi-view.ts`) : importe Pixi.
 */
import { Assets, ImageSource, Sprite, Texture, type Container, type VideoSource } from 'pixi.js';
import { prefersEconomy, prefersReducedMotion } from '@/lib/perf/device';

/** Images de la vidéo de fond par seconde, au plus. */
export const VIDEO_FPS = 24;
/** Même chose sur une machine économe. */
export const VIDEO_FPS_ECONOMY = 15;
/** Côté maximal de l'image de fond sur une machine économe (au-delà : réduite). */
export const ECONOMY_MAX_TEXTURE = 4096;

const VIDEO_EXT = /\.(webm|mp4|m4v|mov)(\?|#|$)/i;
export const isVideoUrl = (url: string) => VIDEO_EXT.test(url);

export interface BackgroundHost {
  /** Plan `background`. */
  plane: Container;
  /** Texture d'une image (cache du rendu, libérée à la destruction) : repli sans décodage. */
  texture(url: string): Promise<Texture>;
  /** Côté maximal d'une texture pour ce GPU (`MAX_TEXTURE_SIZE`). */
  maxTextureSize: number;
  /** Taille naturelle connue : taille du monde. */
  onLoaded(width: number, height: number): void;
  onError(url: string, err: unknown): void;
  invalidate(): void;
  /** Animation du moteur (repli sans `requestVideoFrameCallback`). */
  onFrame(cb: (now: number) => boolean | void): () => void;
}

interface Loaded {
  texture: Texture;
  /** Taille naturelle (celle du monde), même si la texture est réduite. */
  width: number;
  height: number;
  /** Texture à nous (décodée ici) : détruite avec le fond. */
  owned: boolean;
}

export class MapBackground {
  private sprite: Sprite | null = null;
  private owned: Texture | null = null;
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
    const frozen = video && prefersReducedMotion();
    const load: Promise<Loaded> = video
      ? Assets.load<Texture>({
          src: url,
          parser: 'video',
          data: {
            autoPlay: !frozen,
            loop: true,
            muted: true,
            playsinline: true,
            preload: true,
            crossorigin: true,
          },
        }).then((texture) => ({
          texture,
          width: texture.width,
          height: texture.height,
          owned: false,
        }))
      : this.loadImage(url);
    load.then(
      ({ texture, width, height, owned }) => {
        if (this.destroyed || seq !== this.seq) {
          if (video) void Assets.unload(url).catch(() => undefined);
          if (owned) texture.destroy(true);
          return;
        }
        const sprite = new Sprite(texture);
        sprite.label = 'background';
        // Texture réduite : le sprite garde la taille du monde
        sprite.setSize(width, height);
        this.sprite = sprite;
        this.owned = owned ? texture : null;
        this.host.plane.addChild(sprite);
        if (video) this.driveVideo(texture.source as VideoSource, url, frozen);
        this.host.onLoaded(Math.round(width), Math.round(height));
        this.host.invalidate();
      },
      (err: unknown) => {
        if (seq === this.seq) this.host.onError(url, err);
      },
    );
  }

  /**
   * Image décodée ici (réduite si besoin), mipmaps générés à l'envoi. Sans `createImageBitmap`
   * ou si le décodage échoue (format exotique), le chargeur de Pixi prend le relais.
   */
  private async loadImage(url: string): Promise<Loaded> {
    const fallback = async (): Promise<Loaded> => {
      const texture = await this.host.texture(url);
      return { texture, width: texture.width, height: texture.height, owned: false };
    };
    if (typeof createImageBitmap !== 'function') return fallback();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fond illisible (${res.status})`);
    const blob = await res.blob();
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return fallback();
    }
    const { width, height } = bitmap;
    const cap = Math.min(
      this.host.maxTextureSize,
      prefersEconomy() ? ECONOMY_MAX_TEXTURE : Number.POSITIVE_INFINITY,
    );
    const k = Math.min(1, cap / Math.max(width, height));
    if (k < 1) {
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.floor(width * k)),
        resizeHeight: Math.max(1, Math.floor(height * k)),
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = resized;
    }
    const source = new ImageSource({
      resource: bitmap,
      alphaMode: 'premultiply-alpha-on-upload',
      autoGenerateMipmaps: true,
    });
    return { texture: new Texture({ source }), width, height, owned: true };
  }

  private driveVideo(source: VideoSource, url: string, frozen: boolean) {
    source.autoUpdate = false;
    const video = source.resource as HTMLVideoElement;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    if (frozen) {
      // Mouvement réduit : la première image, sans lecture
      video.pause();
      source.update();
      this.stopVideo = () => void Assets.unload(url).catch(() => undefined);
      return;
    }
    void video.play().catch(() => undefined);
    const interval = 1000 / (prefersEconomy() ? VIDEO_FPS_ECONOMY : VIDEO_FPS);
    let last = -Infinity;
    /** Nouvelle image si la précédente date d'au moins un intervalle (cadence tenue en moyenne). */
    const frame = (now: number) => {
      const elapsed = now - last;
      if (elapsed < interval - 2) return;
      last = elapsed > 4 * interval ? now : now - (elapsed % interval);
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
    // Onglet caché : la vidéo ne se décode plus pour rien
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else {
        void video.play().catch(() => undefined);
        // Repli sans `requestVideoFrameCallback` : la boucle s'était arrêtée avec la pause
        this.host.invalidate();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.stopVideo = () => {
      document.removeEventListener('visibilitychange', onVisibility);
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
    if (this.owned) {
      const bitmap = this.owned.source.resource as ImageBitmap | undefined;
      this.owned.destroy(true);
      bitmap?.close?.();
      this.owned = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.clear();
  }
}
