/**
 * Module « catalog » : sons et musiques intégrés (§ 3.4).
 *
 *   GET /v1/audio/catalog?library=&kind= → { categories, items }
 *
 * `library` : bibliothèque ou système de la campagne (`star-wars-eote` →
 * Star Wars), sinon la bibliothèque par défaut.
 */
import { AssetKind, CatalogCategory, CatalogEntry } from '@vtt/contracts';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { libraryOf } from '../../catalog/index.js';
import type { Module } from '../../deps.js';

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/v1/audio/catalog',
    {
      preValidation: app.authenticate,
      schema: {
        querystring: z.object({
          library: z.string().max(64).optional(),
          kind: AssetKind.optional(),
        }),
        response: {
          200: z.object({ categories: z.array(CatalogCategory), items: z.array(CatalogEntry) }),
        },
      },
    },
    async (req, reply) => {
      const library = libraryOf(req.query.library);
      const { kind } = req.query;
      reply.header('cache-control', 'private, max-age=300');
      return {
        categories: deps.catalog.categories(library).filter((c) => !kind || c.kind === kind),
        items: deps.catalog.entries(library).filter((e) => !kind || e.kind === kind),
      };
    },
  );
};
