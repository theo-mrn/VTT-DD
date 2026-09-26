/**
 * Module « amis » : liste d'amis, demandes reçues et envoyées, envoi,
 * acceptation, refus ou annulation d'une demande, retrait d'un ami.
 */
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import {
  accepterDemande,
  envoyerDemande,
  listerAmis,
  listerDemandes,
  retirerAmi,
  supprimerDemande,
} from './service.js';

const IdJoueur = z.uuid('Identifiant de joueur invalide').transform((s) => s.toLowerCase());
const ParamJoueur = z.object({ userId: IdJoueur });

const Demande = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * Limite l'envoi de demandes en masse (plugin rate-limit de @vtt/platform).
 * Types de @fastify/rate-limit non chargés ici, d'où la conversion.
 */
const LIMITE_DEMANDES = {
  rateLimit: { max: 30, timeWindow: '1 minute' },
} as FastifyContextConfig;

const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const moi = (req: FastifyRequest) => req.user!.userId.toLowerCase();

  r.get(
    '/v1/friends',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              avatarUrl: z.string().nullable(),
              title: z.string().nullable(),
              since: z.string(),
            }),
          ),
        },
      },
    },
    async (req) => listerAmis(deps.db, moi(req)),
  );

  r.get(
    '/v1/friends/requests',
    {
      preHandler: app.authenticate,
      schema: {
        response: { 200: z.object({ received: z.array(Demande), sent: z.array(Demande) }) },
      },
    },
    async (req) => listerDemandes(deps.db, moi(req)),
  );

  r.post(
    '/v1/friends/requests',
    {
      preHandler: app.authenticate,
      config: LIMITE_DEMANDES,
      schema: {
        body: z.object({ userId: IdJoueur }),
        response: { 201: z.object({ status: z.enum(['pending', 'accepted']) }) },
      },
    },
    async (req, reply) => {
      const resultat = await envoyerDemande(deps.db, contexte(req), moi(req), req.body.userId);
      reply.code(201);
      return resultat;
    },
  );

  r.post(
    '/v1/friends/requests/:userId/accept',
    { preHandler: app.authenticate, schema: { params: ParamJoueur } },
    async (req, reply) => {
      await accepterDemande(deps.db, contexte(req), moi(req), req.params.userId);
      reply.code(204);
    },
  );

  r.delete(
    '/v1/friends/requests/:userId',
    { preHandler: app.authenticate, schema: { params: ParamJoueur } },
    async (req, reply) => {
      await supprimerDemande(deps.db, contexte(req), moi(req), req.params.userId);
      reply.code(204);
    },
  );

  r.delete(
    '/v1/friends/:userId',
    { preHandler: app.authenticate, schema: { params: ParamJoueur } },
    async (req, reply) => {
      await retirerAmi(deps.db, contexte(req), moi(req), req.params.userId);
      reply.code(204);
    },
  );
};
