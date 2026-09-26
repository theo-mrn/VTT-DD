/**
 * Campagnes en base : accès d'un membre, détail d'une campagne, événements.
 *
 * Une campagne dont l'appelant n'est pas membre est introuvable (404) : on ne
 * révèle pas son existence. Un membre sans le rôle requis reçoit 403.
 */
import type { ActorRole, Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { Profile } from '../../clients/profiles.js';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  campaignCombatParticipants,
  campaignCombats,
  campaignMembers,
  campaigns,
  type Role,
  type Side,
} from '../../db/schema.js';
import type { Deps } from '../../deps.js';
import { combatApi, type CombatApi } from '../combat/api.js';
import { currentUser } from '../schemas.js';

export type Campaign = typeof campaigns.$inferSelect;

export interface Access {
  campaign: Campaign;
  role: Role;
}

export const campaignNotFound = () =>
  new HttpError(404, 'Ressource introuvable', 'campaign_not_found', 'Campagne introuvable');

/** Campagne et rôle de l'appelant ; 404 s'il n'en est pas membre. */
export async function access(db: Db | Tx, campaignId: string, userId: string): Promise<Access> {
  const [row] = await db
    .select({ campaign: campaigns, role: campaignMembers.role })
    .from(campaigns)
    .innerJoin(
      campaignMembers,
      and(eq(campaignMembers.campaignId, campaigns.id), eq(campaignMembers.userId, userId)),
    )
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!row) throw campaignNotFound();
  return row;
}

/** Comme `access`, et 403 si l'appelant n'est pas MJ. */
export async function gmAccess(db: Db | Tx, campaignId: string, userId: string): Promise<Access> {
  const a = await access(db, campaignId, userId);
  if (a.role !== 'gm') throw HttpError.forbidden('Réservé au MJ de la campagne');
  return a;
}

/** Verrouille la campagne pour la transaction (changements de membres, d'engagement, de combat). */
export async function lockCampaign(tx: Tx, campaignId: string) {
  await tx
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .for('update');
}

/** Rôle de l'auteur d'un événement de campagne. */
export const actorRole = (role: Role | null): ActorRole =>
  role === 'gm' ? 'gm' : role ? 'player' : 'user';

/** Événement de campagne (sujet vtt.<campaignId>.campaign.<action>), visible des membres. */
export function campaignEvent(
  tx: Tx,
  ctx: EventContext,
  e: {
    type: `campaign.${string}`;
    campaignId: string;
    userId: string;
    role: Role | null;
    payload: Record<string, unknown>;
    /** Public par défaut (membres de la campagne). */
    visibility?: Visibility;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: e.campaignId,
    actor: { userId: e.userId, role: actorRole(e.role), characterId: null },
    aggregate: { type: 'campaign', id: e.campaignId },
    payload: e.payload,
    ...(e.visibility ? { visibility: e.visibility } : {}),
  });
}

export interface MemberApi {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
}

export interface UserApi {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Champs communs à la liste des campagnes, aux campagnes publiques et au détail. */
export interface CampaignFieldsApi {
  id: string;
  name: string;
  description: string;
  system: { id: string; version: string };
  code: string;
  imageUrl: string | null;
  isPublic: boolean;
  characterCreation: boolean;
  playerCount: number;
  owner: UserApi;
  updatedAt: string;
}

export interface CampaignSummaryApi extends CampaignFieldsApi {
  role: Role | null;
  memberCount: number;
}

export interface CampaignApi extends CampaignFieldsApi {
  ownerId: string;
  /** Rôle de l'appelant. */
  role: Role;
  playedCharacterId: string | null;
  members: MemberApi[];
  characters: {
    characterId: string;
    ownerId: string;
    side: Side;
    addedBy: string;
    playedBy: string | null;
  }[];
  combat?: CombatApi;
  version: number;
  createdAt: string;
}

/** Utilisateur affiché, depuis les profils chargés. */
export const userApi = (id: string, profiles: Map<string, Profile>): UserApi => ({
  id,
  name: profiles.get(id)?.name ?? null,
  avatarUrl: profiles.get(id)?.avatarUrl ?? null,
});

function campaignFields(
  c: Campaign,
  playerCount: number,
  profiles: Map<string, Profile>,
): CampaignFieldsApi {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    system: { id: c.systemId, version: c.systemVersion },
    code: c.code,
    imageUrl: c.imageUrl,
    isPublic: c.isPublic,
    characterCreation: c.characterCreation,
    playerCount,
    owner: userApi(c.ownerId, profiles),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Effectif des campagnes : membres, et joueurs (membres qui ne sont pas MJ). */
export function headcounts(db: Db | Tx) {
  return db
    .select({
      campaignId: campaignMembers.campaignId,
      memberCount: count().as('member_count'),
      playerCount: sql<number>`count(*) filter (where ${campaignMembers.role} <> 'gm')`
        .mapWith(Number)
        .as('player_count'),
    })
    .from(campaignMembers)
    .groupBy(campaignMembers.campaignId)
    .as('headcount');
}

/** Campagnes d'une liste, avec le profil de leur propriétaire. */
export async function campaignSummaries(
  deps: Pick<Deps, 'profiles'>,
  rows: { campaign: Campaign; role: Role | null; memberCount: number; playerCount: number }[],
  authorization: string | undefined,
): Promise<CampaignSummaryApi[]> {
  const profiles = await deps.profiles.profiles(
    [...new Set(rows.map((r) => r.campaign.ownerId))],
    authorization,
  );
  return rows.map((r) => ({
    ...campaignFields(r.campaign, Number(r.playerCount), profiles),
    role: r.role,
    memberCount: Number(r.memberCount),
  }));
}

/** Détail d'une campagne pour un membre (profils des membres via identity). */
export async function campaignDetail(
  deps: Pick<Deps, 'db' | 'profiles'>,
  a: Access,
  req: FastifyRequest,
): Promise<CampaignApi> {
  const { db } = deps;
  const userId = currentUser(req);
  const id = a.campaign.id;
  // Relue : l'accès a pu être obtenu avant une modification de la même requête
  const [[campaign], members, characters, [combat], participants] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.id, id)),
    db
      .select()
      .from(campaignMembers)
      .where(eq(campaignMembers.campaignId, id))
      .orderBy(asc(campaignMembers.joinedAt), asc(campaignMembers.userId)),
    db
      .select()
      .from(campaignCharacters)
      .where(eq(campaignCharacters.campaignId, id))
      .orderBy(asc(campaignCharacters.addedAt), asc(campaignCharacters.characterId)),
    db.select().from(campaignCombats).where(eq(campaignCombats.campaignId, id)),
    db
      .select()
      .from(campaignCombatParticipants)
      .where(eq(campaignCombatParticipants.campaignId, id))
      .orderBy(asc(campaignCombatParticipants.turnOrder)),
  ]);
  const c = campaign ?? a.campaign;
  const profiles = await deps.profiles.profiles(
    [...new Set([c.ownerId, ...members.map((m) => m.userId)])],
    req.headers.authorization,
  );
  return {
    ...campaignFields(c, members.filter((m) => m.role !== 'gm').length, profiles),
    ownerId: c.ownerId,
    role: a.role,
    playedCharacterId: characters.find((p) => p.playedBy === userId)?.characterId ?? null,
    members: members.map((m) => ({
      userId: m.userId,
      name: profiles.get(m.userId)?.name ?? null,
      avatarUrl: profiles.get(m.userId)?.avatarUrl ?? null,
      role: m.role,
    })),
    characters: characters.map((p) => ({
      characterId: p.characterId,
      ownerId: p.ownerId,
      side: p.side,
      addedBy: p.addedBy,
      playedBy: p.playedBy,
    })),
    ...(combat ? { combat: combatApi(combat, participants) } : {}),
    version: c.version,
    createdAt: c.createdAt.toISOString(),
  };
}
