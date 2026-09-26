/** Schémas Zod partagés par les routes du service. */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CAMPS, MODES, ROLES } from '../db/schema.js';

export const Uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());
export const IdSalle = Uuid('Identifiant de salle invalide');
export const IdPersonnage = Uuid('Identifiant de personnage invalide');
export const IdUtilisateur = Uuid('Identifiant d’utilisateur invalide');
export const IdSysteme = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Identifiant de système invalide');

export const Role = z.enum(ROLES);
export const Camp = z.enum(CAMPS);
export const ModeCombat = z.enum(MODES);

export const Nom = z.string().trim().min(1, 'Nom requis').max(100, '100 caractères au plus');
export const Description = z.string().trim().max(2000, '2000 caractères au plus');

export const Membre = z.object({
  userId: z.string(),
  nom: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: Role,
});

export const CombatReponse = z.object({
  id: z.string(),
  round: z.number().int(),
  mode: ModeCombat,
  ordre: z.array(
    z.object({ characterId: z.string(), camp: Camp, cles: z.array(z.number()), aAgi: z.boolean() }),
  ),
  courant: z.number().int(),
  creneaux: z.array(z.object({ camp: Camp })).optional(),
  initiative: z.boolean(),
  version: z.number().int(),
});

export const SalleReponse = z.object({
  id: z.string(),
  nom: z.string(),
  description: z.string(),
  systeme: z.object({ id: z.string(), version: z.string() }),
  proprietaireId: z.string(),
  role: Role,
  membres: z.array(Membre),
  personnages: z.array(
    z.object({ characterId: z.string(), ownerId: z.string(), camp: Camp, ajoutePar: z.string() }),
  ),
  combat: CombatReponse.optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Contexte des événements écrits par la requête. */
export const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

/** Utilisateur authentifié (identifiant en minuscules, comme en base). */
export const moi = (req: FastifyRequest) => req.user!.userId.toLowerCase();
