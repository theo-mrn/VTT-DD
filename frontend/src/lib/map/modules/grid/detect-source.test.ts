// @vitest-environment jsdom
/**
 * Détection du quadrillage d'un fond : image lue (CORS), réduite à 2048 px de large, analysée,
 * résultat rapporté à la taille du monde ; vidéo lue à sa première seconde ; image illisible,
 * sans quadrillage ou erreur : null.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectGrid } from './detect';

/** Fond synthétique : lignes sombres tous les `cell` pixels, sur un fond clair texturé. */
function gridPixels(w: number, h: number, cell: number, ox = 0, oy = 0) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const line = (x - ox) % cell === 0 || (y - oy) % cell === 0;
      const v = line ? 20 : 200 + ((x * 7 + y * 13) % 17);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return data;
}

let pixels: (w: number, h: number) => Uint8ClampedArray;
let source: { width: number; height: number; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  pixels = (w, h) => gridPixels(w, h, 50, 10, 20);
  source = { width: 600, height: 400, close: vi.fn() };
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        const { width, height } = this;
        return {
          drawImage: vi.fn(),
          getImageData: () => ({ data: pixels(width, height) }),
        };
      }
    },
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => source),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('quadrillage d’un fond', () => {
  it('image : cases et décalage trouvés, image libérée', async () => {
    const g = await detectGrid('/cartes/donjon.webp', false);
    expect(g).not.toBeNull();
    expect(g!.size).toBeCloseTo(50, 0);
    // Bord de la ligne : à un pixel près
    expect(Math.abs((g!.offsetX % 50) - 10)).toBeLessThanOrEqual(1);
    expect(source.close).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      '/cartes/donjon.webp',
      expect.objectContaining({ mode: 'cors' }),
    );
  });

  it('variante réduite du fond : résultat rapporté à la largeur du monde', async () => {
    const g = await detectGrid('/cartes/donjon.webp', false, 1200);
    expect(g!.size).toBeCloseTo(100, 0);
  });

  it('fond sans quadrillage, image illisible, canevas sans contexte, erreur : null', async () => {
    pixels = (w, h) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i++) d[i] = (i * 2654435761) % 251;
      return d;
    };
    expect(await detectGrid('/cartes/bruit.webp', false)).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    expect(await detectGrid('/cartes/absente.webp', false)).toBeNull();
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('cors'));
    expect(await detectGrid('/cartes/cors.webp', false)).toBeNull();
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    expect(await detectGrid('/cartes/donjon.webp', false)).toBeNull();
  });

  it('vidéo : image lue à sa première seconde ; vidéo illisible : null', async () => {
    const created: HTMLVideoElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = create(tag);
      if (tag === 'video') created.push(el as HTMLVideoElement);
      return el;
    }) as typeof document.createElement);
    (HTMLMediaElement.prototype as unknown as { load(): void }).load = vi.fn();
    const pending = detectGrid('/cartes/anime.webm', true);
    const v = created[0]!;
    Object.defineProperty(v, 'duration', { value: 8 });
    v.dispatchEvent(new Event('loadedmetadata'));
    expect(v.currentTime).toBe(1);
    v.dispatchEvent(new Event('seeked'));
    const g = await pending;
    expect(g!.size).toBeCloseTo(50, 0);
    const broken = detectGrid('/cartes/casse.webm', true);
    created[1]!.dispatchEvent(new Event('error'));
    expect(await broken).toBeNull();
  });
});
