/**
 * Jetons d'accès (JWT) signés en EdDSA (Ed25519), vérifiés par tous les
 * services via le JWKS publié par identity (middleware `auth` de @vtt/platform).
 *
 * Rotation des clés sans coupure : la première clé de la liste signe, toutes
 * sont publiées dans le JWKS. Pour tourner : ajouter la nouvelle clé en tête,
 * attendre la durée de vie d'un jeton, puis retirer l'ancienne.
 */
import { randomUUID } from 'node:crypto';
import { exportJWK, importJWK, SignJWT, type JWK } from 'jose';

/** Durée de vie d'un jeton d'accès : courte, le refresh token prend le relais. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessClaims {
  userId: string;
  roles: string[];
  /** Rôle dans chaque salle, lu par `requireRoomRole` des services. */
  rooms: Record<string, 'gm' | 'player'>;
}

interface CleSignature {
  kid: string;
  privee: Awaited<ReturnType<typeof importJWK>>;
  publique: JWK;
}

export interface JwtSigner {
  sign(claims: AccessClaims, now?: Date): Promise<string>;
  /** Clés publiques uniquement, pour GET /.well-known/jwks.json. */
  jwks(): { keys: JWK[] };
}

/**
 * @param privateJwks Clés privées Ed25519 au format JWK, chacune avec un `kid`.
 *                    La première signe. Viennent d'un Secret k8s, jamais du dépôt.
 */
export async function createJwtSigner(opts: {
  privateJwks: JWK[];
  issuer: string;
  audience: string;
}): Promise<JwtSigner> {
  if (opts.privateJwks.length === 0) throw new Error('Aucune clé de signature JWT configurée');

  const cles: CleSignature[] = await Promise.all(
    opts.privateJwks.map(async (jwk) => {
      if (!jwk.kid) throw new Error('Chaque clé JWT doit avoir un kid');
      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d) {
        throw new Error(`Clé ${jwk.kid} : une clé privée Ed25519 (OKP) est attendue`);
      }
      const privee = await importJWK(jwk, 'EdDSA');
      // Clé publique : on ne garde que les champs publics, jamais `d`
      const publique: JWK = {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        kid: jwk.kid,
        alg: 'EdDSA',
        use: 'sig',
      };
      return { kid: jwk.kid, privee, publique };
    }),
  );
  const active = cles[0]!;

  return {
    async sign(claims, now = new Date()) {
      const iat = Math.floor(now.getTime() / 1000);
      return new SignJWT({ roles: claims.roles, rooms: claims.rooms })
        .setProtectedHeader({ alg: 'EdDSA', kid: active.kid, typ: 'JWT' })
        .setSubject(claims.userId)
        .setIssuer(opts.issuer)
        .setAudience(opts.audience)
        .setIssuedAt(iat)
        .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
        .setJti(randomUUID())
        .sign(active.privee);
    },
    jwks() {
      return { keys: cles.map((c) => c.publique) };
    },
  };
}

/** Génère une clé privée Ed25519 au format JWK (outil d'amorçage et tests). */
export async function generateSigningJwk(kid: string): Promise<JWK> {
  const { generateKeyPair } = await import('jose');
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  return { ...(await exportJWK(privateKey)), kid, alg: 'EdDSA' };
}
