import { BaseConfig, withoutTrailingSlashes } from '@vtt/platform';
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
  APP_URL: z.string().url().default('http://localhost:3000').transform(withoutTrailingSlashes),

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
   * TVA calculée par Stripe Tax (automatic_tax) : à activer avec Stripe Tax dans
   * le tableau de bord, le jour où le statut fiscal l'exige. Les prix sont TTC
   * (tax_behavior inclusive) : le montant payé ne change pas.
   */
  STRIPE_TAX: z.enum(['on', 'off']).default('off'),

  /**
   * Bus d'événements : le relais d'outbox y publie les droits
   * (billing.entitlements_changed), appliqués par dice et identity. Absent :
   * les événements restent dans l'outbox.
   */
  NATS_URL: optional(z.string().min(1)),
  /** Connexion directe (hors PgBouncer) pour le LISTEN du relais d'outbox. */
  DATABASE_DIRECT_URL: optional(z.string().min(1)),
});
export type BillingConfig = z.infer<typeof BillingConfig>;
