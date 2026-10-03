/**
 * Situation du combat (docs/combat.md § 5.7) : ce que le combat a compté pour chaque participant
 * (`tally`), et le contexte figé pour les règles à la déclaration d'une attaque (`@combat.*`).
 *
 * Une attaque compte si elle n'est ni annulée ni refusée par les règles (`cancelled`, `failed`) ;
 * une cible compte comme visée si elle n'a pas été refusée (`failed`). « Ce round » : attaques
 * déclarées au round courant du combat. Vue d'un joueur : seules les attaques publiques d'un
 * attaquant qu'il voit (jamais un participant caché).
 */
import type { AttackCombatContext, CombatRulesParticipant, CombatTally } from '@vtt/contracts';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import { campaignAttacks, campaignAttackTargets, type AttackStatusValue } from '../../db/schema.js';
import type { CombatState, Participant } from './turns.js';

/** Attaques d'un combat regroupées : faites par un participant, ou qui l'ont visé. */
export interface TallyRow {
  kind: 'made' | 'targeted';
  /** Attaquant (`made`) ou cible (`targeted`). */
  characterId: string;
  attackerId: string;
  round: number;
  visibility: 'public' | 'private' | 'gm';
  count: number;
}

/** Qui regarde : le MJ (toutes les attaques) ou un joueur (attaques publiques, attaquant vu). */
export type TallyAudience = 'gm' | 'players';

const NOT_COUNTED: AttackStatusValue[] = ['cancelled', 'failed'];

/** Décompte en base des attaques d'un combat. */
export async function loadTallyRows(db: Db | Tx, combatId: string): Promise<TallyRow[]> {
  const counted = and(
    eq(campaignAttacks.combatId, combatId),
    notInArray(campaignAttacks.status, NOT_COUNTED),
  );
  const [made, targeted] = await Promise.all([
    db
      .select({
        characterId: campaignAttacks.attackerId,
        round: campaignAttacks.round,
        visibility: campaignAttacks.visibility,
        count: sql<number>`count(*)::int`,
      })
      .from(campaignAttacks)
      .where(counted)
      .groupBy(campaignAttacks.attackerId, campaignAttacks.round, campaignAttacks.visibility),
    db
      .select({
        characterId: campaignAttackTargets.characterId,
        attackerId: campaignAttacks.attackerId,
        round: campaignAttacks.round,
        visibility: campaignAttacks.visibility,
        count: sql<number>`count(*)::int`,
      })
      .from(campaignAttackTargets)
      .innerJoin(campaignAttacks, eq(campaignAttacks.id, campaignAttackTargets.attackId))
      .where(and(counted, sql`${campaignAttackTargets.status} <> 'failed'`))
      .groupBy(
        campaignAttackTargets.characterId,
        campaignAttacks.attackerId,
        campaignAttacks.round,
        campaignAttacks.visibility,
      ),
  ]);
  return [
    ...made.map((r) => ({
      kind: 'made' as const,
      characterId: r.characterId,
      attackerId: r.characterId,
      round: r.round ?? 0,
      visibility: r.visibility,
      count: Number(r.count),
    })),
    ...targeted.map((r) => ({
      kind: 'targeted' as const,
      characterId: r.characterId,
      attackerId: r.attackerId,
      round: r.round ?? 0,
      visibility: r.visibility,
      count: Number(r.count),
    })),
  ];
}

const EMPTY: CombatTally = { attacksMadeRound: 0, attacksMade: 0, targetedRound: 0, targeted: 0 };

/**
 * Décompte de chaque participant, pour ce round et ce public. Un joueur ne compte que les
 * attaques publiques d'un attaquant qu'il voit (un participant caché ne compte pour rien).
 */
export function talliesOf(
  rows: readonly TallyRow[],
  state: Pick<CombatState, 'round' | 'order'>,
  audience: TallyAudience,
): Map<string, CombatTally> {
  const hidden = new Set(state.order.filter((p) => !p.visibleToPlayers).map((p) => p.characterId));
  const out = new Map<string, CombatTally>(state.order.map((p) => [p.characterId, { ...EMPTY }]));
  for (const r of rows) {
    const t = out.get(r.characterId);
    if (!t) continue;
    if (audience === 'players' && (r.visibility !== 'public' || hidden.has(r.attackerId))) continue;
    addToTally(t, r, r.round === state.round);
  }
  return out;
}

/** Ajoute une ligne (attaques faites ou subies) au décompte d'un participant. */
function addToTally(t: CombatTally, r: TallyRow, thisRound: boolean): void {
  if (r.kind === 'made') {
    t.attacksMade += r.count;
    if (thisRound) t.attacksMadeRound += r.count;
  } else {
    t.targeted += r.count;
    if (thisRound) t.targetedRound += r.count;
  }
}

/** Lignes d'une attaque pas encore enregistrée (lot du MJ : les suivantes la comptent). */
export function rowsOfDeclaration(
  round: number,
  attackerId: string,
  targetIds: readonly string[],
): TallyRow[] {
  const base = { attackerId, round, visibility: 'gm' as const, count: 1 };
  return [
    { kind: 'made', characterId: attackerId, ...base },
    ...targetIds.map((id) => ({ kind: 'targeted' as const, characterId: id, ...base })),
  ];
}

/**
 * Contexte des règles pour une attaque déclarée maintenant (`combat` de la préparation) :
 * round, attaquant et cibles qui participent, avec leur décompte (vue du MJ, sans l'attaque en
 * cours), a agi ce round, surpris. Hors combat : undefined.
 */
export function combatContextOf(
  state: Pick<CombatState, 'round' | 'order'> | null,
  rows: readonly TallyRow[],
  attackerId: string,
  targetIds: readonly string[],
): AttackCombatContext | undefined {
  if (!state) return undefined;
  const tallies = talliesOf(rows, state, 'gm');
  const byId = new Map(state.order.map((p) => [p.characterId, p]));
  const rules = (p: Participant): CombatRulesParticipant => ({
    ...(tallies.get(p.characterId) ?? EMPTY),
    hasActed: p.hasActed,
    surprised: p.surprised,
  });
  const actor = byId.get(attackerId);
  return {
    round: Math.max(1, state.round),
    ...(actor ? { actor: rules(actor) } : {}),
    targets: [...new Set(targetIds)].flatMap((id) => {
      const p = byId.get(id);
      return p ? [{ characterId: id, ...rules(p) }] : [];
    }),
  };
}
