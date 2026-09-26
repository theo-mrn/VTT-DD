/** Forme de l'état de combat renvoyée par l'API. */
import type { Camp, combatParticipants, combats } from '../../db/schema.js';
import type { EtatCombat } from './ordre.js';

export interface CombatApi {
  id: string;
  round: number;
  mode: 'individuel' | 'creneaux';
  ordre: { characterId: string; camp: Camp; cles: number[]; aAgi: boolean }[];
  /** Index du participant (individuel) ou du créneau (creneaux) dont c'est le tour. */
  courant: number;
  creneaux?: { camp: Camp }[];
  /** Vrai une fois l'initiative tirée. */
  initiative: boolean;
  version: number;
}

type LigneCombat = typeof combats.$inferSelect;
type LigneParticipant = typeof combatParticipants.$inferSelect;

/** État pur (règles de tour) depuis les lignes en base, participants triés par rang. */
export function etatDe(combat: LigneCombat, participants: LigneParticipant[]): EtatCombat {
  return {
    mode: combat.mode,
    round: combat.round,
    courant: combat.courant,
    creneaux: combat.creneaux ?? null,
    ordre: [...participants]
      .sort((a, b) => a.rang - b.rang)
      .map((p) => ({ characterId: p.characterId, camp: p.camp, cles: p.cles, aAgi: p.aAgi })),
  };
}

export function combatApi(combat: LigneCombat, participants: LigneParticipant[]): CombatApi {
  const etat = etatDe(combat, participants);
  return {
    id: combat.id,
    round: etat.round,
    mode: etat.mode,
    ordre: etat.ordre,
    courant: etat.courant,
    ...(etat.creneaux ? { creneaux: etat.creneaux.map((camp) => ({ camp })) } : {}),
    initiative: combat.initiative,
    version: combat.version,
  };
}
