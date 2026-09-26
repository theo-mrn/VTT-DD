/**
 * Modifications d'état proposées par une action (dégâts, soins, dépense de
 * ressource…). Une action ne modifie jamais l'état elle-même : elle renvoie
 * ces modifications, que l'appelant applique (ou non) avec
 * `appliquerModifications`.
 */
import type { Fiche } from '../calcul/index.js';
import type { SystemeCharge } from '../chargement/index.js';
import type { EtatEntite } from '../schema/index.js';

export interface ModificationAttribut {
  /** Entité touchée : l'acteur ou la cible de l'action. */
  entite: 'acteur' | 'cible';
  /** Attribut de base ou ressource. */
  attribut: string;
  operation: 'ajouter' | 'retirer' | 'fixer';
  /** Valeur appliquée (après résistances pour des dégâts typés). */
  valeur: number;
  /** Type de dégâts, et dégâts avant résistances. */
  type?: string;
  brut?: number;
}

/** Entrée donnée ou retirée (état, blessure…), avec une durée éventuelle en rounds. */
export interface ModificationEntree {
  entite: 'acteur' | 'cible';
  entree: string;
  operation: 'donner' | 'retirer';
  rangs: number;
  duree?: number;
}

export type Modification = ModificationAttribut | ModificationEntree;

/**
 * Applique des modifications à l'état d'une fiche et renvoie un nouvel état
 * (l'état d'origine n'est pas touché). Seules les valeurs stockées changent :
 * les bornes (minimum, maximum d'une ressource) sont appliquées ensuite par
 * `calculer`.
 *
 * Point de départ quand aucune valeur n'est stockée : la valeur courante
 * calculée pour une ressource (sa valeur initiale), la valeur de base (défaut
 * borné, sans les effets) pour un attribut de base.
 *
 * `entite` restreint l'application aux modifications de cette entité ; sans
 * lui, toutes les modifications données sont appliquées.
 */
export function appliquerModifications(
  fiche: Fiche,
  modifications: Modification[],
  entite?: Modification['entite'],
): EtatEntite {
  const valeurs = { ...fiche.etat.valeurs };
  let possessions = fiche.etat.possessions;

  for (const m of modifications) {
    if (entite !== undefined && m.entite !== entite) continue;
    if ('entree' in m) {
      possessions = modifierPossession(fiche.systeme, possessions, m);
      continue;
    }
    const a = fiche.entite.attributs.get(m.attribut);
    if (!a || (a.nature !== 'base' && a.nature !== 'ressource')) {
      throw new Error(
        `Attribut de base ou ressource attendu sur ${fiche.entite.type.nom} : ${m.attribut}`,
      );
    }
    const stocke = valeurs[m.attribut];
    const depart =
      typeof stocke === 'number'
        ? stocke
        : a.nature === 'ressource'
          ? Number(fiche.valeur(m.attribut))
          : Number(
              fiche.valeurs.get(m.attribut)?.detail.find((l) => l.source === 'base')?.valeur ??
                a.defaut,
            );
    valeurs[m.attribut] =
      m.operation === 'fixer'
        ? m.valeur
        : m.operation === 'ajouter'
          ? depart + m.valeur
          : depart - m.valeur;
  }

  return { ...fiche.etat, valeurs, possessions };
}

/** Donne (possession ou rangs) ou retire (rangs, puis possession) une entrée. */
function modifierPossession(
  systeme: SystemeCharge,
  possessions: EtatEntite['possessions'],
  m: ModificationEntree,
): EtatEntite['possessions'] {
  const entree = systeme.entrees.get(m.entree);
  if (!entree) throw new Error(`Entrée inconnue : ${m.entree}`);
  const aRangs = !!systeme.sortes.get(entree.sorte)?.rangs;
  const liste = possessions.map((p) => ({ ...p }));
  const existante = liste.find((p) => p.entree === m.entree);
  const rangs = Math.max(0, Math.floor(m.rangs));

  if (m.operation === 'donner') {
    if (existante) {
      if (aRangs) existante.rang += rangs;
      existante.actif = true;
      if (m.duree !== undefined) existante.duree = Math.max(existante.duree ?? 0, m.duree);
      return liste;
    }
    liste.push({
      entree: m.entree,
      rang: aRangs ? rangs : 0,
      actif: true,
      choix: {},
      champs: {},
      ...(m.duree !== undefined ? { duree: m.duree } : {}),
    });
    return liste;
  }

  if (!existante) return liste;
  if (aRangs && existante.rang > rangs) {
    existante.rang -= rangs;
    return liste;
  }
  return liste.filter((p) => p !== existante);
}

/**
 * Applique le résultat d'une table à un état : l'entrée de la ligne (blessure
 * critique, état…) est ajoutée, ou gagne un rang si elle se possède par rangs
 * et est déjà possédée. Renvoie un nouvel état ; sans entrée, l'état est rendu tel quel.
 */
export function appliquerTirage(
  systeme: SystemeCharge,
  etat: EtatEntite,
  tirage: { ligne: { entree?: string | undefined } | null },
): EtatEntite {
  const id = tirage.ligne?.entree;
  const entree = id ? systeme.entrees.get(id) : undefined;
  if (!id || !entree) return etat;
  const aRangs = !!systeme.sortes.get(entree.sorte)?.rangs;
  const possessions = etat.possessions.map((p) => ({ ...p }));
  const existante = possessions.find((p) => p.entree === id);
  if (existante) {
    if (aRangs) existante.rang += 1;
  } else {
    possessions.push({ entree: id, rang: aRangs ? 1 : 0, actif: true, choix: {}, champs: {} });
  }
  return { ...etat, possessions };
}
