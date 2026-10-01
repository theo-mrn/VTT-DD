/**
 * Route /internal/storage/references sur la vraie base : une clé est référencée où qu'elle soit
 * (colonne d'adresse, vignette du CDN, JSON), jamais par le seul journal des événements.
 */
import { inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters, outbox } from '../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../test/app-de-test.js';
import { outils, type Utilisateur } from '../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const SECRET = 'secret-interne-de-test-0123456789abcdef';

describe.skipIf(!TEST_DATABASE_URL)('références des fichiers', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let alice: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET });
    o = outils(t);
    alice = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const references = (keys: string[], secret = SECRET) =>
    t.app.inject({
      method: 'POST',
      url: '/internal/storage/references',
      headers: { 'x-internal-secret': secret },
      payload: { keys },
    });

  it('trouve une clé dans une adresse, une vignette ou du JSON ; pas dans l’outbox', async () => {
    const p = await o.ok(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: 'Thorin',
    });
    const key = () => `characters/${p.id}/${crypto.randomUUID()}.webp`;
    const [avatar, token, json, outboxOnly, nowhere] = [key(), key(), key(), key(), key()];
    await t
      .db!.update(characters)
      .set({
        avatarUrl: `https://files.test/${avatar}`,
        tokenUrl: `https://files.test/cdn-cgi/image/width=96,format=auto/${token}`,
        details: sql`jsonb_build_object('note', ${`voir https://files.test/${json}.`}::text)`,
      })
      .where(inArray(characters.id, [p.id]));
    await t.db!.insert(outbox).values({
      id: crypto.randomUUID(),
      subject: 'vtt.global.character.updated',
      envelope: { avatarUrl: `https://files.test/${outboxOnly}`, aggregate: { id: p.id } },
    } as never);

    const res = await references([avatar, token, json, outboxOnly, nowhere, 'pas/une/cle.webp']);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { referenced: string[] }).referenced.sort()).toEqual(
      [avatar, token, json].sort(),
    );
    expect((await references([avatar], 'mauvais-secret-0123456789abcdef-0000')).statusCode).toBe(
      401,
    );
    await t.db!.delete(outbox).where(sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id}`);
  });
});
