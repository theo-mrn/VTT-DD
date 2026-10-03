/**
 * Compte associé à une identité Google ou Discord :
 *
 * 1. déjà rattaché (oauth_accounts) : on le reprend ;
 * 2. sinon, un compte existe avec la même adresse, et le fournisseur l'a
 *    vérifiée : on rattache l'identité à ce compte (identity.oauth_linked) ;
 * 3. sinon, on crée un compte (identity.user_registered). Si l'adresse est
 *    déjà prise, le compte est créé sans e-mail : jamais de rattachement sur
 *    une adresse non vérifiée par le fournisseur.
 *
 * Chaque écriture et son événement partagent la même transaction. Les
 * événements ne contiennent ni e-mail ni identifiant du fournisseur.
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { credentials, oauthAccounts, profiles, sessions, users } from '../../db/schema.js';
import type { Fournisseur } from './etat.js';
import type { ProfilFournisseur } from './fournisseurs.js';

export interface CompteResolu {
  userId: string;
  disabled: boolean;
  /** Ce qui s'est passé : reprise, rattachement ou création. */
  issue: 'existant' | 'rattache' | 'cree';
}

const NOM_PAR_DEFAUT = 'Aventurier';

/** Même règle que la contrainte users_email_format, plus la syntaxe d'e-mail de Zod. */
const Email = z.email().max(254);

/** Adresse exploitable, ou null. */
export function emailValide(brut: string | null): string | null {
  if (!brut) return null;
  const email = brut.trim();
  return Email.safeParse(email).success && /^[^@\s]+@[^@\s]+$/.test(email) ? email : null;
}

/** Nom d'affichage : 1 à 64 caractères (contrainte profiles_name_length), sans contrôle. */
export function nomAffichable(brut: string | null): string {
  const propre = (brut ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // char_length de PostgreSQL compte les points de code, pas les unités UTF-16
  const nom = Array.from(propre).slice(0, 64).join('').trim();
  return nom || NOM_PAR_DEFAUT;
}

function estViolationUnicite(err: unknown): boolean {
  const e = (err as { cause?: unknown })?.cause ?? err;
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

const acteur = (userId: string) => ({ userId, role: 'user' as const, characterId: null });

/** 1. Identité déjà rattachée à un compte, s'il y en a un. */
async function identiteRattachee(
  tx: Tx,
  fournisseur: Fournisseur,
  profil: ProfilFournisseur,
): Promise<CompteResolu | null> {
  const [lien] = await tx
    .select({ userId: users.id, disabledAt: users.disabledAt })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(
      and(
        eq(oauthAccounts.provider, fournisseur),
        eq(oauthAccounts.providerAccountId, profil.providerAccountId),
      ),
    )
    .limit(1);
  if (!lien) return null;
  return { userId: lien.userId, disabled: lien.disabledAt !== null, issue: 'existant' };
}

/**
 * Adresse jamais prouvée sur ce compte : quelqu'un a pu l'inscrire avec l'adresse d'autrui
 * et un mot de passe à lui (pré-appropriation). Le fournisseur vient de prouver l'adresse :
 * on retire ce mot de passe et les sessions ouvertes avec lui. Le vrai titulaire peut en
 * redéfinir un par « mot de passe oublié ». Vrai si un mot de passe a été retiré.
 */
async function prouverAdresse(tx: Tx, userId: string): Promise<boolean> {
  const retires = await tx
    .delete(credentials)
    .where(eq(credentials.userId, userId))
    .returning({ userId: credentials.userId });
  const motDePasseRetire = retires.length > 0;
  if (motDePasseRetire) {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
  await tx
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return motDePasseRetire;
}

/**
 * 2. Rattachement à un compte de même adresse (vérifiée par le fournisseur) ; null si aucun
 * compte n'a cette adresse.
 */
async function rattacherParEmail(
  tx: Tx,
  ctx: EventContext,
  fournisseur: Fournisseur,
  profil: ProfilFournisseur,
  email: string,
): Promise<CompteResolu | null> {
  const [existant] = await tx
    .select({
      userId: users.id,
      disabledAt: users.disabledAt,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1)
    .for('update');
  if (!existant) return null;
  // Compte désactivé : on ne rattache rien, la connexion sera refusée
  if (existant.disabledAt) return { userId: existant.userId, disabled: true, issue: 'existant' };

  await tx.insert(oauthAccounts).values({
    provider: fournisseur,
    providerAccountId: profil.providerAccountId,
    userId: existant.userId,
    email,
  });
  const motDePasseRetire = existant.emailVerified
    ? false
    : await prouverAdresse(tx, existant.userId);

  await appendEvent(tx, ctx, {
    type: 'identity.oauth_linked',
    actor: acteur(existant.userId),
    aggregate: { type: 'user', id: existant.userId },
    payload: {
      provider: fournisseur,
      emailVerified: true,
      ...(motDePasseRetire ? { passwordRemoved: true } : {}),
    },
  });
  return { userId: existant.userId, disabled: false, issue: 'rattache' };
}

/** 3. Nouveau compte ; l'adresse n'est gardée que si personne ne l'utilise. */
async function creerCompte(
  tx: Tx,
  ctx: EventContext,
  fournisseur: Fournisseur,
  profil: ProfilFournisseur,
  email: string | null,
): Promise<CompteResolu> {
  let emailCompte: string | null = null;
  if (email) {
    const [pris] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    if (!pris) emailCompte = email;
  }

  const userId = uuidv7();
  await tx.insert(users).values({
    id: userId,
    email: emailCompte,
    emailVerified: emailCompte !== null && profil.emailVerified,
  });
  await tx.insert(profiles).values({
    userId,
    name: nomAffichable(profil.name),
    avatarUrl: profil.avatarUrl,
  });
  await tx.insert(oauthAccounts).values({
    provider: fournisseur,
    providerAccountId: profil.providerAccountId,
    userId,
    email,
  });
  await appendEvent(tx, ctx, {
    type: 'identity.user_registered',
    actor: acteur(userId),
    aggregate: { type: 'user', id: userId },
    payload: { method: fournisseur },
  });
  return { userId, disabled: false, issue: 'cree' };
}

async function tenter(
  tx: Tx,
  ctx: EventContext,
  fournisseur: Fournisseur,
  profil: ProfilFournisseur,
): Promise<CompteResolu> {
  const lien = await identiteRattachee(tx, fournisseur, profil);
  if (lien) return lien;

  const email = emailValide(profil.email);
  // Rattachement par e-mail, seulement si le fournisseur a vérifié l'adresse
  if (email && profil.emailVerified) {
    const rattache = await rattacherParEmail(tx, ctx, fournisseur, profil, email);
    if (rattache) return rattache;
  }
  return creerCompte(tx, ctx, fournisseur, profil, email);
}

/**
 * Retrouve, rattache ou crée le compte. Une violation d'unicité (deux retours
 * simultanés, adresse prise entre la lecture et l'écriture) relance une fois
 * la résolution complète : la seconde passe voit la ligne concurrente.
 */
export async function resoudreCompte(
  db: Db,
  ctx: EventContext,
  fournisseur: Fournisseur,
  profil: ProfilFournisseur,
): Promise<CompteResolu> {
  for (let essai = 1; ; essai++) {
    try {
      return await db.transaction((tx) => tenter(tx, ctx, fournisseur, profil));
    } catch (err) {
      if (essai < 2 && estViolationUnicite(err)) continue;
      throw err;
    }
  }
}

/** Trace de la connexion réussie, comme pour le mot de passe. */
export async function journaliserConnexion(
  db: Db,
  ctx: EventContext,
  fournisseur: Fournisseur,
  userId: string,
): Promise<void> {
  await db.transaction((tx) =>
    appendEvent(tx, ctx, {
      type: 'identity.user_logged_in',
      actor: acteur(userId),
      aggregate: { type: 'user', id: userId },
      payload: { method: fournisseur },
    }),
  );
}
