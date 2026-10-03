/**
 * Action à plusieurs cibles (attaque de zone, soins de groupe, attaque contre plusieurs
 * adversaires) : le moteur ne connaît qu'une cible par exécution, l'action est donc exécutée
 * une fois par cible, avec les paramètres de l'acteur et la réaction de chaque cible
 * (paramètres `par: cible`).
 *
 * - `par-cible` : chaque cible a ses propres dés.
 * - `commun` : les dés sont partagés par phase et par position (`partagerGenerateur`) : le d20
 *   d'une attaque de zone, les 4d6 d'une boule de feu sont lancés une fois pour toutes ; un dé
 *   que seule une cible demande est lancé pour elle seule.
 *
 * Les coûts de l'acteur (ses modifications : stress d'une option, munitions) ne comptent
 * qu'une fois : ceux de la première cible résolue.
 *
 * Dés planifiés (`aleatoirePlanifie`, dés physiques ou tirés à la demande) : l'exécution
 * avance par étapes. Une cible dont des dés manquent est `enAttente` (avec ce qui est déjà
 * exact : le jet et son issue quand il ne manque que les dégâts) ; les autres sont finies
 * (un raté ne demande pas de dégâts). `requis` : les dés de l'étape suivante, pour toutes les
 * cibles ensemble.
 */
import type { Fiche } from '../calcul/index.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import type { Generateur, PhaseDes, Valeur } from '../formules/index.js';
import type { Action, ContexteCombatSaisi } from '../schema/index.js';
import {
  executer,
  type Ajustements,
  type ErreurAction,
  type IssueForcee,
  type ResultatAction,
} from './actions.js';
import type { Modification } from './modifications.js';
import {
  DesRequis,
  generateurParCible,
  ParametresRequis,
  partagerGenerateur,
  type DeRequis,
  type SourceDes,
} from './planification.js';

export type ModeJet = 'commun' | 'par-cible';

export interface CibleAction {
  /** Identifiant libre (personnage), repris dans le résultat. */
  id: string;
  fiche: Fiche;
  /** Réaction de la cible : valeurs de ses paramètres `par: cible` (absentes : défauts). */
  reaction?: Record<string, Valeur>;
  /** Issue imposée pour cette cible (MJ). */
  forcer?: IssueForcee;
  /** Contexte du combat propre à cette cible (`@combat.*`) ; absent : celui de la demande. */
  combat?: ContexteCombatSaisi;
}

export interface DemandeMulticible {
  action: string;
  acteur: Fiche;
  cibles: CibleAction[];
  /** Paramètres de l'acteur ; ceux `par: cible` sont ignorés (ils viennent des réactions). */
  parametres?: Record<string, Valeur>;
  /** Mode de jet ; absent : celui que déclare l'action (`multicible.jet`), sinon `par-cible`. */
  jet?: ModeJet;
  ajustements?: Ajustements;
  /**
   * Contexte du combat (`@combat.*`) commun à toutes les cibles, figé à la déclaration ; une
   * cible peut porter le sien (`CibleAction.combat`). Absent : hors combat.
   */
  combat?: ContexteCombatSaisi;
  /**
   * Générateur des dés (il est partagé ou non selon le mode), ou source de générateurs par
   * cible déjà prête (dés planifiés, voir `aleatoirePlanifie`).
   */
  aleatoire: Generateur | SourceDes;
}

export type ResultatCible =
  | { id: string; ok: true; resultat: ResultatAction }
  | { id: string; ok: false; erreurs: ErreurAction[] };

/** Cible dont des dés restent à lancer (générateur planifié). */
export interface CibleEnAttente {
  id: string;
  /** Phase des dés qui lui manquent. */
  phase: PhaseDes;
  /** Ce qui est déjà exact (jet et issue, puis valeurs après le jet) ; null avant le jet. */
  partiel: ResultatAction | null;
  /** Paramètres `etape: apres` qu'elle attend (l'arme, une fois touchée). */
  parametres?: string[];
}

export type ResultatMulticible =
  | { ok: false; erreurs: ErreurAction[] }
  | {
      ok: true;
      jet: ModeJet;
      /** Cibles finies (résolues ou refusées), dans l'ordre de la demande. */
      cibles: ResultatCible[];
      /** Cibles dont des dés restent à lancer (générateur planifié), dans l'ordre. */
      enAttente: CibleEnAttente[];
      /** Modifications de l'acteur (coûts), comptées une fois ; vides tant qu'un dé manque. */
      acteur: Modification[];
      /** Dés encore à lancer (générateur planifié) : le résultat n'est pas encore final. */
      requis: DeRequis[];
      /**
       * Paramètres `etape: apres` à fournir avant la suite (l'arme, une fois une cible touchée),
       * dans l'ordre de l'action ; les mêmes pour toutes les cibles.
       */
      parametres: string[];
    };

/** Mode de jet proposé par l'action (défaut : un jet par cible). */
export function modeDeJet(action: Pick<Action, 'multicible'>): ModeJet {
  return action.multicible?.jet ?? 'par-cible';
}

/**
 * Paramètres `par: cible` proposés à une cible (défense active) : ceux dont l'`exige` est vrai
 * pour elle, ou qui n'en ont pas.
 */
export function parametresReaction(
  systeme: SystemeCharge,
  actionId: string,
  cible: Fiche,
): string[] {
  const action = systeme.actions.get(actionId);
  if (!action) return [];
  return action.parametres
    .filter((p) => {
      if (p.par !== 'cible') return false;
      const exige = systeme.formules.get(chemins.action(action.id, `parametres/${p.id}/exige`));
      return !exige || cible.evaluer(exige, {}, false) === true;
    })
    .map((p) => p.id);
}

const estSource = (a: Generateur | SourceDes): a is SourceDes => 'pour' in a;

export function executerMulticible(
  systeme: SystemeCharge,
  demande: DemandeMulticible,
): ResultatMulticible {
  const action = systeme.actions.get(demande.action);
  if (!action) return { ok: false, erreurs: [{ message: `Action inconnue : ${demande.action}` }] };
  if (!action.cible)
    return { ok: false, erreurs: [{ message: `${action.nom} ne prend pas de cible` }] };
  if (!demande.cibles.length) return { ok: false, erreurs: [{ message: 'Aucune cible' }] };
  const max = action.multicible?.max;
  if (max !== undefined && demande.cibles.length > max)
    return {
      ok: false,
      erreurs: [{ message: `${action.nom} : ${max} cible(s) au plus` }],
    };

  const jet = demande.jet ?? modeDeJet(action);
  let source;
  if (estSource(demande.aleatoire)) source = demande.aleatoire;
  else if (jet === 'commun') source = partagerGenerateur(demande.aleatoire);
  else source = generateurParCible(demande.aleatoire);

  // Les paramètres de la cible viennent de sa réaction, jamais de l'acteur
  const deCible = new Set(action.parametres.filter((p) => p.par === 'cible').map((p) => p.id));
  const communs = Object.fromEntries(
    Object.entries(demande.parametres ?? {}).filter(([k]) => !deCible.has(k)),
  );

  const cibles: ResultatCible[] = [];
  const enAttente: CibleEnAttente[] = [];
  const requis = new Map<string, DeRequis & { demandes: number }>();
  let acteur: Modification[] | undefined;
  const aChoisir = new Set<string>();
  demande.cibles.forEach((c, index) => {
    const reaction = Object.fromEntries(
      Object.entries(c.reaction ?? {}).filter(([k]) => deCible.has(k)),
    );
    try {
      const r = executer(systeme, {
        action: action.id,
        acteur: demande.acteur,
        cible: c.fiche,
        parametres: { ...communs, ...reaction },
        aleatoire: source.pour(c.id, index),
        ...(demande.ajustements ? { ajustements: demande.ajustements } : {}),
        ...(c.forcer ? { forcer: c.forcer } : {}),
        ...((c.combat ?? demande.combat) ? { combat: c.combat ?? demande.combat } : {}),
      });
      if (!r.ok) {
        cibles.push({ id: c.id, ok: false, erreurs: r.erreurs });
        return;
      }
      const resultat = r.resultat;
      acteur ??= resultat.modifications.filter((m) => m.entite === 'acteur');
      cibles.push({
        id: c.id,
        ok: true,
        resultat: {
          ...resultat,
          modifications: resultat.modifications.filter((m) => m.entite === 'cible'),
        },
      });
    } catch (e) {
      if (e instanceof ParametresRequis) {
        for (const p of e.parametres) aChoisir.add(p);
        enAttente.push({
          id: c.id,
          phase: e.phase,
          partiel: {
            ...e.partiel,
            modifications: e.partiel.modifications.filter((m) => m.entite === 'cible'),
          },
          parametres: e.parametres,
        });
        return;
      }
      if (!(e instanceof DesRequis)) throw e;
      const partiel = e.partiel
        ? {
            ...e.partiel,
            modifications: e.partiel.modifications.filter((m) => m.entite === 'cible'),
          }
        : null;
      enAttente.push({ id: c.id, phase: e.phase, partiel });
      for (const d of e.des) {
        const deja = requis.get(d.id);
        if (deja) deja.demandes++;
        else requis.set(d.id, { ...d, ...(jet === 'commun' ? { cible: c.id } : {}), demandes: 1 });
      }
    }
  });

  // Jet commun : un dé que plusieurs cibles demandent n'appartient à aucune
  const aLancer = [...requis.values()].map(({ demandes, ...d }): DeRequis => {
    if (demandes > 1) delete d.cible;
    return d;
  });

  const parametres = action.parametres.filter((p) => aChoisir.has(p.id)).map((p) => p.id);
  return {
    ok: true,
    jet,
    cibles,
    enAttente,
    acteur: aLancer.length || parametres.length ? [] : (acteur ?? []),
    requis: aLancer,
    parametres,
  };
}
