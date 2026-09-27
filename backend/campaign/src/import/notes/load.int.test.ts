/**
 * Chargement des notes migrées sur un vrai PostgreSQL : contraintes
 * respectées, import rejouable sans doublon ni écrasement, droits de lecture
 * de l'API appliqués aux notes importées.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import type { FirestoreDoc } from '../legacy.js';
import { legacyUuid } from '../maps/transform.js';
import { existingNotes, loadNotes } from './load.js';
import { transformNotes } from './transform.js';

const doc = (path: string, data: Record<string, unknown>): FirestoreDoc => ({
  path,
  id: path.split('/').pop()!,
  data,
});

describe.skipIf(!TEST_DATABASE_URL)('import des notes', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  it('écrit les notes une seule fois, sans écraser, lisibles selon leurs droits', async () => {
    const campaignId = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const aria = await h.engage(campaignId, alice);
    const brom = await h.engage(campaignId, bob);
    // Code de salle propre au test : les identifiants dérivés ne se croisent pas
    const R = `T${crypto.randomUUID().slice(0, 8)}`;
    const privateDocs = [
      doc(`Notes/${R}/aria/n1`, {
        title: 'Journal',
        content: '<p>Secret</p>',
        type: 'quest',
        questType: 'annexe',
        questStatus: 'not-started',
        subQuests: [{ id: '1', title: 'Étape', description: '', status: 'in-progress' }],
        tags: [{ id: 'a', label: 'A' }],
        createdAt: { $timestamp: '2025-05-01T10:00:00.000Z' },
        updatedAt: { $timestamp: '2025-05-02T10:00:00.000Z' },
      }),
      doc(`Notes/${R}/uid-gm/n2`, { title: 'Scénario', content: 'Le traître' }),
    ];
    const sharedDocs = [
      doc(`SharedNotes/${R}/notes/s1`, {
        title: 'Pour Brom',
        createdBy: 'aria',
        sharedWith: ['brom'],
      }),
      doc(`SharedNotes/${R}/notes/s2`, {
        title: 'Pour tous',
        createdBy: 'aria',
        sharedWith: 'all',
      }),
    ];
    const m = transformNotes(R, privateDocs, sharedDocs, {
      campaignId,
      gmId: gm.id,
      characters: new Map([
        [
          `cartes/${R}/characters/aria`,
          { id: aria, engaged: true, ownerId: alice.id, playedBy: null },
        ],
        [
          `cartes/${R}/characters/brom`,
          { id: brom, engaged: true, ownerId: bob.id, playedBy: null },
        ],
      ]),
      legacyCharacters: new Map([
        ['aria', { name: 'Aria', type: 'joueurs' }],
        ['brom', { name: 'Brom', type: 'joueurs' }],
      ]),
      accounts: new Map([['uid-gm', gm.id]]),
      users: new Map(),
      importedAt: new Date(),
    });
    expect(m.warnings).toEqual([]);

    expect(await existingNotes(t.db!, m.notes)).toBe(0);
    expect(await loadNotes(t.db!, campaignId, m.notes, 'test')).toEqual({ private: 2, shared: 2 });

    // Modifiée dans l'app entre deux imports : le second import ne l'écrase pas
    const n1 = legacyUuid(`Notes/${R}/aria/n1`);
    await h.ok(alice, 'PATCH', `/v1/campaigns/${campaignId}/notes/${n1}`, { title: 'Renommée' });
    expect(await existingNotes(t.db!, m.notes)).toBe(4);
    expect(await loadNotes(t.db!, campaignId, m.notes, 'test')).toEqual({ private: 0, shared: 0 });

    const titles = async (u: TestUser) =>
      (await h.ok<{ title: string }[]>(u, 'GET', `/v1/campaigns/${campaignId}/notes`))
        .map((n) => n.title)
        .sort();
    expect(await titles(alice)).toEqual(['Pour Brom', 'Pour tous', 'Renommée']);
    expect(await titles(bob)).toEqual(['Pour Brom', 'Pour tous']);
    expect(await titles(gm)).toEqual(['Pour tous', 'Scénario']);

    const note = await h.ok<Record<string, unknown>>(
      alice,
      'GET',
      `/v1/campaigns/${campaignId}/notes/${n1}`,
    );
    expect(note).toMatchObject({
      characterId: aria,
      questType: 'side',
      questStatus: 'not_started',
      subQuests: [{ id: '1', title: 'Étape', description: '', status: 'in_progress' }],
      createdAt: '2025-05-01T10:00:00.000Z',
    });

    const imported = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${campaignId} and ${outbox.envelope}->>'type' = 'note.imported'`,
      );
    // Un seul événement (le second import n'a rien écrit), compteurs seuls
    expect(imported.map((e) => e.envelope)).toEqual([
      expect.objectContaining({
        visibility: 'gm_only',
        actor: { userId: null, role: 'system', characterId: null },
        payload: { counts: { private: 2, shared: 2 } },
      }),
    ]);
  });
});
