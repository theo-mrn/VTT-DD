/**
 * Canevas de jsdom sans paquet natif (tests seulement) : un contexte 2D factice (mesure du texte,
 * pixels vides, dessin ignoré) et un WebGL réduit aux constantes que Pixi lit hors rendu.
 * Installé à l'import, avant Pixi, qui teste un canevas dès le sien.
 */
/** Classe des contextes 2D (absente de jsdom) : Pixi teste `instanceof`. */
class FakeContext2d {}

/** Contexte 2D factice : mesure le texte, rend des pixels vides, ignore le dessin. */
function fakeContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state = Object.assign(Object.create(FakeContext2d.prototype) as object, {
    canvas,
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
  }) as Record<string | symbol, unknown>;
  const methods: Record<string, unknown> = {
    measureText: (text: string) => ({
      width: text.length * 6,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 6,
      fontBoundingBoxAscent: 9,
      fontBoundingBoxDescent: 3,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
  };
  return new Proxy(state, {
    get: (target, key) =>
      key in methods ? methods[key as string] : key in target ? target[key] : () => undefined,
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Faux contexte WebGL : quelques constantes que Pixi lit hors rendu (précision des shaders). */
const fakeWebgl = {
  FRAGMENT_SHADER: 0x8b30,
  VERTEX_SHADER: 0x8b31,
  HIGH_FLOAT: 0x8df2,
  MAX_TEXTURE_SIZE: 0x0d33,
  getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
  getExtension: () => null,
  getParameter: () => 4096,
};

const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

const canvasProto = HTMLCanvasElement.prototype as unknown as {
  getContext(this: HTMLCanvasElement, type: string): unknown;
  toDataURL(): string;
};
canvasProto.getContext = function (type) {
  if (type !== '2d') return fakeWebgl;
  let ctx = contexts.get(this);
  if (!ctx) contexts.set(this, (ctx = fakeContext2d(this)));
  return ctx;
};
canvasProto.toDataURL = () => 'data:,';
const g = globalThis as Record<string, unknown>;
g.CanvasRenderingContext2D ??= FakeContext2d;

/** Pixels d'image (absents de jsdom) : la météo peint ses textures avec. */
class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}
g.ImageData ??= FakeImageData;
