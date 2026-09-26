import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const facultatif = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const CharacterConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('character'),
  PORT: z.coerce.number().int().positive().default(3002),
  /** Connexion avec le rôle characters_svc (jamais characters_owner). */
  DATABASE_URL: z.string().min(1),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /** Actions (jets de dés tirés par le serveur) par minute et par IP. */
  RATE_LIMIT_ACTIONS_MAX: z.coerce.number().int().positive().default(120),

  /**
   * Secret partagé entre services (en-tête x-internal-secret) : protège les
   * routes /internal appelées par campaign, et accompagne les appels de
   * character vers campaign. Absent : pas de route interne, pas de droits de MJ.
   */
  INTERNAL_API_SECRET: facultatif(z.string().min(32)),
  /**
   * Service campaign, interrogé quand l'appelant n'est pas propriétaire d'un
   * personnage (MJ ou joueur de la salle où il est engagé). Absent : seul le
   * propriétaire accède à ses personnages.
   */
  CAMPAIGN_URL: facultatif(z.string().url()),
  /**
   * Service dice : chaque jet d'action lui est transmis (POST /internal/rolls)
   * pour l'historique des jets. Absent : les jets d'action n'y apparaissent pas.
   */
  DICE_URL: facultatif(z.string().url()),
  /** Durée de vie en mémoire des droits renvoyés par campaign, en millisecondes. */
  DROITS_CACHE_MS: z.coerce.number().int().nonnegative().default(5_000),
});
export type CharacterConfig = z.infer<typeof CharacterConfig>;
