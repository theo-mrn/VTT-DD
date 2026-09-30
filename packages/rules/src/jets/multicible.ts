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
 */
import type { Fiche } from '../calcul/index.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import type { Generateur, Valeur } from '../formules/index.js';
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

export type ResultatMulticible =
  | { ok: false; erreurs: ErreurAction[] }
  | {
      ok: true;
      jet: ModeJet;
      cibles: ResultatCible[];
      /** Modifications de l'acteur (coûts), comptées une fois. */
      acteur: Modification[];
      /** Dés encore à lancer (générateur planifié) : le résultat n'est pas encore final. */
      requis: DeRequis[];
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
  const source = estSource(demande.aleatoire)
    ? demande.aleatoire
    : jet === 'commun'
      ? partagerGenerateur(demande.aleatoire)
      : generateurParCible(demande.aleatoire);

  // Les paramètres de la cible viennent de sa réaction, jamais de l'acteur
  const deCible = new Set(action.parametres.filter((p) => p.par === 'cible').map((p) => p.id));
  const communs = Object.fromEntries(
    Object.entries(demande.parametres ?? {}).filter(([k]) => !deCible.has(k)),
  );

  const cibles: ResultatCible[] = [];
  const requis = new Map<string, DeRequis & { demandes: number }>();
  let acteur: Modification[] | undefined;
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
      if (!(e instanceof DesRequis)) throw e;
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

  return {
    ok: true,
    jet,
    cibles: aLancer.length ? [] : cibles,
    acteur: aLancer.length ? [] : (acteur ?? []),
    requis: aLancer,
  };
}
