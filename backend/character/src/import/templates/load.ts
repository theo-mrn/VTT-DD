/**
 * Écriture des modèles migrés d'une campagne, dans une transaction, avec un
 * événement de synthèse par domaine (`npc_template.imported`,
 * `object_template.imported` : acteur système, MJ seulement) si quelque chose
 * a été écrit. Rejouable : chaque ligne a un identifiant stable (UUIDv5 de son
 * chemin legacy) et les conflits sont ignorés (`ON CONFLICT DO NOTHING`).
 */
import type { Db } from '../../db/client.js';
import { appendEvent, type Tx } from '../../db/outbox.js';
import { npcTemplateCategories, npcTemplates, objectTemplates } from '../../db/schema.js';
import type { MigratedCategory, MigratedNpcTemplate, MigratedObjectTemplate } from './transform.js';

export interface CampaignTemplates {
  categories: MigratedCategory[];
  npcTemplates: MigratedNpcTemplate[];
  objectTemplates: MigratedObjectTemplate[];
}

/** Identifiants réellement insérés (les autres existaient déjà). */
export interface Inserted {
  categories: string[];
  npcTemplates: string[];
  objectTemplates: string[];
}

const withDates = (d: Date | null) => (d ? { createdAt: d, updatedAt: d } : {});

async function summary(
  tx: Tx,
  correlationId: string,
  campaignId: string,
  type: string,
  counts: Record<string, number>,
) {
  await appendEvent(
    tx,
    { correlationId },
    {
      type,
      roomId: campaignId,
      actor: { userId: null, role: 'system', characterId: null },
      aggregate: { type: 'campaign', id: campaignId },
      payload: { ...counts, imported: true },
      visibility: 'gm_only',
    },
  );
}

export function loadCampaignTemplates(
  db: Db,
  campaignId: string,
  m: CampaignTemplates,
  correlationId: string,
): Promise<Inserted> {
  return db.transaction(async (tx) => {
    // Catégories d'abord : les modèles y font référence (clé étrangère)
    const categories = m.categories.length
      ? await tx
          .insert(npcTemplateCategories)
          .values(
            m.categories.map((c) => ({
              id: c.id,
              campaignId,
              name: c.name,
              color: c.color,
              ...withDates(c.createdAt),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: npcTemplateCategories.id })
      : [];
    const templates = m.npcTemplates.length
      ? await tx
          .insert(npcTemplates)
          .values(
            m.npcTemplates.map((t) => ({
              id: t.id,
              campaignId,
              categoryId: t.categoryId,
              name: t.name,
              imageUrl: t.imageUrl,
              tokenUrl: t.tokenUrl,
              systemId: t.etat.systeme.id,
              systemVersion: t.etat.systeme.version,
              type: t.etat.type,
              etat: t.etat,
              actions: t.actions,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: npcTemplates.id })
      : [];
    const objects = m.objectTemplates.length
      ? await tx
          .insert(objectTemplates)
          .values(
            m.objectTemplates.map((o) => ({
              id: o.id,
              campaignId,
              name: o.name,
              imageUrl: o.imageUrl,
              category: o.category,
              ...withDates(o.createdAt),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: objectTemplates.id })
      : [];

    if (categories.length || templates.length)
      await summary(tx, correlationId, campaignId, 'npc_template.imported', {
        categories: categories.length,
        templates: templates.length,
      });
    if (objects.length)
      await summary(tx, correlationId, campaignId, 'object_template.imported', {
        templates: objects.length,
      });
    return {
      categories: categories.map((r) => r.id),
      npcTemplates: templates.map((r) => r.id),
      objectTemplates: objects.map((r) => r.id),
    };
  });
}
