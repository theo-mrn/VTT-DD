/**
 * Pages du front vers lesquelles le backend renvoie : liens des e-mails, redirections.
 *
 * Partagées entre front et back pour qu'un renommage de route ne casse plus ces liens
 * sans bruit : un test du front (src/lib/pages-front.test.ts) vérifie que chacune
 * existe dans src/app.
 */
export const PAGES_FRONT = {
  /** Connexion ; `?erreur=oauth` y affiche l'échec d'une connexion Google ou Discord. */
  connexion: '/connexion',
  /** Choix d'un nouveau mot de passe, `?jeton=…` (e-mail de réinitialisation). */
  reinitialisation: '/reinitialisation',
  /** Confirmation de l'adresse e-mail, `?jeton=…` (e-mail de vérification). */
  verificationEmail: '/verification-email',
} as const;
