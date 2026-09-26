/**
 * Outils communs de la progression : copie d'état (les fonctions de ce module
 * ne mutent jamais l'état reçu) et évaluation protégée des formules.
 */
import type { Fiche } from '../calcul/index.js';
import type { EntiteChargee } from '../chargement/index.js';
import {
  ErreurEvaluation,
  evaluer,
  type ContexteEvaluation,
  type FormuleVerifiee,
  type JetDes,
  type Valeur,
} from '../formules/index.js';
import type { Attribut, EtatEntite, Possession } from '../schema/index.js';

/** Résultat d'une opération qui produit un nouvel état. */
export type ResultatEtat = { ok: true; etat: EtatEntite } | { ok: false; erreur: string };

export type Evaluation =
  { ok: true; valeur: Valeur; jets: JetDes[] } | { ok: false; message: string };

/** Copie profonde d'un état : on modifie la copie, jamais l'original. */
export function copier(etat: EtatEntite): EtatEntite {
  return {
    ...etat,
    systeme: { ...etat.systeme },
    valeurs: { ...etat.valeurs },
    possessions: etat.possessions.map(copierPossession),
    noeuds: Object.fromEntries(Object.entries(etat.noeuds).map(([k, v]) => [k, [...v]])),
    journal: etat.journal.map((l) => ({ ...l })),
  };
}

export function copierPossession(p: Possession): Possession {
  return {
    ...p,
    choix: Object.fromEntries(Object.entries(p.choix).map(([k, v]) => [k, [...v]])),
    champs: { ...p.champs },
  };
}

export function nouvellePossession(entree: string, rang = 0): Possession {
  return { entree, rang, actif: true, choix: {}, champs: {} };
}

/** Évalue une formule sur une fiche sans jamais lever d'erreur de données. */
export function essayer(
  fiche: Fiche,
  f: FormuleVerifiee,
  extra: Partial<ContexteEvaluation> = {},
): Evaluation {
  try {
    const r = evaluer(f.noeud, fiche.contexte(extra));
    return { ok: true, valeur: r.valeur, jets: r.jets };
  } catch (e) {
    if (!(e instanceof ErreurEvaluation)) throw e;
    return { ok: false, message: `${e.message} (« ${f.texte} »)` };
  }
}

/** Variables fournies à une formule, les autres noms lèvent une erreur d'évaluation. */
export function variables(vars: Record<string, Valeur>): (nom: string) => Valeur {
  return (nom) => {
    const v = vars[nom];
    if (v === undefined) throw new ErreurEvaluation(`Variable absente du contexte : ${nom}`, 0);
    return v;
  };
}

/** Valeur de base d'un attribut telle qu'enregistrée (ou sa valeur par défaut). */
export function valeurBase(etat: EtatEntite, a: Attribut & { nature: 'base' }): number {
  const v = etat.valeurs[a.cle];
  return typeof v === 'number' ? v : a.defaut;
}

/** Attributs visés par une étape : liste explicite, puis ceux du groupe retenus par `garder`. */
export function attributsVises(
  entite: EntiteChargee,
  o: { attributs?: string[] | undefined; groupe?: string | undefined },
  garder: (a: Attribut) => boolean,
): Attribut[] {
  const cles = new Set(o.attributs ?? []);
  if (o.groupe) {
    for (const a of entite.attributs.values())
      if (a.groupe === o.groupe && garder(a)) cles.add(a.cle);
  }
  return [...cles]
    .map((c) => entite.attributs.get(c))
    .filter((a): a is Attribut => a !== undefined);
}
