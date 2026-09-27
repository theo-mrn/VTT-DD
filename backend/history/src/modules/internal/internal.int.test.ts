/** Route interne de rattrapage (realtime), sur un vrai Postgres. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendEvents } from '../../journal/append.js';
import {
  envelope,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type EventBody,
  type TestContext,
} from '../../test/test-app.js';

const internal = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('GET /internal/campaigns/:id/events', () => {
  let t: TestContext;
  let campaignId: string;
  const alice = crypto.randomUUID();

  beforeEach(async () => {
    t = await testApp();
    campaignId = crypto.randomUUID();
    for (const visibility of ['public', 'gm_only', 'owner', 'public'] as const)
      await appendEvents(
        t.db!,
        [envelope({ roomId: campaignId, visibility, actor: { userId: alice, role: 'player' } })],
        'history',
      );
  });

  afterEach(async () => {
    await t.close();
  });

  const delta = (query: string, headers: Record<string, string> = internal) =>
    t.app.inject({
      method: 'GET',
      url: `/internal/campaigns/${campaignId}/events?${query}`,
      headers,
    });

  it('exige le secret interne', async () => {
    expect((await delta('afterSeq=0', {})).statusCode).toBe(401);
    expect((await delta('afterSeq=0', { 'x-internal-secret': 'x'.repeat(40) })).statusCode).toBe(
      401,
    );
  });

  it('tout ce qui suit un rang, du plus ancien au plus récent, et le dernier rang', async () => {
    const res = await delta('afterSeq=1');
    expect(res.statusCode).toBe(200);
    const body = res.json() as { lastSeq: number; events: EventBody[]; hasMore: boolean };
    expect(body.lastSeq).toBe(4);
    expect(body.events.map((e) => e.seq)).toEqual([2, 3, 4]);
    expect(body.hasMore).toBe(false);
    expect((await delta('afterSeq=0&limit=2')).json()).toMatchObject({ hasMore: true });
    expect((await delta('afterSeq=2&limit=0')).json()).toEqual({
      campaignId,
      lastSeq: 4,
      events: [],
      hasMore: true,
    });
  });

  it('avec un lecteur : même visibilité que l’API publique', async () => {
    const seqs = async (query: string) =>
      ((await delta(query)).json() as { events: EventBody[] }).events.map((e) => e.seq);
    expect(await seqs(`userId=${alice}&role=player`)).toEqual([1, 3, 4]);
    expect(await seqs(`userId=${crypto.randomUUID()}&role=player`)).toEqual([1, 4]);
    expect(await seqs(`userId=${alice}&role=gm`)).toEqual([1, 2, 3, 4]);
    expect((await delta('role=player')).statusCode).toBe(400);
  });
});
