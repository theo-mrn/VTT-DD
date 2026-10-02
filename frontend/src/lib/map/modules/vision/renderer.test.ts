/**
 * Rendu de la visibilité sans WebGL : la scène Pixi (masques, éventails, contenus) et ce qui
 * est refait à chaque image, avec un faux renderer qui note ses rendus dans les textures.
 * Seuls les shaders ne s'exécutent pas ici ; leur rendu se vérifie dans le navigateur.
 */
import { blockingWalls } from './vision-state';
import * as PIXI from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { MapTheme } from '../../engine/entities/entity-kind';
import { VisionRenderer, type CameraView } from './renderer';
import { object, setup, token, wall } from './vision-test-kit';

const THEME: MapTheme = {
  primary: 0xd4b16a,
  foreground: 0xf4f2ee,
  background: 0x09090b,
  muted: 0x9f9fa9,
  destructive: 0xe5484d,
  success: 0x30a46c,
};

// Canevas factices : GlProgram lit la précision du GPU sur un canevas de test, et le disque de
// vision se dessine sur un canevas 2D.
class FakeCanvas {
  style = {};
  constructor(
    public width = 1,
    public height = 1,
  ) {}
  getContext(type: string) {
    if (type === '2d')
      return {
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
        fillStyle: '',
      };
    return {
      FRAGMENT_SHADER: 0x8b30,
      VERTEX_SHADER: 0x8b31,
      HIGH_FLOAT: 0x8df2,
      getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
      getExtension: () => null,
    };
  }
  addEventListener() {}
  removeEventListener() {}
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).HTMLCanvasElement ??= FakeCanvas;
  PIXI.DOMAdapter.set({
    ...PIXI.BrowserAdapter,
    createCanvas: (w?: number, h?: number) => new FakeCanvas(w, h) as unknown as HTMLCanvasElement,
  });
});

function harness(opts: Parameters<typeof setup>[0] = {}) {
  const t = setup(opts);
  const render = vi.fn();
  const renderer = { resolution: 2, render } as unknown as PIXI.Renderer;
  const plane = new PIXI.Container();
  const r = new VisionRenderer(PIXI, renderer, plane, THEME);
  let cam: CameraView = { x: 500, y: 500, zoom: 1, width: 800, height: 600 };
  const draw = (patch: Partial<CameraView> = {}, time = 0) => {
    cam = { ...cam, ...patch };
    t.run();
    render.mockClear();
    r.draw(t.state.picture(), cam, time);
    return render.mock.calls.map((c) => (c[0] as { container: PIXI.Container }).container.label);
  };
  // Intérieur du rendu (tests seulement)
  const inner = r as unknown as {
    visRoot: PIXI.Container;
    composite: PIXI.Mesh<PIXI.MeshGeometry, PIXI.Shader>;
    uniforms: PIXI.UniformGroup;
  };
  return { ...t, r, plane, draw, inner };
}

const light = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  version: 1,
  mapId: 'carte',
  pos: { x, y },
  radius: 2,
  visible: true,
  falloff: 0.5,
  color: '#ffcc88',
  intensity: 1,
  attachedTokenId: null,
  ...extra,
});

const fogZone = (id: string, x: number, y: number) => ({
  id,
  version: 1,
  mapId: 'carte',
  shape: 'circle',
  mode: 'fog',
  points: [],
  center: { x, y },
  radius: 80,
  order: 1,
});

describe('rendu de la visibilité (sans WebGL)', () => {
  it('ne refait que les textures dont un terme a changé', () => {
    const h = harness({
      tokens: [token('orc', 300, 100)],
      extra: { lights: [light('l', 600, 600)], fogZones: [fogZone('z', 700, 700)] },
    });
    // Première image : tout
    expect(h.draw()).toEqual([
      'vision:range',
      'vision:fog',
      'vision:glow',
      'vision:vis',
      'vision:mist',
    ]);
    // Image suivante : textures neuves refaites une fois (un premier rendu peut sortir vide)
    expect(h.draw()).toContain('vision:vis');
    // Rien de neuf : rien
    expect(h.draw()).toEqual([]);
    // Caméra : tout, à l'échelle de l'écran
    expect(h.draw({ x: 520 })).toEqual([
      'vision:range',
      'vision:fog',
      'vision:glow',
      'vision:vis',
      'vision:mist',
    ]);
    // Mon héros bouge : la vue seule
    const heros = h.engine.entity('heros')!;
    h.engine.setPreview(heros, { ...heros.geometry, x: 120 });
    expect(h.draw()).toEqual(['vision:vis']);
    // Un PNJ bouge : rien à refaire (il est masqué ou montré, pas dessiné ici)
    const orc = h.engine.entity('orc')!;
    h.engine.setPreview(orc, { ...orc.geometry, x: 310 });
    expect(h.draw()).toEqual([]);
    // Une lumière : portée, lueurs, vue ; pas le brouillard
    h.store.getState().upsert('lights', [light('l', 620, 600, { version: 2 })]);
    expect(h.draw()).toEqual(['vision:range', 'vision:glow', 'vision:vis']);
    // Une zone : portée, brouillard, vue
    h.store.getState().upsert('fogZones', [{ ...fogZone('z', 720, 700), version: 2 }]);
    expect(h.draw()).toEqual(['vision:range', 'vision:fog', 'vision:vis', 'vision:mist']);
    // La brume dérive (horloge) : sa densité seule
    expect(h.draw({}, 1)).toEqual(['vision:mist']);
  });

  it('geste de caméra : textures gardées, puis refaites à la caméra finale', () => {
    const h = harness({
      extra: { lights: [light('l', 600, 600)], fogZones: [fogZone('z', 700, 700)] },
    });
    const all = ['vision:range', 'vision:fog', 'vision:glow', 'vision:vis', 'vision:mist'];
    h.draw();
    // Premier déplacement après le repos : tout, tout de suite
    expect(h.draw({ x: 510 })).toEqual(all);
    // Le geste continue : les textures d'il y a un instant servent encore
    expect(h.draw({ x: 520 })).toEqual([]);
    expect(h.draw({ x: 530, zoom: 1.2 })).toEqual([]);
    // Un terme change pendant le geste : tout est refait à la caméra courante
    const heros = h.engine.entity('heros')!;
    h.engine.setPreview(heros, { ...heros.geometry, x: 140 });
    expect(h.draw({ x: 540 })).toEqual(all);
    // Caméra arrêtée (image suivante, même caméra) : refaite si elle était en retard
    expect(h.draw({ x: 550 })).toEqual([]);
    expect(h.draw()).toEqual(all);
    expect(h.draw()).toEqual([]);
  });

  it('contexte WebGL restauré : toutes les textures refaites à l’image suivante', () => {
    const h = harness({
      extra: { lights: [light('l', 600, 600)], fogZones: [fogZone('z', 700, 700)] },
    });
    h.draw();
    h.draw();
    expect(h.draw()).toEqual([]);
    h.r.redrawAll();
    expect(h.draw()).toEqual([
      'vision:range',
      'vision:fog',
      'vision:glow',
      'vision:vis',
      'vision:mist',
    ]);
    expect(h.draw()).toEqual([]);
  });

  it('sans brouillard ni lumière : ni brume ni lueurs', () => {
    const h = harness();
    expect(h.draw()).toEqual(['vision:range', 'vision:vis']);
    const u = h.inner.uniforms.uniforms;
    expect(u.uFogOn).toBe(0);
    expect(u.uGlowOn).toBe(0);
    expect(u.uDarkness).toBeCloseTo(0.8);
  });

  it('observateur : ligne de vue en masque, pièce de confinement, pièces retirées', () => {
    const square = (x: number, y: number, w: number) => [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + w },
      { x, y: y + w },
    ];
    const h = harness({
      extra: {
        rooms: [
          { id: 'salle', version: 1, points: square(0, 0, 180) },
          { id: 'cave', version: 1, points: square(600, 600, 100) },
        ],
      },
    });
    h.draw();
    const nodes = h.inner.visRoot.children;
    expect(nodes).toHaveLength(1);
    const root = nodes[0]!;
    expect(root.mask).toBeInstanceOf(PIXI.Mesh);
    const clipBox = root.children[1]!;
    expect(clipBox.mask).toBeInstanceOf(PIXI.Graphics);
    const subBox = clipBox.children[1]!;
    expect(subBox.mask).toBeInstanceOf(PIXI.Graphics);
    // Contenu : la portée et le disque, en `max`
    const body = subBox.children[1]!;
    const content = body.children[0]!;
    expect(content.children.map((c) => c.blendMode)).toEqual(['max', 'max']);
    const disc = content.getChildByLabel('disc') as PIXI.Sprite;
    expect(disc.position).toMatchObject({ x: 100, y: 100 });
    expect(disc.width).toBeCloseTo(200);
  });

  it('mur translucide : la portée atténuée derrière lui, masquée par son ombre', () => {
    const h = harness({ obstacles: [wall('verre', 200, 0, 1000, { opacity: 0.4 })] });
    h.draw();
    const body = h.inner.visRoot.children[0]!.children[1]!.children[1]!.children[1]!;
    // Hors ombre (masque inverse) + une ombre à 60 %
    expect(body.children).toHaveLength(2);
    expect(body.children[1]!.alpha).toBeCloseTo(0.6);
    expect(body.children[1]!.mask).toBeInstanceOf(PIXI.Graphics);
  });

  it('sans observateur : vue d’en haut ; composition bornée à la carte ; voile du MJ', () => {
    const s = harness({ viewer: { userId: 'bob', role: 'spectator', characterIds: [] } });
    s.draw();
    expect(s.inner.visRoot.children.map((c) => c.label)).toEqual(['vision:top-down']);
    // Caméra qui déborde de la carte : le quadrilatère s'arrête à ses bords
    s.draw({ x: 0, y: 0 });
    const pos = s.inner.composite.geometry.positions;
    expect(Array.from(pos)).toEqual([0, 0, 400, 0, 400, 300, 0, 300]);
    const g = harness({ viewer: { userId: 'mj', role: 'gm', characterIds: [] } });
    g.draw();
    expect(g.inner.uniforms.uniforms.uDarkness).toBeCloseTo(0.8 * 0.25);
    expect(g.inner.uniforms.uniforms.uGlowFloor).toBeCloseTo(0.75);
  });

  it('se détruit sans rien laisser dans le plan', () => {
    const h = harness({ objects: [object('coffre', 300, 90)] });
    h.draw();
    // L'ombre, les salles cachées et le tracé des murs
    expect(h.plane.children).toHaveLength(3);
    h.r.destroy();
    expect(h.plane.children).toHaveLength(0);
    h.r.draw(h.state.picture(), { x: 0, y: 0, zoom: 1, width: 10, height: 10 }, 0);
  });

  it('murs tracés pour le joueur : opaques et portes fermées, ni fenêtres ni portes ouvertes', () => {
    const P = (x: number, y: number) => ({ x, y });
    const walls = blockingWalls({
      segments: [
        { id: 'm', a: P(0, 0), b: P(10, 0), kind: 'wall' },
        { id: 'f', a: P(10, 0), b: P(20, 0), kind: 'window' },
        { id: 'po', a: P(20, 0), b: P(30, 0), kind: 'door', open: true },
        { id: 'pf', a: P(30, 0), b: P(40, 0), kind: 'door', open: false },
        { id: 'z', a: P(40, 0), b: P(50, 0), kind: 'wall', opacity: 0 },
      ],
    });
    expect([...walls]).toEqual([0, 0, 10, 0, 30, 0, 40, 0]);
  });
});
