/**
 * Monnaies : le reste d'une monnaie est son total (formule du système, qui
 * peut dépendre des attributs) moins les dépenses enregistrées au journal.
 */
import type { Fiche } from '../calcul/index.js';
import { chemins } from '../chargement/index.js';
import type { Monnaie } from '../schema/index.js';
import { essayer } from './outils.js';

export interface SoldeMonnaie {
  monnaie: Monnaie;
  /** Total gagné (formule `total`). */
  total: number;
  /** Somme des coûts du journal dans cette monnaie. */
  depense: number;
  solde: number;
  /** Erreur d'évaluation du total (le total vaut alors 0). */
  erreur?: string;
}

/** Monnaies utilisables par le type de l'entité. */
export function monnaiesDe(fiche: Fiche): Monnaie[] {
  return [...fiche.systeme.monnaies.values()].filter((m) => m.pour.includes(fiche.etat.type));
}

export function detailSolde(fiche: Fiche, id: string): SoldeMonnaie {
  const monnaie = fiche.systeme.monnaies.get(id);
  if (!monnaie) throw new Error(`Monnaie inconnue du système ${fiche.systeme.source.id} : ${id}`);
  if (!monnaie.pour.includes(fiche.etat.type)) {
    throw new Error(`${monnaie.nom} n’est pas une monnaie de ${fiche.entite.type.nom}`);
  }
  const depense = fiche.etat.journal
    .filter((l) => l.monnaie === id)
    .reduce((s, l) => s + l.cout, 0);
  const r = essayer(fiche, fiche.systeme.formule(chemins.monnaie(id)));
  const total = r.ok ? Number(r.valeur) : 0;
  return {
    monnaie,
    total,
    depense,
    solde: total - depense,
    ...(r.ok ? {} : { erreur: r.message }),
  };
}

/** Reste disponible dans une monnaie. */
export function solde(fiche: Fiche, monnaie: string): number {
  return detailSolde(fiche, monnaie).solde;
}

/** Détail de toutes les monnaies de l'entité. */
export function soldes(fiche: Fiche): SoldeMonnaie[] {
  return monnaiesDe(fiche).map((m) => detailSolde(fiche, m.id));
}
