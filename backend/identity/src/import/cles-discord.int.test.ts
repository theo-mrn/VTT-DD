/**
 * Chargement des clés d'API et des liens Discord importés, sur un vrai
 * PostgreSQL. Ignoré sans TEST_DATABASE_URL.
 */
import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiKeys, legacyIds, oauthAccounts } from '../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../test/app-de-test.js';
import { chargerClesApi, transformerClesApi } from './cles-api.js';
import { chargerLiensDiscord, transformerLiensDiscord } from './discord.js';
import { LEGACY_KIND, lireUuidParUid } from './load.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const ctx = { correlationId: 'test-import-cles-discord' };

describe.skipIf(!TEST_DATABASE_URL)('import des clés d’API et des liens Discord', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  const suffixe = crypto.randomUUID().slice(0, 8);
  const uids: string[] = [];
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET });
    alice = await t.inscrire('Alice');
    bob = await t.inscrire('Bob');
    for (const [uid, id] of [
      [`fb-${suffixe}-alice`, alice.id],
      [`fb-${suffixe}-bob`, bob.id],
    ] as const) {
      uids.push(uid);
      await t.db.insert(legacyIds).values({ kind: LEGACY_KIND, legacyId: uid, id });
    }
  });

  afterAll(async () => {
    if (uids.length) {
      await t.db
        .delete(legacyIds)
        .where(and(eq(legacyIds.kind, LEGACY_KIND), inArray(legacyIds.legacyId, uids)));
    }
    await t?.fermer();
  });

  it('importe une clé de l’ancienne app, qui reste utilisable, une seule fois', async () => {
    const uuidParUid = await lireUuidParUid(t.db);
    expect(uuidParUid.get(`fb-${suffixe}-alice`)).toBe(alice.id);

    // Format de l'ancienne app : « vtt_ » + 64 caractères hexadécimaux
    const cle = 'vtt_' + createHash('sha256').update(suffixe).digest('hex');
    const docs = [
      {
        path: `apiKeys/k-${suffixe}`,
        id: `k-${suffixe}`,
        data: {
          uid: `fb-${suffixe}-alice`,
          keyHash: createHash('sha256').update(cle).digest('hex'),
          label: 'ancien bot',
          createdAt: { $timestamp: '2025-03-01T12:00:00.000000000Z' },
          lastUsed: null,
        },
      },
    ];
    const { cles } = transformerClesApi(docs, uuidParUid);
    expect(await chargerClesApi(t.db, ctx, cles)).toEqual({ importees: 1, dejaImportees: 0 });
    // Rejouable : un nouvel UUID est tiré, mais l'empreinte existe déjà
    const encore = transformerClesApi(docs, uuidParUid).cles;
    expect(await chargerClesApi(t.db, ctx, encore)).toEqual({ importees: 0, dejaImportees: 1 });
    expect(await t.db.select().from(apiKeys).where(eq(apiKeys.userId, alice.id))).toHaveLength(1);

    const res = await t.app.inject({
      method: 'POST',
      url: '/internal/api-keys/exchange',
      headers: { 'x-internal-secret': SECRET },
      payload: { key: cle },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: alice.id });
  });

  it('rattache les identifiants Discord, sans écraser un lien existant', async () => {
    const uuidParUid = await lireUuidParUid(t.db);
    const base = BigInt('100000000000000000') + BigInt(parseInt(suffixe, 16));
    const discordAlice = base.toString();
    const discordBob = (base + 1n).toString();

    const docs = [
      {
        path: `discordLinks/${discordAlice}`,
        id: discordAlice,
        data: { uid: `fb-${suffixe}-alice` },
      },
      { path: `discordLinks/${discordBob}`, id: discordBob, data: { uid: `fb-${suffixe}-bob` } },
    ];
    const { liens } = transformerLiensDiscord(docs, new Map(), uuidParUid);
    expect(await chargerLiensDiscord(t.db, ctx, liens)).toEqual({
      importes: 2,
      dejaImportes: 0,
      conflits: 0,
    });
    expect(await chargerLiensDiscord(t.db, ctx, liens)).toEqual({
      importes: 0,
      dejaImportes: 2,
      conflits: 0,
    });

    // Le Discord de Bob annoncé pour Alice : conflit signalé, rien n'est écrasé
    const detourne = transformerLiensDiscord(
      [
        {
          path: `discordLinks/${discordBob}`,
          id: discordBob,
          data: { uid: `fb-${suffixe}-alice` },
        },
      ],
      new Map(),
      uuidParUid,
    );
    expect(await chargerLiensDiscord(t.db, ctx, detourne.liens)).toEqual({
      importes: 0,
      dejaImportes: 0,
      conflits: 1,
    });
    const [ligne] = await t.db
      .select({ userId: oauthAccounts.userId, email: oauthAccounts.email })
      .from(oauthAccounts)
      .where(
        and(eq(oauthAccounts.provider, 'discord'), eq(oauthAccounts.providerAccountId, discordBob)),
      );
    expect(ligne).toEqual({ userId: bob.id, email: null });
  });
});
