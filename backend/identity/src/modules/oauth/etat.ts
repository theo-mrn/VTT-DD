/**
 * État d'un parcours OAuth, conservé dans un cookie httpOnly signé entre le
 * départ (/start) et le retour du fournisseur (/callback) : state, code_verifier
 * PKCE, nonce OpenID et chemin de retour. Aucune donnée n'est stockée en base.
 *
 * La signature HMAC-SHA256 empêche le navigateur (ou un tiers) de fabriquer un
 * état ; l'expiration est portée dans le contenu signé, pas seulement par le
 * navigateur.
 */
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const OAUTH_COOKIE = 'vtt_oauth';
export const OAUTH_COOKIE_PATH = '/v1/auth/oauth';
/** Durée de vie d'un parcours : au-delà, l'utilisateur recommence. */
export const OAUTH_TTL_SECONDS = 10 * 60;

export const FOURNISSEURS = ['google', 'discord'] as const;
export type Fournisseur = (typeof FOURNISSEURS)[number];

export const EtatOAuth = z.object({
  fournisseur: z.enum(FOURNISSEURS),
  state: z.string().min(32).max(128),
  codeVerifier: z.string().min(43).max(128),
  nonce: z.string().min(32).max(128),
  retour: z.string().min(1).max(2048),
  /** Échéance en secondes depuis l'époque Unix. */
  expire: z.number().int().positive(),
});
export type EtatOAuth = z.infer<typeof EtatOAuth>;

/**
 * Clé HMAC du cookie, dérivée (HKDF) d'un secret déjà présent : la clé privée
 * de signature JWT. Aucune configuration supplémentaire ; une rotation de la
 * clé JWT invalide seulement les parcours OAuth en cours (10 min au plus).
 */
export function deriverCleEtat(secret: string): Buffer {
  if (!secret) throw new Error('Secret absent pour dériver la clé du cookie OAuth');
  return Buffer.from(hkdfSync('sha256', secret, 'vtt-identity', 'oauth-state-cookie-v1', 32));
}

const aleatoire = () => randomBytes(32).toString('base64url');

/** Nouveau parcours : valeurs aléatoires de 256 bits. */
export function nouvelEtat(
  fournisseur: Fournisseur,
  retour: string,
  maintenant: Date = new Date(),
): EtatOAuth {
  return {
    fournisseur,
    state: aleatoire(),
    codeVerifier: aleatoire(),
    nonce: aleatoire(),
    retour,
    expire: Math.floor(maintenant.getTime() / 1000) + OAUTH_TTL_SECONDS,
  };
}

/** code_challenge PKCE (méthode S256) du code_verifier. */
export function defiPkce(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

const mac = (cle: Buffer, contenu: string) =>
  createHmac('sha256', cle).update(contenu, 'ascii').digest('base64url');

/** Valeur du cookie : contenu JSON en base64url, point, HMAC du contenu. */
export function scellerEtat(cle: Buffer, etat: EtatOAuth): string {
  const contenu = Buffer.from(JSON.stringify(etat), 'utf8').toString('base64url');
  return `${contenu}.${mac(cle, contenu)}`;
}

export type LectureEtat =
  | { ok: true; etat: EtatOAuth }
  | { ok: false; raison: 'absent' | 'signature' | 'format' | 'expire' };

/** Vérifie la signature puis l'échéance ; ne lève jamais. */
export function ouvrirEtat(
  cle: Buffer,
  valeur: string | undefined,
  maintenant: Date = new Date(),
): LectureEtat {
  if (!valeur) return { ok: false, raison: 'absent' };
  if (valeur.length > 4096) return { ok: false, raison: 'format' };
  const point = valeur.indexOf('.');
  if (point <= 0) return { ok: false, raison: 'format' };
  const contenu = valeur.slice(0, point);
  const signature = Buffer.from(valeur.slice(point + 1), 'utf8');
  const attendue = Buffer.from(mac(cle, contenu), 'utf8');
  if (signature.length !== attendue.length || !timingSafeEqual(signature, attendue)) {
    return { ok: false, raison: 'signature' };
  }

  let brut: unknown;
  try {
    brut = JSON.parse(Buffer.from(contenu, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, raison: 'format' };
  }
  const lu = EtatOAuth.safeParse(brut);
  if (!lu.success) return { ok: false, raison: 'format' };
  if (lu.data.expire <= Math.floor(maintenant.getTime() / 1000)) {
    return { ok: false, raison: 'expire' };
  }
  return { ok: true, etat: lu.data };
}

/** Comparaison à temps constant de deux chaînes (state reçu et attendu). */
export function egalesSecretes(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Chemin de retour après connexion : uniquement un chemin relatif du front.
 * Tout le reste (URL absolue, « //hôte », « /\hôte », caractères de contrôle
 * que les navigateurs ignorent, antislash) devient « / » : pas de redirection
 * ouverte.
 */
export function cheminDeRetour(brut: unknown): string {
  if (typeof brut !== 'string' || brut.length === 0 || brut.length > 2048) return '/';
  if (!brut.startsWith('/') || brut.startsWith('//')) return '/';
  // Antislash (normalisé en « / » par les navigateurs), contrôles, espaces
  if (/[\\\u0000- \u007f]/.test(brut)) return '/';
  // Ceinture et bretelles : le chemin résolu doit rester sur une origine fixe
  try {
    const url = new URL(brut, 'http://retour.invalid');
    if (url.origin !== 'http://retour.invalid') return '/';
  } catch {
    return '/';
  }
  return brut;
}

/** URL absolue du front pour un chemin déjà validé (APP_URL sans « / » final). */
export function urlDuFront(appUrl: string, chemin: string): string {
  return `${appUrl.replace(/\/+$/, '')}${chemin}`;
}
