/**
 * Écriture des modèles importés : un second import des mêmes documents
 * (mêmes UUIDv5) n'écrit rien et n'émet aucun événement.
 */
import { uuidv7 } from '@vtt/contracts';
import { systeme } from '@vtt/systemes';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../../db/client.js';
import { npcTemplateCategories, npcTemplates, objectTemplates, outbox } from '../../db/schema.js';
import { loadCampaignTemplates, type CampaignTemplates } from './load.js';
import {
  transformCategory,
  transformNpcTemplate,
  transformObjectTemplate,
  type LegacyNpcTemplate,
} from './transform.js';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('import des modèles en base', () => {
  const { db, pool } = createDb(URL ?? '');
  const campaignId = crypto.randomUUID();
  afterAll(async () => {
    await db.delete(npcTemplates).where(eq(npcTemplates.campaignId, campaignId));
    await db.delete(npcTemplateCategories).where(eq(npcTemplateCategories.campaignId, campaignId));
    await db.delete(objectTemplates).where(eq(objectTemplates.campaignId, campaignId));
    await db.delete(outbox).where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`);
    await pool.end();
  });

  it('écrit catégories, modèles et objets avec leurs événements ; un second import ne fait rien', async () => {
    // Salle propre au test : chemins legacy (donc UUIDv5) jamais vus
    const salle = `salleTest-${uuidv7()}`;
    const categorie = `npc_templates/${salle}/categories/c1`;
    const m: CampaignTemplates = {
      categories: [
        transformCategory({
          path: categorie,
          id: 'c1',
          data: {
            name: 'Gobelins',
            color: '#10b981',
            createdAt: { $timestamp: '2026-01-05T14:21:20Z' },
          },
        }),
      ],
      npcTemplates: [
        transformNpcTemplate(
          {
            path: `npc_templates/${salle}/templates/t1`,
            id: 't1',
            data: {
              Nomperso: 'Gobelin',
              categoryId: 'c1',
              niveau: 1,
              DEX: 14,
              Defense: 15,
            } as LegacyNpcTemplate,
          },
          {
            systemId: 'dnd-classic',
            systemes: { 'dnd-classic': systeme('dnd-classic') },
            categories: new Set([categorie]),
          },
        ),
      ],
      objectTemplates: [
        transformObjectTemplate({
          path: `object_templates/${salle}/templates/o1`,
          id: 'o1',
          data: { name: 'Caisse', imageUrl: 'https://x.test/c.png' },
        }),
      ],
    };

    const first = await loadCampaignTemplates(db, campaignId, m, uuidv7());
    expect(
      [first.categories, first.npcTemplates, first.objectTemplates].map((l) => l.length),
    ).toEqual([1, 1, 1]);
    const [t] = await db.select().from(npcTemplates).where(eq(npcTemplates.campaignId, campaignId));
    expect(t).toMatchObject({
      name: 'Gobelin',
      categoryId: m.categories[0]!.id,
      systemId: 'dnd-classic',
    });
    const [c] = await db
      .select()
      .from(npcTemplateCategories)
      .where(eq(npcTemplateCategories.campaignId, campaignId));
    expect(c!.createdAt.toISOString()).toBe('2026-01-05T14:21:20.000Z');

    const second = await loadCampaignTemplates(db, campaignId, m, uuidv7());
    expect(second).toEqual({ categories: [], npcTemplates: [], objectTemplates: [] });

    const events = (
      await db
        .select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    ).map((e) => e.envelope as Record<string, any>);
    expect(events.map((e) => [e.type, e.visibility, e.actor.role, e.payload])).toEqual([
      [
        'npc_template.imported',
        'gm_only',
        'system',
        { categories: 1, templates: 1, imported: true },
      ],
      ['object_template.imported', 'gm_only', 'system', { templates: 1, imported: true }],
    ]);
  });
});
