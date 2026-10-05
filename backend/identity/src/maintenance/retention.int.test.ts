/**
 * Purge des sessions et des jetons d'e-mail sur un vrai PostgreSQL (rôle identity_svc).
 * Ignoré si TEST_DATABASE_URL est absent.
 */
import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { uuidv7 } from '@vtt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { emailTokens, sessions, users } from '../db/schema.js';
import { purgeExpired } from './retention.js';

const URL = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

describe.skipIf(!URL)('durées de conservation', () => {
  let db: Db;
  let close: () => Promise<void>;
  const userId = uuidv7();
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  beforeAll(async () => {
    const c = createDb(URL!);
    db = c.db;
    close = () => c.pool.end();
    await db.insert(users).values({ id: userId });
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [userId]));
    await close();
  });

  it('garde 30 jours après rotation, révocation ou expiration ; jamais une session ouverte', async () => {
    const family = uuidv7();
    const row = (o: Partial<typeof sessions.$inferInsert>) => ({
      id: uuidv7(),
      userId,
      familyId: family,
      tokenHash: randomBytes(32),
      expiresAt: new Date(now.getTime() + 10 * DAY),
      ip: '203.0.113.7',
      ...o,
    });
    const open = row({});
    const rotatedOld = row({ rotatedAt: ago(31) });
    const rotatedRecent = row({ rotatedAt: ago(5) });
    const revokedOld = row({ revokedAt: ago(40) });
    const expiredOld = row({ expiresAt: ago(31) });
    const expiredRecent = row({ expiresAt: ago(2) });
    await db
      .insert(sessions)
      .values([open, rotatedOld, rotatedRecent, revokedOld, expiredOld, expiredRecent]);

    await purgeExpired(db, now);

    const left = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.userId, [userId]));
    expect(left.map((r) => r.id).sort()).toEqual(
      [open.id, rotatedRecent.id, expiredRecent.id].sort(),
    );
  });

  it('supprime un jeton d’e-mail un jour après son utilisation ou son expiration', async () => {
    const token = (o: Partial<typeof emailTokens.$inferInsert>) => ({
      tokenHash: randomBytes(32),
      userId,
      purpose: 'password_reset' as const,
      email: 'test@exemple.fr',
      expiresAt: new Date(now.getTime() + DAY),
      ...o,
    });
    const pending = token({});
    const usedOld = token({ usedAt: ago(2) });
    const usedNow = token({ usedAt: ago(0.1) });
    const expiredOld = token({ expiresAt: ago(3) });
    await db.insert(emailTokens).values([pending, usedOld, usedNow, expiredOld]);

    await purgeExpired(db, now);

    const left = await db
      .select({ hash: emailTokens.tokenHash })
      .from(emailTokens)
      .where(inArray(emailTokens.userId, [userId]));
    expect(left.map((r) => Buffer.from(r.hash).toString('hex')).sort()).toEqual(
      [pending.tokenHash, usedNow.tokenHash].map((h) => h.toString('hex')).sort(),
    );
  });
});
