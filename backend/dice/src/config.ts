import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const DiceConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('dice'),
  PORT: z.coerce.number().int().positive().default(3004),
  /** Connexion avec le rôle dice_svc (jamais dice_owner). */
  DATABASE_URL: z.string().min(1),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /**
   * Secret partagé entre services (en-tête x-internal-secret) : protège la
   * route /internal/rolls appelée par character, et accompagne les appels de
   * dice vers campaign et character. Absent : pas de route interne, pas de
   * jet dans une campagne ni avec un personnage.
   */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service campaign : rôle de l'appelant dans une campagne (visibilité, droits). */
  CAMPAIGN_URL: optional(z.string().url()),
  /** Service character : fiche d'un personnage (variables des formules). */
  CHARACTER_URL: optional(z.string().url()),
  /** Service identity : noms et avatars des auteurs (profils publics). Absent : noms vides. */
  IDENTITY_URL: optional(z.string().url()),
  /** Durée de vie en mémoire des rôles renvoyés par campaign, en millisecondes. */
  RIGHTS_CACHE_MS: z.coerce.number().int().nonnegative().default(5_000),

  /** Jets par minute et par IP (route POST /v1/dice/rolls). */
  RATE_LIMIT_ROLLS_MAX: z.coerce.number().int().positive().default(120),
  /** Jets par minute et par utilisateur, comptés en base (toutes instances confondues). */
  RATE_LIMIT_ROLLS_PER_USER: z.coerce.number().int().positive().default(60),
});
export type DiceConfig = z.infer<typeof DiceConfig>;
