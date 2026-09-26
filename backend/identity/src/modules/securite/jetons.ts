/**
 * Jetons à usage unique envoyés par e-mail (réinitialisation du mot de passe,
 * vérification d'adresse) : logique pure, sans accès à la base.
 *
 * - Le jeton est aléatoire (256 bits, base64url) ; seul son SHA-256 est stocké.
 * - Il n'est valable qu'une fois, avant son échéance, et seulement pour
 *   l'adresse à laquelle il a été envoyé.
 */
import { createHash, randomBytes } from 'node:crypto';

const HEURE_MS = 3600 * 1000;

export type ObjetJeton = 'password_reset' | 'email_verification';

/** Durée de validité d'un lien, selon son objet. */
export const DUREE_JETON_MS: Record<ObjetJeton, number> = {
  password_reset: HEURE_MS,
  email_verification: 24 * HEURE_MS,
};

/** Page du front qui reçoit le jeton. */
const PAGE: Record<ObjetJeton, string> = {
  password_reset: '/reinitialisation',
  email_verification: '/verification-email',
};

export function empreinteJeton(jeton: string): Buffer {
  return createHash('sha256').update(jeton, 'utf8').digest();
}

export function nouveauJeton(): { jeton: string; empreinte: Buffer } {
  const jeton = randomBytes(32).toString('base64url');
  return { jeton, empreinte: empreinteJeton(jeton) };
}

export function echeanceJeton(objet: ObjetJeton, maintenant: Date = new Date()): Date {
  return new Date(maintenant.getTime() + DUREE_JETON_MS[objet]);
}

/** Lien envoyé par e-mail : {APP_URL}/<page>?jeton=<jeton>. */
export function lienJeton(appUrl: string, objet: ObjetJeton, jeton: string): string {
  return `${appUrl.replace(/\/+$/, '')}${PAGE[objet]}?jeton=${encodeURIComponent(jeton)}`;
}

export interface JetonStocke {
  /** Adresse à laquelle le lien a été envoyé. */
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Vrai si le jeton peut encore servir : jamais utilisé, non expiré, et
 * l'adresse actuelle du compte est toujours celle qui a reçu le lien.
 */
export function jetonUtilisable(
  jeton: JetonStocke,
  emailDuCompte: string | null,
  maintenant: Date = new Date(),
): boolean {
  if (jeton.usedAt) return false;
  if (jeton.expiresAt.getTime() <= maintenant.getTime()) return false;
  if (!emailDuCompte) return false;
  return emailDuCompte.toLowerCase() === jeton.email.toLowerCase();
}

/**
 * Attend que la réponse ait pris au moins `dureeMs` depuis `debut` : une
 * adresse inconnue répond dans le même temps qu'une adresse connue.
 */
export async function attendrePlancher(
  debut: number,
  dureeMs: number,
  maintenant: () => number = Date.now,
): Promise<void> {
  const reste = debut + dureeMs - maintenant();
  if (reste > 0) await new Promise((fin) => setTimeout(fin, reste));
}
