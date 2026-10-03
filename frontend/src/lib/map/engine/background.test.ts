// @vitest-environment jsdom
/**
 * Fond de la carte : image décodée hors du fil principal (réduite au-delà de ce que le GPU
 * accepte, sprite à la taille naturelle), repli sur le chargeur de Pixi, chargement dépassé
 * abandonné ; vidéo native sous le canevas (variante 1080p puis original, taille de l'original,
 * lecture selon « Animer le fond » et l'onglet, suivi de la caméra, libération du décodeur).
 */
import '../test/fake-canvas';
import * as PIXI from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { BackgroundPrefs } from './background-prefs';
import { MapBackground, type BackgroundHost } from './background';

const LIB = 'https://assets.yner.fr/Map/Donjon/Animated';

function host(o: { maxTextureSize?: number } = {}) {
  const prefs = createStore<BackgroundPrefs>()(() => ({ animate: true }) as BackgroundPrefs);
  const h = {
    plane: new PIXI.Container(),
    underlay: document.createElement('div'),
    prefs,
    texture: vi.fn(async () => {
      const t = new PIXI.Texture({ source: new PIXI.TextureSource({ width: 300, height: 200 }) });
      return t;
    }),
    maxTextureSize: o.maxTextureSize ?? 8192,
    onLoaded: vi.fn(),
    onError: vi.fn(),
    invalidate: vi.fn(),
  };
  return h as typeof h & BackgroundHost;
}

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

/** Vidéos créées par le fond (la lue et la sonde de taille). */
let videos: HTMLVideoElement[] = [];
let bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  videos = [];
  bitmaps = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = create(tag);
    if (tag === 'video') videos.push(el as HTMLVideoElement);
    return el;
  }) as typeof document.createElement);
  const media = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  media.play = vi.fn(async function (this: { _paused: boolean }) {
    this._paused = false;
  });
  media.pause = vi.fn(function (this: { _paused: boolean }) {
    this._paused = true;
  });
  media.load = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: { _paused?: boolean }) {
      return this._paused ?? true;
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubImage(width: number, height: number, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 404, blob: async () => new Blob(['x']) })),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (_src: unknown, opts?: { resizeWidth: number; resizeHeight: number }) => {
      const b = {
        width: opts?.resizeWidth ?? width,
        height: opts?.resizeHeight ?? height,
        close: vi.fn(),
      };
      bitmaps.push(b);
      return b;
    }),
  );
}

/** La vidéo connaît sa taille : `loadedmetadata`. */
function meta(video: HTMLVideoElement, width: number, height: number) {
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  video.dispatchEvent(new Event('loadedmetadata'));
}

describe('fond image', () => {
  it('décodée ici, à la taille du monde ; nouveau fond : l’ancien est libéré', async () => {
    stubImage(3000, 2000);
    const h = host();
    const bg = new MapBackground(h);
    bg.set('/cartes/crypte.webp');
    bg.set('/cartes/crypte.webp');
    await flush();
    expect(h.onLoaded).toHaveBeenCalledWith(3000, 2000);
    const sprite = h.plane.children[0] as PIXI.Sprite;
    expect(sprite.label).toBe('background');
    expect(sprite.width).toBe(3000);
    bg.set(null);
    expect(h.plane.children).toHaveLength(0);
    expect(bitmaps[0]!.close).toHaveBeenCalled();
    bg.destroy();
    bg.set('/cartes/autre.webp');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('plus grande que le GPU : réduite au décodage, le monde garde sa taille', async () => {
    stubImage(10000, 5000);
    const h = host({ maxTextureSize: 4000 });
    new MapBackground(h).set('/cartes/geante.webp');
    await flush();
    expect(bitmaps[1]).toMatchObject({ width: 4000, height: 2000 });
    expect(bitmaps[0]!.close).toHaveBeenCalled();
    expect(h.onLoaded).toHaveBeenCalledWith(10000, 5000);
  });

  it('sans décodeur ou format illisible : chargeur de Pixi ; réponse en erreur : signalée', async () => {
    const h = host();
    new MapBackground(h).set('/cartes/a.webp');
    await flush();
    expect(h.texture).toHaveBeenCalledWith('/cartes/a.webp');
    expect(h.onLoaded).toHaveBeenCalledWith(300, 200);
    stubImage(10, 10);
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('avif ?'));
    const h2 = host();
    new MapBackground(h2).set('/cartes/b.avif');
    await flush();
    expect(h2.texture).toHaveBeenCalled();
    stubImage(10, 10, false);
    const h3 = host();
    new MapBackground(h3).set('/cartes/c.webp');
    await flush();
    expect(h3.onError).toHaveBeenCalledWith('/cartes/c.webp', expect.any(Error));
  });

  it('chargement dépassé par un autre : abandonné', async () => {
    stubImage(100, 100);
    const h = host();
    const bg = new MapBackground(h);
    bg.set('/cartes/1.webp');
    bg.set('/cartes/2.webp');
    await flush();
    expect(h.plane.children).toHaveLength(1);
    expect(h.onLoaded).toHaveBeenCalledTimes(1);
    // Fermé pendant le chargement : la texture décodée est détruite
    const late = new MapBackground(host());
    late.set('/cartes/3.webp');
    late.destroy();
    await flush();
  });
});

describe('fond vidéo', () => {
  it('vidéo de la bibliothèque : variante 1080p, taille de l’original, visible à la 1re image', async () => {
    const h = host();
    const bg = new MapBackground(h);
    bg.set(`${LIB}/Lave.webm`);
    const video = videos[0]!;
    expect(video.getAttribute('src')).toBe(`${LIB}/1080p/Lave.mp4`);
    expect(h.underlay.contains(video)).toBe(true);
    expect(video.style.visibility).toBe('hidden');
    meta(video, 1920, 1080);
    // Sonde de l'original (4K)
    const probe = videos[1]!;
    meta(probe, 3840, 2160);
    await flush();
    expect(h.onLoaded).toHaveBeenCalledWith(3840, 2160);
    expect(video.style.width).toBe('3840px');
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.style.visibility).toBe('visible');
    expect(video.play).toHaveBeenCalled();
    // La caméra : une transformation CSS, recalculée seulement si elle change
    bg.setCamera(0.5, 10, 20);
    expect(video.style.transform).toBe('matrix(0.5,0,0,0.5,10,20)');
    bg.setCamera(0.5, 10, 20);
    bg.destroy();
    expect(h.underlay.contains(video)).toBe(false);
    expect(video.load).toHaveBeenCalled();
  });

  it('variante illisible : l’original ; illisible aussi : erreur signalée', () => {
    const h = host();
    new MapBackground(h).set(`${LIB}/Lave.webm`);
    const video = videos[0]!;
    video.dispatchEvent(new Event('error'));
    expect(video.getAttribute('src')).toBe(`${LIB}/Lave.webm`);
    video.dispatchEvent(new Event('error'));
    expect(h.onError).toHaveBeenCalledWith(`${LIB}/Lave.webm`, video.error);
  });

  it('vidéo hors bibliothèque : lue telle quelle, sa propre taille ; sonde illisible ignorée', async () => {
    const h = host();
    new MapBackground(h).set('https://exemple.test/carte.mp4');
    const video = videos[0]!;
    expect(video.getAttribute('src')).toBe('https://exemple.test/carte.mp4');
    meta(video, 1280, 720);
    await flush();
    expect(h.onLoaded).toHaveBeenCalledWith(1280, 720);
  });

  it('« Animer le fond » coupé, onglet caché : en pause ; rétabli : lecture', () => {
    const h = host();
    new MapBackground(h).set('https://exemple.test/carte.webm');
    const video = videos[0]!;
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.paused).toBe(false);
    h.prefs.setState({ animate: false });
    expect(video.paused).toBe(true);
    h.prefs.setState({ animate: true });
    expect(video.paused).toBe(false);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(video.paused).toBe(true);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('vidéo remplacée avant sa taille : rien n’est annoncé', async () => {
    const h = host();
    const bg = new MapBackground(h);
    bg.set(`${LIB}/Lave.webm`);
    const first = videos[0]!;
    bg.set('https://exemple.test/autre.webm');
    meta(first, 100, 100);
    first.dispatchEvent(new Event('error'));
    await flush();
    expect(h.onLoaded).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });
});
