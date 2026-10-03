import { DEFAULT_CAMPAIGN_STORAGE_QUOTA } from '@vtt/contracts';
import { BaseConfig, OrphanSweepSettings } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const CampaignConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('campaign'),
  PORT: z.coerce.number().int().positive().default(3003),
  /** Connexion avec le rôle campaign_svc (jamais campaign_owner). */
  DATABASE_URL: z.string().min(1),
  /**
   * Connexion directe à Postgres (hors PgBouncer) pour le LISTEN du relais
   * d'outbox : LISTEN ne traverse pas un pooler en mode transaction. Absent : DATABASE_URL.
   */
  DATABASE_DIRECT_URL: optional(z.string().min(1)),
  /**
   * Bus NATS JetStream (`nats://hôte:4222`, plusieurs séparés par des virgules) :
   * le relais y publie l'outbox. Absent : les événements restent dans l'outbox.
   */
  NATS_URL: optional(z.string().min(1)),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /**
   * Secret partagé entre services (en-tête x-internal-secret) : protège les
   * routes /internal appelées par character, et accompagne les appels de
   * campaign vers character. Absent : ni route interne, ni appel à character.
   */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service character : résumé des personnages engagés, initiative, durées. */
  CHARACTER_URL: optional(z.string().url()),
  /** Service identity : noms et avatars des membres (profils publics). Absent : noms vides. */
  IDENTITY_URL: optional(z.string().url()),

  /** URL publique du front : lien d'invitation `<APP_URL>/join/<code>`. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Tentatives pour rejoindre une campagne, par minute et par IP (codes devinés). */
  RATE_LIMIT_JOIN_MAX: z.coerce.number().int().positive().default(20),
  /** Messages de discussion par minute, par membre et par campagne. */
  RATE_LIMIT_MESSAGES_MAX: z.coerce.number().int().positive().default(20),

  /** Stockage des images de campagne (R2), comme les avatars d'identity. */
  R2_ENDPOINT: optional(z.string().url()),
  R2_REGION: z.string().default('auto'),
  R2_BUCKET_NAME: optional(z.string()),
  R2_ACCESS_KEY_ID: optional(z.string()),
  R2_SECRET_ACCESS_KEY: optional(z.string()),
  /** URL publique des fichiers envoyés (CDN R2, ou R2_ENDPOINT/bucket en dev). */
  R2_PUBLIC_URL: optional(z.string().url()),
  /**
   * Bibliothèque d'images du produit (couvertures proposées à la création) :
   * une image de campagne peut désigner un fichier sous cette URL sans être
   * envoyée. Vide : seules les images envoyées sont acceptées.
   */
  PRESET_IMAGES_URL: z
    .preprocess((v) => (v === '' ? null : v), z.string().url().nullable())
    .default('https://assets.yner.fr/'),

  /** Fichiers orphelins de ses dossiers du stockage (docs/nettoyage.md § Fichiers). */
  ...OrphanSweepSettings,

  /** Place d'une campagne sur le stockage, sons compris (docs/stockage.md) : 5 Gio par défaut. */
  CAMPAIGN_STORAGE_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CAMPAIGN_STORAGE_QUOTA),
  /** Inventaire du stockage de toutes les campagnes, toutes les N minutes. */
  STORAGE_INVENTORY_EVERY_MINUTES: z.coerce.number().int().positive().default(60),
});
export type CampaignConfig = z.infer<typeof CampaignConfig>;
