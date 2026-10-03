/** Chargement de l'ancien Historique sur un vrai PostgreSQL (rôle history_svc). */
import type { EventEnvelope } from '@vtt/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import { inRollback, TEST_DATABASE_URL } from '../test/test-app.js';
import {
  alreadyImported,
  campaignsWithLiveEvents,
  chronological,
  importCampaign,
  prepareEvent,
  type Mappings,
} from './loading.js';
import { transformEvent } from './transform.js';

describe.skipIf(!TEST_DATABASE_URL)('chargement de l’import', () => {
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const db = connection?.db;
  const code = `T${crypto.randomUUID().slice(0, 8)}`;
  const campaignId = crypto.randomUUID();
  // Dates récentes : partitions déjà créées
  const start = Date.now() - 60_000;
  const maps: Mappings = {
    accounts: new Map(),
    campaigns: new Map([[code, campaignId]]),
    characters: new Map(),
    roles: new Map(),
  };

  afterAll(async () => {
    await connection?.pool.end();
  });

  /** Événements dans le désordre du fichier ; renvoyés triés par date comme la CLI. */
  const legacy = (order: number[]) =>
    order
      .map((i) => {
        const e = transformEvent({
          path: `Historique/${code}/events/e${i}`,
          id: `e${i}`,
          data: { type: 'combat', message: `tour ${i}`, timestamp: start + i * 1000 },
        });
        const p = prepareEvent(e, maps);
        if (p.status !== 'ready') throw new Error('campagne attendue');
        return { e: p.envelope, occurredAt: e.occurredAt, legacyId: e.legacyId };
      })
      .sort(chronological)
      .map((x) => x.e as EventEnvelope);

  it('rang dans l’ordre chronologique, chaîne vérifiée, réimport sans doublon', async () => {
    // Transaction annulée : l'import de test ne reste pas dans le journal (ajout seul)
    await inRollback(db!, async (tx) => {
      const events = legacy([3, 1, 2]);
      expect(await importCampaign(tx, events, 2)).toEqual({ imported: 3, duplicates: 0 });
      const rows = await tx.execute<{ seq: string; message: string; type: string }>(sql`
      select seq, payload->>'message' as message, type from history.events
      where campaign_id = ${campaignId} order by seq`);
      expect(rows.rows).toEqual([
        { seq: '1', message: 'tour 1', type: 'legacy.combat' },
        { seq: '2', message: 'tour 2', type: 'legacy.combat' },
        { seq: '3', message: 'tour 3', type: 'legacy.combat' },
      ]);
      const broken = await tx.execute(sql`select * from history.verify_chain(${campaignId}::uuid)`);
      expect(broken.rows).toEqual([]);

      // Second import (avec un nouvel événement) : seuls les nouveaux sont ajoutés
      const again = legacy([1, 2, 3, 4]);
      expect(
        (
          await alreadyImported(
            tx,
            again.map((e) => e.id),
          )
        ).size,
      ).toBe(3);
      expect(await importCampaign(tx, again)).toEqual({ imported: 1, duplicates: 3 });
      // Aucun événement du bus dans cette campagne
      expect((await campaignsWithLiveEvents(tx, [campaignId])).size).toBe(0);
    });
  });
});
