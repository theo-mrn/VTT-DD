/**
 * Accès à la base du module « securite » : sessions, mots de passe, jetons
 * envoyés par e-mail, suppression du compte.
 *
 * Chaque changement d'état écrit son événement dans l'outbox, dans la même
 * transaction. Les événements ne contiennent jamais d'e-mail, de hash ni de jeton.
 */
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { credentials, emailTokens, sessions, users } from '../../db/schema.js';
import type { StoredPassword } from '../../passwords/passwords.js';
import { hashRefreshToken } from '../../tokens/refresh.js';
import { jetonUtilisable, type ObjetJeton } from './jetons.js';

const acteur = (userId: string) => ({ userId, role: 'user' as const, characterId: null });
const compte = (userId: string) => ({ type: 'user', id: userId });

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export interface FamilleActive {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  userAgent: string | null;
  ip: string | null;
}

/**
 * Une entrée par famille active : son dernier jeton n'est ni consommé, ni
 * révoqué, ni expiré. Début = première session, dernière utilisation = la plus
 * récente ; appareil et IP sont ceux de la dernière session.
 */
export async function listerFamilles(db: Db, userId: string): Promise<FamilleActive[]> {
  return db
    .select({
      id: sessions.familyId,
      createdAt: sql<Date>`min(${sessions.createdAt})`.mapWith(sessions.createdAt),
      lastUsedAt: sql<Date>`max(${sessions.createdAt})`.mapWith(sessions.createdAt),
      userAgent: sql<
        string | null
      >`(array_agg(${sessions.userAgent} ORDER BY ${sessions.createdAt} DESC))[1]`,
      ip: sql<
        string | null
      >`host((array_agg(${sessions.ip} ORDER BY ${sessions.createdAt} DESC))[1])`,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .groupBy(sessions.familyId)
    .having(
      sql`bool_or(${sessions.rotatedAt} IS NULL AND ${sessions.revokedAt} IS NULL AND ${sessions.expiresAt} > now())`,
    )
    .orderBy(desc(sql`max(${sessions.createdAt})`));
}

/** Famille du refresh token présenté, s'il appartient bien à cet utilisateur. */
export async function familleDuJeton(
  db: Db,
  userId: string,
  jeton: string | undefined,
): Promise<string | null> {
  if (!jeton) return null;
  const [ligne] = await db
    .select({ familyId: sessions.familyId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashRefreshToken(jeton)), eq(sessions.userId, userId)))
    .limit(1);
  return ligne?.familyId ?? null;
}

/** Révoque les sessions de l'utilisateur (sauf une famille) ; renvoie le nombre de familles touchées. */
async function revoquer(tx: Tx, userId: string, sauf: string | null = null): Promise<number> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (sauf) conditions.push(ne(sessions.familyId, sauf));
  const lignes = await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ familyId: sessions.familyId });
  return new Set(lignes.map((l) => l.familyId)).size;
}

/** Révoque une famille de l'utilisateur ; faux si elle n'existe pas, est déjà révoquée ou appartient à un autre. */
export async function revoquerFamille(
  db: Db,
  ctx: EventContext,
  userId: string,
  familyId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const lignes = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.familyId, familyId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });
    if (lignes.length === 0) return false;
    await appendEvent(tx, ctx, {
      type: 'identity.session_revoked',
      actor: acteur(userId),
      aggregate: compte(userId),
      payload: { familyId },
    });
    return true;
  });
}

/** Déconnexion de tous les appareils. */
export async function revoquerToutes(db: Db, ctx: EventContext, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const familles = await revoquer(tx, userId);
    await appendEvent(tx, ctx, {
      type: 'identity.sessions_revoked',
      actor: acteur(userId),
      aggregate: compte(userId),
      payload: { reason: 'logout_all', families: familles },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Mots de passe                                                       */
/* ------------------------------------------------------------------ */

/** Mot de passe stocké du compte, ou null (compte Google/Discord seul). */
export async function lireMotDePasse(db: Db, userId: string): Promise<StoredPassword | null> {
  const [ligne] = await db
    .select({ algorithm: credentials.algorithm, hash: credentials.hash, salt: credentials.salt })
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  if (!ligne) return null;
  if (ligne.algorithm === 'argon2id') return { algorithm: 'argon2id', hash: ligne.hash };
  if (ligne.salt) return { algorithm: 'firebase-scrypt', hash: ligne.hash, salt: ligne.salt };
  return null;
}

async function ecrireMotDePasse(
  tx: Tx,
  userId: string,
  motDePasse: StoredPassword & { algorithm: 'argon2id' },
): Promise<void> {
  const valeurs = {
    algorithm: 'argon2id' as const,
    hash: motDePasse.hash,
    salt: null,
    updatedAt: new Date(),
  };
  await tx
    .insert(credentials)
    .values({ userId, ...valeurs })
    .onConflictDoUpdate({ target: credentials.userId, set: valeurs });
}

/**
 * Changement de mot de passe par l'utilisateur connecté : les autres appareils
 * sont déconnectés, la famille de l'appareil courant est conservée.
 */
export async function changerMotDePasse(
  db: Db,
  ctx: EventContext,
  userId: string,
  motDePasse: StoredPassword & { algorithm: 'argon2id' },
  familleConservee: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ecrireMotDePasse(tx, userId, motDePasse);
    const familles = await revoquer(tx, userId, familleConservee);
    await appendEvent(tx, ctx, {
      type: 'identity.password_changed',
      actor: acteur(userId),
      aggregate: compte(userId),
      payload: { algorithm: 'argon2id', revokedFamilies: familles },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Jetons envoyés par e-mail                                           */
/* ------------------------------------------------------------------ */

/** Remplace les jetons encore valables du même objet par un nouveau. */
async function emettreJeton(
  tx: Tx,
  params: {
    userId: string;
    objet: ObjetJeton;
    email: string;
    empreinte: Buffer;
    echeance: Date;
  },
): Promise<void> {
  await tx
    .delete(emailTokens)
    .where(
      and(
        eq(emailTokens.userId, params.userId),
        eq(emailTokens.purpose, params.objet),
        isNull(emailTokens.usedAt),
      ),
    );
  await tx.insert(emailTokens).values({
    tokenHash: params.empreinte,
    userId: params.userId,
    purpose: params.objet,
    email: params.email,
    expiresAt: params.echeance,
  });
}

/**
 * Demande de réinitialisation : null si aucun compte actif ne porte cette
 * adresse (l'appelant répond de la même façon dans les deux cas).
 */
export async function demanderReinitialisation(
  db: Db,
  ctx: EventContext,
  email: string,
  jeton: { empreinte: Buffer; echeance: Date },
): Promise<{ userId: string; email: string } | null> {
  const [cible] = await db
    .select({ id: users.id, email: users.email, disabledAt: users.disabledAt })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  if (!cible?.email || cible.disabledAt) return null;
  const adresse = cible.email;

  await db.transaction(async (tx) => {
    await emettreJeton(tx, {
      userId: cible.id,
      objet: 'password_reset',
      email: adresse,
      ...jeton,
    });
    await appendEvent(tx, ctx, {
      type: 'identity.password_reset_requested',
      actor: acteur(cible.id),
      aggregate: compte(cible.id),
      payload: { expiresAt: jeton.echeance.toISOString() },
    });
  });
  return { userId: cible.id, email: adresse };
}

/** Lit et verrouille un jeton ; null s'il n'est pas (ou plus) utilisable. */
async function consommerJeton(
  tx: Tx,
  objet: ObjetJeton,
  empreinte: Buffer,
): Promise<{ userId: string } | null> {
  // Verrou sur le jeton seul (FOR UPDATE OF refuse les noms qualifiés par le schéma)
  const [ligne] = await tx
    .select({
      userId: emailTokens.userId,
      email: emailTokens.email,
      expiresAt: emailTokens.expiresAt,
      usedAt: emailTokens.usedAt,
    })
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, empreinte), eq(emailTokens.purpose, objet)))
    .for('update')
    .limit(1);
  if (!ligne) return null;
  const [titulaire] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ligne.userId))
    .limit(1);
  if (!jetonUtilisable(ligne, titulaire?.email ?? null)) return null;

  const maintenant = new Date();
  await tx
    .update(emailTokens)
    .set({ usedAt: maintenant })
    .where(eq(emailTokens.tokenHash, empreinte));
  // Les autres liens du même objet deviennent inutiles
  await tx
    .delete(emailTokens)
    .where(
      and(
        eq(emailTokens.userId, ligne.userId),
        eq(emailTokens.purpose, objet),
        isNull(emailTokens.usedAt),
      ),
    );
  return { userId: ligne.userId };
}

/**
 * Nouveau mot de passe par lien reçu par e-mail : crée ou remplace le mot de
 * passe et déconnecte tous les appareils. Faux si le jeton est invalide.
 */
export async function reinitialiserMotDePasse(
  db: Db,
  ctx: EventContext,
  empreinte: Buffer,
  motDePasse: StoredPassword & { algorithm: 'argon2id' },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const jeton = await consommerJeton(tx, 'password_reset', empreinte);
    if (!jeton) return false;
    await ecrireMotDePasse(tx, jeton.userId, motDePasse);
    const familles = await revoquer(tx, jeton.userId);
    await appendEvent(tx, ctx, {
      type: 'identity.password_reset',
      actor: acteur(jeton.userId),
      aggregate: compte(jeton.userId),
      payload: { algorithm: 'argon2id', revokedFamilies: familles },
    });
    return true;
  });
}

export type DemandeVerification =
  | { ok: true; email: string }
  | { ok: false; raison: 'sans_email' | 'deja_verifie' | 'introuvable' };

export async function demanderVerification(
  db: Db,
  ctx: EventContext,
  userId: string,
  jeton: { empreinte: Buffer; echeance: Date },
): Promise<DemandeVerification> {
  return db.transaction(async (tx) => {
    const [cible] = await tx
      .select({ email: users.email, verifie: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
      .limit(1);
    if (!cible) return { ok: false, raison: 'introuvable' } as const;
    if (!cible.email) return { ok: false, raison: 'sans_email' } as const;
    if (cible.verifie) return { ok: false, raison: 'deja_verifie' } as const;

    await emettreJeton(tx, { userId, objet: 'email_verification', email: cible.email, ...jeton });
    await appendEvent(tx, ctx, {
      type: 'identity.email_verification_requested',
      actor: acteur(userId),
      aggregate: compte(userId),
      payload: { expiresAt: jeton.echeance.toISOString() },
    });
    return { ok: true, email: cible.email } as const;
  });
}

/** Confirme l'adresse du compte ; faux si le jeton est invalide. */
export async function verifierEmail(
  db: Db,
  ctx: EventContext,
  empreinte: Buffer,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const jeton = await consommerJeton(tx, 'email_verification', empreinte);
    if (!jeton) return false;
    await tx
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, jeton.userId));
    await appendEvent(tx, ctx, {
      type: 'identity.email_verified',
      actor: acteur(jeton.userId),
      aggregate: compte(jeton.userId),
      payload: {},
    });
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Suppression du compte                                               */
/* ------------------------------------------------------------------ */

/**
 * Supprime le compte et, en cascade, ses profils, identifiants, sessions,
 * jetons, amis, titres et clés. L'événement est écrit avant la suppression,
 * dans la même transaction.
 */
export async function supprimerCompte(db: Db, ctx: EventContext, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [cible] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
      .limit(1);
    if (!cible) return false;
    await appendEvent(tx, ctx, {
      type: 'identity.user_deleted',
      actor: acteur(userId),
      aggregate: compte(userId),
      payload: {},
    });
    await tx.delete(users).where(eq(users.id, userId));
    return true;
  });
}
