/**
 * Module « titres » : catalogue public, titres du joueur et choix du titre
 * affiché sur le profil. Le catalogue du code est écrit en base au démarrage.
 */
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { amorcerCatalogue } from './catalogue.js';
import { choisirTitre, listerCatalogue, listerTitresDuJoueur } from './service.js';

const Slug = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug de titre invalide');

const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const register: Module = async (app, deps) => {
  try {
    await amorcerCatalogue(deps.db);
  } catch (err) {
    // Base indisponible au démarrage : le service démarre quand même (la sonde
    // de disponibilité le signale) et le catalogue sera réécrit au prochain démarrage.
    app.log.error({ err }, 'amorçage du catalogue des titres impossible');
  }

  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/titles',
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              slug: z.string(),
              label: z.string(),
              description: z.string().nullable(),
              condition: z.record(z.string(), z.unknown()).nullable(),
              defaultUnlocked: z.boolean(),
            }),
          ),
        },
      },
    },
    async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return listerCatalogue(deps.db);
    },
  );

  r.get(
    '/v1/users/me/titles',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: z.array(
            z.object({ slug: z.string(), label: z.string(), unlockedAt: z.string().nullable() }),
          ),
        },
      },
    },
    async (req) => listerTitresDuJoueur(deps.db, req.user!.userId),
  );

  r.put(
    '/v1/users/me/title',
    {
      preHandler: app.authenticate,
      schema: {
        body: z.object({ slug: Slug.nullable() }),
        response: { 200: z.object({ title: z.string().nullable() }) },
      },
    },
    async (req) => choisirTitre(deps.db, contexte(req), req.user!.userId, req.body.slug),
  );
};
