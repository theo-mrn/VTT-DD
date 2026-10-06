/**
 * Module « shortcuts » : raccourcis clavier de l'utilisateur, propres au compte et partagés
 * entre ses appareils (docs/raccourcis.md § 4). Sans ligne : touches par défaut, aucun
 * raccourci créé (version 0).
 *
 *   GET /v1/users/me/shortcuts
 *   PUT /v1/users/me/shortcuts   { bindings, custom, version? } (les préférences entières)
 *
 * Événement `identity.shortcuts_updated` (l'auteur seul), avec la version seulement : les
 * raccourcis créés portent du texte libre, qui n'entre pas dans le journal (ajout seul, RGPD).
 * Les autres appareils relisent.
 */
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  PROBLEM_CONTENT_TYPE,
  ShortcutPreferences,
  ShortcutPreferencesUpdate,
} from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { shortcutPreferences } from '../../db/schema.js';
import type { Module } from '../../deps.js';

type Prefs = Omit<ShortcutPreferences, 'version'>;

/** 409 : les préférences ont changé depuis leur lecture ; `current` permet de repartir d'elles. */
function sendConflict(reply: FastifyReply, current: ShortcutPreferences) {
  return reply.code(409).type(PROBLEM_CONTENT_TYPE).send({
    type: 'about:blank',
    title: 'Conflit',
    status: 409,
    code: 'version_conflict',
    detail: 'Les raccourcis ont été modifiés sur un autre appareil',
    current,
  });
}

/** Forme stable (clés triées) : deux écritures identiques ne font pas de nouvelle version. */
const stable = (p: Prefs) =>
  JSON.stringify({
    bindings: Object.fromEntries(Object.entries(p.bindings).sort(([a], [b]) => (a < b ? -1 : 1))),
    custom: p.custom,
  });

export async function shortcutsOf(
  db: Pick<Db, 'select'>,
  userId: string,
): Promise<ShortcutPreferences> {
  const [row] = await db
    .select()
    .from(shortcutPreferences)
    .where(eq(shortcutPreferences.userId, userId));
  if (!row) return structuredClone(DEFAULT_SHORTCUT_PREFERENCES);
  const parsed = ShortcutPreferences.omit({ version: true }).safeParse(row.preferences);
  const prefs = parsed.success ? parsed.data : { bindings: {}, custom: [] };
  return { ...prefs, version: row.version };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.get(
    '/v1/users/me/shortcuts',
    { preValidation: app.authenticate, schema: { response: { 200: ShortcutPreferences } } },
    async (req) => shortcutsOf(db, req.user!.userId),
  );

  r.put(
    '/v1/users/me/shortcuts',
    {
      preValidation: app.authenticate,
      schema: { body: ShortcutPreferencesUpdate, response: { 200: ShortcutPreferences } },
    },
    async (req, reply) => {
      const userId = req.user!.userId;
      const next: Prefs = { bindings: req.body.bindings, custom: req.body.custom };
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shortcuts:${userId}`}))`);
        const current = await shortcutsOf(tx, userId);
        if (req.body.version !== undefined && req.body.version !== current.version)
          return { conflict: current } as const;
        if (current.version > 0 && stable(current) === stable(next))
          return { prefs: current } as const;
        const version = current.version + 1;
        await tx
          .insert(shortcutPreferences)
          .values({ userId, preferences: next, version })
          .onConflictDoUpdate({
            target: shortcutPreferences.userId,
            set: { preferences: next, version, updatedAt: sql`now()` },
          });
        await appendEvent(
          tx,
          {
            correlationId: req.ctx.correlationId,
            traceparent: (req.headers.traceparent as string | undefined) ?? null,
          },
          {
            type: 'identity.shortcuts_updated',
            actor: { userId, role: 'user', characterId: null },
            aggregate: { type: 'user', id: userId },
            payload: { version },
            visibility: 'owner',
          },
        );
        return { prefs: { ...next, version } } as const;
      });
      if (result.conflict) return sendConflict(reply, result.conflict);
      return result.prefs;
    },
  );
};
