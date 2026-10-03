/**
 * Tests d'intégration sur un vrai PostgreSQL migré par Liquibase, connecté avec
 * le rôle du service (identity_svc). Ignorés si TEST_DATABASE_URL est absent.
 *   TEST_DATABASE_URL=postgres://identity_svc:identity-dev@localhost:5432/vtt pnpm test
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../passwords/passwords.js';
import { rotateSession, startSession } from '../tokens/refresh.js';
import {
  createPasswordAccount,
  EmailAlreadyUsed,
  findLoginByEmail,
  getProfile,
  replacePassword,
} from './accounts.js';
import { createDb, type Db } from './client.js';
import { outbox, users } from './schema.js';
import { pgSessionStore } from './session-store.js';

const URL = process.env.TEST_DATABASE_URL;
const ctx = { correlationId: 'test-integration' };

describe.skipIf(!URL)('identity sur Postgres', () => {
  let db: Db;
  let fermer: () => Promise<void>;
  const crees: string[] = [];
  const email = () => `test-${crypto.randomUUID()}@exemple.fr`;

  beforeAll(() => {
    const c = createDb(URL!);
    db = c.db;
    fermer = () => c.pool.end();
  });

  afterAll(async () => {
    if (crees.length) {
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, crees));
      await db.delete(users).where(inArray(users.id, crees));
    }
    await fermer();
  });

  it('crée un compte, le retrouve par e-mail sans tenir compte de la casse, avec son événement', async () => {
    const adresse = email();
    const userId = await createPasswordAccount(db, ctx, {
      email: adresse,
      name: 'Théo',
      password: await hashPassword('secret'),
    });
    crees.push(userId);

    const login = await findLoginByEmail(db, adresse.toUpperCase());
    expect(login).toMatchObject({ userId, disabled: false, password: { algorithm: 'argon2id' } });
    expect(await getProfile(db, userId)).toMatchObject({ name: 'Théo', showPremiumBadge: true });

    const evts = await db
      .select()
      .from(outbox)
      .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`);
    expect(evts).toHaveLength(1);
    expect(evts[0]!.subject).toBe('vtt.global.identity.user_registered');
    // Jamais de donnée personnelle dans le journal
    expect(JSON.stringify(evts[0]!.envelope)).not.toContain(adresse);
  });

  it('refuse un e-mail déjà utilisé, même avec une autre casse, sans rien écrire', async () => {
    const adresse = email();
    crees.push(
      await createPasswordAccount(db, ctx, {
        email: adresse,
        name: 'A',
        password: await hashPassword('x'),
      }),
    );
    const avant = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'correlationId' = ${ctx.correlationId}`);
    await expect(
      createPasswordAccount(db, ctx, {
        email: adresse.toUpperCase(),
        name: 'B',
        password: await hashPassword('y'),
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyUsed);
    const apres = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'correlationId' = ${ctx.correlationId}`);
    expect(apres[0]!.n).toBe(avant[0]!.n);
  });

  it('remplace un hash Firebase par argon2id', async () => {
    const userId = await createPasswordAccount(db, ctx, {
      email: email(),
      name: 'Importé',
      password: { algorithm: 'firebase-scrypt', hash: 'aGFzaA==', salt: 'c2Vs' },
    });
    crees.push(userId);
    const argon = await hashPassword('secret');
    if (argon.algorithm !== 'argon2id') throw new Error('attendu argon2id');
    await replacePassword(db, ctx, userId, argon, 'rehash');

    const [c] = await db
      .execute<{ algorithm: string; salt: string | null }>(
        sql`SELECT algorithm, salt FROM identity.credentials WHERE user_id = ${userId}`,
      )
      .then((r) => r.rows);
    expect(c).toEqual({ algorithm: 'argon2id', salt: null });
  });

  it('sérialise deux renouvellements simultanés du même jeton : un seul réussit', async () => {
    const userId = await createPasswordAccount(db, ctx, {
      email: email(),
      name: 'Course',
      password: await hashPassword('x'),
    });
    crees.push(userId);
    const store = pgSessionStore(db);
    const { token } = await startSession(store, userId, { userAgent: 'vitest', ip: '127.0.0.1' });

    const [a, b] = await Promise.all([rotateSession(store, token), rotateSession(store, token)]);
    const reussis = [a, b].filter((r) => r.ok);
    expect(reussis).toHaveLength(1);
    // Le second voit un jeton déjà consommé : la famille est révoquée
    expect([a, b].find((r) => !r.ok)).toEqual({ ok: false, reason: 'reused' });
    const [survivant] = reussis;
    if (survivant?.ok)
      expect(await rotateSession(store, survivant.token)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('ne connaît pas un e-mail absent', async () => {
    expect(await findLoginByEmail(db, email())).toBeNull();
    expect(await db.select().from(users).where(eq(users.email, 'absent@exemple.fr'))).toHaveLength(
      0,
    );
  });
});
