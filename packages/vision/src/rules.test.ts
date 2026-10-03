/**
 * Règles de visibilité du § 9 (docs/carte.md), une par une : portes, fenêtres, sens unique,
 * pièces, brouillard, lumières, murs translucides.
 */
import { describe, expect, it } from 'vitest';
import {
  closedRooms,
  inFog,
  innermostRoom,
  isEntityVisible,
  lightArea,
  playerView,
  pointInPolygon,
  prepareScene,
  sampleCircle,
  sideOf,
  translucentShadows,
  viewerView,
  withLights,
  type FogZone,
  type Light,
  type Room,
  type Segment,
  type Viewer,
  type VisionScene,
} from './index.js';
import { boxWalls, rectPoints } from './testing/scenes.js';

const bounds = { width: 400, height: 400 };
const viewer = (x: number, y: number, visionRadius = 50): Viewer => ({
  id: `v${x},${y}`,
  pos: { x, y },
  visionRadius,
});
const scene = (segments: Segment[], extra: Partial<VisionScene> = {}): VisionScene => ({
  bounds,
  segments,
  ...extra,
});

/** Mur vertical x = 200 sur toute la hauteur, avec une ouverture de 180 à 220 d'une sorte donnée. */
function wallWithGap(gap: Partial<Segment> & Pick<Segment, 'kind'>): Segment[] {
  return [
    { id: 'haut', a: { x: 200, y: 0 }, b: { x: 200, y: 180 }, kind: 'wall' },
    { id: 'ouverture', a: { x: 200, y: 180 }, b: { x: 200, y: 220 }, ...gap },
    { id: 'bas', a: { x: 200, y: 220 }, b: { x: 200, y: 400 }, kind: 'wall' },
  ];
}

describe('murs et portes', () => {
  it('un mur opaque cache ce qui est derrière', () => {
    const prep = prepareScene(scene(wallWithGap({ kind: 'wall' })));
    const view = viewerView(prep, viewer(100, 200));
    expect(view.contains({ x: 150, y: 200 })).toBe(true);
    expect(view.contains({ x: 300, y: 200 })).toBe(false);
    expect(view.contains({ x: 300, y: 20 })).toBe(false);
  });

  it('une porte fermée bloque comme un mur, ouverte elle laisse voir', () => {
    const closed = viewerView(prepareScene(scene(wallWithGap({ kind: 'door' }))), viewer(100, 200));
    expect(closed.contains({ x: 300, y: 200 })).toBe(false);
    const explicit = prepareScene(scene(wallWithGap({ kind: 'door', open: false })));
    expect(viewerView(explicit, viewer(100, 200)).contains({ x: 300, y: 200 })).toBe(false);

    const open = viewerView(
      prepareScene(scene(wallWithGap({ kind: 'door', open: true }))),
      viewer(100, 200),
    );
    expect(open.contains({ x: 300, y: 200 })).toBe(true);
    // Hors du cône de la porte : toujours caché.
    expect(open.contains({ x: 300, y: 20 })).toBe(false);
  });

  it('une fenêtre laisse voir', () => {
    const view = viewerView(prepareScene(scene(wallWithGap({ kind: 'window' }))), viewer(100, 200));
    expect(view.contains({ x: 300, y: 200 })).toBe(true);
  });

  it('opacité nulle : sans effet', () => {
    const view = viewerView(
      prepareScene(scene(wallWithGap({ kind: 'wall', opacity: 0 }))),
      viewer(100, 200),
    );
    expect(view.contains({ x: 300, y: 200 })).toBe(true);
  });
});

describe('mur à sens unique', () => {
  // Segment orienté a = (200, 0) → b = (200, 400), vers le bas de l'écran. Convention :
  // p est à gauche si cross(b − a, p − a) < 0 (y vers le bas). Ici cross = −400 (px − 200) :
  // la gauche est x > 200 (en marchant vers le bas de l'écran, la main gauche est à l'est).
  const a = { x: 200, y: 0 };
  const b = { x: 200, y: 400 };

  it('convention de côté : gauche = cross(b − a, p − a) < 0, y vers le bas', () => {
    expect(sideOf(a, b, { x: 300, y: 100 })).toBe('left');
    expect(sideOf(a, b, { x: 100, y: 100 })).toBe('right');
    expect(sideOf(a, b, { x: 200, y: 100 })).toBeNull();
    // Segment vers la droite de l'écran : la gauche est en haut (y plus petit).
    expect(sideOf({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -1 })).toBe('left');
  });

  it('blocksFrom left : bloque l’observateur à gauche, transparent de l’autre côté', () => {
    const prep = prepareScene(scene([{ id: 'sens', a, b, kind: 'one_way', blocksFrom: 'left' }]));
    // Observateur à gauche (x > 200) : ne voit pas de l'autre côté.
    expect(viewerView(prep, viewer(300, 200)).contains({ x: 100, y: 200 })).toBe(false);
    // Observateur à droite (x < 200) : voit à travers.
    expect(viewerView(prep, viewer(100, 200)).contains({ x: 300, y: 200 })).toBe(true);
  });

  it('blocksFrom right : l’inverse', () => {
    const prep = prepareScene(scene([{ id: 'sens', a, b, kind: 'one_way', blocksFrom: 'right' }]));
    expect(viewerView(prep, viewer(300, 200)).contains({ x: 100, y: 200 })).toBe(true);
    expect(viewerView(prep, viewer(100, 200)).contains({ x: 300, y: 200 })).toBe(false);
  });

  it('l’alias one_way_wall du contrat, et blocksFrom absent = left', () => {
    const prep = prepareScene(scene([{ id: 'sens', a, b, kind: 'one_way_wall' }]));
    expect(viewerView(prep, viewer(300, 200)).contains({ x: 100, y: 200 })).toBe(false);
    expect(viewerView(prep, viewer(100, 200)).contains({ x: 300, y: 200 })).toBe(true);
  });

  it('le sens est celui de chaque segment, même inversé', () => {
    // Même mur tracé b→a : la gauche devient x < 200.
    const prep = prepareScene(
      scene([{ id: 'sens', a: b, b: a, kind: 'one_way', blocksFrom: 'left' }]),
    );
    expect(viewerView(prep, viewer(100, 200)).contains({ x: 300, y: 200 })).toBe(false);
    expect(viewerView(prep, viewer(300, 200)).contains({ x: 100, y: 200 })).toBe(true);
  });
});

describe('pièces', () => {
  const roomBox = { x: 100, y: 100, w: 200, h: 200 };
  const room: Room = {
    id: 'salle',
    points: rectPoints(roomBox.x, roomBox.y, roomBox.w, roomBox.h),
  };

  it('pièce fermée sans murs : ni dehors depuis dedans, ni dedans depuis dehors', () => {
    const prep = prepareScene(scene([], { rooms: [room] }));
    expect(closedRooms(prep)).toEqual(new Set(['salle']));
    const outside = viewerView(prep, viewer(50, 200));
    expect(outside.contains({ x: 200, y: 200 })).toBe(false);
    expect(outside.contains({ x: 50, y: 20 })).toBe(true);
    expect(outside.contains({ x: 350, y: 380 })).toBe(true);
    const inside = viewerView(prep, viewer(200, 200));
    expect(inside.contains({ x: 120, y: 280 })).toBe(true);
    expect(inside.contains({ x: 50, y: 200 })).toBe(false);
    // Les termes pour le rendu.
    expect(inside.viewers[0]!.clipRoom?.id).toBe('salle');
    expect(inside.viewers[0]!.subtractRooms).toEqual([]);
    expect(outside.viewers[0]!.clipRoom).toBeNull();
    expect(outside.viewers[0]!.subtractRooms.map((r) => r.id)).toEqual(['salle']);
  });

  /** Murs du contour, avec une porte sur le bord gauche (x = 100, y de 180 à 220). */
  function walledRoom(door: Partial<Segment>): Segment[] {
    return [
      { id: 'n', a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, kind: 'wall' },
      { id: 'e', a: { x: 300, y: 100 }, b: { x: 300, y: 300 }, kind: 'wall' },
      { id: 's', a: { x: 300, y: 300 }, b: { x: 100, y: 300 }, kind: 'wall' },
      { id: 'o1', a: { x: 100, y: 300 }, b: { x: 100, y: 220 }, kind: 'wall' },
      { id: 'porte', a: { x: 100, y: 220 }, b: { x: 100, y: 180 }, kind: 'door', ...door },
      { id: 'o2', a: { x: 100, y: 180 }, b: { x: 100, y: 100 }, kind: 'wall' },
    ];
  }

  it('une porte ouverte sur le contour ouvre la pièce', () => {
    const prep = prepareScene(scene(walledRoom({ open: true }), { rooms: [room] }));
    expect(closedRooms(prep).size).toBe(0);
    expect(prep.rooms[0]!.doorIds).toEqual(['porte']);
    const outside = viewerView(prep, viewer(50, 200));
    expect(outside.contains({ x: 200, y: 200 })).toBe(true);
    // Dans la pièce mais hors du cône de la porte : caché par les murs.
    expect(outside.contains({ x: 200, y: 110 })).toBe(false);
    const inside = viewerView(prep, viewer(200, 200));
    expect(inside.contains({ x: 20, y: 200 })).toBe(true);
  });

  it('porte fermée : la pièce est fermée', () => {
    const prep = prepareScene(scene(walledRoom({ open: false }), { rooms: [room] }));
    expect(closedRooms(prep).has('salle')).toBe(true);
    expect(viewerView(prep, viewer(50, 200)).contains({ x: 200, y: 200 })).toBe(false);
  });

  it('salle détectée des murs, sans pièce posée : fermée, puis ouverte par sa porte', () => {
    const closed = prepareScene(scene(walledRoom({ open: false })));
    expect(closedRooms(closed).size).toBe(1);
    expect(viewerView(closed, viewer(50, 200)).contains({ x: 200, y: 200 })).toBe(false);
    expect(viewerView(closed, viewer(200, 200)).contains({ x: 50, y: 200 })).toBe(false);
    const open = prepareScene(scene(walledRoom({ open: true })));
    expect(closedRooms(open).size).toBe(0);
    expect(viewerView(open, viewer(50, 200)).contains({ x: 200, y: 200 })).toBe(true);
    // Désactivable : sans pièce posée, la salle n'existe plus (seuls les murs comptent)
    const off = prepareScene(scene(walledRoom({ open: false })), { wallRooms: false });
    expect(closedRooms(off).size).toBe(0);
  });

  it('porte à 3 px du contour : comptée ; à 10 px : non', () => {
    const near: Segment = {
      id: 'p',
      a: { x: 102.5, y: 180 },
      b: { x: 102.5, y: 220 },
      kind: 'door',
      open: true,
    };
    const prepNear = prepareScene(scene([near], { rooms: [room] }));
    expect(closedRooms(prepNear).size).toBe(0);
    const far: Segment = { ...near, a: { x: 110, y: 180 }, b: { x: 110, y: 220 } };
    const prepFar = prepareScene(scene([far], { rooms: [room] }));
    expect(closedRooms(prepFar)).toEqual(new Set(['salle']));
    // Tolérance réglable.
    expect(
      closedRooms(prepareScene(scene([far], { rooms: [room] }), { doorTolerance: 12 })).size,
    ).toBe(0);
  });

  it('une porte en travers de la pièce (extrémités sur le contour) ne l’ouvre pas', () => {
    const across: Segment = {
      id: 'p',
      a: { x: 100, y: 200 },
      b: { x: 300, y: 200 },
      kind: 'door',
      open: true,
    };
    expect(closedRooms(prepareScene(scene([across], { rooms: [room] })))).toEqual(
      new Set(['salle']),
    );
  });

  it('une fenêtre sur le contour ouvre la pièce : on voit au travers', () => {
    const segs = walledRoom({}).map((s) =>
      s.id === 'porte' ? { ...s, kind: 'window' as const } : s,
    );
    const prep = prepareScene(scene(segs, { rooms: [room] }));
    expect(closedRooms(prep).size).toBe(0);
    // La ligne de vue passe par la fenêtre, dans les deux sens ; le reste de la pièce reste caché
    expect(viewerView(prep, viewer(50, 200)).contains({ x: 200, y: 200 })).toBe(true);
    expect(viewerView(prep, viewer(50, 200)).contains({ x: 200, y: 110 })).toBe(false);
    expect(viewerView(prep, viewer(200, 200)).contains({ x: 50, y: 200 })).toBe(true);
  });

  it('pièces imbriquées : la plus intérieure confine, les fermées voisines sont retirées', () => {
    const outer: Room = { id: 'grande', points: rectPoints(50, 50, 300, 300) };
    const inner: Room = { id: 'petite', points: rectPoints(150, 150, 60, 60) };
    const prep = prepareScene(scene([], { rooms: [outer, inner] }));
    expect(innermostRoom(prep, { x: 180, y: 180 })?.id).toBe('petite');
    expect(innermostRoom(prep, { x: 60, y: 60 })?.id).toBe('grande');
    expect(innermostRoom(prep, { x: 10, y: 10 })).toBeNull();
    // Dans la grande pièce, hors de la petite : on voit la grande, pas la petite, pas dehors.
    const view = viewerView(prep, viewer(100, 100));
    expect(view.contains({ x: 300, y: 300 })).toBe(true);
    expect(view.contains({ x: 180, y: 180 })).toBe(false);
    expect(view.contains({ x: 20, y: 20 })).toBe(false);
    // Dans la petite : seulement la petite.
    const small = viewerView(prep, viewer(180, 180));
    expect(small.contains({ x: 200, y: 200 })).toBe(true);
    expect(small.contains({ x: 100, y: 100 })).toBe(false);
  });

  it('innermostRoom avec closedOnly ignore les pièces ouvertes', () => {
    const outer: Room = { id: 'grande', points: rectPoints(50, 50, 300, 300) };
    const inner: Room = { id: 'petite', points: rectPoints(150, 150, 60, 60) };
    const door: Segment = {
      id: 'p',
      a: { x: 150, y: 170 },
      b: { x: 150, y: 190 },
      kind: 'door',
      open: true,
    };
    const prep = prepareScene(scene([door], { rooms: [outer, inner] }));
    expect(closedRooms(prep)).toEqual(new Set(['grande']));
    expect(innermostRoom(prep, { x: 180, y: 180 })?.id).toBe('petite');
    expect(innermostRoom(prep, { x: 180, y: 180 }, { closedOnly: true })?.id).toBe('grande');
  });
});

describe('brouillard', () => {
  const zones: FogZone[] = [
    { id: 'clair', mode: 'clear', shape: 'rect', points: rectPoints(0, 0, 200, 200) },
    { id: 'brume', mode: 'fog', shape: 'circle', center: { x: 100, y: 100 }, radius: 40 },
    { id: 'trou', mode: 'clear', shape: 'circle', center: { x: 100, y: 100 }, radius: 10 },
  ];

  it('zones appliquées dans l’ordre, à partir de fogFull', () => {
    const prep = prepareScene(scene([], { fogFull: true, fogZones: zones }));
    expect(inFog(prep, { x: 300, y: 300 })).toBe(true); // fogFull
    expect(inFog(prep, { x: 20, y: 20 })).toBe(false); // clair
    expect(inFog(prep, { x: 100, y: 70 })).toBe(true); // brume, postérieure
    expect(inFog(prep, { x: 100, y: 100 })).toBe(false); // trou, encore après
    // Ordre inversé : la zone claire, dernière, l'emporte partout dans son rectangle.
    const reversed = prepareScene(scene([], { fogFull: true, fogZones: [...zones].reverse() }));
    expect(inFog(reversed, { x: 100, y: 70 })).toBe(false);
  });

  it('sans fogFull, seules les zones fog couvrent', () => {
    const prep = prepareScene(scene([], { fogZones: zones }));
    expect(inFog(prep, { x: 300, y: 300 })).toBe(false);
    expect(inFog(prep, { x: 100, y: 70 })).toBe(true);
  });

  it('polygone à main levée (grand, indexé par bandes)', () => {
    const pts = [];
    for (let k = 0; k < 400; k++) {
      const a = (2 * Math.PI * k) / 400;
      const r = k % 2 === 0 ? 100 : 90;
      pts.push({ x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a) });
    }
    const prep = prepareScene(
      scene([], { fogZones: [{ id: 'lasso', mode: 'fog', shape: 'polygon', points: pts }] }),
    );
    for (let k = 0; k < 500; k++) {
      const p = { x: 90 + ((k * 37) % 220), y: 90 + ((k * 53) % 220) };
      expect(inFog(prep, p)).toBe(pointInPolygon(p, pts));
    }
  });

  it('dans le brouillard, on ne voit que dans son rayon de vision', () => {
    const prep = prepareScene(scene([], { fogFull: true, fogZones: zones }));
    const view = viewerView(prep, viewer(300, 300, 30));
    expect(view.contains({ x: 310, y: 310 })).toBe(true); // rayon de vision
    expect(view.contains({ x: 360, y: 360 })).toBe(false); // brouillard, hors rayon
    expect(view.contains({ x: 20, y: 20 })).toBe(true); // zone claire, en vue
    expect(view.contains({ x: 100, y: 70 })).toBe(false); // brume
    expect(view.contains({ x: 100, y: 100 })).toBe(true); // trou clair
  });

  it('le brouillard n’agit que sur la portée : un mur cache même dans le rayon', () => {
    const wall: Segment = { id: 'm', a: { x: 320, y: 250 }, b: { x: 320, y: 350 }, kind: 'wall' };
    const prep = prepareScene(scene([wall], { fogFull: true }));
    const view = viewerView(prep, viewer(300, 300, 50));
    expect(view.contains({ x: 310, y: 300 })).toBe(true);
    expect(view.contains({ x: 330, y: 300 })).toBe(false);
  });
});

describe('lumières', () => {
  const light: Light = {
    id: 'torche',
    pos: { x: 100, y: 300 },
    radius: 60,
    on: true,
    falloff: 0.5,
  };

  it('une zone éclairée se voit dans le brouillard', () => {
    const prep = prepareScene(scene([], { fogFull: true, lights: [light] }));
    const view = viewerView(prep, viewer(300, 300, 20));
    expect(view.contains({ x: 120, y: 300 })).toBe(true);
    expect(view.contains({ x: 100, y: 200 })).toBe(false);
    expect(view.lights).toHaveLength(1);
    expect(view.lights[0]!.falloff).toBe(0.5);
  });

  it('éteinte : sans effet', () => {
    const prep = prepareScene(scene([], { fogFull: true, lights: [{ ...light, on: false }] }));
    expect(viewerView(prep, viewer(300, 300, 20)).contains({ x: 120, y: 300 })).toBe(false);
    expect(lightArea(prep, { ...light, on: false }).polygon).toHaveLength(0);
  });

  it('une lumière derrière un mur n’éclaire pas de l’autre côté', () => {
    // Mur x = 130 de y = 250 à 350 : la lumière (100, 300) n'éclaire pas (150, 300).
    const wall: Segment = { id: 'm', a: { x: 130, y: 250 }, b: { x: 130, y: 350 }, kind: 'wall' };
    const prep = prepareScene(scene([wall], { fogFull: true, lights: [light] }));
    const view = viewerView(prep, viewer(250, 300, 20));
    expect(view.contains({ x: 150, y: 300 })).toBe(false); // dans le disque, derrière le mur
    // Éclairé (devant le mur côté lumière) mais caché à l'observateur par le mur : non vu.
    expect(view.contains({ x: 110, y: 300 })).toBe(false);
    // Éclairé et en vue de l'observateur (sous le mur).
    const seen = viewerView(prep, viewer(250, 380, 20));
    expect(seen.contains({ x: 110, y: 355 })).toBe(true);
  });

  it('lightArea : polygone dans le disque, coupé par les murs', () => {
    // Mur plus long que le disque : rien ne passe au-delà de x = 130.
    const wall: Segment = { id: 'm', a: { x: 130, y: 200 }, b: { x: 130, y: 400 }, kind: 'wall' };
    const prep = prepareScene(scene([wall], { lights: [light] }));
    const area = lightArea(prep, light);
    expect(area.radius).toBe(60);
    expect(area.center).toEqual(light.pos);
    const poly = area.polygon;
    expect(poly.length).toBeGreaterThan(20);
    for (let i = 0; i < poly.length; i += 2) {
      expect(Math.hypot(poly[i]! - 100, poly[i + 1]! - 300)).toBeLessThanOrEqual(60 + 1e-6);
      expect(poly[i]!).toBeLessThanOrEqual(130 + 1e-6);
    }
    expect(pointInPolygon({ x: 70, y: 300 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 140, y: 300 }, poly)).toBe(false);
    // Même résultat pour une lumière hors scène.
    const moved = lightArea(prep, { ...light });
    expect(Array.from(moved.polygon)).toEqual(Array.from(poly));
  });

  it('withLights : la torche bouge sans refaire les murs', () => {
    const prep = prepareScene(scene([], { fogFull: true, lights: [light] }));
    const moved = withLights(prep, [{ ...light, pos: { x: 300, y: 100 } }]);
    expect(moved.core).toBe(prep.core);
    const view = viewerView(moved, viewer(200, 200, 10));
    expect(view.contains({ x: 300, y: 120 })).toBe(true);
    expect(view.contains({ x: 100, y: 310 })).toBe(false);
  });
});

describe('murs translucides', () => {
  const glass: Segment = {
    id: 'vitre',
    a: { x: 200, y: 150 },
    b: { x: 200, y: 250 },
    kind: 'wall',
    opacity: 0.4,
  };

  it('ne masquent pas un PNJ, mais projettent une ombre partielle', () => {
    const prep = prepareScene(scene([glass]));
    const view = viewerView(prep, viewer(100, 200));
    const npc = sampleCircle({ x: 300, y: 200 }, 20);
    expect(isEntityVisible(view, npc)).toBe(true);
    const shadows = translucentShadows(prep, { x: 100, y: 200 });
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.opacity).toBe(0.4);
    expect(shadows[0]!.id).toBe('vitre');
    expect(pointInPolygon({ x: 300, y: 200 }, shadows[0]!.polygon)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 200 }, shadows[0]!.polygon)).toBe(false);
    expect(pointInPolygon({ x: 300, y: 20 }, shadows[0]!.polygon)).toBe(false);
  });

  it('ombre jusqu’au bord, avec les coins de la carte englobés', () => {
    // Vitre longue près de l'observateur : le cône couvre les deux coins de droite.
    const long: Segment = {
      id: 'v',
      a: { x: 110, y: 10 },
      b: { x: 110, y: 390 },
      kind: 'wall',
      opacity: 0.5,
    };
    const [shadow] = translucentShadows(prepareScene(scene([long])), { x: 100, y: 200 });
    expect(pointInPolygon({ x: 395, y: 5 }, shadow!.polygon)).toBe(true);
    expect(pointInPolygon({ x: 395, y: 395 }, shadow!.polygon)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 200 }, shadow!.polygon)).toBe(false);
  });

  it('sens unique translucide : ombre seulement du côté bloquant', () => {
    const oneWay: Segment = { ...glass, kind: 'one_way', blocksFrom: 'left' };
    const prep = prepareScene(scene([oneWay]));
    // a→b vers le bas : gauche = x > 200.
    expect(translucentShadows(prep, { x: 300, y: 200 })).toHaveLength(1);
    expect(translucentShadows(prep, { x: 100, y: 200 })).toHaveLength(0);
  });
});

describe('vue d’un joueur', () => {
  it('union de ses observateurs', () => {
    const wall: Segment = { id: 'm', a: { x: 200, y: 0 }, b: { x: 200, y: 400 }, kind: 'wall' };
    const prep = prepareScene(scene([wall]));
    const view = playerView(prep, [viewer(100, 200), viewer(300, 200)]);
    expect(view.contains({ x: 20, y: 20 })).toBe(true);
    expect(view.contains({ x: 380, y: 380 })).toBe(true);
    expect(view.viewers).toHaveLength(2);
    expect(playerView(prep, [viewer(100, 200)]).contains({ x: 380, y: 380 })).toBe(false);
  });

  it('sans observateur, rien n’est vu', () => {
    const prep = prepareScene(scene([]));
    expect(playerView(prep, []).contains({ x: 10, y: 10 })).toBe(false);
  });

  it('entité à cheval sur un bord de l’ombre : vue si un échantillon l’est', () => {
    const wall: Segment = { id: 'm', a: { x: 200, y: 100 }, b: { x: 200, y: 400 }, kind: 'wall' };
    const prep = prepareScene(scene([wall]));
    const view = viewerView(prep, viewer(100, 90));
    // Centre (260, 110) caché par le mur, mais l'échantillon du haut (260, 89) est en vue.
    expect(view.contains({ x: 260, y: 110 })).toBe(false);
    expect(isEntityVisible(view, sampleCircle({ x: 260, y: 110 }, 30))).toBe(true);
    expect(isEntityVisible(view, sampleCircle({ x: 260, y: 300 }, 30))).toBe(false);
    expect(
      view.containsAny([
        { x: 260, y: 300 },
        { x: 20, y: 20 },
      ]),
    ).toBe(true);
  });

  it('les observateurs sans position finie sont ignorés', () => {
    const prep = prepareScene(scene(boxWalls('b', 150, 150, 100, 100)));
    const view = playerView(prep, [
      { id: 'x', pos: { x: NaN, y: 0 }, visionRadius: 10 },
      viewer(50, 50),
    ]);
    expect(view.viewers).toHaveLength(1);
    expect(view.contains({ x: 60, y: 60 })).toBe(true);
  });
});
