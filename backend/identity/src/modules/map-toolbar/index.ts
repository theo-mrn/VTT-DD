/**
 * Module « map-toolbar » : disposition de la barre d'outils de la carte, propre au compte et
 * partagée entre ses appareils (docs/carte.md § 6, Personnalisation). Sans ligne : ordre par
 * défaut, rien de masqué (version 0).
 *
 *   GET /v1/users/me/map-toolbar
 *   PUT /v1/users/me/map-toolbar   { order, hidden, version? } (la disposition entière)
 *
 * Événement `identity.map_toolbar_updated` (l'auteur seul) : ses autres appareils l'adoptent.
 */
import {
  DEFAULT_MAP_TOOLBAR_LAYOUT,
  MapToolbarLayout,
  MapToolbarLayoutUpdate,
  PROBLEM_CONTENT_TYPE,
} from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { mapToolbarLayouts } from '../../db/schema.js';
import type { Module } from '../../deps.js';

/** Sans doublon, dans l'ordre de première apparition. */
const unique = (ids: readonly string[]) => [...new Set(ids)];

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** 409 : la disposition a changé depuis sa lecture ; `current` permet de repartir d'elle. */
function sendConflict(reply: FastifyReply, current: MapToolbarLayout) {
  return reply.code(409).type(PROBLEM_CONTENT_TYPE).send({
    type: 'about:blank',
    title: 'Conflit',
    status: 409,
    code: 'version_conflict',
    detail: 'La barre a été modifiée sur un autre appareil',
    current,
  });
}

export async function layoutOf(db: Pick<Db, 'select'>, userId: string): Promise<MapToolbarLayout> {
  const [row] = await db
    .select()
    .from(mapToolbarLayouts)
    .where(eq(mapToolbarLayouts.userId, userId));
  if (!row) return structuredClone(DEFAULT_MAP_TOOLBAR_LAYOUT);
  return { order: row.layout.order, hidden: row.layout.hidden, version: row.version };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.get(
    '/v1/users/me/map-toolbar',
    { preValidation: app.authenticate, schema: { response: { 200: MapToolbarLayout } } },
    async (req) => layoutOf(db, req.user!.userId),
  );

  r.put(
    '/v1/users/me/map-toolbar',
    {
      preValidation: app.authenticate,
      schema: { body: MapToolbarLayoutUpdate, response: { 200: MapToolbarLayout } },
    },
    async (req, reply) => {
      const userId = req.user!.userId;
      const order = unique(req.body.order);
      const hidden = unique(req.body.hidden);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`map-toolbar:${userId}`}))`);
        const current = await layoutOf(tx, userId);
        if (req.body.version !== undefined && req.body.version !== current.version)
          return { conflict: current } as const;
        if (
          current.version > 0 &&
          sameList(order, current.order) &&
          sameList(hidden, current.hidden)
        )
          return { layout: current } as const;
        const version = current.version + 1;
        await tx
          .insert(mapToolbarLayouts)
          .values({ userId, layout: { order, hidden }, version })
          .onConflictDoUpdate({
            target: mapToolbarLayouts.userId,
            set: { layout: { order, hidden }, version, updatedAt: sql`now()` },
          });
        const layout: MapToolbarLayout = { order, hidden, version };
        await appendEvent(
          tx,
          {
            correlationId: req.ctx.correlationId,
            traceparent: (req.headers.traceparent as string | undefined) ?? null,
          },
          {
            type: 'identity.map_toolbar_updated',
            actor: { userId, role: 'user', characterId: null },
            aggregate: { type: 'user', id: userId },
            // Identifiants d'entrées de la barre seulement : aucune donnée personnelle
            payload: layout,
            visibility: 'owner',
          },
        );
        return { layout } as const;
      });
      if (result.conflict) return sendConflict(reply, result.conflict);
      return result.layout;
    },
  );
};
