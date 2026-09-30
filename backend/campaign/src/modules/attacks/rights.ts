/**
 * Droits sur les attaques (docs/combat.md § 9.1) et ce que chaque membre connaît des
 * personnages de la campagne (§ 5.2, § 7.6).
 *
 * - Déclarer : le MJ avec tout personnage engagé ; un joueur avec un personnage qu'il incarne,
 *   contre des personnages qu'il voit (liste filtrée de la campagne, participant non caché) ;
 *   un spectateur, jamais.
 * - Réagir : le MJ pour toute cible, un joueur pour une cible qu'il incarne.
 * - Décider (appliquer, écarter, annuler) : le MJ seul.
 * - Lire : le MJ tout ; un joueur ses attaques (auteur, ou attaquant qu'il incarne) et celles où
 *   l'une de ses cibles doit réagir.
 */
import { HttpError } from '@vtt/platform';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import { campaignCharacters, campaignCombatParticipants, type Side } from '../../db/schema.js';
import type { Access } from '../campaigns/repository.js';
import { visibleEngagements } from '../characters/visibility.js';
import type { LoadedAttack } from './repository.js';

/** Qui lit ou agit, et ce qu'il connaît. */
export interface AttackViewer {
  userId: string;
  isGm: boolean;
  spectator: boolean;
  /** Personnages qu'il incarne. */
  played: Set<string>;
  /** Personnages qu'il connaît (tous pour le MJ). */
  known: Set<string>;
  /** Camp de chaque personnage engagé. */
  sideOf: Map<string, Side>;
  /** Participants du combat en cours cachés aux joueurs. */
  hidden: Set<string>;
}

export async function attackViewer(db: Db, a: Access, userId: string): Promise<AttackViewer> {
  const [engagements, participants] = await Promise.all([
    db.select().from(campaignCharacters).where(eq(campaignCharacters.campaignId, a.campaign.id)),
    db
      .select({
        characterId: campaignCombatParticipants.characterId,
        visibleToPlayers: campaignCombatParticipants.visibleToPlayers,
      })
      .from(campaignCombatParticipants)
      .where(eq(campaignCombatParticipants.campaignId, a.campaign.id)),
  ]);
  const hidden = new Set(participants.filter((p) => !p.visibleToPlayers).map((p) => p.characterId));
  const played = new Set(
    engagements.filter((e) => e.playedBy === userId).map((e) => e.characterId),
  );
  const isGm = a.role === 'gm';
  const visible = isGm ? engagements : await visibleEngagements(db, a, userId, engagements);
  const own = (e: (typeof engagements)[number]) => e.ownerId === userId || e.playedBy === userId;
  const known = new Set(
    visible.filter((e) => isGm || own(e) || !hidden.has(e.characterId)).map((e) => e.characterId),
  );
  return {
    userId,
    isGm,
    spectator: a.role === 'spectator',
    played,
    known,
    sideOf: new Map(engagements.map((e) => [e.characterId, e.side])),
    hidden,
  };
}

/** Un spectateur ne joue pas. */
export function requireActor(v: AttackViewer) {
  if (v.spectator) throw HttpError.forbidden('Un spectateur ne joue pas');
}

export function requireGm(v: AttackViewer) {
  if (!v.isGm) throw HttpError.forbidden('Réservé au MJ de la campagne');
}

export const targetNotFound = (id: string) =>
  new HttpError(404, 'Ressource introuvable', 'target_not_found', `Cible introuvable : ${id}`);

/**
 * Attaquant et cibles d'une déclaration : engagés dans la campagne ; pour un joueur, un
 * attaquant qu'il incarne (403) et des cibles qu'il voit (404 `target_not_found`).
 */
export function checkDeclaration(v: AttackViewer, attackerId: string, targets: string[]) {
  if (!v.sideOf.has(attackerId))
    throw new HttpError(
      422,
      'Refusé',
      'character_not_engaged',
      `L’attaquant n’est pas engagé dans la campagne : ${attackerId}`,
    );
  if (!v.isGm && !v.played.has(attackerId))
    throw HttpError.forbidden('Un joueur attaque avec un personnage qu’il incarne');
  for (const id of targets) if (!v.sideOf.has(id) || !v.known.has(id)) throw targetNotFound(id);
}

/** L'appelant est l'auteur de l'attaque, ou incarne l'attaquant. */
export const isAuthor = (l: LoadedAttack, v: AttackViewer) =>
  l.attack.createdBy === v.userId || v.played.has(l.attack.attackerId);

/** Cibles de l'attaque que l'appelant incarne et qui peuvent réagir. */
export const reactingTargets = (l: LoadedAttack, v: AttackViewer) =>
  l.targets.filter((t) => v.played.has(t.characterId) && t.reactionParams.length > 0);

/**
 * Personnage connu de tous les joueurs (annonces publiques) : camp des joueurs, ou
 * participant non caché du combat en cours. Les autres sont retirés des annonces.
 */
export function knownToAll(
  id: string,
  sides: Map<string, Side>,
  participants: Map<string, boolean> | null,
): boolean {
  if (participants?.get(id) === false) return false;
  return sides.get(id) === 'players' || participants?.get(id) === true;
}

/** Camps et participants (visibles ou non) du moment, pour les annonces. */
export async function announceContext(tx: Tx, campaignId: string) {
  const [engagements, participants] = await Promise.all([
    tx
      .select({ id: campaignCharacters.characterId, side: campaignCharacters.side })
      .from(campaignCharacters)
      .where(eq(campaignCharacters.campaignId, campaignId)),
    tx
      .select({
        id: campaignCombatParticipants.characterId,
        visible: campaignCombatParticipants.visibleToPlayers,
      })
      .from(campaignCombatParticipants)
      .where(eq(campaignCombatParticipants.campaignId, campaignId)),
  ]);
  const inCombat = new Map(participants.map((p) => [p.id, p.visible]));
  return {
    sides: new Map(engagements.map((e) => [e.id, e.side])),
    participants: inCombat.size ? inCombat : null,
  };
}

/** Joueurs qui incarnent ces personnages. */
export async function playersOf(tx: Tx | Db, campaignId: string, ids: Set<string>) {
  if (!ids.size) return [];
  const rows = await tx
    .select({ id: campaignCharacters.characterId, playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(eq(campaignCharacters.campaignId, campaignId));
  return [...new Set(rows.flatMap((r) => (ids.has(r.id) && r.playedBy ? [r.playedBy] : [])))];
}
