/**
 * Règles de tour d'un combat, sans base de données ni appel réseau.
 *
 * - individuel : chaque participant agit à son tour, dans l'ordre d'initiative ;
 * - creneaux (Star Wars) : l'ordre donne une suite de créneaux par camp ;
 *   pendant un créneau, n'importe quel participant du camp qui n'a pas encore
 *   agi peut agir.
 *
 * `courant` est l'index du participant (individuel) ou du créneau (creneaux)
 * dont c'est le tour.
 */
import { HttpError } from '@vtt/platform';
import type { Camp, Mode } from '../../db/schema.js';

export interface Participant {
  characterId: string;
  camp: Camp;
  cles: number[];
  aAgi: boolean;
}

export interface EtatCombat {
  mode: Mode;
  round: number;
  courant: number;
  ordre: Participant[];
  /** Camps des créneaux, dans l'ordre (mode creneaux seulement). */
  creneaux: Camp[] | null;
}

/**
 * Ordre d'initiative : clés comparées une à une, de la plus importante à la
 * moins importante, la plus haute d'abord. À égalité parfaite, le camp
 * `joueurs` passe d'abord, puis l'ordre reçu est conservé (tri stable).
 */
export function trier<P extends { camp: Camp; cles: number[] }>(participants: P[]): P[] {
  return participants
    .map((p, index) => ({ p, index }))
    .sort((a, b) => {
      const n = Math.max(a.p.cles.length, b.p.cles.length);
      for (let i = 0; i < n; i++) {
        const d = (b.p.cles[i] ?? -Infinity) - (a.p.cles[i] ?? -Infinity);
        if (d !== 0 && !Number.isNaN(d)) return d;
      }
      const joueurs = Number(b.p.camp === 'joueurs') - Number(a.p.camp === 'joueurs');
      return joueurs !== 0 ? joueurs : a.index - b.index;
    })
    .map((x) => x.p);
}

/** Créneaux du mode creneaux : le camp de chaque rang de l'ordre. */
export const creneauxDe = (ordre: Pick<Participant, 'camp'>[]): Camp[] => ordre.map((p) => p.camp);

/** Combat qui démarre, ou qui repart après l'initiative : premier tour, personne n'a agi. */
export function depart(mode: Mode, ordre: Participant[], round = 1): EtatCombat {
  const remis = ordre.map((p) => ({ ...p, aAgi: false }));
  return {
    mode,
    round,
    courant: 0,
    ordre: remis,
    creneaux: mode === 'creneaux' ? creneauxDe(remis) : null,
  };
}

const pasSonTour = (detail: string) => HttpError.conflict(detail, 'pas_son_tour');

/** Participants qui peuvent agir maintenant. */
export function peuventAgir(etat: EtatCombat): Participant[] {
  if (etat.mode === 'individuel') {
    const p = etat.ordre[etat.courant];
    return p && !p.aAgi ? [p] : [];
  }
  const camp = etat.creneaux?.[etat.courant];
  return etat.ordre.filter((p) => p.camp === camp && !p.aAgi);
}

export interface Passage {
  etat: EtatCombat;
  /** Participant qui vient d'agir (aucun si le créneau n'avait plus personne). */
  aAgi: string | null;
  /** Vrai si ce passage termine le round (les durées doivent être décomptées). */
  finDeRound: boolean;
}

/**
 * Tour suivant : le participant `characterId` (par défaut le premier qui peut
 * agir) a agi, on passe au participant ou au créneau suivant. Après le
 * dernier, un nouveau round commence et personne n'a encore agi.
 */
export function suivant(etat: EtatCombat, characterId?: string): Passage {
  if (!etat.ordre.length)
    throw HttpError.conflict('Le combat n’a aucun participant', 'combat_vide');
  const possibles = peuventAgir(etat);
  let acteur = possibles[0];
  if (characterId) {
    acteur = possibles.find((p) => p.characterId === characterId);
    if (!acteur)
      throw pasSonTour(
        etat.mode === 'individuel'
          ? 'Ce n’est pas le tour de ce personnage'
          : 'Ce personnage ne peut pas agir pendant ce créneau (autre camp, ou il a déjà agi)',
      );
  }
  const ordre = etat.ordre.map((p) => (p === acteur ? { ...p, aAgi: true } : p));
  const taille = etat.mode === 'individuel' ? ordre.length : (etat.creneaux?.length ?? 0);
  const courant = etat.courant + 1;
  if (courant < taille) {
    return {
      etat: { ...etat, ordre, courant },
      aAgi: acteur?.characterId ?? null,
      finDeRound: false,
    };
  }
  return {
    etat: {
      ...etat,
      round: etat.round + 1,
      courant: 0,
      ordre: ordre.map((p) => ({ ...p, aAgi: false })),
    },
    aAgi: acteur?.characterId ?? null,
    finDeRound: true,
  };
}

/**
 * Retire des participants (personnage retiré de la salle). En mode creneaux,
 * un créneau de son camp disparaît aussi : un créneau passé s'il avait déjà
 * agi, sinon un créneau à venir. Si le tour courant n'existe plus, un nouveau
 * round commence (sans décompte des durées).
 */
export function retirer(etat: EtatCombat, characterIds: string[]): EtatCombat {
  let { courant, round } = etat;
  let ordre = etat.ordre;
  let creneaux = etat.creneaux ? [...etat.creneaux] : null;
  for (const id of characterIds) {
    const index = ordre.findIndex((p) => p.characterId === id);
    if (index < 0) continue;
    const p = ordre[index]!;
    ordre = ordre.filter((_, i) => i !== index);
    if (!creneaux) {
      if (index < courant) courant--;
      continue;
    }
    const indices = creneaux.flatMap((c, i) => (c === p.camp ? [i] : []));
    const passes = indices.filter((i) => i < courant);
    const aVenir = indices.filter((i) => i >= courant);
    const retire = p.aAgi ? (passes.at(-1) ?? aVenir.at(-1)) : (aVenir.at(-1) ?? passes.at(-1));
    if (retire === undefined) continue;
    creneaux.splice(retire, 1);
    if (retire < courant) courant--;
  }
  const taille = creneaux ? creneaux.length : ordre.length;
  if (courant >= taille && taille > 0) {
    courant = 0;
    round++;
    ordre = ordre.map((p) => ({ ...p, aAgi: false }));
  }
  if (taille === 0) courant = 0;
  return { ...etat, round, courant, ordre, creneaux };
}
