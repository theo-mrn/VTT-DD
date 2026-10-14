/**
 * Exécuteur des automatismes sur un vrai PostgreSQL : un événement déclenche une règle, ses
 * conditions sont jugées, ses actions changent l'état de la table, les différées passent par la
 * file, le journal garde trace ; un événement déjà traité est écarté.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { handleAutomationEvent, runDueJobs } from './executor.js';

interface Rule {
  id: string;
}
interface State {
  mood: string | null;
  paused: boolean;
  fate: { count: number } | null;
}

describe.skipIf(!TEST_DATABASE_URL)('exécuteur des automatismes', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    campaignId = await h.campaign(gm, 'dnd-classic', []);
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (rest: string) => `/v1/campaigns/${campaignId}${rest}`;
  const event = (type: string, payload: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    type,
    roomId: campaignId,
    payload,
    correlationId: 'test',
  });

  it('fin de combat → ambiance danger tout de suite, pause 2 s plus tard ; journal', async () => {
    await h.ok<Rule>(gm, 'POST', url('/automation-rules'), {
      name: 'Après la bataille',
      trigger: { type: 'combat.end' },
      actions: [
        { type: 'screen.mood', mood: 'danger' },
        { type: 'table.pause', paused: true, delayMs: 2000 },
      ],
    });
    const e = event('combat.ended');
    expect(await handleAutomationEvent(t.db!, e)).toBe(true);
    // Déjà traité : écarté
    expect(await handleAutomationEvent(t.db!, e)).toBe(false);

    let s = await h.ok<State>(gm, 'GET', url('/table-state'));
    expect(s).toMatchObject({ mood: 'danger', paused: false });

    expect(await runDueJobs(t.db!, Date.now() + 5000)).toBeGreaterThanOrEqual(1);
    s = await h.ok<State>(gm, 'GET', url('/table-state'));
    expect(s.paused).toBe(true);

    const runs = await h.ok<{ items: { ruleName: string; ok: boolean }[] }>(
      gm,
      'GET',
      url('/automation-runs'),
    );
    expect(runs.items[0]).toMatchObject({ ruleName: 'Après la bataille', ok: true });
  });

  it('arrivée sur une scène, avec condition et « une seule fois »', async () => {
    const map = await h.ok<{ id: string }>(gm, 'POST', url('/maps'), { name: 'Crypte' });
    await h.ok(gm, 'PATCH', url('/table-state'), { fate: { count: 0, max: 5 } });
    await h.ok(gm, 'POST', url('/automation-rules'), {
      name: 'Bienvenue',
      trigger: { type: 'scene.enter', mapId: map.id },
      conditions: [{ type: 'combat.active', value: false }],
      actions: [{ type: 'fate.give', count: 2 }],
      once: true,
    });
    await handleAutomationEvent(t.db!, event('map_settings.updated', { partyMapId: map.id }));
    await handleAutomationEvent(t.db!, event('map_settings.updated', { partyMapId: null }));
    await handleAutomationEvent(t.db!, event('map_settings.updated', { partyMapId: map.id }));
    const s = await h.ok<State>(gm, 'GET', url('/table-state'));
    expect(s.fate?.count).toBe(2);
  });

  it("déclencheur d'un réglage : appliqué par le serveur", async () => {
    await h.ok(gm, 'POST', url('/automations'), {
      name: 'Tension',
      params: { mood: 'danger' },
      triggers: [{ type: 'combat.start' }],
    });
    await handleAutomationEvent(t.db!, event('combat.started'));
    const s = await h.ok<State>(gm, 'GET', url('/table-state'));
    expect(s.mood).toBe('danger');
  });

  it('ambiance pour un seul joueur : lui seul la voit', async () => {
    const alice = await t.user();
    const cid = await h.campaign(gm, 'dnd-classic', [alice]);
    await h.ok(gm, 'POST', `/v1/campaigns/${cid}/automation-rules`, {
      name: 'Cauchemar',
      trigger: { type: 'combat.end' },
      actions: [{ type: 'screen.mood', mood: 'dream', to: alice.id }],
    });
    await handleAutomationEvent(t.db!, { ...event('combat.ended'), roomId: cid });
    const vue = await h.ok<{ mood: string | null; personalMood: string | null }>(
      alice,
      'GET',
      `/v1/campaigns/${cid}/table-state`,
    );
    expect(vue).toMatchObject({ mood: null, personalMood: 'dream' });
  });
});
