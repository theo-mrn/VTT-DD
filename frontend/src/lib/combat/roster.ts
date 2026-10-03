/**
 * Qui peut attaquer et qui peut être visé (docs/combat.md § 5.2, § 9.1), à partir de ce que
 * le serveur m'a donné : la liste des personnages de la campagne (filtrée pour un joueur : il
 * n'y trouve que les PNJ dont un token lui est visible) et l'état du combat (vue expurgée).
 *
 * - Attaquant : pour un joueur, un personnage qu'il incarne ; pour le MJ, tout personnage
 *   engagé (création terminée).
 * - Cibles : les participants du combat d'abord, dans l'ordre du tour, puis les autres
 *   personnages connus. Rien n'est lu au-delà de la liste (aucune fiche de PNJ).
 */
import type { CampaignSide, CombatState } from '@vtt/contracts';
import type { CampaignCharacterApi } from '../campagnes';
import type { KnownCharacter } from './view';

export interface RosterCharacter extends KnownCharacter {
  side: CampaignSide | null;
  kind: 'pc' | 'npc' | null;
  ownerId: string | null;
  playedBy: string | null;
  inCreation: boolean;
}

export function rosterOf(list: readonly CampaignCharacterApi[] | undefined): RosterCharacter[] {
  return (list ?? []).map((c) => ({
    id: c.characterId,
    name: c.name,
    portraitUrl: c.avatarUrl,
    side: c.side,
    kind: c.kind,
    ownerId: c.ownerId,
    playedBy: c.playedBy,
    inCreation: c.inCreation,
  }));
}

/** Personnages avec lesquels j'attaque (§ 9.1). */
export function attackerCandidates(
  roster: readonly RosterCharacter[],
  viewer: { gm: boolean; userId: string },
): RosterCharacter[] {
  return roster.filter(
    (c) => !c.inCreation && (viewer.gm || (c.playedBy !== null && c.playedBy === viewer.userId)),
  );
}

export interface TargetGroups {
  /** Participants du combat, dans l'ordre du tour (vue expurgée pour un joueur). */
  participants: RosterCharacter[];
  /** Autres personnages connus (hors combat, ou pas participants). */
  others: RosterCharacter[];
}

/** Cibles proposées dans la liste du menu. */
export function targetGroups(
  roster: readonly RosterCharacter[],
  combat: CombatState | null | undefined,
): TargetGroups {
  const byId = new Map(roster.map((c) => [c.id, c]));
  const inCombat = new Set<string>();
  const participants: RosterCharacter[] = [];
  for (const p of combat?.order ?? []) {
    inCombat.add(p.characterId);
    participants.push(
      byId.get(p.characterId) ?? {
        id: p.characterId,
        name: null,
        portraitUrl: null,
        side: p.side,
        kind: null,
        ownerId: null,
        playedBy: null,
        inCreation: false,
      },
    );
  }
  const others = roster.filter((c) => !inCombat.has(c.id) && !c.inCreation);
  return { participants, others };
}
