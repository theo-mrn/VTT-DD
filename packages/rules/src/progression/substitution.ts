/**
 * Substitution d'une entrée possédée par une autre de même sorte : une voie du catalogue
 * remplacée par sa variante maison (docs/entrees-libres.md). Tout ce qui la désigne dans l'état
 * passe à la nouvelle : possessions (rangs, choix, exemplaires…), journal des achats (les rangs
 * achetés se remboursent encore), effets coupés (`<entrée>/<index>`), usages consommés.
 */
import type { EtatEntite } from '../schema/index.js';
import { copier } from './outils.js';

/** Clé d'effet coupé de `de` (`de/i` ou `de#exemplaire/i`) réécrite pour `vers`. */
function cleVers(cle: string, de: string, vers: string): string {
  if (cle.startsWith(`${de}/`) || cle.startsWith(`${de}#`)) return vers + cle.slice(de.length);
  return cle;
}

export function substituerEntree(etat: EtatEntite, de: string, vers: string): EtatEntite {
  if (de === vers) return etat;
  const suivant = copier(etat);
  suivant.possessions = suivant.possessions.map((p) =>
    p.entree === de ? { ...p, entree: vers } : p,
  );
  suivant.journal = suivant.journal.map((l) => (l.objet === de ? { ...l, objet: vers } : l));
  suivant.effetsDesactives = suivant.effetsDesactives.map((c) => cleVers(c, de, vers));
  if (de in suivant.usages) {
    const { [de]: consomme, ...autres } = suivant.usages;
    suivant.usages = { ...autres, [vers]: consomme! };
  }
  return suivant;
}
