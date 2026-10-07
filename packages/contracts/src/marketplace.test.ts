import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  isValidPrice,
  mapPackUrls,
  marketplaceFee,
  nextVersionNumber,
  normalizeText,
  PackContent,
  packCounts,
  packKinds,
  packUrls,
  slugify,
  VersionNumber,
} from './marketplace.js';

const BG = 'https://assets.test/campaigns/0192a0e0-0000-7000-8000-000000000001/fond.webp';
const OBJ = 'https://assets.test/campaigns/0192a0e0-0000-7000-8000-000000000001/coffre.webp';

const pack = () =>
  PackContent.parse({
    format: 1,
    systemId: 'dnd5e',
    scenes: [
      {
        ref: 's1',
        scene: { name: 'Crypte', backgroundUrl: BG, width: 2000, height: 1500 },
        obstacles: [
          {
            kind: 'wall',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
        lights: [{ pos: { x: 5, y: 5 }, radius: 4 }],
        objects: [
          {
            pos: { x: 1, y: 1 },
            imageUrl: OBJ,
            items: [{ id: 'a', name: 'Clé', quantity: 1, imageUrl: OBJ }],
          },
          { pos: { x: 2, y: 2 }, imageUrl: '/images/tonneau.webp' },
        ],
      },
    ],
    npcTemplates: [{ ref: 'n1', name: 'Goule', imageUrl: BG, etat: { systeme: 'dnd5e' } }],
    objectTemplates: [{ ref: 'o1', name: 'Tonneau', imageUrl: OBJ }],
  });

describe('commission et prix', () => {
  it('15 %, 0,50 € au moins, jamais plus que le prix', () => {
    expect(marketplaceFee(0)).toBe(0);
    expect(marketplaceFee(200)).toBe(50);
    expect(marketplaceFee(1000)).toBe(150);
    expect(marketplaceFee(499)).toBe(75);
    expect(marketplaceFee(30)).toBe(30);
  });

  it('gratuit, ou de 2 € à 200 €', () => {
    expect(isValidPrice(0)).toBe(true);
    expect(isValidPrice(199)).toBe(false);
    expect(isValidPrice(200)).toBe(true);
    expect(isValidPrice(20_000)).toBe(true);
    expect(isValidPrice(20_001)).toBe(false);
    expect(isValidPrice(2.5)).toBe(false);
  });
});

describe('numéros de version', () => {
  it('x.y.z sans zéro de tête', () => {
    expect(VersionNumber.safeParse('1.0.0').success).toBe(true);
    expect(VersionNumber.safeParse('01.0.0').success).toBe(false);
    expect(VersionNumber.safeParse('1.0').success).toBe(false);
  });

  it('compare numériquement et propose le correctif suivant', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(nextVersionNumber(null)).toBe('1.0.0');
    expect(nextVersionNumber('1.2.3')).toBe('1.2.4');
  });
});

describe('texte', () => {
  it('normalise et fabrique une adresse', () => {
    expect(normalizeText('  Les Cryptes de Sél !')).toBe('les cryptes de sel');
    expect(slugify('Les Cryptes de Sél !')).toBe('les-cryptes-de-sel');
    expect(slugify('!!!')).toBe('pack');
  });
});

describe('pack', () => {
  it('compte les éléments et les fichiers distincts (hors chemins du front)', () => {
    const p = pack();
    expect(packCounts(p)).toEqual({ scenes: 1, npcTemplates: 1, objectTemplates: 1, assets: 2 });
    expect(packKinds(packCounts(p))).toEqual(['scenes', 'npcs', 'objects']);
    expect(packUrls(p).sort()).toEqual([BG, OBJ, '/images/tonneau.webp'].sort());
  });

  it('réécrit toutes les adresses', () => {
    const p = mapPackUrls(pack(), (u) => (u.startsWith('/') ? u : `${u}?copie`));
    expect(p.scenes[0]!.scene.backgroundUrl).toBe(`${BG}?copie`);
    expect(p.scenes[0]!.objects[0]!.imageUrl).toBe(`${OBJ}?copie`);
    expect(p.scenes[0]!.objects[0]!.items![0]!.imageUrl).toBe(`${OBJ}?copie`);
    expect(p.npcTemplates[0]!.imageUrl).toBe(`${BG}?copie`);
    expect(p.objectTemplates[0]!.imageUrl).toBe(`${OBJ}?copie`);
    expect(p.scenes[0]!.objects[1]!.imageUrl).toBe('/images/tonneau.webp');
  });

  it('refuse un pack vide, des PNJ sans système, des références en double, un calque', () => {
    expect(PackContent.safeParse({ format: 1 }).success).toBe(false);
    expect(
      PackContent.safeParse({
        format: 1,
        npcTemplates: [{ ref: 'n', name: 'X', etat: {} }],
      }).success,
    ).toBe(false);
    expect(
      PackContent.safeParse({
        format: 1,
        objectTemplates: [
          { ref: 'a', name: 'X' },
          { ref: 'a', name: 'Y' },
        ],
      }).success,
    ).toBe(false);
    expect(
      PackContent.safeParse({
        format: 1,
        scenes: [
          { ref: 's', scene: { name: 'S' }, objects: [{ pos: { x: 0, y: 0 }, layerId: 'x' }] },
        ],
      }).success,
    ).toBe(false);
  });
});
