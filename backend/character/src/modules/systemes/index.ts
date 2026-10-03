/**
 * Module « systèmes » : lecture publique des systèmes de jeu (sans jeton).
 */
import { HttpError } from '@vtt/platform';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';

const IdSysteme = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Identifiant de système invalide');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/systems',
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              version: z.string(),
              nom: z.string(),
              description: z.string().nullable(),
            }),
          ),
        },
      },
    },
    async (_req, reply) => {
      // Documents figés au build : cache navigateur et CDN courts
      reply.header('cache-control', 'public, max-age=300');
      return deps.catalogue.lister();
    },
  );

  r.get(
    '/v1/systems/:id',
    {
      schema: {
        params: z.object({ id: IdSysteme }),
        response: { 200: z.object({ systeme: z.unknown(), presentation: z.unknown() }) },
      },
    },
    async (req, reply) => {
      const documents = deps.catalogue.documents(req.params.id);
      if (!documents) throw HttpError.notFound(`Système inconnu : ${req.params.id}`);
      reply.header('cache-control', 'public, max-age=300');
      return documents;
    },
  );
};
