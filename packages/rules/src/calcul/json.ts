/**
 * Forme sérialisable d'une fiche calculée : ce que le service character
 * renvoie à ses clients (front, bots, API publique). Le front peut aussi
 * recalculer localement avec `calculer()` pour un aperçu immédiat.
 */
import type { Valeur } from '../formules/index.js';
import type { Fiche, LigneExplication } from './fiche.js';

export interface ValeurJson {
  valeur: Valeur;
  modificateur?: number;
  /** Apport aux jets libres, si l'attribut déclare `jet`. */
  jet?: number;
  min?: number;
  max?: number;
  detail: LigneExplication[];
}

export interface PossessionJson {
  entree: string;
  sorte: string;
  nom: string;
  rang: number;
  achete: number;
  actif: boolean;
  /** Possédée au sens des règles (rang 1 minimum pour une entrée à rangs). */
  effective: boolean;
  /** Nombre d'exemplaires (possessions explicites ; 1 pour une entrée obtenue par effet). */
  exemplaires: number;
  /** Somme des quantités des exemplaires. */
  quantite: number;
  sources: string[];
  marques: string[];
}

export interface FicheJson {
  systeme: { id: string; version: string };
  type: string;
  creation: boolean;
  valeurs: Record<string, ValeurJson>;
  possessions: PossessionJson[];
  erreurs: { ou: string; message: string }[];
}

export function ficheJson(fiche: Fiche): FicheJson {
  const valeurs: Record<string, ValeurJson> = {};
  for (const [cle, v] of fiche.valeurs) {
    valeurs[cle] = {
      valeur: v.valeur,
      ...(v.modificateur !== undefined ? { modificateur: v.modificateur } : {}),
      ...(v.jet !== undefined ? { jet: v.jet } : {}),
      ...(v.min !== undefined ? { min: v.min } : {}),
      ...(v.max !== undefined ? { max: v.max } : {}),
      detail: v.detail,
    };
  }
  return {
    systeme: { id: fiche.systeme.source.id, version: fiche.systeme.source.version },
    type: fiche.etat.type,
    creation: fiche.etat.creation,
    valeurs,
    possessions: [...fiche.possessions.values()].map((p) => ({
      entree: p.entree.id,
      sorte: p.sorte.id,
      nom: p.entree.nom,
      rang: p.rang,
      achete: p.achete,
      actif: p.actif,
      effective: !p.sorte.rangs || p.rang > 0,
      exemplaires: Math.max(1, p.exemplaires.length),
      quantite: p.quantite,
      sources: p.sources,
      marques: [...(fiche.marques.get(p.entree.id) ?? [])],
    })),
    erreurs: fiche.erreurs,
  };
}
