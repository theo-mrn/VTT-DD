/**
 * Effacement sur un vrai Postgres (rôle history_svc) : un compte supprimé perd ses événements
 * sans campagne et son pseudo dans les campagnes, chaînes recalculées et toujours valides ; une
 * campagne supprimée perd sa chaîne. Le rôle du service ne peut toujours rien modifier lui-même.
 */
import { CAMPAIGN_DELETED, USER_DELETED } from '@vtt/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { envelope, TEST_DATABASE_URL } from '../test/test-app.js';
import { appendEvents } from './append.js';
import { eraseFor } from './erase.js';
import { ensurePartitions } from './partitions.js';

describe.skipIf(!TEST_DATABASE_URL)('effacement du journal', () => {
  let connection: ReturnType<typeof createDb>;
  let db: Db;

  beforeAll(async () => {
    connection = createDb(TEST_DATABASE_URL!);
    db = connection.db;
    await ensurePartitions(db, new Date(), 2);
  });
  afterAll(async () => {
    await connection.pool.end();
  });

  const rows = async (where: ReturnType<typeof sql>) =>
    (
      await db.execute<{ id: string; seq: string | null; payload: Record<string, unknown> }>(
        sql`select id, seq, payload from history.events where ${where} order by seq, occurred_at`,
      )
    ).rows;
  const broken = async (campaignId: string) =>
    (await db.execute(sql`select * from history.verify_chain(${campaignId}::uuid)`)).rows;

  const roll = (campaignId: string, userId: string, userName: string) =>
    envelope({
      type: 'dice.rolled',
      roomId: campaignId,
      actor: { userId, role: 'player' },
      aggregate: { type: 'roll', id: crypto.randomUUID() },
      payload: { authorId: userId, userName, total: 17 },
    });

  it('compte supprimé : événements de compte effacés, pseudo remplacé, chaîne valide', async () => {
    const leaving = crypto.randomUUID();
    const other = crypto.randomUUID();
    const campaignId = crypto.randomUUID();
    await appendEvents(
      db,
      [
        roll(campaignId, other, 'Brom'),
        roll(campaignId, leaving, 'Aelwen'),
        roll(campaignId, other, 'Brom'),
        roll(campaignId, leaving, 'Aelwen'),
      ],
      'history',
    );
    await appendEvents(
      db,
      [
        envelope({
          type: 'identity.profile_updated',
          actor: { userId: leaving, role: 'user' },
          aggregate: { type: 'user', id: leaving },
          payload: { name: 'Aelwen' },
        }),
      ],
      'history',
    );

    const deletion = envelope({
      type: USER_DELETED,
      actor: { userId: leaving, role: 'user' },
      aggregate: { type: 'user', id: leaving },
      payload: {},
    });
    await appendEvents(db, [deletion], 'history');
    expect(await eraseFor(db, deletion)).toBeGreaterThan(0);

    expect(await rows(sql`campaign_id is null and actor_id = ${leaving}::uuid`)).toHaveLength(0);
    const chain = await rows(sql`campaign_id = ${campaignId}::uuid`);
    expect(chain.map((r) => r.payload.userName)).toEqual([
      'Brom',
      'Joueur supprimé',
      'Brom',
      'Joueur supprimé',
    ]);
    expect(JSON.stringify(chain)).not.toContain('Aelwen');
    expect(await broken(campaignId)).toEqual([]);

    // Un ajout après l'effacement prolonge la chaîne recalculée
    await appendEvents(db, [roll(campaignId, other, 'Brom')], 'history');
    expect(await broken(campaignId)).toEqual([]);

    // Rejoué : rien de plus
    expect(await eraseFor(db, deletion)).toBe(0);
  });

  it('campagne supprimée : toute sa chaîne', async () => {
    const campaignId = crypto.randomUUID();
    const user = crypto.randomUUID();
    await appendEvents(
      db,
      [roll(campaignId, user, 'Cassia'), roll(campaignId, user, 'Cassia')],
      'history',
    );
    const deleted = envelope({
      type: CAMPAIGN_DELETED,
      roomId: campaignId,
      aggregate: { type: 'campaign', id: campaignId },
      payload: { name: 'La Table' },
    });
    await appendEvents(db, [deleted], 'history');
    expect(await eraseFor(db, deleted)).toBe(3);
    expect(await rows(sql`campaign_id = ${campaignId}::uuid`)).toHaveLength(0);
    expect(
      (
        await db.execute(
          sql`select 1 from history.campaign_heads where campaign_id = ${campaignId}::uuid`,
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('le rôle du service ne peut toujours ni modifier ni supprimer, même en levant le réglage', async () => {
    const campaignId = crypto.randomUUID();
    await appendEvents(db, [roll(campaignId, crypto.randomUUID(), 'Dorn')], 'history');
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('history.erasure', 'on', true)`);
        await tx.execute(sql`delete from history.events where campaign_id = ${campaignId}::uuid`);
      }),
    ).rejects.toThrow();
    expect(await rows(sql`campaign_id = ${campaignId}::uuid`)).toHaveLength(1);
    await eraseFor(db, {
      type: CAMPAIGN_DELETED,
      roomId: campaignId,
      aggregate: { type: 'campaign', id: campaignId },
    });
  });
});
