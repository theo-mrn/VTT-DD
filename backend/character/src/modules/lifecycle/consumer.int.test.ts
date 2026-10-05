/**
 * Comptes et campagnes supprimés sur un vrai PostgreSQL : un compte emporte ses personnages,
 * une campagne ses PNJ et ses modèles ; le reste ne bouge pas.
 */
import { CAMPAIGN_DELETED, USER_DELETED } from '@vtt/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  characters,
  npcTemplateCategories,
  npcTemplates,
  objectTemplates,
} from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';
import { handleLifecycleEvent } from './consumer.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

describe.skipIf(!TEST_DATABASE_URL)('comptes et campagnes supprimés', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    alice = await t.utilisateur();
    bob = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const creer = async (u: Utilisateur, nom: string) =>
    (
      await o.ok<{ id: string }>(u, 'POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom,
      })
    ).id;
  const restants = async (ids: string[]) =>
    (await t.db!.select({ id: characters.id }).from(characters).where(inArray(characters.id, ids)))
      .map((r) => r.id)
      .sort();
  const event = (type: string, id: string, roomId: string | null = null) => ({
    id: crypto.randomUUID(),
    type,
    roomId,
    aggregate: { type: type === USER_DELETED ? 'user' : 'campaign', id },
    correlationId: 'test-cycle-de-vie',
    traceparent: null,
  });

  it('un compte supprimé emporte tous ses personnages, pas ceux des autres', async () => {
    const [a1, a2, b1] = [
      await creer(alice, 'Aelwen'),
      await creer(alice, 'Brom'),
      await creer(bob, 'Cassia'),
    ];
    const e = event(USER_DELETED, alice.id);
    expect(await handleLifecycleEvent(t.db!, e)).toBe(true);
    expect(await restants([a1, a2, b1])).toEqual([b1]);
    expect(await handleLifecycleEvent(t.db!, e)).toBe(false);
  });

  it('une campagne supprimée emporte ses PNJ et ses modèles, pas les personnages des joueurs', async () => {
    const campaignId = crypto.randomUUID();
    const other = crypto.randomUUID();
    const [pnj, joueur] = [await creer(alice, 'Gobelin'), await creer(bob, 'Cassia')];
    await t.db!.update(characters).set({ kind: 'npc', campaignId }).where(eq(characters.id, pnj));
    const categoryId = crypto.randomUUID();
    await t.db!.insert(npcTemplateCategories).values([
      { id: categoryId, campaignId, name: 'Monstres' },
      { id: crypto.randomUUID(), campaignId: other, name: 'Autre' },
    ]);
    const tpl = {
      name: 'Gobelin',
      systemId: 'dnd-classic',
      systemVersion: '1',
      type: 'personnage',
      etat: {} as never,
    };
    await t.db!.insert(npcTemplates).values([
      { id: crypto.randomUUID(), campaignId, categoryId, ...tpl },
      { id: crypto.randomUUID(), campaignId: other, ...tpl },
    ]);
    await t.db!.insert(objectTemplates).values([
      { id: crypto.randomUUID(), campaignId, name: 'Tonneau' },
      { id: crypto.randomUUID(), campaignId: other, name: 'Coffre' },
    ]);

    expect(await handleLifecycleEvent(t.db!, event(CAMPAIGN_DELETED, campaignId, campaignId))).toBe(
      true,
    );

    expect(await restants([pnj, joueur])).toEqual([joueur]);
    for (const table of [npcTemplates, npcTemplateCategories, objectTemplates]) {
      const left = await t.db!.select({ campaignId: table.campaignId }).from(table);
      expect(left.some((r) => r.campaignId === campaignId)).toBe(false);
      expect(left.some((r) => r.campaignId === other)).toBe(true);
    }
    // La campagne témoin ne reste pas dans la base
    await handleLifecycleEvent(t.db!, event(CAMPAIGN_DELETED, other, other));
  });
});
