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
  /** Abonnement, factures et achats (liens des e-mails de paiement, portail Stripe). */
  abonnement: '/profil/abonnement',
  /** Retour de Stripe Checkout après paiement, `?session_id=…&retour=…`. */
  paiementSucces: '/paiement/succes',
  /** Retour de Stripe Checkout sans paiement, `?retour=…`. */
  paiementAnnule: '/paiement/annule',
  /** Table de dés : la collection (lien de l'e-mail d'achat). */
  des: '/des',
  /** Marketplace : catalogue, `/<slug>` fiche d'un pack (retour de Checkout d'un achat). */
  marketplace: '/marketplace',
  /** Packs acquis et leurs installations. */
  marketplaceLibrary: '/marketplace/library',
  /** Espace du créateur (retour de l'onboarding Stripe Connect). */
  marketplaceStudio: '/marketplace/studio',
} as const;
