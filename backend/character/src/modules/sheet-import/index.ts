/**
 * Module « import de fiche » (docs/import-fiche.md) : lecture d'une fiche en ligne, sur un site
 * pris en charge. La création du personnage importé passe par le module personnages.
 */
import { SheetLinkRequest, SheetReading } from '@vtt/contracts';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Module } from '../../deps.js';
import { lireFicheEnLigne } from './sites.js';

export const register: Module = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Le service télécharge la page (le navigateur ne le peut pas, CORS) : limite par IP
  r.post(
    '/v1/characters/import/link',
    {
      preValidation: app.authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: { body: SheetLinkRequest, response: { 200: SheetReading } },
    },
    async (req) => lireFicheEnLigne(req.body.url),
  );
};
