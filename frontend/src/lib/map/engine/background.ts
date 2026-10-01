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
 * Vidéo : un élément `<video>` du navigateur, dans un calque placé SOUS le canvas (transparent),
 * transformé comme la caméra (`setCamera`). Le navigateur la décode et la compose lui-même
 * (décodage matériel, sans copie vers WebGL) : la carte ne redessine rien tant que rien ne bouge,
 * même sur un fond animé en 4K. Préférence « Animer le fond » (`background-prefs.ts`) : sinon la
 * première image, figée. Onglet caché : en pause (reprise au retour).
 *
 * Chargé avec le rendu (`pixi-view.ts`) : importe Pixi.
 */
import { ImageSource, Sprite, Texture, type Container } from 'pixi.js';
import type { StoreApi } from 'zustand/vanilla';
import { prefersEconomy } from '@/lib/perf/device';
import { isVideoUrl, type BackgroundPrefs } from './background-prefs';

export { isVideoUrl };
/** Côté maximal de l'image de fond sur une machine économe (au-delà : réduite). */
export const ECONOMY_MAX_TEXTURE = 4096;

export interface BackgroundHost {
  /** Plan `background` (image). */
  plane: Container;
  /** Calque DOM sous le canvas (vidéo), de la taille de la vue. */
  underlay: HTMLElement;
  /** « Animer le fond » : la vidéo joue ou reste sur sa première image. */
  prefs: StoreApi<BackgroundPrefs>;
  /** Texture d'une image (cache du rendu, libérée à la destruction) : repli sans décodage. */
  texture(url: string): Promise<Texture>;
  /** Côté maximal d'une texture pour ce GPU (`MAX_TEXTURE_SIZE`). */
  maxTextureSize: number;
  /** Taille naturelle connue : taille du monde. */
  onLoaded(width: number, height: number): void;
  onError(url: string, err: unknown): void;
  invalidate(): void;
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
  private video: HTMLVideoElement | null = null;
  private stopVideo: (() => void) | null = null;
  private camera = '';
  private destroyed = false;

  constructor(private readonly host: BackgroundHost) {}

  /** Change de fond (null : aucun). Un chargement dépassé par un autre est abandonné. */
  set(url: string | null) {
    if (this.destroyed || url === this.url) return;
    this.url = url;
    const seq = ++this.seq;
    this.clear();
    if (!url) return;
    if (isVideoUrl(url)) {
      this.showVideo(url, seq);
      return;
    }
    this.loadImage(url).then(
      ({ texture, width, height, owned }) => {
        if (this.destroyed || seq !== this.seq) {
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
        this.host.onLoaded(Math.round(width), Math.round(height));
        this.host.invalidate();
      },
      (err: unknown) => {
        if (seq === this.seq) this.host.onError(url, err);
      },
    );
  }

  /** Caméra du monde (échelle, translation en pixels CSS) : la vidéo suit, sans rendu. */
  setCamera(zoom: number, x: number, y: number) {
    const key = `${zoom} ${x} ${y}`;
    if (key === this.camera) return;
    this.camera = key;
    if (this.video) this.video.style.transform = `matrix(${zoom},0,0,${zoom},${x},${y})`;
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

  /**
   * Vidéo native sous le canvas. Taille naturelle à `loadedmetadata` (taille du monde) ; lecture
   * selon « Animer le fond », en pause onglet caché.
   */
  private showVideo(url: string, seq: number) {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('aria-hidden', 'true');
    Object.assign(video.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transformOrigin: '0 0',
      maxWidth: 'none',
      pointerEvents: 'none',
      // Pas d'image avant la première image décodée (évite un flash)
      visibility: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    this.video = video;
    this.camera = '';

    const animate = () => this.host.prefs.getState().animate;
    const sync = () => {
      if (document.hidden || !animate()) video.pause();
      else void video.play().catch(() => undefined);
    };
    const onMeta = () => {
      if (this.destroyed || seq !== this.seq) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      video.style.width = `${width}px`;
      video.style.height = `${height}px`;
      this.host.onLoaded(width, height);
      this.host.invalidate();
    };
    const onData = () => {
      video.style.visibility = 'visible';
      sync();
    };
    const onError = () => {
      if (seq === this.seq) this.host.onError(url, video.error);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('loadeddata', onData);
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', sync);
    const unsubscribe = this.host.prefs.subscribe(sync);
    video.src = url;
    this.host.underlay.appendChild(video);
    this.stopVideo = () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', sync);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('loadeddata', onData);
      video.removeEventListener('error', onError);
      video.pause();
      // Libère le décodeur tout de suite
      video.removeAttribute('src');
      video.load();
      video.remove();
    };
  }

  private clear() {
    this.stopVideo?.();
    this.stopVideo = null;
    this.video = null;
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
