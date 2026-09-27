/**
 * Module « settings » : réglages de table d'une campagne, décidés par le MJ
 * pour toute la table (contrat : docs/api-campaign.md).
 *
 *   GET    /v1/campaigns/:id/settings    réglages (membres)
 *   PATCH  /v1/campaigns/:id/settings    { version, dice? } (MJ) → campaign.settings_updated
 *
 * Lanceur de dés : `dice.hiddenAttributes` retire des attributs jetables (ceux
 * dont les règles déclarent `jet`) pour toute la table. On ne peut qu'en
 * retirer : une clé qui ne sert pas aux jets dans le système est refusée.
 *
 * Les réglages ont leur propre version (0 tant que le MJ n'a rien changé) :
 * le PATCH la rappelle, et un écart donne 409 `version_conflict`.
 */
import { changesPayload } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignSettings } from '../../db/schema.js';
import type { Tx } from '../../db/outbox.js';
import type { Db } from '../../db/client.js';
import type { Module } from '../../deps.js';
import type { CampaignSystem } from '../../systems/catalog.js';
import { access, campaignEvent, gmAccess, lockCampaign } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext } from '../schemas.js';

/** Clé d'attribut des règles (`@FOR`, `Contact`). */
const AttributeKey = z
  .string()
  .max(64)
  .regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, 'Clé d’attribut invalide');

/** Attributs retirés au plus (bien au-delà des systèmes connus). */
const MAX_HIDDEN = 200;

/** Document stocké en jsonb : relu avec des valeurs par défaut, clés inconnues ignorées. */
const StoredSettings = z.object({
  dice: z
    .object({ hiddenAttributes: z.array(AttributeKey).max(MAX_HIDDEN).catch([]).default([]) })
    .catch({ hiddenAttributes: [] })
    .default({ hiddenAttributes: [] }),
});
type StoredSettings = z.output<typeof StoredSettings>;

export const CampaignSettingsResponse = z.object({
  /** 0 tant que le MJ n'a rien réglé. */
  version: z.number().int(),
  dice: z.object({
    /** Attributs jetables retirés du lanceur de dés pour toute la table. */
    hiddenAttributes: z.array(z.string()),
  }),
  updatedAt: z.string().nullable(),
});

const Params = z.object({ id: CampaignId });

const versionConflict = () =>
  HttpError.conflict(
    'Les réglages ont été modifiés entre-temps : rechargez-les',
    'version_conflict',
  );

/** Réglages enregistrés d'une campagne (défauts si aucun), limités au système courant. */
async function readSettings(db: Db | Tx, campaignId: string, system: CampaignSystem | undefined) {
  const [row] = await db
    .select()
    .from(campaignSettings)
    .where(eq(campaignSettings.campaignId, campaignId));
  const settings = StoredSettings.parse(row?.settings ?? {});
  // Une clé retirée que le système ne déclare plus jetable (changement de système) est ignorée
  const rollable = new Set(system?.rollAttributes ?? []);
  settings.dice.hiddenAttributes = settings.dice.hiddenAttributes.filter((k) => rollable.has(k));
  return { row, settings };
}

const response = (
  version: number,
  settings: StoredSettings,
  updatedAt: Date | null,
): z.infer<typeof CampaignSettingsResponse> => ({
  version,
  dice: { hiddenAttributes: settings.dice.hiddenAttributes },
  updatedAt: updatedAt?.toISOString() ?? null,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalog } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/campaigns/:id/settings',
    { ...auth, schema: { params: Params, response: { 200: CampaignSettingsResponse } } },
    async (req) => {
      const a = await access(db, req.params.id, currentUser(req));
      const { row, settings } = await readSettings(
        db,
        a.campaign.id,
        catalog.system(a.campaign.systemId),
      );
      return response(row?.version ?? 0, settings, row?.updatedAt ?? null);
    },
  );

  r.patch(
    '/v1/campaigns/:id/settings',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          /** Version lue (0 si aucun réglage enregistré). */
          version: z.number().int().min(0),
          dice: z
            .object({ hiddenAttributes: z.array(AttributeKey).max(MAX_HIDDEN).optional() })
            .optional(),
        }),
        response: { 200: CampaignSettingsResponse },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      return db.transaction(async (tx) => {
        await lockCampaign(tx, req.params.id);
        const a = await gmAccess(tx, req.params.id, userId);
        const system = catalog.system(a.campaign.systemId);
        const { row, settings: before } = await readSettings(tx, a.campaign.id, system);
        const current = row?.version ?? 0;
        if (req.body.version !== current) throw versionConflict();

        const next: StoredSettings = structuredClone(before);
        const hidden = req.body.dice?.hiddenAttributes;
        if (hidden !== undefined) {
          // On ne retire qu'un attribut qui sert aux jets dans le système de la campagne
          const rollable = new Set(system?.rollAttributes ?? []);
          const unknown = hidden.filter((k) => !rollable.has(k));
          if (unknown.length)
            throw HttpError.badRequest(
              `Attribut qui ne sert pas aux jets dans ce système : ${unknown.join(', ')}`,
              'not_rollable',
            );
          next.dice.hiddenAttributes = [...new Set(hidden)];
        }

        const version = current + 1;
        const [saved] = await tx
          .insert(campaignSettings)
          .values({ campaignId: a.campaign.id, settings: next, version, updatedBy: userId })
          .onConflictDoUpdate({
            target: campaignSettings.campaignId,
            set: { settings: next, version, updatedBy: userId, updatedAt: sql`now()` },
          })
          .returning();
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.settings_updated',
          campaignId: a.campaign.id,
          userId,
          role: a.role,
          payload: { version, dice: next.dice, ...changesPayload(before, next) },
        });
        return response(version, next, saved!.updatedAt);
      });
    },
  );
};
