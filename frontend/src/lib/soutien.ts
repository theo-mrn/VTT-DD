/**
 * Yner ne vend rien (décision du 2026-10-05) : dés, bordures et cadres sont
 * ouverts à tous, et le projet se soutient par dons. Le paiement (service
 * billing, docs/paiement.md) reste prêt : PAIEMENTS le remet dans l'interface
 * (onglet Abonnement, premium de la boutique, bordures réservées), avec
 * SKINS_FOR_SALE=on côté dice.
 */
export const PAIEMENTS = false;

/** Page de dons (Buy Me a Coffee) ; null : rien n'est affiché. */
export const SOUTIEN_URL: string | null = null;
