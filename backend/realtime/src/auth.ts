/**
 * Vérification du jeton du handshake Socket.IO (`auth.token`, sinon en-tête
 * Authorization) : exactement le contrôle des routes HTTP des services
 * (plugin `auth` de platform : signature via le JWKS d'identity, issuer,
 * audience, expiration). Le jeton n'est pas dans une requête HTTP ordinaire :
 * il est passé à `app.authenticate` dans une requête minimale.
 */
import type { AuthUser } from '@vtt/platform';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function verifyToken(
  app: Pick<FastifyInstance, 'authenticate' | 'log'>,
  token: string,
): Promise<AuthUser> {
  const req = {
    headers: { authorization: `Bearer ${token}` },
    ctx: {},
    log: app.log,
    user: undefined,
  } as unknown as FastifyRequest;
  await app.authenticate(req, undefined as unknown as FastifyReply);
  if (!req.user) throw new Error('jeton invalide');
  return req.user;
}

/** Jeton du handshake : `auth.token` (navigateur), sinon « Authorization: Bearer … » (client Node). */
export function handshakeToken(handshake: {
  auth: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
  const header = handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim() || undefined;
  }
  return undefined;
}
