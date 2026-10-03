/**
 * Routes des systèmes (publiques) et protection des routes des personnages,
 * sans base de données.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDeTest } from '../../test/app-de-test.js';

describe('systèmes par HTTP', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t.fermer();
  });

  it('liste les systèmes de référence sans jeton', async () => {
    const res = await t.app.inject({ url: '/v1/systems' });
    expect(res.statusCode).toBe(200);
    const liste = res.json() as { id: string; version: string; nom: string }[];
    expect(liste.map((s) => s.id)).toEqual(['dnd-classic', 'nooblies', 'star-wars-eote']);
    expect(liste[2]).toMatchObject({ version: '1.0.0', nom: expect.stringContaining('Star Wars') });
  });

  it('renvoie les documents bruts d’un système', async () => {
    const res = await t.app.inject({ url: '/v1/systems/star-wars-eote' });
    expect(res.statusCode).toBe(200);
    const corps = res.json() as {
      systeme: { id: string; entites: unknown[] };
      presentation: unknown;
    };
    expect(corps.systeme.id).toBe('star-wars-eote');
    expect(corps.systeme.entites.length).toBeGreaterThan(0);
    expect(corps.presentation).not.toBeNull();
  });

  it('404 pour un système inconnu, 400 pour un identifiant invalide', async () => {
    expect((await t.app.inject({ url: '/v1/systems/inconnu' })).statusCode).toBe(404);
    const res = await t.app.inject({ url: '/v1/systems/..%2F..%2Fpackage' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('les personnages exigent un jeton', async () => {
    for (const [method, url] of [
      ['GET', '/v1/characters'],
      ['POST', '/v1/characters'],
      ['GET', '/v1/characters/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'],
      ['POST', '/v1/characters/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/actions/attaque'],
    ] as const) {
      const res = await t.app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

describe('limite des actions', () => {
  it('429 au-delà de RATE_LIMIT_ACTIONS_MAX actions par minute', async () => {
    const t = await appDeTest({ RATE_LIMIT_ACTIONS_MAX: '2' });
    try {
      const url = '/v1/characters/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/actions/attaque';
      const codes: number[] = [];
      for (let i = 0; i < 3; i++)
        codes.push((await t.app.inject({ method: 'POST', url, payload: {} })).statusCode);
      expect(codes).toEqual([401, 401, 429]);
      // Les autres routes gardent la limite globale
      expect((await t.app.inject({ url: '/v1/systems' })).statusCode).toBe(200);
    } finally {
      await t.fermer();
    }
  });
});
