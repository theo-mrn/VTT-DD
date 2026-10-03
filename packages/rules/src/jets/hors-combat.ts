/**
 * Hors de combat : formule `horsCombat` du type d'entité (`@PV <= 0`, `@neutralise`), évaluée
 * par le service après chaque application d'une attaque. Sans formule, pas de détection.
 */
import type { Fiche } from '../calcul/index.js';
import { chemins } from '../chargement/index.js';

/** Vrai si l'entité est hors de combat ; `undefined` si son type ne déclare pas de règle. */
export function estHorsCombat(fiche: Fiche): boolean | undefined {
  const f = fiche.systeme.formules.get(chemins.horsCombat(fiche.etat.type));
  return f ? fiche.evaluer(f, {}, false) === true : undefined;
}
