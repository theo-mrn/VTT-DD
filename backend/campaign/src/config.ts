import { BaseConfig } from '@vtt/platform';
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

  /** Stockage des images de campagne (R2 en prod, SeaweedFS en dev), comme les avatars d'identity. */
  S3_ENDPOINT: optional(z.string().url()),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),
  /** URL publique des fichiers envoyés (CDN R2, ou S3_ENDPOINT/bucket en dev). */
  S3_PUBLIC_URL: optional(z.string().url()),
  /**
   * Bibliothèque d'images du produit (couvertures proposées à la création) :
   * une image de campagne peut désigner un fichier sous cette URL sans être
   * envoyée. Vide : seules les images envoyées sont acceptées.
   */
  PRESET_IMAGES_URL: z
    .preprocess((v) => (v === '' ? null : v), z.string().url().nullable())
    .default('https://assets.yner.fr/'),
});
export type CampaignConfig = z.infer<typeof CampaignConfig>;
