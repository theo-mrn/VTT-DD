/** Schémas Zod partagés par les routes du service. */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { VISIBILITIES } from '../db/schema.js';
import { MAX_NOTATION } from '../engine/roll.js';

export const Uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());
export const CampaignId = Uuid('Identifiant de campagne invalide');
export const CharacterId = Uuid('Identifiant de personnage invalide');
export const UserId = Uuid('Identifiant d’utilisateur invalide');
export const RollId = Uuid('Identifiant de jet invalide');
export const SystemId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Identifiant de système invalide');

export const Visibility = z.enum(VISIBILITIES);
export const Label = z.string().trim().min(1, 'Titre vide').max(200, '200 caractères au plus');
export const Notation = z
  .string()
  .trim()
  .min(1, 'Notation vide')
  .max(MAX_NOTATION, `${MAX_NOTATION} caractères au plus`);

/** Pool de dés à symboles : sorte de dé du système (`de`) et nombre de dés. */
export const Pool = z
  .array(
    z.object({
      de: z.string().min(1).max(64),
      nombre: z.number().int().min(0).max(100),
    }),
  )
  .min(1, 'Pool vide')
  .max(20);

export const DiceGroup = z.object({
  faces: z.number().int().min(1).max(10_000),
  values: z
    .array(z.object({ value: z.number(), kept: z.boolean(), exploded: z.boolean() }))
    .max(500),
});

export const Symbols = z.object({
  dice: z
    .array(
      z.object({
        die: z.string(),
        face: z.number().int(),
        symbols: z.record(z.string(), z.number()),
      }),
    )
    .max(500),
  totals: z.record(z.string(), z.number()).default({}),
  results: z.record(z.string(), z.number()).default({}),
});

export const Outcome = z.object({
  success: z.boolean().nullable(),
  critical: z.boolean(),
  fumble: z.boolean(),
});

/**
 * Un jet tel que l'API le renvoie : les champs de l'ancienne app (FirebaseRoll
 * de dice-roller.tsx, repris tels quels pour que ses composants s'en servent),
 * puis le détail structuré du service.
 *
 * `hidden` : jet caché au MJ (isBlind), vu par son auteur sans résultat.
 */
export const Roll = z.object({
  id: z.string(),
  campaignId: z.string().nullable(),
  // ─── Champs de l'ancienne app ───
  /** Auteur (compte identity). */
  uid: z.string().nullable(),
  /** Nom affiché au moment du jet : personnage, « MJ » ou nom du profil. */
  userName: z.string(),
  userAvatar: z.string().nullable(),
  /** Personnage du jet. */
  persoId: z.string().nullable(),
  isPrivate: z.boolean(),
  isBlind: z.boolean(),
  diceCount: z.number().int(),
  diceFaces: z.number().int(),
  modifier: z.number(),
  results: z.array(z.number()),
  total: z.number().nullable(),
  notation: z.string().nullable(),
  output: z.string(),
  symbolResult: z.string().nullable(),
  type: z.string(),
  /** Date du jet en millisecondes (Date.now()). */
  timestamp: z.number(),
  // ─── Détail du service ───
  source: z.enum(['free', 'action', 'api', 'import']),
  visibility: Visibility,
  hidden: z.boolean(),
  label: z.string().nullable(),
  actionId: z.string().nullable(),
  systemId: z.string().nullable(),
  dice: z.array(DiceGroup),
  symbols: Symbols.nullable(),
  outcome: Outcome.nullable(),
  explanations: z.array(z.string()),
  createdAt: z.string(),
});
export type RollApi = z.output<typeof Roll>;

export const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();

export const eventContext = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});
