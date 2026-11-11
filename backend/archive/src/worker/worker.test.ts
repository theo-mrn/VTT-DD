/**
 * Export puis import d'une campagne (docs/export-campagne.md § 5) avec de faux services :
 * adresses de fichiers, nouveaux identifiants, fichiers recopiés, tout ou rien.
 */
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { fakeServices } from '../test/fake-services.js';
import { memoryStore } from '../test/memory-store.js';
import { exportCampaign } from './export.js';
import { importArchive } from './import.js';

const BASE = 'https://files.test';
const C = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const HERO = '0190a1b2-c3d4-7e5f-8a9b-111111111111';
const MAP = '0190a1b2-c3d4-7e5f-8a9b-222222222222';
const OTHER = '0190a1b2-c3d4-7e5f-8a9b-999999999999';
const GM = '0190a1b2-c3d4-7e5f-8a9b-aaaaaaaaaaaa';
const HEIR = '0190a1b2-c3d4-7e5f-8a9b-bbbbbbbbbbbb';

function setup(failOn?: 'character' | 'audio') {
  const { store, objects, put } = memoryStore(BASE);
  put(`campaigns/${C}/fond.webp`, 'FOND', 'image/webp');
  put(`characters/${HERO}/portrait.png`, 'PORTRAIT', 'image/png');
  put(`campaigns/${OTHER}/vole.png`, 'AUTRE', 'image/png');
  put(`campaigns/${C}/page.html`, '<script>', 'text/html');
  const fake = fakeServices({
    failOn,
    campaign: {
      schemaVersion: '0040',
      gmIds: [GM],
      files: [`campaigns/${C}/page.html`],
      tables: {
        campaigns: [
          { id: C, name: 'La Crypte', systemId: 'dnd-classic', systemVersion: '1', ownerId: GM },
        ],
        maps: [
          {
            id: MAP,
            campaignId: C,
            backgroundUrl: `${BASE}/campaigns/${C}/fond.webp`,
            notes: `voir ${BASE}/campaigns/${OTHER}/vole.png`,
          },
        ],
      },
    },
    character: {
      schemaVersion: '0014',
      files: [],
      tables: {
        characters: [
          { id: HERO, campaignId: C, avatarUrl: `${BASE}/characters/${HERO}/portrait.png` },
        ],
      },
    },
  });
  return { store, objects, ...fake };
}

describe('export puis import', () => {
  it('exporte la campagne et ses fichiers, puis la recrée sous de nouveaux identifiants', async () => {
    const s = setup();
    const deps = {
      store: s.store,
      services: s.services,
      now: () => new Date('2026-11-11T10:00:00Z'),
    };
    const exported = await exportCampaign(
      deps,
      C,
      { keepProgress: true },
      'exports/x.yner',
      () => {},
    );
    expect(exported.name).toBe('La Crypte');
    expect(exported.manifest.files.map((f) => f.key).sort()).toEqual([
      `campaigns/${C}/fond.webp`,
      `characters/${HERO}/portrait.png`,
    ]);

    const result = await importArchive(deps, 'exports/x.yner', HEIR, () => {});
    expect(result.name).toBe('La Crypte');
    expect(result.campaignId).not.toBe(C);
    expect(s.imports.map((i) => i.service)).toEqual(['campaign', 'character', 'audio']);

    const [campaign, character] = s.imports;
    const map = campaign!.body.tables.maps![0]!;
    const hero = character!.body.tables.characters![0]!;
    expect(map.id).not.toBe(MAP);
    expect(map.campaignId).toBe(result.campaignId);
    expect(map.backgroundUrl).toBe(`${BASE}/campaigns/${result.campaignId}/fond.webp`);
    // Fichier d'une autre campagne : laissé tel quel, jamais recopié
    expect(map.notes).toBe(`voir ${BASE}/campaigns/${OTHER}/vole.png`);
    expect(hero.avatarUrl).toBe(`${BASE}/characters/${hero.id}/portrait.png`);
    expect(campaign!.body.foreignIds).toContain(hero.id);
    expect(campaign!.body.ownerId).toBe(HEIR);

    expect(await buffer(await s.store.read(`campaigns/${result.campaignId}/fond.webp`))).toEqual(
      Buffer.from('FOND'),
    );
    expect(s.objects.has(`characters/${hero.id}/portrait.png`)).toBe(true);
    expect([...s.objects.keys()].some((k) => k.endsWith('page.html') && !k.includes(C))).toBe(
      false,
    );
  });

  it('retire la campagne et les fichiers copiés si un service échoue', async () => {
    const s = setup('character');
    const deps = { store: s.store, services: s.services, now: () => new Date() };
    await exportCampaign(deps, C, { keepProgress: true }, 'exports/x.yner', () => {});
    const before = new Set(s.objects.keys());
    await expect(importArchive(deps, 'exports/x.yner', HEIR, () => {})).rejects.toThrow(/en panne/);
    expect(s.removed).toHaveLength(1);
    expect(new Set(s.objects.keys())).toEqual(before);
  });

  it('duplique avec ses propres options et un nouveau nom', async () => {
    const s = setup();
    const deps = { store: s.store, services: s.services, now: () => new Date() };
    await exportCampaign(deps, C, { keepProgress: false }, 'tmp.yner', () => {});
    const r = await importArchive(deps, 'tmp.yner', GM, () => {}, {
      options: { keepProgress: false },
      name: (n) => `${n} (copie)`,
    });
    expect(r.name).toBe('La Crypte (copie)');
    expect(s.imports[0]!.body.tables.campaigns![0]!.name).toBe('La Crypte (copie)');
    expect(s.imports[0]!.body.options).toEqual({ keepProgress: false });
  });
});
