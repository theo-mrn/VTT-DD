/**
 * Refresh tokens opaques à rotation, avec détection de réutilisation.
 *
 * - Le jeton est aléatoire (256 bits) ; seul son SHA-256 est stocké : une fuite
 *   de la base ne donne aucun jeton utilisable.
 * - Chaque renouvellement consomme le jeton et en émet un nouveau dans la même
 *   « famille » (chaîne issue d'une même connexion).
 * - Un jeton déjà consommé qui revient signifie qu'il a été copié : on révoque
 *   toute la famille, l'attaquant comme l'utilisateur doivent se reconnecter.
 *
 * Le front doit donc sérialiser ses renouvellements (un seul à la fois, partagé
 * entre les onglets), sinon deux onglets déclencheraient une fausse alerte.
 */
import { createHash, randomBytes } from 'node:crypto';
import { uuidv7, uuidv7Timestamp } from '@vtt/contracts';

const JOUR_MS = 24 * 3600 * 1000;
/** Inactivité maximale : un jeton non utilisé pendant 30 jours expire. */
export const REFRESH_TOKEN_TTL_MS = 30 * JOUR_MS;
/** Durée maximale d'une famille, même utilisée tous les jours : reconnexion au bout de 180 jours. */
export const SESSION_FAMILY_MAX_MS = 180 * JOUR_MS;

/** Échéance glissante, plafonnée à 180 jours après la connexion (encodée dans l'UUIDv7 de la famille). */
function echeance(familyId: string, now: Date): Date {
  return new Date(
    Math.min(
      now.getTime() + REFRESH_TOKEN_TTL_MS,
      uuidv7Timestamp(familyId) + SESSION_FAMILY_MAX_MS,
    ),
  );
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export interface NewSession {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: Buffer;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

/** Opérations sur les sessions, exécutées dans une même transaction. */
export interface SessionTx {
  /** Lit la session par empreinte et la verrouille jusqu'à la fin de la transaction. */
  findByHashForUpdate(tokenHash: Buffer): Promise<SessionRecord | null>;
  insert(session: NewSession): Promise<void>;
  markRotated(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
}

export interface SessionStore {
  transaction<T>(fn: (tx: SessionTx) => Promise<T>): Promise<T>;
}

export interface ClientMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export function hashRefreshToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function nouveauJeton(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export interface IssuedRefresh {
  token: string;
  sessionId: string;
  familyId: string;
  expiresAt: Date;
}

/** Ouvre une famille de sessions (connexion). */
export async function startSession(
  store: SessionStore,
  userId: string,
  meta: ClientMeta = {},
  now: Date = new Date(),
): Promise<IssuedRefresh> {
  const { token, hash } = nouveauJeton();
  const familyId = uuidv7(now.getTime());
  const session: NewSession = {
    id: uuidv7(now.getTime()),
    userId,
    familyId,
    tokenHash: hash,
    expiresAt: echeance(familyId, now),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  };
  await store.transaction((tx) => tx.insert(session));
  return { token, sessionId: session.id, familyId: session.familyId, expiresAt: session.expiresAt };
}

export type RefreshOutcome =
  | ({ ok: true; userId: string } & IssuedRefresh)
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'reused' };

/** Échange un refresh token contre un nouveau (rotation). */
export async function rotateSession(
  store: SessionStore,
  token: string,
  meta: ClientMeta = {},
  now: Date = new Date(),
): Promise<RefreshOutcome> {
  return store.transaction(async (tx) => {
    const session = await tx.findByHashForUpdate(hashRefreshToken(token));
    if (!session) return { ok: false, reason: 'unknown' } as const;
    if (session.revokedAt) return { ok: false, reason: 'revoked' } as const;
    if (session.rotatedAt) {
      // Jeton déjà consommé : copié par un tiers. On coupe toute la chaîne.
      await tx.revokeFamily(session.familyId, now);
      return { ok: false, reason: 'reused' } as const;
    }
    if (session.expiresAt.getTime() <= now.getTime())
      return { ok: false, reason: 'expired' } as const;

    const { token: suivant, hash } = nouveauJeton();
    const nouvelle: NewSession = {
      id: uuidv7(now.getTime()),
      userId: session.userId,
      familyId: session.familyId,
      tokenHash: hash,
      expiresAt: echeance(session.familyId, now),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    };
    await tx.markRotated(session.id, now);
    await tx.insert(nouvelle);
    return {
      ok: true,
      userId: session.userId,
      token: suivant,
      sessionId: nouvelle.id,
      familyId: nouvelle.familyId,
      expiresAt: nouvelle.expiresAt,
    } as const;
  });
}

/** Déconnexion : révoque la famille du jeton présenté (cet appareil). */
export async function endSession(
  store: SessionStore,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  await store.transaction(async (tx) => {
    const session = await tx.findByHashForUpdate(hashRefreshToken(token));
    if (session) await tx.revokeFamily(session.familyId, now);
  });
}
