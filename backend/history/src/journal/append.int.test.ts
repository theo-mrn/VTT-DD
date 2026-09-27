/**
 * Journal sur un vrai Postgres (TEST_DATABASE_URL, rôle history_svc) : rangs,
 * chaîne de hash, dédoublonnage, concurrence et détection d'une altération.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { envelope, TEST_DATABASE_URL } from '../test/test-app.js';
import { appendEvents, isPermanentDbError } from './append.js';
import { ensurePartitions } from './partitions.js';

type ChainRow = {
  seq: string | null;
  prev_hash: string | null;
  hash: string;
  canonical: string;
};

describe.skipIf(!TEST_DATABASE_URL)('journal (Postgres réel)', () => {
  let connection: ReturnType<typeof createDb>;
  let db: Db;

  beforeAll(() => {
    connection = createDb(TEST_DATABASE_URL!);
    db = connection.db;
  });
  afterAll(async () => {
    await connection.pool.end();
  });

  /** Événements d'une campagne (ou globaux) avec leur JSON canonique recalculé par Postgres. */
  async function chain(where: ReturnType<typeof sql>): Promise<ChainRow[]> {
    const r = await db.execute<ChainRow>(sql`
      select seq, encode(prev_hash, 'hex') as prev_hash, encode(hash, 'hex') as hash,
        history.event_canonical(id, occurred_at, campaign_id, seq, type, version, actor_id,
          actor_role, actor_character_id, aggregate_type, aggregate_id, visibility, payload,
          correlation_id, causation_id, traceparent) as canonical
      from history.events where ${where} order by seq, occurred_at`);
    return r.rows;
  }

  /** Messages de l'erreur et de ses causes (Drizzle enveloppe l'erreur de pg). */
  const messages = (e: unknown): string => {
    const out: string[] = [];
    for (let x = e, i = 0; x && i < 5; i++, x = (x as { cause?: unknown }).cause)
      out.push(String((x as Error).message ?? x));
    return out.join(' | ');
  };

  const sha256 = (prev: string | null, canonical: string) =>
    createHash('sha256')
      .update(Buffer.concat([Buffer.from(prev ?? '', 'hex'), Buffer.from(canonical, 'utf8')]))
      .digest('hex');

  const verify = async (campaignId: string) =>
    (
      await db.execute<{ seq: string; id: string | null; reason: string }>(
        sql`select seq, id, reason from history.verify_chain(${campaignId}::uuid)`,
      )
    ).rows;

  it('attribue 1, 2, 3… et chaîne chaque événement au précédent', async () => {
    const campaignId = crypto.randomUUID();
    const batch = [1, 2, 3].map((hp) =>
      envelope({ roomId: campaignId, payload: { hp, texte: 'Épée à deux mains' } }),
    );
    const results = [];
    for (const e of batch) results.push(...(await appendEvents(db, [e], 'history')));
    expect(results.map((r) => [r.status, r.seq])).toEqual([
      ['appended', 1],
      ['appended', 2],
      ['appended', 3],
    ]);

    const rows = await chain(sql`campaign_id = ${campaignId}`);
    expect(rows.map((r) => Number(r.seq))).toEqual([1, 2, 3]);
    expect(rows[0]!.prev_hash).toBeNull();
    for (const [i, r] of rows.entries()) {
      if (i > 0) expect(r.prev_hash).toBe(rows[i - 1]!.hash);
      // hash = sha256(prev_hash || JSON canonique), recalculé ici sans Postgres
      expect(r.hash).toBe(sha256(r.prev_hash, r.canonical));
      expect(JSON.parse(r.canonical)).toMatchObject({ roomId: campaignId, seq: i + 1 });
    }
    const head = await db.execute<{ last_seq: string; last_hash: string }>(
      sql`select last_seq, encode(last_hash, 'hex') as last_hash from history.campaign_heads
          where campaign_id = ${campaignId}`,
    );
    expect(head.rows[0]).toEqual({ last_seq: '3', last_hash: rows[2]!.hash });
    expect(await verify(campaignId)).toEqual([]);
  });

  it('écarte un événement déjà reçu, seul ou dans un lot', async () => {
    const campaignId = crypto.randomUUID();
    const a = envelope({ roomId: campaignId });
    const b = envelope({ roomId: campaignId });
    expect(await appendEvents(db, [a], 'history')).toEqual([
      { id: a.id, status: 'appended', seq: 1 },
    ]);
    expect(await appendEvents(db, [a], 'history')).toEqual([
      { id: a.id, status: 'duplicate', seq: null },
    ]);
    expect(await appendEvents(db, [a, b, b], 'import')).toEqual([
      { id: a.id, status: 'duplicate', seq: null },
      { id: b.id, status: 'appended', seq: 2 },
      { id: b.id, status: 'appended', seq: 2 },
    ]);
    const rows = await chain(sql`campaign_id = ${campaignId}`);
    expect(rows).toHaveLength(2);
    expect(await verify(campaignId)).toEqual([]);
  });

  it('refuse un lot qui mélange plusieurs campagnes', async () => {
    await expect(
      appendEvents(
        db,
        [envelope({ roomId: crypto.randomUUID() }), envelope({ roomId: crypto.randomUUID() })],
        'history',
      ),
    ).rejects.toThrow(/une campagne/);
  });

  it('ajouts simultanés dans une campagne : rangs uniques et chaîne intacte', async () => {
    const campaignId = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        appendEvents(db, [envelope({ roomId: campaignId, payload: { i } })], 'history'),
      ),
    );
    expect(
      results
        .flat()
        .map((r) => r.seq)
        .sort((x, y) => x! - y!),
    ).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await verify(campaignId)).toEqual([]);
  });

  it('événement sans campagne : ni rang ni chaîne, hash de lui seul', async () => {
    const e = envelope({ type: 'user.profile_updated', aggregate: { type: 'user', id: 'u1' } });
    expect(await appendEvents(db, [e], 'history')).toEqual([
      { id: e.id, status: 'appended', seq: null },
    ]);
    const [row] = await chain(sql`id = ${e.id}`);
    expect(row).toMatchObject({ seq: null, prev_hash: null });
    expect(row!.hash).toBe(sha256(null, row!.canonical));
  });

  it('détecte un maillon forgé, un trou et une tête qui ne suit plus', async () => {
    const campaignId = crypto.randomUUID();
    for (let i = 0; i < 3; i++)
      await appendEvents(db, [envelope({ roomId: campaignId })], 'history');
    // Le rôle du service peut ajouter (jamais modifier) : un ajout hors chaîne se voit
    const forged = envelope({ roomId: campaignId });
    await db.execute(sql`
      insert into history.events (id, occurred_at, campaign_id, seq, type, version, actor_role,
        aggregate_type, aggregate_id, payload, correlation_id, prev_hash, hash)
      values (${forged.id}, now(), ${campaignId}, 5, 'character.hp_changed', 1, 'gm',
        'character', 'x', '{}', 'c', sha256('faux'::bytea), sha256('faux'::bytea))`);
    const broken = await verify(campaignId);
    expect(broken.map((b) => [Number(b.seq), b.reason])).toEqual([
      [3, 'head'],
      [5, 'seq'],
    ]);
  });

  it('le journal ne se modifie ni ne se vide avec le rôle du service', async () => {
    const e = envelope({ roomId: crypto.randomUUID() });
    await appendEvents(db, [e], 'history');
    for (const q of [
      sql`update history.events set payload = '{}' where id = ${e.id}`,
      sql`delete from history.events where id = ${e.id}`,
      sql`truncate history.events`,
      sql`delete from history.inbox where event_id = ${e.id}`,
      sql`select count(*) from history.events_default`,
    ]) {
      const err = await db.execute(q).then(
        () => null,
        (x: unknown) => x,
      );
      expect(messages(err)).toMatch(/permission denied/);
    }
  });

  it('refus définitif de Postgres (caractère nul dans la charge utile)', async () => {
    const e = envelope({ roomId: crypto.randomUUID(), payload: { texte: 'a\u0000b' } });
    const err = await appendEvents(db, [e], 'history').catch((x: unknown) => x);
    expect(isPermanentDbError(err)).toBe(true);
    // Transaction annulée : l'événement n'est pas marqué comme reçu
    const seen = await db.execute(sql`select 1 from history.inbox where event_id = ${e.id}`);
    expect(seen.rows).toHaveLength(0);
  });

  it('partitions : déjà créées pour le mois courant, rien à refaire', async () => {
    expect(await ensurePartitions(db, new Date(), 1)).toBe(0);
  });
});
