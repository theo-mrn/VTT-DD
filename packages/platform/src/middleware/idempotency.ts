import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Cache } from '../cache.js';
import { HttpError } from './error-handler.js';

interface StoredResponse {
  status: number;
  body: unknown;
  contentType?: string;
}

export interface IdempotencyOptions {
  cache: Cache;
  ttlSeconds?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

const KEY = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * En-tête `Idempotency-Key` sur POST/PUT/PATCH/DELETE : une requête rejouée
 * (retry réseau, double clic) renvoie la réponse d'origine au lieu de
 * refaire l'action. Indispensable pour les paiements et les jets de dés.
 */
export const idempotency = fp<IdempotencyOptions>(
  async (app: FastifyInstance, opts) => {
    const ttl = opts.ttlSeconds ?? 24 * 3600;
    // Le hook global passe avant l'authentification de la route : on isole donc
    // les clés par empreinte du jeton, pour qu'un utilisateur ne rejoue jamais
    // la réponse d'un autre.
    const principal = (req: FastifyRequest) => {
      const h = req.headers.authorization ?? req.headers['x-api-key'] ?? 'anon';
      return createHash('sha256').update(String(h)).digest('base64url').slice(0, 22);
    };
    const scoped = (req: FastifyRequest, k: string) =>
      `idem:${principal(req)}:${req.method}:${req.routeOptions.url}:${k}`;

    app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
      const raw = req.headers['idempotency-key'];
      if (raw === undefined) return;
      if (typeof raw !== 'string' || !KEY.test(raw)) {
        throw HttpError.badRequest('Idempotency-Key invalide', 'invalid_idempotency_key');
      }
      const k = scoped(req, raw);
      const stored = await opts.cache.get<StoredResponse>(k);
      if (stored) {
        reply.header('idempotent-replayed', 'true');
        if (stored.contentType) reply.type(stored.contentType);
        return reply.code(stored.status).send(stored.body);
      }
      if (!(await opts.cache.acquire(k, 60))) {
        throw HttpError.conflict('Requête identique déjà en cours', 'idempotency_in_progress');
      }
      req.idempotencyKey = k;
    });

    app.addHook('onSend', async (req, reply, payload) => {
      const k = req.idempotencyKey;
      if (!k) return payload;
      // On ne mémorise que les réponses définitives (pas les 5xx, qu'on peut retenter)
      if (reply.statusCode < 500) {
        let body: unknown = payload;
        if (typeof payload === 'string') {
          try {
            body = JSON.parse(payload);
          } catch {
            body = payload;
          }
        }
        const contentType = reply.getHeader('content-type');
        await opts.cache.set<StoredResponse>(
          k,
          {
            status: reply.statusCode,
            body,
            contentType: typeof contentType === 'string' ? contentType : undefined,
          },
          { ttlSeconds: ttl },
        );
      }
      await opts.cache.release(k);
      return payload;
    });
  },
  { name: 'vtt-idempotency' },
);
