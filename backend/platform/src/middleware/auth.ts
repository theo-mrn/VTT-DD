import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { HttpError } from './error-handler.js';

export interface AuthUser {
  userId: string;
  roles: string[];
  /** Salles et rôle dans chacune, si le jeton les porte (claim `rooms`). */
  rooms: Record<string, 'gm' | 'player'>;
  claims: JWTPayload;
}

export interface AuthOptions {
  issuer: string;
  audience: string;
  /** URL du JWKS publié par identity, ou résolveur de clé (tests). */
  jwksUrl?: string;
  keyResolver?: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    /** preHandler : exige un JWT valide. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler : exige le rôle MJ dans la salle `params.roomId`. */
    requireRoomRole: (
      role: 'gm' | 'player',
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return undefined;
  return h.slice(7).trim() || undefined;
}

/**
 * Vérifie les JWT émis par identity (signature asymétrique via JWKS, issuer,
 * audience, expiration). Les clés sont mises en cache par `jose` et
 * rafraîchies automatiquement lors d'une rotation.
 */
export const auth = fp<AuthOptions>(
  async (app: FastifyInstance, opts) => {
    const key: JWTVerifyGetKey | undefined =
      opts.keyResolver ?? (opts.jwksUrl ? createRemoteJWKSet(new URL(opts.jwksUrl)) : undefined);
    if (!key) throw new Error('auth : jwksUrl ou keyResolver requis');

    app.decorateRequest('user', undefined);

    app.decorate('authenticate', async (req: FastifyRequest) => {
      const token = bearer(req);
      if (!token) throw HttpError.unauthorized('Jeton Bearer manquant');
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: opts.issuer,
          audience: opts.audience,
          algorithms: ['EdDSA', 'ES256', 'RS256'],
          clockTolerance: opts.clockToleranceSeconds ?? 5,
        });
        if (!payload.sub) throw new Error('sub manquant');
        req.user = {
          userId: payload.sub,
          roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
          rooms: (payload.rooms as AuthUser['rooms']) ?? {},
          claims: payload,
        };
        req.ctx.userId = payload.sub;
      } catch (err) {
        req.log.info({ reason: (err as Error).message }, 'jwt rejected');
        throw HttpError.unauthorized('Jeton invalide ou expiré');
      }
    });

    app.decorate('requireRoomRole', (role: 'gm' | 'player') => {
      return async (req: FastifyRequest) => {
        const roomId = (req.params as { roomId?: string } | undefined)?.roomId;
        const actual = roomId ? req.user?.rooms[roomId] : undefined;
        if (!req.user) throw HttpError.unauthorized();
        if (!roomId || !actual) throw HttpError.forbidden("Vous n'êtes pas membre de cette salle");
        if (role === 'gm' && actual !== 'gm') throw HttpError.forbidden('Réservé au MJ');
        req.ctx.roomId = roomId;
      };
    });
  },
  { name: 'vtt-auth', dependencies: ['vtt-request-context'] },
);
