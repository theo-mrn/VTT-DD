/**
 * Module « backgrounds » : fonds de scène partagés (docs/bibliotheque.md).
 *
 *   GET /v1/library/backgrounds?q&lang&kind&place&setting&time&mood&animated&page   recherche (30 par page)
 *   GET /v1/library/backgrounds/facets?kind                                   nombre par facette
 *   GET /v1/library/backgrounds/lookup?url&lang                               fond d'une adresse de variante
 *   GET /v1/library/backgrounds/:id?lang                                      une entrée et ses variantes
 *
 * Lecture pour tout utilisateur connecté ; rien ne s'écrit par l'API (l'import seul écrit).
 */
import {
  Background,
  BackgroundFacets,
  BackgroundFacetsQuery,
  BackgroundLookup,
  BackgroundPage,
  BackgroundQuery,
  BACKGROUNDS_PER_PAGE,
  LibraryLang,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import {
  backgroundById,
  backgroundByUrl,
  backgroundView,
  facets,
  searchBackgrounds,
  variantsOf,
} from './queries.js';

const IdParams = z.object({ id: z.uuid() });

const notFound = () =>
  new HttpError(404, 'Ressource introuvable', 'background_not_found', 'Fond introuvable');
const LangQuery = z.object({ lang: LibraryLang.default('fr') });

export const register: Module = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/library/backgrounds',
    { ...auth, schema: { querystring: BackgroundQuery, response: { 200: BackgroundPage } } },
    async (req) => {
      const { rows, total } = await searchBackgrounds(db, req.query);
      const variants = await variantsOf(
        db,
        rows.map((b) => b.id),
      );
      return {
        items: rows.map((b) => backgroundView(b, variants.get(b.id) ?? [], req.query.lang)),
        page: req.query.page,
        perPage: BACKGROUNDS_PER_PAGE,
        total,
      };
    },
  );

  r.get(
    '/v1/library/backgrounds/facets',
    {
      ...auth,
      schema: { querystring: BackgroundFacetsQuery, response: { 200: BackgroundFacets } },
    },
    async (req) => facets(db, req.query.kind),
  );

  r.get(
    '/v1/library/backgrounds/lookup',
    { ...auth, schema: { querystring: BackgroundLookup, response: { 200: Background } } },
    async (req) => {
      const row = await backgroundByUrl(db, req.query.url);
      if (!row) throw notFound();
      const variants = await variantsOf(db, [row.id]);
      return backgroundView(row, variants.get(row.id) ?? [], req.query.lang);
    },
  );

  r.get(
    '/v1/library/backgrounds/:id',
    {
      ...auth,
      schema: { params: IdParams, querystring: LangQuery, response: { 200: Background } },
    },
    async (req) => {
      const row = await backgroundById(db, req.params.id);
      if (!row) throw notFound();
      const variants = await variantsOf(db, [row.id]);
      return backgroundView(row, variants.get(row.id) ?? [], req.query.lang);
    },
  );
};
