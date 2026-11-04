/**
 * Recherche des fonds sur un vrai PostgreSQL (rôle library_svc) : lieux écrits comme par
 * l'import (titre provisoire, puis description), recherche par contexte, filtres, facettes,
 * fiche. Les termes portent un marqueur propre au test : les vrais fonds de la base n'y
 * répondent pas.
 */
import type { Background, BackgroundFacets, BackgroundPage } from '@vtt/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Description } from '../../import/describe.js';
import { saveDescription, upsertEntry, upsertVariant } from '../../import/store.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('fonds de la bibliothèque', () => {
  let t: TestContext;
  let marker: string;
  const ids: Record<string, string> = {};

  async function place(key: string, d: Description) {
    const entry = { sourceKey: key, collection: 'Dark Mountains', hint: key, images: [] };
    const { id } = await upsertEntry(t.db!, t.source as never, entry, {
      animated: false,
      kind: key === 'cave' ? 'illustration' : 'map',
    });
    await upsertVariant(t.db!, id, {
      position: 0,
      url: `https://assets.test/${t.source}/${key}-0.webp`,
      thumbUrl: `https://assets.test/${t.source}/thumbs/${key}-0.webp`,
      originalKey: `library/originals/${t.source}/${key}-0.png`,
      width: 1456,
      height: 832,
      bytes: 200_000,
    });
    await saveDescription(t.db!, id, entry.collection, d, 'claude-test#1');
    ids[key] = id;
  }

  const get = async <T>(url: string) => {
    const r = await t.app.inject({ method: 'GET', url, headers: t.auth });
    expect(r.statusCode, r.body).toBe(200);
    return r.json<T>();
  };

  beforeEach(async () => {
    t = await testApp();
    marker = `mq${crypto.randomUUID().slice(0, 6)}`;
    await place('cave', {
      titleFr: 'Grotte aux cristaux',
      titleEn: 'Crystal cave',
      descriptionFr: 'Une grotte souterraine illuminée par des cristaux bleus.',
      descriptionEn: 'An underground cave lit by blue crystals.',
      keywordsFr: ['grotte', 'caverne', 'cristaux', 'lumineux', marker],
      keywordsEn: ['cave', 'cavern', 'crystals', 'glowing', marker],
      place: 'cave',
      setting: 'underground',
      timeOfDay: 'unknown',
      moods: ['magical', 'mysterious'],
    });
    await place('hall', {
      titleFr: 'Grande salle du château',
      titleEn: 'Castle great hall',
      descriptionFr: 'L’intérieur d’un château, une salle aux bannières éclairée par des torches.',
      descriptionEn: 'Inside a castle, a hall with banners lit by torches.',
      keywordsFr: ['château', 'salle', 'intérieur', 'torches', marker],
      keywordsEn: ['castle', 'hall', 'interior', 'torches', marker],
      place: 'castle',
      setting: 'indoor',
      timeOfDay: 'night',
      moods: ['epic'],
    });
  });

  afterEach(async () => {
    await t.close();
  });

  it('trouve un lieu par ce qu’il montre, sans accents ni mot exact', async () => {
    const page = await get<BackgroundPage>(
      `/v1/library/backgrounds?q=${encodeURIComponent(`grottes illuminees ${marker}`)}`,
    );
    expect(page.items.map((b) => b.id)).toEqual([ids.cave]);
    expect(page.items[0]).toMatchObject({
      title: 'Grotte aux cristaux',
      place: 'cave',
      variants: [{ position: 0, width: 1456, kind: 'image', grid: false }],
    });
  });

  it('cherche aussi en anglais, et sert les textes de la langue demandée', async () => {
    const page = await get<BackgroundPage>(
      `/v1/library/backgrounds?lang=en&q=${encodeURIComponent(`inside castle ${marker}`)}`,
    );
    expect(page.items.map((b) => b.title)).toEqual(['Castle great hall']);
  });

  it('se rabat sur n’importe quel terme si aucun lieu ne les a tous', async () => {
    const page = await get<BackgroundPage>(
      `/v1/library/backgrounds?q=${encodeURIComponent(`${marker} introuvablezz`)}`,
    );
    expect(page.items.map((b) => b.id).sort()).toEqual([ids.cave, ids.hall].sort());
  });

  it('sépare les plans de carte des illustrations', async () => {
    const maps = await get<BackgroundPage>(`/v1/library/backgrounds?kind=map&q=${marker}`);
    expect(maps.items.map((b) => b.id)).toEqual([ids.hall]);
    expect(maps.items[0]!.kind).toBe('map');
    const art = await get<BackgroundPage>(`/v1/library/backgrounds?kind=illustration&q=${marker}`);
    expect(art.items.map((b) => b.id)).toEqual([ids.cave]);
    const f = await get<BackgroundFacets>('/v1/library/backgrounds/facets?kind=illustration');
    expect(f.kinds.map).toBeGreaterThanOrEqual(1);
    expect(f.kinds.illustration).toBeGreaterThanOrEqual(1);
  });

  it('filtre par facette', async () => {
    const page = await get<BackgroundPage>(
      `/v1/library/backgrounds?setting=indoor&mood=epic&q=${marker}`,
    );
    expect(page.items.map((b) => b.id)).toEqual([ids.hall]);
  });

  it('compte les entrées par facette et sert une fiche', async () => {
    const f = await get<BackgroundFacets>('/v1/library/backgrounds/facets');
    expect(f.places.cave).toBeGreaterThanOrEqual(1);
    expect(f.moods.epic).toBeGreaterThanOrEqual(1);
    expect(f.collections['Dark Mountains']).toBeGreaterThanOrEqual(2);
    expect(f.covers['Dark Mountains']).toMatch(/^https:\/\//);
    const one = await get<Background>(`/v1/library/backgrounds/${ids.cave}?lang=en`);
    expect(one.title).toBe('Crystal cave');
  });

  it('retrouve un fond par l’adresse d’une variante, et filtre par collection', async () => {
    const url = `https://assets.test/${t.source}/hall-0.webp`;
    const found = await get<Background>(
      `/v1/library/backgrounds/lookup?url=${encodeURIComponent(url)}`,
    );
    expect(found.id).toBe(ids.hall);
    const page = await get<BackgroundPage>(
      `/v1/library/backgrounds?collection=${encodeURIComponent('Dark Mountains')}&q=${marker}`,
    );
    expect(page.items).toHaveLength(2);
  });

  it('demande un jeton, et répond 404 pour un fond inconnu', async () => {
    const anonymous = await t.app.inject({ method: 'GET', url: '/v1/library/backgrounds' });
    expect(anonymous.statusCode).toBe(401);
    const missing = await t.app.inject({
      method: 'GET',
      url: `/v1/library/backgrounds/${crypto.randomUUID()}`,
      headers: t.auth,
    });
    expect(missing.statusCode).toBe(404);
  });
});
