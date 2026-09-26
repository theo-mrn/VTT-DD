/**
 * Modifications d'état proposées par une action (dégâts, soins, dépense de
 * ressource…). Une action ne modifie jamais l'état elle-même : elle renvoie
 * ces modifications, que l'appelant applique (ou non) avec
 * `appliquerModifications`.
 */
import type { Fiche } from '../calcul/index.js';
import type { EtatEntite } from '../schema/index.js';

export interface Modification {
  /** Entité touchée : l'acteur ou la cible de l'action. */
  entite: 'acteur' | 'cible';
  /** Attribut de base ou ressource. */
  attribut: string;
  operation: 'ajouter' | 'retirer' | 'fixer';
  valeur: number;
}

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

  for (const m of modifications) {
    if (entite !== undefined && m.entite !== entite) continue;
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

  return { ...fiche.etat, valeurs };
}
