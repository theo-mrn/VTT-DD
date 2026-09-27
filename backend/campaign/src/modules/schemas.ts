/** Schémas Zod partagés par les routes du service. */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACCENTS, COMBAT_MODES, ROLES, SIDES } from '../db/schema.js';

export const Uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());
export const CampaignId = Uuid('Identifiant de campagne invalide');
export const CharacterId = Uuid('Identifiant de personnage invalide');
export const UserId = Uuid('Identifiant d’utilisateur invalide');
export const SystemId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Identifiant de système invalide');

export const Role = z.enum(ROLES);
export const Accent = z.enum(ACCENTS);
export const Side = z.enum(SIDES);
export const CombatMode = z.enum(COMBAT_MODES);

export const Name = z.string().trim().min(1, 'Nom requis').max(100, '100 caractères au plus');
export const Description = z.string().trim().max(2000, '2000 caractères au plus');
export const Pitch = z.string().trim().max(160, '160 caractères au plus');
/** Genres de la campagne : sans doublon, 10 au plus. */
export const Tags = z
  .array(z.string().trim().min(1, 'Genre vide').max(40, '40 caractères au plus'))
  .max(10, '10 genres au plus')
  .transform((tags) => [...new Set(tags)]);

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
  pitch: z.string(),
  accent: Accent,
  tags: z.array(z.string()),
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

/** Session de jeu prévue. */
export const Session = z.object({ id: z.string(), date: z.string(), title: z.string().nullable() });

/**
 * Une de mes campagnes (GET /v1/campaigns) : le résumé, plus ce que les listes
 * affichent sans charger le détail. `members` : les premiers membres (MJ
 * d'abord), `memberCount` donne le total ; `characterIds` : tous les
 * personnages engagés.
 */
export const MyCampaignSummary = CampaignSummary.extend({
  role: Role,
  members: z.array(Member),
  nextSession: Session.nullable(),
  playedCharacterId: z.string().nullable(),
  characterIds: z.array(z.string()),
});

/** Utilisateur invité nominativement, en attente (visible du MJ seulement). */
export const Invitee = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  invitedBy: z.string(),
  invitedAt: z.string(),
});

/** Campagne où l'appelant est invité (GET /v1/campaigns/invited). */
export const InvitedCampaign = CampaignSummary.extend({
  invitedBy: UserRef,
  invitedAt: z.string(),
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
  /** Invitations nominatives en attente : pour le MJ, vide pour les autres membres. */
  invitees: z.array(Invitee),
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
