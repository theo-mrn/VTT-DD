import { z } from 'zod';

/**
 * Droits d'un utilisateur, publiés par billing (source de vérité) et
 * appliqués par dice (skins, accès à tous les skins) et identity (badge
 * premium). Voir docs/paiement.md, « Droits par événements ».
 *
 * L'événement porte l'état complet, pas une variation : un consommateur
 * applique la dernière `version` reçue et ignore une version plus ancienne ou
 * égale. L'ordre de livraison et les doublons sont donc sans effet.
 */
export const ENTITLEMENTS_CHANGED = 'billing.entitlements_changed';

export const EntitlementsChanged = z.object({
  userId: z.uuid(),
  /** Croît à chaque changement des droits de cet utilisateur. */
  version: z.number().int().positive(),
  premium: z.boolean(),
  /** Skins de dés achetés (ou offerts) ; avec premium, tous les skins sont accessibles. */
  diceSkins: z.array(z.string().min(1)),
  tokenFrames: z.array(z.string().min(1)),
});
export type EntitlementsChanged = z.infer<typeof EntitlementsChanged>;

// ─── Marketplace : comptes des créateurs et ventes (docs/marketplace.md § 5) ──

/**
 * État du compte Stripe Connect d'un créateur, publié par billing à chaque changement. Comme les
 * droits : état complet et `version` croissante, un consommateur ignore une version plus ancienne
 * ou égale.
 */
export const CONNECT_ACCOUNT_UPDATED = 'billing.connect_account_updated';
export const ConnectAccountUpdated = z.object({
  userId: z.uuid(),
  version: z.number().int().positive(),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
});
export type ConnectAccountUpdated = z.infer<typeof ConnectAccountUpdated>;

/** Vente d'un pack payée, remboursée ou contestée (sujet vtt.global.billing.<action>). */
export const MARKETPLACE_SALE_COMPLETED = 'billing.marketplace_sale_completed';
export const MARKETPLACE_SALE_REFUNDED = 'billing.marketplace_sale_refunded';
export const MARKETPLACE_SALE_DISPUTED = 'billing.marketplace_sale_disputed';
export const MarketplaceSale = z.object({
  saleId: z.uuid(),
  buyerId: z.uuid(),
  sellerId: z.uuid(),
  listingId: z.uuid(),
  amountCents: z.number().int().positive(),
  feeCents: z.number().int().min(0),
  currency: z.string().length(3),
});
export type MarketplaceSale = z.infer<typeof MarketplaceSale>;

/** `POST /internal/marketplace/checkout` (billing) : session de vente demandée par marketplace. */
export const MarketplaceCheckoutRequest = z.object({
  buyerId: z.uuid(),
  sellerId: z.uuid(),
  listingId: z.uuid(),
  title: z.string().min(1).max(120),
  priceCents: z.number().int().positive(),
  currency: z.literal('eur'),
  /** Chemin du front où revenir (relatif). */
  returnUrl: z
    .string()
    .max(512)
    .regex(/^\/(?![/\\])[^\s\\]*$/, 'Chemin relatif attendu (/…)'),
});
export type MarketplaceCheckoutRequest = z.infer<typeof MarketplaceCheckoutRequest>;
