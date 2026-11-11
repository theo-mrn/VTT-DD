/**
 * Conversion UVTT (docs/import-uvtt.md § 4) : lecture tolérante, cases → pixels avec origine et
 * réduction, murs simplifiés et coupés, portes, lumières (sauf ombres peintes), couleurs, image.
 */
import { describe, expect, it } from 'vitest';
import {
  convertUvtt,
  isUvttName,
  parseUvtt,
  simplify,
  splitPolyline,
  uvttColor,
  uvttImage,
  uvttSize,
} from './convert';

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Fichier comme en exporte Dungeondraft (format 0.3). */
const dungeondraft = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 20, y: 10 }, pixels_per_grid: 100 },
    line_of_sight: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 3 },
      ],
    ],
    objects_line_of_sight: [
      [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ],
    ],
    portals: [
      {
        position: { x: 3, y: 0.5 },
        bounds: [
          { x: 3, y: 0 },
          { x: 3, y: 1 },
        ],
        rotation: 0,
        closed: true,
        freestanding: false,
      },
      {
        position: { x: 4, y: 0 },
        bounds: [
          { x: 4, y: 0 },
          { x: 4, y: 1 },
        ],
        closed: false,
      },
    ],
    lights: [
      { position: { x: 10, y: 5 }, range: 6, intensity: 1.4, color: 'ffeccd8b', shadows: true },
      { position: { x: 1, y: 1 }, range: 0, intensity: 1, color: 'ffffffff', shadows: true },
    ],
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    image: PNG_1PX,
    ...extra,
  });

describe('parseUvtt', () => {
  it('lit un fichier Dungeondraft', () => {
    const doc = parseUvtt(dungeondraft());
    expect(doc?.resolution.pixels_per_grid).toBe(100);
    expect(uvttSize(doc!)).toEqual({ width: 2000, height: 1000 });
  });

  it('accepte un fichier sans murs d’objets, portes, lumières ni environnement', () => {
    const doc = parseUvtt(
      JSON.stringify({
        resolution: { map_size: { x: 4, y: 4 }, pixels_per_grid: 50 },
        line_of_sight: [],
        image: PNG_1PX,
      }),
    );
    expect(doc).not.toBeNull();
    expect(convertUvtt(doc!)).toMatchObject({ walls: [], doors: [], lights: [], objectWalls: [] });
  });

  it('refuse ce qui n’est pas un UVTT', () => {
    expect(parseUvtt('pas du json')).toBeNull();
    expect(parseUvtt(JSON.stringify({ name: 'scène' }))).toBeNull();
    expect(parseUvtt(dungeondraft({ image: '' }))).toBeNull();
  });

  it('reconnaît les extensions', () => {
    expect(isUvttName('Crypte.DD2VTT')).toBe(true);
    expect(isUvttName('grotte.uvtt')).toBe(true);
    expect(isUvttName('forêt.df2vtt')).toBe(true);
    expect(isUvttName('carte.png')).toBe(false);
  });
});

describe('convertUvtt', () => {
  const doc = parseUvtt(dungeondraft())!;

  it('convertit les cases en pixels et fond les points alignés', () => {
    const { walls, cellPx } = convertUvtt(doc);
    expect(cellPx).toBe(100);
    expect(walls).toEqual([
      {
        kind: 'wall',
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 300 },
        ],
      },
    ]);
  });

  it('suit la réduction de l’image et l’origine de la carte', () => {
    const shifted = parseUvtt(
      dungeondraft({
        resolution: {
          map_origin: { x: 1, y: 1 },
          map_size: { x: 20, y: 10 },
          pixels_per_grid: 100,
        },
      }),
    )!;
    const { walls, cellPx, lights } = convertUvtt(shifted, 0.5);
    expect(cellPx).toBe(50);
    // Le premier segment tombe hors de l'image : le mur commence au bord
    expect(walls[0]!.points).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    expect(lights[0]!.pos).toEqual({ x: 450, y: 200 });
  });

  it('garde les murs des objets à part', () => {
    expect(convertUvtt(doc).objectWalls).toEqual([
      {
        kind: 'wall',
        points: [
          { x: 500, y: 500 },
          { x: 600, y: 500 },
        ],
      },
    ]);
  });

  it('fait des portes, ouvertes ou fermées, jamais verrouillées', () => {
    expect(convertUvtt(doc).doors).toEqual([
      {
        kind: 'door',
        points: [
          { x: 300, y: 0 },
          { x: 300, y: 100 },
        ],
        isOpen: false,
        isLocked: false,
      },
      {
        kind: 'door',
        points: [
          { x: 400, y: 0 },
          { x: 400, y: 100 },
        ],
        isOpen: true,
        isLocked: false,
      },
    ]);
  });

  it('importe les lumières en cases, couleur et intensité bornée', () => {
    expect(convertUvtt(doc).lights).toEqual([
      {
        pos: { x: 1000, y: 500 },
        radius: 6,
        color: '#eccd8b',
        intensity: 1,
        falloff: 0.5,
        visible: true,
      },
    ]);
  });

  it('écarte les lumières quand les ombres sont peintes dans l’image', () => {
    const baked = parseUvtt(dungeondraft({ environment: { baked_lighting: true } }))!;
    expect(convertUvtt(baked).lights).toEqual([]);
  });
});

describe('cadre de l’image', () => {
  // Dungeondraft exporte les murs de tout le niveau, l'image n'en montre qu'une partie
  const cropped = parseUvtt(
    dungeondraft({
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 4, y: 4 }, pixels_per_grid: 100 },
      line_of_sight: [
        [
          { x: -2, y: 1 },
          { x: 6, y: 1 },
        ],
        [
          { x: 1, y: 2 },
          { x: 1, y: 9 },
          { x: 3, y: 9 },
          { x: 3, y: 2 },
        ],
        [
          { x: 10, y: 10 },
          { x: 12, y: 10 },
        ],
      ],
      portals: [
        {
          bounds: [
            { x: 2, y: 2 },
            { x: 2, y: 3 },
          ],
          closed: true,
        },
        {
          bounds: [
            { x: 8, y: 2 },
            { x: 8, y: 3 },
          ],
          closed: true,
        },
      ],
      lights: [
        { position: { x: 2, y: 2 }, range: 3, intensity: 1, color: 'ffffffff' },
        { position: { x: 9, y: 9 }, range: 3, intensity: 1, color: 'ffffffff' },
      ],
    }),
  )!;
  const s = convertUvtt(cropped);

  it('coupe les murs au bord et écarte ceux du dehors', () => {
    expect(s.walls.map((w) => w.points)).toEqual([
      [
        { x: 0, y: 100 },
        { x: 400, y: 100 },
      ],
      [
        { x: 100, y: 200 },
        { x: 100, y: 400 },
      ],
      [
        { x: 300, y: 400 },
        { x: 300, y: 200 },
      ],
    ]);
  });

  it('ne garde que les portes et les lumières de l’image', () => {
    expect(s.doors).toHaveLength(1);
    expect(s.lights.map((l) => l.pos)).toEqual([{ x: 200, y: 200 }]);
  });
});

describe('simplify', () => {
  it('retire les doublons et les points alignés, garde les angles et les retours', () => {
    expect(
      simplify([
        { x: 0, y: 0 },
        { x: 0.2, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 20, y: 5 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 20, y: 5 },
    ]);
  });

  it('garde une ligne fermée fermée', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    expect(simplify(square)).toEqual(square);
  });

  it('rend vide un mur réduit à un point', () => {
    expect(
      simplify([
        { x: 3, y: 3 },
        { x: 3.5, y: 3 },
      ]),
    ).toEqual([]);
  });
});

describe('splitPolyline', () => {
  it('coupe en morceaux soudés de 1 000 points au plus', () => {
    const line = Array.from({ length: 2500 }, (_, i) => ({ x: i, y: i % 2 }));
    const parts = splitPolyline(line);
    expect(parts.map((p) => p.length)).toEqual([1000, 1000, 502]);
    expect(parts[1]![0]).toEqual(parts[0]![999]);
    expect(parts[2]!.at(-1)).toEqual(line.at(-1));
  });
});

describe('uvttColor et uvttImage', () => {
  it('lit les couleurs ARGB et #RRGGBB', () => {
    expect(uvttColor('ff336699')).toBe('#336699');
    expect(uvttColor('#ABCDEF')).toBe('#abcdef');
    expect(uvttColor('rouge')).toBe('#ffffff');
  });

  it('décode l’image et devine son type', () => {
    const file = uvttImage(parseUvtt(dungeondraft())!, 'Crypte.dd2vtt');
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('Crypte.png');
    expect(file.size).toBeGreaterThan(60);
    const prefixed = uvttImage(
      parseUvtt(dungeondraft({ image: `data:image/png;base64,${PNG_1PX}` }))!,
      'a.uvtt',
    );
    expect(prefixed.size).toBe(file.size);
  });
});
