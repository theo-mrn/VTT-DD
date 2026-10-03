/**
 * Jeton de liaison Discord (docs/discord.md) : remis par le bot (`/link`) au seul joueur qui l'a
 * demandé, il porte son identifiant Discord, signé par identity, valable 10 minutes. Le joueur
 * l'ouvre sur le site, connecté à son compte (quel que soit son moyen de connexion), et lie ainsi
 * son identité Discord à ce compte, sans passer par la connexion Discord.
 *
 * Clé HMAC dérivée (HKDF) de la clé privée JWT : aucune configuration en plus. Pas de registre des
 * jetons utilisés : un identifiant Discord ne se lie qu'à un compte (clé primaire), le premier qui
 * l'utilise l'emporte, et seul le joueur Discord a vu le jeton.
 */
import { hkdfSync } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const LINK_TOKEN_TTL_SECONDS = 10 * 60;
const AUDIENCE = 'discord-link';

export function deriveLinkKey(secret: string): Uint8Array {
  if (!secret) throw new Error('Secret absent pour dériver la clé des jetons de liaison Discord');
  return new Uint8Array(hkdfSync('sha256', secret, 'vtt-identity', 'discord-link-token-v1', 32));
}

const Claims = z.object({
  sub: z.string().regex(/^\d{1,32}$/),
  name: z.string().max(100).optional(),
});
export type LinkClaims = { discordUserId: string; discordName: string | null };

export async function signLinkToken(
  key: Uint8Array,
  discordUserId: string,
  discordName: string | null,
): Promise<string> {
  return new SignJWT(discordName ? { name: discordName.slice(0, 100) } : {})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(discordUserId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${LINK_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

/** Revendications d'un jeton valide (signature, audience, échéance), ou null. */
export async function verifyLinkToken(key: Uint8Array, token: string): Promise<LinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ['HS256'] });
    const claims = Claims.safeParse(payload);
    return claims.success
      ? { discordUserId: claims.data.sub, discordName: claims.data.name ?? null }
      : null;
  } catch {
    return null;
  }
}
