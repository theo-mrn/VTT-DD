/**
 * Module « cles-api » : clés d'accès programmatique (CLI, bots, scripts).
 *
 *   GET    /v1/api-keys          clés actives, sans la clé ni son empreinte
 *   POST   /v1/api-keys          crée une clé (affichée une seule fois)
 *   DELETE /v1/api-keys/:id      révoque une clé
 *   POST   /internal/api-keys/exchange
 *          réservé à la gateway (en-tête x-internal-secret) : échange une clé
 *          contre un jeton d'accès court. Absent si INTERNAL_API_SECRET n'est
 *          pas configuré.
 *
 * Un jeton obtenu par clé d'API porte le rôle « api » : il ne peut pas créer
 * d'autre clé (une clé qui fuite ne se multiplie pas).
 */
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../tokens/jwt.js';
import { secretsEgaux } from './cles.js';
import { creerCle, LimiteAtteinte, listerCles, revoquerCle, utiliserCle } from './service.js';

export const EN_TETE_SECRET_INTERNE = 'x-internal-secret';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/api-keys',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              prefix: z.string(),
              createdAt: z.string(),
              lastUsedAt: z.string().nullable(),
            }),
          ),
        },
      },
    },
    async (req) => {
      const cles = await listerCles(deps.db, req.user!.userId);
      return cles.map((c) => ({
        id: c.id,
        name: c.name,
        prefix: c.prefix,
        createdAt: c.createdAt.toISOString(),
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      }));
    },
  );

  r.post(
    '/v1/api-keys',
    {
      preHandler: app.authenticate,
      schema: {
        body: z.object({ name: z.string().trim().min(1).max(64) }),
        response: {
          201: z.object({ id: z.string(), name: z.string(), prefix: z.string(), key: z.string() }),
        },
      },
    },
    async (req, reply) => {
      if (req.user!.roles.includes('api')) {
        throw HttpError.forbidden("Une clé d'API ne peut pas créer d'autre clé");
      }
      try {
        const cree = await creerCle(deps.db, contexte(req), req.user!.userId, req.body.name);
        // La clé n'est montrée qu'une fois : aucun cache ne doit la garder
        reply.header('cache-control', 'no-store');
        reply.code(201);
        return cree;
      } catch (err) {
        if (err instanceof LimiteAtteinte) {
          throw HttpError.conflict(err.message, 'api_key_limit');
        }
        throw err;
      }
    },
  );

  r.delete(
    '/v1/api-keys/:id',
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ id: z.string().max(64) }) },
    },
    async (req, reply) => {
      const ok =
        UUID.test(req.params.id) &&
        (await revoquerCle(deps.db, contexte(req), req.user!.userId, req.params.id));
      if (!ok) throw HttpError.notFound('Clé introuvable');
      reply.code(204);
    },
  );

  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) {
    app.log.warn("INTERNAL_API_SECRET absent : les clés d'API ne peuvent pas être échangées");
    return;
  }

  r.post(
    '/internal/api-keys/exchange',
    {
      // Toutes les requêtes viennent de la gateway (une seule IP) : limite large
      config: { rateLimit: { max: 3000, timeWindow: '1 minute' } },
      // Secret vérifié avant la validation du corps : rien ne fuit sans lui
      preValidation: async (req) => {
        const recu = req.headers[EN_TETE_SECRET_INTERNE];
        if (!secretsEgaux(typeof recu === 'string' ? recu : undefined, secret)) {
          throw HttpError.unauthorized('Secret interne invalide');
        }
      },
      schema: {
        hide: true,
        body: z.object({ key: z.string().min(1).max(256) }),
        response: {
          200: z.object({
            userId: z.string(),
            accessToken: z.string(),
            expiresIn: z.number(),
          }),
        },
      },
    },
    async (req, reply) => {
      const compte = await utiliserCle(deps.db, contexte(req), req.body.key);
      if (!compte) throw HttpError.unauthorized("Clé d'API invalide ou révoquée");
      reply.header('cache-control', 'no-store');
      return {
        userId: compte.userId,
        accessToken: await deps.signer.sign({
          userId: compte.userId,
          roles: ['user', 'api'],
          rooms: {},
        }),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      };
    },
  );
};
