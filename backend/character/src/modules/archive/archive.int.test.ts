/**
 * Archive d'une campagne, part de character (docs/export-campagne.md § 5) : instantané des
 * personnages et modèles de la campagne, import sous de nouveaux identifiants pour un autre MJ.
 */
import { ArchiveServiceSnapshot, remapIds, rowIds, uuidv7 } from '@vtt/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  characters,
  npcTemplateCategories,
  npcTemplates,
  objectTemplates,
} from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import type { Utilisateur } from '../../test/outils.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const interne = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('archive (character)', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  let mj: Utilisateur;
  let alice: Utilisateur;
  let heritier: Utilisateur;
  const campagnes: string[] = [];

  beforeEach(async () => {
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET });
    [mj, alice, heritier] = await Promise.all([t.utilisateur(), t.utilisateur(), t.utilisateur()]);
  });

  afterEach(async () => {
    const db = t.db!;
    if (campagnes.length) {
      await db.delete(characters).where(inArray(characters.campaignId, campagnes));
      await db.delete(npcTemplates).where(inArray(npcTemplates.campaignId, campagnes));
      await db
        .delete(npcTemplateCategories)
        .where(inArray(npcTemplateCategories.campaignId, campagnes));
      await db.delete(objectTemplates).where(inArray(objectTemplates.campaignId, campagnes));
      campagnes.length = 0;
    }
    await t.fermer();
  });

  async function campagne() {
    const campaignId = uuidv7();
    campagnes.push(campaignId);
    const db = t.db!;
    const base = {
      systemId: 'dnd-classic',
      systemVersion: '1',
      type: 'personnage',
      etat: { valeurs: {} },
    };
    const [categorie] = await db
      .insert(npcTemplateCategories)
      .values({ id: uuidv7(), campaignId, name: 'Morts-vivants', createdBy: mj.id })
      .returning();
    const [modele] = await db
      .insert(npcTemplates)
      .values({
        id: uuidv7(),
        campaignId,
        categoryId: categorie!.id,
        name: 'Squelette',
        createdBy: mj.id,
        ...base,
      })
      .returning();
    await db
      .insert(objectTemplates)
      .values({ id: uuidv7(), campaignId, name: 'Coffre', createdBy: mj.id });
    const [heros] = await db
      .insert(characters)
      .values({ id: uuidv7(), campaignId, ownerId: alice.id, nom: 'Aria', kind: 'pc', ...base })
      .returning();
    const [pnj] = await db
      .insert(characters)
      .values({
        id: uuidv7(),
        campaignId,
        ownerId: mj.id,
        nom: 'Squelette 1',
        kind: 'npc',
        templateId: modele!.id,
        ...base,
      })
      .returning();
    await db.insert(characters).values({
      id: uuidv7(),
      campaignId,
      ownerId: mj.id,
      nom: 'Supprimé',
      deletedAt: new Date(),
      ...base,
    });
    return { campaignId, heros: heros!.id, pnj: pnj!.id, modele: modele!.id };
  }

  async function instantane(campaignId: string) {
    const res = await t.app.inject({
      method: 'POST',
      url: `/internal/campaigns/${campaignId}/archive/snapshot`,
      headers: interne,
      payload: { options: { keepProgress: true }, gmIds: [mj.id] },
    });
    expect(res.statusCode, res.body).toBe(200);
    return ArchiveServiceSnapshot.parse(res.json());
  }

  it('exige le secret interne', async () => {
    const { campaignId } = await campagne();
    const res = await t.app.inject({
      method: 'POST',
      url: `/internal/campaigns/${campaignId}/archive/snapshot`,
      headers: mj.auth,
      payload: { options: { keepProgress: true }, gmIds: [mj.id] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('exporte modèles et personnages ; ceux des joueurs deviennent des PNJ', async () => {
    const { campaignId, heros } = await campagne();
    const snap = await instantane(campaignId);
    expect(snap.tables.npc_template_categories).toHaveLength(1);
    expect(snap.tables.npc_templates).toHaveLength(1);
    expect(snap.tables.object_templates).toHaveLength(1);
    expect(snap.tables.characters!.map((c) => c.nom).sort()).toEqual(['Aria', 'Squelette 1']);
    expect(snap.tables.characters!.find((c) => c.id === heros)).toMatchObject({ kind: 'npc' });
  });

  it('réimporte pour un autre MJ, sous de nouveaux identifiants, une seule fois', async () => {
    const { campaignId, pnj, modele } = await campagne();
    const snap = await instantane(campaignId);
    const ids = new Map(
      [...rowIds(Object.values(snap.tables)), campaignId].map((id) => [id, uuidv7()]),
    );
    const nouvelle = ids.get(campaignId)!;
    campagnes.push(nouvelle);
    const importer = () =>
      t.app.inject({
        method: 'POST',
        url: `/internal/campaigns/${nouvelle}/archive`,
        headers: interne,
        payload: {
          schemaVersion: snap.schemaVersion,
          tables: remapIds(snap.tables, ids),
          ownerId: heritier.id,
          options: { keepProgress: true },
          foreignIds: [],
        },
      });
    const res = await importer();
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().written).toEqual({
      npc_template_categories: 1,
      npc_templates: 1,
      object_templates: 1,
      characters: 2,
    });

    const copies = await t.db!.select().from(characters).where(eq(characters.campaignId, nouvelle));
    expect(copies.every((c) => c.ownerId === heritier.id && c.kind === 'npc')).toBe(true);
    expect(copies.find((c) => c.id === ids.get(pnj))?.templateId).toBe(ids.get(modele));
    expect((await importer()).statusCode).toBe(409);
  });
});
