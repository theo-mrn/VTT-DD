// @vitest-environment jsdom
/**
 * Effets animés des gabarits (boule de feu, cône) : catalogue de la bibliothèque, vidéos
 * partagées par effet (référencées), lecture seulement quand c'est utile (montrée, animée, onglet
 * visible), horloge commune qui n'envoie au GPU que les images neuves, variante 512 px puis
 * original, et pose du sprite sur la forme.
 */
import '../../test/fake-canvas';
import * as PIXI from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapEngine } from '../../engine/map-engine';
import type { MeasureSpec } from './model';
import type { SkinAsset } from './skins';

const LIB = 'https://assets.yner.fr/Effect';
const ASSETS: SkinAsset[] = [
  {
    name: 'c',
    path: `${LIB}/Cone/cone2.webm`,
    localPath: 'Effect/Cone/cone2.webm',
    category: 'Effect/Cone',
    type: 'video',
  },
  {
    name: 'c',
    path: `${LIB}/Cone/cone10.webm`,
    localPath: 'Effect/Cone/cone10.webm',
    category: 'Effect/Cone',
    type: 'video',
  },
  {
    name: 'c',
    path: `${LIB}/Cone/cone2.webp`,
    localPath: 'Effect/Cone/cone2.webp',
    category: 'Effect/Cone',
    type: 'image',
  },
  {
    name: 'f',
    path: `${LIB}/Fireballs/explosion1.webm`,
    localPath: 'Effect/Fireballs/explosion1.webm',
    category: 'Effect/Fireballs',
    type: 'video',
  },
  {
    name: 'x',
    path: '/autre.webm',
    localPath: 'Autre/loop3.webm',
    category: 'Autre',
    type: 'video',
  },
];

/** Vidéo factice : lecture, pause, suivi des images décodées. */
function fakeVideo(withFrameApi = true) {
  const frames: (() => void)[] = [];
  const v = {
    paused: true,
    muted: false,
    loop: false,
    play: vi.fn(async () => {
      v.paused = false;
    }),
    pause: vi.fn(() => {
      v.paused = true;
    }),
    ...(withFrameApi
      ? {
          requestVideoFrameCallback: vi.fn((cb: () => void) => frames.push(cb)),
          cancelVideoFrameCallback: vi.fn(),
        }
      : {}),
    /** Le décodeur sort une image. */
    decode() {
      frames.shift()?.();
    },
  };
  return v;
}

function setup(o: { failVariant?: boolean; failAll?: boolean; frameApi?: boolean } = {}) {
  const videos: ReturnType<typeof fakeVideo>[] = [];
  const updates = vi.fn();
  const load = vi.fn(async ({ src }: { src: string }) => {
    if (o.failAll || (o.failVariant && src.includes('/512/'))) throw new Error('illisible');
    const video = fakeVideo(o.frameApi ?? true);
    videos.push(video);
    return {
      source: { resource: video, autoUpdate: true, update: updates },
    } as unknown as PIXI.Texture;
  });
  const unload = vi.fn(async () => undefined);
  const engine = {
    pixi: { Assets: { load, unload } },
    invalidate: vi.fn(),
  } as unknown as MapEngine & { invalidate: ReturnType<typeof vi.fn> };
  return { engine, load, unload, updates, videos };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

let mod: typeof import('./skins');
beforeEach(async () => {
  // Catalogue lu une fois par page : module neuf à chaque test
  vi.resetModules();
  // Réponse sans flux (lue en microtâches, même sous horloge simulée)
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ASSETS,
  } as Response);
  mod = await import('./skins');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('catalogue des effets', () => {
  it('options par forme, triées, avec vignette ; libellés ; adresses', () => {
    const cones = mod.skinOptions(ASSETS, 'cone');
    expect(cones.map((c) => [c.value, c.label, c.thumbnail])).toEqual([
      ['Cone/cone2.webm', 'Cône 2', `${LIB}/Cone/cone2.webp`],
      ['Cone/cone10.webm', 'Cône 10', null],
    ]);
    expect(mod.skinOptions(ASSETS, 'line')).toEqual([]);
    expect(mod.skinLabel('Fireballs/explosion1.webm')).toBe('Explosion 1');
    expect(mod.skinLabel('Autre/loop3.webm')).toBe('Boucle 3');
    expect(mod.skinLabel('Autre/feu.webm')).toBe('feu');
    expect(mod.skinLabel('Autre/arc7.webm')).toBe('arc 7');
    expect(mod.skinUrl('Effect/Cone/cone2.webm', ASSETS)).toBe(`${LIB}/Cone/cone2.webm`);
    expect(mod.skinUrl('Cone/inconnu.webm', ASSETS)).toBeNull();
    expect(mod.skinnable('circle')).toBe(true);
    expect(mod.skinnable('cube')).toBe(false);
  });
});

describe('textures vidéo partagées', () => {
  it('variante 512 px chargée une fois, jouée tant qu’elle est prise, en pause sinon', async () => {
    vi.useFakeTimers();
    const t = setup();
    const textures = new mod.SkinTextures(t.engine);
    const ready = vi.fn();
    textures.onReady(ready);
    expect(textures.acquire('Cone/cone2.webm')).toBeNull();
    textures.acquire('Cone/cone2.webm');
    await flush();
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(t.load.mock.calls[0]![0].src).toBe(`${LIB}/Cone/512/cone2.webm`);
    expect(ready).toHaveBeenCalled();
    expect(textures.peek('Cone/cone2.webm')).not.toBeNull();
    const video = t.videos[0]!;
    expect(video.play).toHaveBeenCalled();
    expect(video.muted && video.loop).toBe(true);
    // Une image décodée part au GPU au battement suivant, une seule fois
    video.decode();
    vi.advanceTimersByTime(50);
    expect(t.updates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(t.updates).toHaveBeenCalledTimes(1);
    // Une référence rendue : elle joue encore ; la dernière : pause
    textures.release('Cone/cone2.webm');
    expect(video.pause).not.toHaveBeenCalled();
    textures.release('Cone/cone2.webm');
    expect(video.pause).toHaveBeenCalled();
    textures.release('inconnu');
    textures.dispose();
    expect(t.unload).toHaveBeenCalledWith(`${LIB}/Cone/512/cone2.webm`);
  });

  it('variante illisible : l’original ; tout illisible : échec sans texture', async () => {
    const t = setup({ failVariant: true });
    const textures = new mod.SkinTextures(t.engine);
    textures.acquire('Fireballs/explosion1.webm');
    await flush();
    expect(t.load.mock.calls.map((c) => c[0].src)).toEqual([
      `${LIB}/Fireballs/512/explosion1.webm`,
      `${LIB}/Fireballs/explosion1.webm`,
    ]);
    expect(textures.peek('Fireballs/explosion1.webm')).not.toBeNull();
    const broken = setup({ failAll: true });
    const other = new mod.SkinTextures(broken.engine);
    other.acquire('Cone/cone2.webm');
    // Hors bibliothèque : pas de variante, un seul essai
    other.acquire('Autre/loop3.webm');
    await flush();
    expect(other.peek('Cone/cone2.webm')).toBeNull();
    expect(broken.load.mock.calls.map((c) => c[0].src)).toContain('/autre.webm');
    // Effet inconnu de la bibliothèque : rien à charger
    other.acquire('Cone/inconnu.webm');
    await flush();
    expect(broken.load).toHaveBeenCalledTimes(3);
  });

  it('« Animer les effets » coupé et onglet caché : pause ; rétablis : lecture', async () => {
    const t = setup();
    const textures = new mod.SkinTextures(t.engine);
    textures.acquire('Cone/cone2.webm');
    await flush();
    const video = t.videos[0]!;
    textures.setAnimate(false);
    textures.setAnimate(false);
    expect(video.paused).toBe(true);
    textures.setAnimate(true);
    await flush();
    expect(video.paused).toBe(false);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(video.paused).toBe(true);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(video.paused).toBe(false);
    textures.dispose();
  });

  it('sans suivi des images décodées : l’image courante part à chaque battement', async () => {
    vi.useFakeTimers();
    const t = setup({ frameApi: false });
    const textures = new mod.SkinTextures(t.engine);
    textures.acquire('Cone/cone2.webm');
    await flush();
    vi.advanceTimersByTime(45);
    vi.advanceTimersByTime(45);
    expect(t.updates.mock.calls.length).toBeGreaterThanOrEqual(2);
    textures.dispose();
  });

  it('effet arrivé après la fermeture : libéré aussitôt ; fermé avant : jamais chargé', async () => {
    const t = setup();
    let arrive!: () => void;
    const original = t.load.getMockImplementation()!;
    t.load.mockImplementationOnce(
      (arg) => new Promise((r) => (arrive = () => r(original(arg) as never))),
    );
    const textures = new mod.SkinTextures(t.engine);
    textures.acquire('Cone/cone2.webm');
    await flush();
    textures.dispose();
    arrive();
    await flush();
    expect(t.unload).toHaveBeenCalledWith(`${LIB}/Cone/512/cone2.webm`);
    const early = setup();
    const closed = new mod.SkinTextures(early.engine);
    closed.acquire('Cone/cone2.webm');
    closed.dispose();
    await flush();
    expect(early.load).not.toHaveBeenCalled();
  });

  it('catalogue injoignable : aucun effet, et il sera relu', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('hors ligne'));
    const t = setup();
    const textures = new mod.SkinTextures(t.engine);
    textures.acquire('Cone/cone2.webm');
    await flush();
    expect(t.load).not.toHaveBeenCalled();
  });
});

describe('effet posé sur la forme', () => {
  const circle: MeasureSpec = {
    shape: 'circle',
    start: { x: 100, y: 100 },
    end: { x: 150, y: 100 },
    options: {},
  };
  const cone = (options = {}): MeasureSpec => ({
    shape: 'cone',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    options,
  });

  it('cercle : sprite centré, 1,35 × le diamètre ; cône : de l’origine au bout, découpé', async () => {
    const t = setup();
    const textures = new mod.SkinTextures(t.engine);
    const container = new PIXI.Container();
    const slot = new mod.SkinSlot(PIXI, container, textures);
    // Texture pas encore prête : rien d'affiché
    expect(slot.set('Fireballs/explosion1.webm', circle, 50)).toBe(false);
    await flush();
    vi.spyOn(textures, 'peek').mockReturnValue(PIXI.Texture.WHITE);
    expect(slot.set('Fireballs/explosion1.webm', circle, 50)).toBe(true);
    const sprite = container.children[1] as PIXI.Sprite;
    expect(sprite.position).toMatchObject({ x: 100, y: 100 });
    expect(sprite.width).toBeCloseTo(2 * 50 * mod.CIRCLE_SKIN_SCALE);
    // Même mesure : rien n'est repositionné
    expect(slot.set('Fireballs/explosion1.webm', circle, 50)).toBe(true);
    // Cône arrondi puis plat
    expect(slot.set('Cone/cone2.webm', cone(), 50)).toBe(true);
    expect(sprite.anchor.x).toBe(0);
    expect(sprite.mask).not.toBeNull();
    expect(slot.set('Cone/cone2.webm', cone({ coneShape: 'flat' }), 50)).toBe(true);
    // Forme sans effet (cube) : caché
    expect(slot.set('Cone/cone2.webm', { ...circle, shape: 'cube' }, 50)).toBe(false);
    expect(sprite.visible).toBe(false);
    slot.release();
    slot.release();
    textures.dispose();
  });
});
