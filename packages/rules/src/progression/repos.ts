/**
 * Repos : chaque ressource revient à la borne déclarée par le système
 * (`recuperation` : `max` pour des PV, `min` pour des blessures ou du stress).
 */
import type { Fiche } from '../calcul/index.js';
import type { EtatEntite } from '../schema/index.js';
import { copier } from './outils.js';

/** Ramène les ressources (toutes, ou celles listées) à leur borne de récupération. */
export function recuperer(fiche: Fiche, attributs?: string[]): EtatEntite {
  const cles =
    attributs ??
    [...fiche.entite.attributs.values()].filter((a) => a.nature === 'ressource').map((a) => a.cle);
  const suivant = copier(fiche.etat);
  for (const cle of cles) {
    const a = fiche.entite.attributs.get(cle);
    if (a?.nature !== 'ressource')
      throw new Error(`${cle} n’est pas une ressource de ${fiche.entite.type.nom}`);
    const v = fiche.valeurs.get(cle);
    suivant.valeurs[cle] = (a.recuperation === 'max' ? v?.max : v?.min) ?? 0;
  }
  return suivant;
}
