/**
 * Fiche calculée, partagée par tous les composants qui lisent le même état avec le
 * même système : la fiche, le HUD, la carte, le combat et les dés ne refont plus
 * chacun le calcul. L'état garde son identité tant que la fiche ne change pas
 * (partage structurel de TanStack Query), le système aussi (chargé une fois, ou
 * réglé par `avecOptions`, mémoïsé) : la paire suffit comme clé, et la mémoire
 * se libère avec eux. Une `Fiche` n'est jamais modifiée après le calcul.
 */
import { calculer, type EtatEntite, type Fiche, type SystemeCharge } from '@vtt/rules';

const fiches = new WeakMap<EtatEntite, WeakMap<SystemeCharge, Fiche>>();

/** `calculer(systeme, etat)`, une fois par paire ; une erreur du calcul remonte, rien n'est gardé. */
export function calculerMemo(systeme: SystemeCharge, etat: EtatEntite): Fiche {
  let parSysteme = fiches.get(etat);
  const connue = parSysteme?.get(systeme);
  if (connue) return connue;
  const fiche = calculer(systeme, etat);
  if (!parSysteme) fiches.set(etat, (parSysteme = new WeakMap()));
  parSysteme.set(systeme, fiche);
  return fiche;
}
