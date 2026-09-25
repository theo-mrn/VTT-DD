/**
 * Comptes : création, lecture pour la connexion, remplacement du hash.
 * Chaque changement d'état écrit son événement dans l'outbox, dans la même
 * transaction. Les événements ne contiennent jamais d'e-mail ni de hash.
 */
import { uuidv7 } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { StoredPassword } from '../passwords/passwords.js';
import type { Db } from './client.js';
import { appendEvent, type EventContext } from './outbox.js';
import { credentials, profiles, users } from './schema.js';

export class EmailAlreadyUsed extends Error {
  constructor() {
    super('E-mail déjà utilisé');
    this.name = 'EmailAlreadyUsed';
  }
}

function estViolationUnicite(err: unknown, contrainte: string): boolean {
  // Drizzle enveloppe l'erreur du pilote pg dans `cause`
  const e = (err as { cause?: unknown })?.cause ?? err;
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === '23505' &&
    (e as { constraint?: string }).constraint === contrainte
  );
}

export async function createPasswordAccount(
  db: Db,
  ctx: EventContext,
  params: { email: string; name: string; password: StoredPassword },
): Promise<string> {
  const userId = uuidv7();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: userId, email: params.email });
      await tx.insert(profiles).values({ userId, name: params.name });
      await tx.insert(credentials).values({
        userId,
        algorithm: params.password.algorithm,
        hash: params.password.hash,
        salt: params.password.algorithm === 'firebase-scrypt' ? params.password.salt : null,
      });
      await appendEvent(tx, ctx, {
        type: 'identity.user_registered',
        actor: { userId, role: 'user', characterId: null },
        aggregate: { type: 'user', id: userId },
        payload: { method: 'password' },
      });
    });
  } catch (err) {
    if (estViolationUnicite(err, 'users_email_unique')) throw new EmailAlreadyUsed();
    throw err;
  }
  return userId;
}

export interface LoginRecord {
  userId: string;
  disabled: boolean;
  password: StoredPassword | null;
}

/** Compte et mot de passe stocké, par e-mail (insensible à la casse). */
export async function findLoginByEmail(db: Db, email: string): Promise<LoginRecord | null> {
  const [ligne] = await db
    .select({
      userId: users.id,
      disabledAt: users.disabledAt,
      algorithm: credentials.algorithm,
      hash: credentials.hash,
      salt: credentials.salt,
    })
    .from(users)
    .leftJoin(credentials, eq(credentials.userId, users.id))
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  if (!ligne) return null;

  let password: StoredPassword | null = null;
  if (ligne.algorithm === 'argon2id' && ligne.hash) {
    password = { algorithm: 'argon2id', hash: ligne.hash };
  } else if (ligne.algorithm === 'firebase-scrypt' && ligne.hash && ligne.salt) {
    password = { algorithm: 'firebase-scrypt', hash: ligne.hash, salt: ligne.salt };
  }
  return { userId: ligne.userId, disabled: ligne.disabledAt !== null, password };
}

/**
 * Remplace le hash d'un compte (passage d'un hash Firebase à argon2id après
 * une connexion réussie, ou changement de mot de passe).
 */
export async function replacePassword(
  db: Db,
  ctx: EventContext,
  userId: string,
  password: StoredPassword & { algorithm: 'argon2id' },
  reason: 'rehash' | 'changed',
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(credentials)
      .set({ algorithm: 'argon2id', hash: password.hash, salt: null, updatedAt: new Date() })
      .where(eq(credentials.userId, userId));
    await appendEvent(tx, ctx, {
      type: reason === 'rehash' ? 'identity.password_rehashed' : 'identity.password_changed',
      actor: { userId, role: reason === 'rehash' ? 'system' : 'user', characterId: null },
      aggregate: { type: 'user', id: userId },
      payload: { algorithm: 'argon2id' },
    });
  });
}

export interface Profile {
  userId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  bannerUrl: string | null;
  borderType: string;
  showPremiumBadge: boolean;
  timeSpentMinutes: number;
}

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const [ligne] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      title: profiles.title,
      bio: profiles.bio,
      bannerUrl: profiles.bannerUrl,
      borderType: profiles.borderType,
      showPremiumBadge: profiles.showPremiumBadge,
      timeSpentMinutes: profiles.timeSpentMinutes,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return ligne ?? null;
}
