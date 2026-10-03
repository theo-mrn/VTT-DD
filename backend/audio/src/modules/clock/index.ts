/**
 * Module « clock » : l'horloge du serveur, seule référence de temps (§ 3.7).
 *
 *   GET /v1/audio/clock → { serverTime } (ms, no-store)
 *
 * Le client mesure l'aller-retour et garde l'échantillon le plus court
 * (estimateOffset, @vtt/contracts/audio-sync). La réponse est minimale et
 * n'interroge rien : son temps de traitement ne fausse pas l'estimation.
 */
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/v1/audio/clock',
    {
      preValidation: (req, reply) => app.authenticate(req, reply),
      // Échantillonnage de 5 requêtes toutes les 5 min par client : large marge
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { response: { 200: z.object({ serverTime: z.number() }) } },
    },
    async (_req, reply) => {
      reply.header('cache-control', 'no-store');
      return { serverTime: deps.now() };
    },
  );
};
