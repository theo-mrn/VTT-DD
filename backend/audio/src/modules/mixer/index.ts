/**
 * Module « mixer » : mixeur personnel de l'utilisateur, partagé entre ses
 * appareils (décision Q3). Sans ligne : tout à 1, rien de coupé (version 0).
 *
 *   GET /v1/audio/me/mixer
 *   PUT /v1/audio/me/mixer   { volumes, muted?, version? } (bus absents : inchangés)
 */
import {
  AUDIO_BUSES,
  DEFAULT_MIXER,
  MixerPreferences,
  MixerUpdate,
  type BusName,
  type MixerPreferences as Prefs,
} from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { mixerPreferences } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { currentUser, eventContext, sendProblem } from '../common.js';

/** Valeurs lues en base, complétées et bornées (une clé inconnue est ignorée). */
function normalize(volumes: Record<string, unknown>, muted: Record<string, unknown>) {
  const v = { ...DEFAULT_MIXER.volumes };
  const m = { ...DEFAULT_MIXER.muted };
  for (const bus of AUDIO_BUSES) {
    const x = volumes[bus];
    if (typeof x === 'number' && Number.isFinite(x)) v[bus] = Math.max(0, Math.min(1, x));
    if (typeof muted[bus] === 'boolean') m[bus] = muted[bus] as boolean;
  }
  return { volumes: v, muted: m };
}

export async function mixerOf(db: Pick<Db, 'select'>, userId: string): Promise<Prefs> {
  const [row] = await db.select().from(mixerPreferences).where(eq(mixerPreferences.userId, userId));
  if (!row) return { ...structuredClone(DEFAULT_MIXER), version: 0 };
  return { ...normalize(row.volumes, row.muted), version: row.version };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/audio/me/mixer',
    { ...auth, schema: { response: { 200: MixerPreferences } } },
    async (req) => mixerOf(db, currentUser(req)),
  );

  r.put(
    '/v1/audio/me/mixer',
    { ...auth, schema: { body: MixerUpdate, response: { 200: MixerPreferences } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audio-mixer:${userId}`}))`);
        const current = await mixerOf(tx, userId);
        if (req.body.version !== undefined && req.body.version !== current.version)
          return { conflict: current } as const;
        const next = normalize(
          { ...current.volumes, ...req.body.volumes },
          { ...current.muted, ...req.body.muted },
        );
        const same = AUDIO_BUSES.every(
          (b: BusName) =>
            next.volumes[b] === current.volumes[b] && next.muted[b] === current.muted[b],
        );
        if (same && current.version > 0) return { prefs: current } as const;
        const version = current.version + 1;
        await tx
          .insert(mixerPreferences)
          .values({ userId, volumes: next.volumes, muted: next.muted, version })
          .onConflictDoUpdate({
            target: mixerPreferences.userId,
            set: { volumes: next.volumes, muted: next.muted, version, updatedAt: sql`now()` },
          });
        const prefs: Prefs = { ...next, version };
        // Autres appareils de l'utilisateur (hors campagne : l'auteur seul)
        await appendEvent(tx, eventContext(req), {
          type: 'audio.mixer_updated',
          actor: { userId, role: 'user', characterId: null },
          aggregate: { type: 'audio_mixer', id: userId },
          payload: prefs,
          visibility: 'owner',
          campaignId: null,
        });
        return { prefs } as const;
      });
      if ('conflict' in result)
        return sendProblem(reply, 409, 'Conflit', 'version_conflict', {
          detail: 'Le mixeur a été modifié sur un autre appareil',
          current: result.conflict,
        });
      return result.prefs;
    },
  );
};
