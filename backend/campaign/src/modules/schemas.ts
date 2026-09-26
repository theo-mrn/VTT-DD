/** Schémas Zod partagés par les routes du service. */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { COMBAT_MODES, ROLES, SIDES } from '../db/schema.js';

export const Uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());
export const CampaignId = Uuid('Identifiant de campagne invalide');
export const CharacterId = Uuid('Identifiant de personnage invalide');
export const UserId = Uuid('Identifiant d’utilisateur invalide');
export const SystemId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Identifiant de système invalide');

export const Role = z.enum(ROLES);
export const Side = z.enum(SIDES);
export const CombatMode = z.enum(COMBAT_MODES);

export const Name = z.string().trim().min(1, 'Nom requis').max(100, '100 caractères au plus');
export const Description = z.string().trim().max(2000, '2000 caractères au plus');

/** Utilisateur affiché (propriétaire, auteur) : profil public d'identity. */
export const UserRef = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

/** Champs d'une campagne communs à la liste, aux campagnes publiques et au détail. */
const CampaignFields = {
  id: z.string(),
  name: z.string(),
  description: z.string(),
  system: z.object({ id: z.string(), version: z.string() }),
  code: z.string(),
  imageUrl: z.string().nullable(),
  isPublic: z.boolean(),
  characterCreation: z.boolean(),
  /** Membres qui ne sont pas MJ (spectateurs compris). */
  playerCount: z.number().int(),
  owner: UserRef,
  updatedAt: z.string(),
};

/** Campagne dans une liste ; `role` vaut null si l'appelant n'en est pas membre. */
export const CampaignSummary = z.object({
  ...CampaignFields,
  role: Role.nullable(),
  memberCount: z.number().int(),
});

export const Member = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: Role,
});

export const CombatResponse = z.object({
  id: z.string(),
  round: z.number().int(),
  mode: CombatMode,
  order: z.array(
    z.object({
      characterId: z.string(),
      side: Side,
      sortKeys: z.array(z.number()),
      hasActed: z.boolean(),
    }),
  ),
  currentIndex: z.number().int(),
  slots: z.array(z.object({ side: Side })).optional(),
  initiativeRolled: z.boolean(),
  version: z.number().int(),
});

export const CampaignResponse = z.object({
  ...CampaignFields,
  ownerId: z.string(),
  role: Role,
  /** Personnage incarné par l'appelant dans cette campagne. */
  playedCharacterId: z.string().nullable(),
  members: z.array(Member),
  characters: z.array(
    z.object({
      characterId: z.string(),
      ownerId: z.string(),
      side: Side,
      addedBy: z.string(),
      playedBy: z.string().nullable(),
    }),
  ),
  combat: CombatResponse.optional(),
  version: z.number().int(),
  createdAt: z.string(),
});

/** Contexte des événements écrits par la requête. */
export const eventContext = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

/** Utilisateur authentifié (identifiant en minuscules, comme en base). */
export const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();
