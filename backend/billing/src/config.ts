import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const BillingConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('billing'),
  PORT: z.coerce.number().int().positive().default(3007),
  /** Connexion avec le rôle billing_svc (jamais billing_owner). */
  DATABASE_URL: z.string().min(1),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /** URL publique du front : retours de Stripe Checkout et du portail client. */
  APP_URL: z
    .string()
    .url()
    .default('http://localhost:3000')
    .transform((u) => u.replace(/\/+$/, '')),

  /**
   * Clé secrète Stripe (sk_… ou clé restreinte rk_…). Absente : le service
   * démarre, mais les routes de paiement répondent 503 billing_unconfigured.
   */
  STRIPE_SECRET_KEY: optional(
    z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, 'clé Stripe sk_… ou rk_… attendue'),
  ),
  /** Secret de signature du webhook (whsec_…). Absent : le webhook répond 503. */
  STRIPE_WEBHOOK_SECRET: optional(z.string().regex(/^whsec_/, 'secret whsec_… attendu')),
  /**
   * Prix récurrent de l'abonnement premium (price_…), créé dans le tableau de
   * bord Stripe. Absent : prix de l'ancienne app (4,99 €/mois) décrit dans la session.
   */
  STRIPE_PREMIUM_PRICE_ID: optional(z.string().regex(/^price_/, 'identifiant price_… attendu')),

  /**
   * Secret partagé entre services (en-tête x-internal-secret) : accompagne
   * les appels de billing vers dice (skins) et identity (statut premium).
   */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service dice : skins achetés et accès à tous les skins (premium). */
  DICE_URL: optional(z.string().url()),
  /** Service identity : statut premium du profil. */
  IDENTITY_URL: optional(z.string().url()),
});
export type BillingConfig = z.infer<typeof BillingConfig>;
