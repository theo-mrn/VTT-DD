/**
 * Références aux fichiers : recherche dans toutes les tables d'un schéma (lecture seule, tables
 * techniques exclues, clés au format de nos envois seulement), route interne protégée par le
 * secret, appels aux autres services, et réglages du balayage.
 */
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler } from './middleware/error-handler.js';
import {
  OrphanSweepSettings,
  referencedKeys,
  referencePlaces,
  registerStorageReferences,
  remotePlaces,
  remoteReferences,
} from './orphans.js';

const U1 = '0199a0c3-0000-7000-8000-000000000001';
const U2 = '0199a0c3-0000-7000-8000-000000000002';
const KEY_A = `avatars/${U1}/${U2}.webp`;
const KEY_B = `campaigns/${U1}/${U1}.png`;

/** Faux pool : les tables du schéma, puis les clés trouvées dans chacune. */
function fakePool(found: Record<string, string[]>, fail?: string) {
  const sql: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => {
      sql.push(text.trim().split(/\s+/).slice(0, 3).join(' '));
      if (fail && text.includes(fail)) throw new Error('panne');
      if (text.includes('information_schema.tables'))
        return { rows: Object.keys(found).map((name) => ({ name })) };
      const table = Object.keys(found).find((t) => text.includes(`"${t}"`));
      return { rows: table ? found[table]!.map((key) => ({ key })) : [] };
    }),
    release: vi.fn(),
  };
  return { pool: { connect: async () => client } as never, client, sql };
}

describe('références dans la base', () => {
  it('tables du schéma lues en lecture seule, clés trouvées par table', async () => {
    const f = fakePool({ users: [KEY_A], maps: [KEY_A, KEY_B] });
    const places = await referencePlaces(f.pool, 'identity', [
      KEY_A.toUpperCase(),
      KEY_B,
      'pas-une-cle',
    ]);
    expect(places).toEqual({ [KEY_A]: ['users', 'maps'], [KEY_B]: ['maps'] });
    expect(f.sql[0]).toBe('BEGIN READ ONLY');
    expect(f.sql.at(-1)).toBe('COMMIT');
    expect(f.client.release).toHaveBeenCalled();
    expect(await referencedKeys(f.pool, 'identity', [KEY_A])).toEqual([KEY_A, KEY_B]);
  });

  it('erreur pendant la lecture : annulée, connexion rendue, erreur remontée', async () => {
    const f = fakePool({ users: [] }, 'information_schema');
    await expect(referencePlaces(f.pool, 'identity', [KEY_A])).rejects.toThrow('panne');
    expect(f.sql).toContain('ROLLBACK');
    expect(f.client.release).toHaveBeenCalled();
  });
});

describe('route interne', () => {
  async function app(secret: string | undefined) {
    const a = Fastify();
    await a.register(errorHandler);
    registerStorageReferences(a, {
      pool: fakePool({ notes: [KEY_A] }).pool,
      schema: 'campaign',
      secret,
    });
    await a.ready();
    return a;
  }

  it('avec le secret : clés citées et leurs tables ; sans : 401 ; non configurée : absente', async () => {
    const a = await app('s'.repeat(32));
    const ok = await a.inject({
      method: 'POST',
      url: '/internal/storage/references',
      headers: { 'x-internal-secret': 's'.repeat(32) },
      payload: { keys: [KEY_A] },
    });
    expect(ok.json()).toEqual({ referenced: [KEY_A], places: { [KEY_A]: ['notes'] } });
    const denied = await a.inject({
      method: 'POST',
      url: '/internal/storage/references',
      headers: { 'x-internal-secret': 'faux' },
      payload: { keys: [KEY_A] },
    });
    expect(denied.statusCode).toBe(401);
    const none = await app(undefined);
    expect(
      (await none.inject({ method: 'POST', url: '/internal/storage/references' })).statusCode,
    ).toBe(404);
  });
});

describe('autres services', () => {
  const reply = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response);

  it('clés citées chez un autre service (secret transmis) ; erreur : la passe échoue', async () => {
    const fetcher = reply({ referenced: [KEY_A] });
    expect(await remoteReferences('http://character:3000/', 'sec', fetcher)([KEY_A])).toEqual([
      KEY_A,
    ]);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('http://character:3000/internal/storage/references');
    expect(init.headers).toMatchObject({ 'x-internal-secret': 'sec' });
    await expect(remoteReferences('http://x', 's', reply({}, false))([KEY_A])).rejects.toThrow(
      '503',
    );
  });

  it('tables qui citent chaque clé ; service plus ancien (sans tables) : listes vides', async () => {
    expect(
      await remotePlaces(
        'http://x',
        's',
        reply({ referenced: [KEY_A], places: { [KEY_A]: ['t'] } }),
      )([KEY_A]),
    ).toEqual({ [KEY_A]: ['t'] });
    expect(await remotePlaces('http://x', 's', reply({ referenced: [KEY_B] }))([KEY_B])).toEqual({
      [KEY_B]: [],
    });
    await expect(remotePlaces('http://x', 's', reply({}, false))([KEY_A])).rejects.toThrow();
  });
});

describe('réglages du balayage', () => {
  it('à blanc par défaut ; adresses des autres services séparées par des virgules', () => {
    const s = z
      .object(OrphanSweepSettings)
      .parse({ STORAGE_REFERENCE_URLS: ' http://a , ,http://b ' });
    expect(s).toMatchObject({
      ORPHAN_SWEEP: 'dry-run',
      ORPHAN_MIN_AGE_HOURS: 24,
      ORPHAN_SWEEP_EVERY_MINUTES: 60,
    });
    expect(s.STORAGE_REFERENCE_URLS).toEqual(['http://a', 'http://b']);
    expect(
      z.object(OrphanSweepSettings).parse({ STORAGE_REFERENCE_URLS: '' }).STORAGE_REFERENCE_URLS,
    ).toBeUndefined();
  });
});
