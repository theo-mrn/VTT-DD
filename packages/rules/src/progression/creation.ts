/**
 * Création de personnage : suite d'étapes déclarées par le système (choisir,
 * répartir, tirer, saisir, acheter). L'état ne garde pas la trace des étapes :
 * leur avancement se déduit de l'état lui-même (entrées possédées, valeurs
 * enregistrées, soldes).
 *
 * Chaque appliquateur vérifie l'étape et renvoie un nouvel état ; il ne mute
 * jamais l'état reçu.
 */
import { calculer, type Fiche } from '../calcul/index.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import type { FormuleVerifiee, Generateur, JetDes, Valeur } from '../formules/index.js';
import type {
  Attribut,
  Choix,
  Creation,
  Entree,
  EtapeCreation,
  EtatEntite,
} from '../schema/index.js';
import { acheter, type DemandeAchat, type ResultatAchat } from './achats.js';
import { detailSolde } from './monnaies.js';
import {
  attributsVises,
  copier,
  copierPossession,
  essayer,
  nouvellePossession,
  valeurBase,
  variables,
  type ResultatEtat,
} from './outils.js';

export type StatutEtape = 'faite' | 'a-faire' | 'invalide';

export interface EtatEtape {
  etape: EtapeCreation;
  statut: StatutEtape;
  /** Erreurs d'abord, puis ce qui reste à faire. */
  raisons: string[];
  /** Répartition : budget et coût cumulé des valeurs actuelles. */
  budget?: number;
  depense?: number;
}

type Etape<T extends EtapeCreation['type']> = Extract<EtapeCreation, { type: T }>;

interface Examen {
  invalides: string[];
  aFaire: string[];
  budget?: number;
  depense?: number;
}

/** Entrée retenue à une étape « choisir », avec ses choix éventuels. */
export interface Selection {
  entree: string;
  /** Entrées retenues pour chaque choix de l'entrée (par identifiant de choix). */
  choix?: Record<string, string[]>;
}

export interface Tirage {
  /** Une valeur par attribut visé. */
  valeurs: number[];
  /** Dés de chaque valeur. */
  jets: JetDes[][];
  total: number;
  min: number;
  max: number;
  /** La contrainte de l'étape est respectée (toujours vrai sans contrainte). */
  valide: boolean;
  /** Tirages automatiquement refaits avant celui-ci (étape `relancer`). */
  relances: number;
}

/** Nombre maximal de tirages refaits automatiquement pour un essai (étape `relancer`). */
export const LIMITE_RELANCES = 10_000;

export type ResultatTirage =
  | {
      ok: true;
      /** Tous les tirages complets effectués, dans l'ordre. */
      tirages: Tirage[];
      /** Premier tirage qui respecte la contrainte. */
      retenu: Tirage;
      attribution: 'ordre' | 'libre';
      /** Attributs visés, dans l'ordre de l'étape. */
      attributs: string[];
      /**
       * Enregistre le tirage retenu. En attribution `libre`, `affectation`
       * donne pour chaque attribut l'indice de la valeur choisie dans
       * `retenu.valeurs` ; en attribution `ordre`, elle est ignorée.
       */
      attribuer(affectation?: Record<string, number>): ResultatEtat;
    }
  | { ok: false; erreur: string; tirages: Tirage[] };

// ─── Outils ──────────────────────────────────────────────────────────────────

export function creationDe(systeme: SystemeCharge, type: string): Creation | undefined {
  return systeme.source.creation.find((c) => c.entite === type);
}

function preparer<T extends EtapeCreation['type']>(
  systeme: SystemeCharge,
  etat: EtatEntite,
  id: string,
  type: T,
): { ok: true; etape: Etape<T> } | { ok: false; erreur: string } {
  if (!etat.creation) return { ok: false, erreur: 'La création est terminée' };
  const creation = creationDe(systeme, etat.type);
  if (!creation) return { ok: false, erreur: `Aucune création déclarée pour ${etat.type}` };
  const etape = creation.etapes.find((e) => e.id === id);
  if (!etape) return { ok: false, erreur: `Étape inconnue : ${id}` };
  if (etape.type !== type)
    return { ok: false, erreur: `L’étape « ${etape.nom} » n’est pas une étape « ${type} »` };
  return { ok: true, etape: etape as Etape<T> };
}

const echec = (erreurs: string[]): ResultatEtat => ({ ok: false, erreur: erreurs.join(' ; ') });

const estBase = (a: Attribut): a is Attribut & { nature: 'base' } => a.nature === 'base';

/** Attributs de base visés (répartition, tirage). */
function ciblesBase(systeme: SystemeCharge, etat: EtatEntite, et: Etape<'repartir' | 'tirer'>) {
  return attributsVises(systeme.entites.get(etat.type)!, et, estBase).filter(estBase);
}

/** Attributs saisissables visés (tout sauf les dérivées). */
function ciblesSaisie(systeme: SystemeCharge, etat: EtatEntite, et: Etape<'saisir'>): Attribut[] {
  return attributsVises(systeme.entites.get(etat.type)!, et, (a) => a.nature !== 'derivee');
}

function nombre(
  fiche: Fiche,
  f: FormuleVerifiee,
  erreurs: string[],
  vars?: Record<string, Valeur>,
): number | undefined {
  const r = essayer(fiche, f, vars ? { variable: variables(vars) } : {});
  if (r.ok) return Number(r.valeur);
  erreurs.push(r.message);
  return undefined;
}

/** Entrées d'une sorte possédées explicitement dans l'état. */
function possessionsDeSorte(systeme: SystemeCharge, etat: EtatEntite, sorte: string) {
  return etat.possessions.filter((p) => systeme.entrees.get(p.entree)?.sorte === sorte);
}

/** Erreurs d'une valeur saisie pour un attribut, bornes lues sur la fiche. */
function erreurSaisie(fiche: Fiche, a: Attribut, v: Valeur): string | undefined {
  switch (a.nature) {
    case 'base':
    case 'ressource': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${a.nom} : nombre attendu`;
      const c = fiche.valeurs.get(a.cle);
      if (c?.min !== undefined && v < c.min) return `${a.nom} : ${v} inférieur au minimum ${c.min}`;
      if (c?.max !== undefined && v > c.max) return `${a.nom} : ${v} supérieur au maximum ${c.max}`;
      return undefined;
    }
    case 'texte':
      return typeof v === 'string' ? undefined : `${a.nom} : texte attendu`;
    case 'choix':
      return typeof v === 'string' && a.options.some((o) => o.valeur === v)
        ? undefined
        : `${a.nom} : option inconnue « ${String(v)} »`;
    case 'booleen':
      return typeof v === 'boolean' ? undefined : `${a.nom} : oui ou non attendu`;
    case 'derivee':
      return `${a.nom} est calculé, il ne se saisit pas`;
  }
}

// ─── Choix d'une entrée ──────────────────────────────────────────────────────

/** Entrées proposées par un choix, compte tenu des marques de la fiche. */
export function optionsChoix(fiche: Fiche, c: Choix): Entree[] {
  return [...fiche.systeme.entrees.values()].filter(
    (e) => erreursOption(fiche, c, e) === undefined,
  );
}

function erreursOption(fiche: Fiche, c: Choix, e: Entree): string | undefined {
  if (e.sorte !== c.parmi.sorte) {
    const sorte = fiche.systeme.sortes.get(c.parmi.sorte);
    return `${c.nom} : ${e.nom} n’est pas de la sorte ${sorte?.nom ?? c.parmi.sorte}`;
  }
  if (c.parmi.entrees && !c.parmi.entrees.includes(e.id))
    return `${c.nom} : ${e.nom} ne fait pas partie des entrées proposées`;
  const marques = fiche.marques.get(e.id);
  if (c.parmi.marque && !marques?.has(c.parmi.marque))
    return `${c.nom} : ${e.nom} n’a pas la marque « ${c.parmi.marque} »`;
  if (c.parmi.sansMarque && marques?.has(c.parmi.sansMarque))
    return `${c.nom} : ${e.nom} a la marque « ${c.parmi.sansMarque} »`;
  return undefined;
}

/** Erreurs des entrées retenues pour un choix (au plus `nombre`, sans doublon). */
export function erreursChoix(fiche: Fiche, c: Choix, ids: string[]): string[] {
  const erreurs: string[] = [];
  if (new Set(ids).size !== ids.length) erreurs.push(`${c.nom} : entrée choisie deux fois`);
  if (ids.length > c.nombre) erreurs.push(`${c.nom} : ${c.nombre} choix au plus`);
  for (const id of ids) {
    const e = fiche.systeme.entrees.get(id);
    const err = e ? erreursOption(fiche, c, e) : `${c.nom} : entrée inconnue ${id}`;
    if (err) erreurs.push(err);
  }
  return erreurs;
}

// ─── Examen des étapes ───────────────────────────────────────────────────────

function examinerChoisir(fiche: Fiche, et: Etape<'choisir'>): Examen {
  const { systeme, etat } = fiche;
  const invalides: string[] = [];
  const aFaire: string[] = [];
  const sorte = systeme.sortes.get(et.sorte)!;
  const pris = possessionsDeSorte(systeme, etat, et.sorte);
  if (!sorte.pour.includes(etat.type))
    invalides.push(`${sorte.nom} non possédable par ${fiche.entite.type.nom}`);
  if (pris.length > et.max) invalides.push(`${et.nom} : ${et.max} au plus (${pris.length})`);
  if (sorte.maximum !== undefined && pris.length > sorte.maximum)
    invalides.push(`${sorte.nom} : ${sorte.maximum} au plus`);
  if (pris.length < et.min)
    aFaire.push(
      pris.length ? `${et.nom} : encore ${et.min - pris.length} à choisir` : `${et.nom} à choisir`,
    );
  if (!pris.length) return { invalides, aFaire };

  // Prérequis lus sans les entrées de la sorte, choix vérifiés sans les choix
  // eux-mêmes (un choix qui pose une marque ne s'exclut pas lui-même)
  const ids = new Set(pris.map((p) => p.entree));
  const sans = calculer(systeme, {
    ...etat,
    possessions: etat.possessions.filter((p) => !ids.has(p.entree)),
  });
  const sansChoix = calculer(systeme, {
    ...etat,
    possessions: etat.possessions.map((p) => (ids.has(p.entree) ? { ...p, choix: {} } : p)),
  });

  for (const p of pris) {
    const entree = systeme.entrees.get(p.entree)!;
    const exige = systeme.formules.get(chemins.exige(entree.id));
    if (exige) {
      const r = essayer(sans, exige);
      if (!r.ok) invalides.push(`${entree.nom} : ${r.message}`);
      else if (r.valeur !== true)
        invalides.push(`${entree.nom} : prérequis non rempli (${exige.texte})`);
    }
    for (const k of Object.keys(p.choix)) {
      if (!entree.choix.some((c) => c.id === k))
        invalides.push(`${entree.nom} : choix inconnu ${k}`);
    }
    for (const c of entree.choix) {
      const choisis = p.choix[c.id] ?? [];
      invalides.push(...erreursChoix(sansChoix, c, choisis));
      if (choisis.length < c.nombre)
        aFaire.push(`${entree.nom} : ${c.nom} (${choisis.length}/${c.nombre})`);
    }
  }
  return { invalides, aFaire };
}

function examinerRepartir(fiche: Fiche, et: Etape<'repartir'>): Examen {
  const { systeme, etat } = fiche;
  const invalides: string[] = [];
  const ch = (x: string) => systeme.formule(chemins.etape(etat.type, et.id, x));
  const budget = nombre(fiche, ch('budget'), invalides);
  const min = nombre(fiche, ch('min'), invalides);
  const max = nombre(fiche, ch('max'), invalides);
  const manquants: string[] = [];
  let depense = 0;
  for (const a of ciblesBase(systeme, etat, et)) {
    const v = valeurBase(etat, a);
    if (typeof etat.valeurs[a.cle] !== 'number') manquants.push(a.nom);
    if (min !== undefined && v < min) invalides.push(`${a.nom} : ${v} inférieur au minimum ${min}`);
    if (max !== undefined && v > max) invalides.push(`${a.nom} : ${v} supérieur au maximum ${max}`);
    depense += nombre(fiche, ch('cout'), invalides, { valeur: v }) ?? 0;
  }
  if (budget !== undefined && depense > budget)
    invalides.push(`${et.nom} : ${depense} points dépensés pour un budget de ${budget}`);
  return {
    invalides,
    aFaire: manquants.length ? [`${et.nom} : ${manquants.join(', ')} à répartir`] : [],
    ...(budget !== undefined ? { budget } : {}),
    depense,
  };
}

function examinerTirer(fiche: Fiche, et: Etape<'tirer'>): Examen {
  const manquants = ciblesBase(fiche.systeme, fiche.etat, et)
    .filter((a) => typeof fiche.etat.valeurs[a.cle] !== 'number')
    .map((a) => a.nom);
  return {
    invalides: [],
    aFaire: manquants.length ? [`${et.nom} : ${manquants.join(', ')} à tirer`] : [],
  };
}

function examinerSaisir(fiche: Fiche, et: Etape<'saisir'>): Examen {
  const invalides: string[] = [];
  const manquants: string[] = [];
  for (const a of ciblesSaisie(fiche.systeme, fiche.etat, et)) {
    const v = fiche.etat.valeurs[a.cle];
    if (v === undefined) {
      if (a.nature === 'derivee') invalides.push(`${a.nom} est calculé, il ne se saisit pas`);
      else manquants.push(a.nom);
      continue;
    }
    const err = erreurSaisie(fiche, a, v);
    if (err) invalides.push(err);
  }
  return {
    invalides,
    aFaire: manquants.length ? [`${et.nom} : ${manquants.join(', ')} à saisir`] : [],
  };
}

function examinerAcheter(fiche: Fiche, et: Etape<'acheter'>): Examen {
  const invalides: string[] = [];
  const monnaies = new Set(et.achats.map((id) => fiche.systeme.achats.get(id)!.monnaie));
  for (const m of monnaies) {
    const monnaie = fiche.systeme.monnaies.get(m)!;
    if (!monnaie.pour.includes(fiche.etat.type)) continue;
    const s = detailSolde(fiche, m);
    if (s.erreur) invalides.push(`${monnaie.nom} : ${s.erreur}`);
    else if (s.solde < 0) invalides.push(`${monnaie.nom} : ${-s.solde} dépensé(s) en trop`);
  }
  return { invalides, aFaire: [] };
}

function examiner(fiche: Fiche, et: EtapeCreation): Examen {
  switch (et.type) {
    case 'choisir':
      return examinerChoisir(fiche, et);
    case 'repartir':
      return examinerRepartir(fiche, et);
    case 'tirer':
      return examinerTirer(fiche, et);
    case 'saisir':
      return examinerSaisir(fiche, et);
    case 'acheter':
      return examinerAcheter(fiche, et);
  }
}

/** Avancement de chaque étape de création déclarée pour le type de l'entité. */
export function etapesCreation(systeme: SystemeCharge, etat: EtatEntite): EtatEtape[] {
  const creation = creationDe(systeme, etat.type);
  if (!creation) return [];
  const fiche = calculer(systeme, etat);
  return creation.etapes.map((etape) => {
    const { invalides, aFaire, ...reste } = examiner(fiche, etape);
    return {
      etape,
      statut: invalides.length ? 'invalide' : aFaire.length ? 'a-faire' : 'faite',
      raisons: [...invalides, ...aFaire],
      ...reste,
    };
  });
}

/** Valide l'étape sur le nouvel état : seules les erreurs bloquent, pas ce qui reste à faire. */
function valider(systeme: SystemeCharge, etat: EtatEntite, et: EtapeCreation): ResultatEtat {
  const { invalides } = examiner(calculer(systeme, etat), et);
  return invalides.length ? echec(invalides) : { ok: true, etat };
}

// ─── Appliquateurs ───────────────────────────────────────────────────────────

/**
 * Étape « choisir » : remplace les entrées de la sorte par la sélection. Une
 * entrée déjà possédée garde ses rangs et ses champs ; ses choix sont
 * remplacés s'ils sont fournis. Des choix partiels sont acceptés (l'étape
 * reste alors « à faire »), des choix invalides non.
 */
export function choisirEtape(
  systeme: SystemeCharge,
  etat: EtatEntite,
  etapeId: string,
  selection: Selection[],
): ResultatEtat {
  const p = preparer(systeme, etat, etapeId, 'choisir');
  if (!p.ok) return p;
  const et = p.etape;
  const erreurs: string[] = [];
  if (selection.length < et.min || selection.length > et.max) {
    erreurs.push(
      et.min === et.max
        ? `${et.nom} : ${et.min} choix attendu(s)`
        : `${et.nom} : entre ${et.min} et ${et.max} choix`,
    );
  }
  const ids = selection.map((s) => s.entree);
  if (new Set(ids).size !== ids.length) erreurs.push(`${et.nom} : entrée choisie deux fois`);
  for (const s of selection) {
    const e = systeme.entrees.get(s.entree);
    if (!e) erreurs.push(`Entrée inconnue : ${s.entree}`);
    else if (e.sorte !== et.sorte) erreurs.push(`${e.nom} n’est pas de la sorte ${et.sorte}`);
    else
      for (const k of Object.keys(s.choix ?? {}))
        if (!e.choix.some((c) => c.id === k)) erreurs.push(`${e.nom} : choix inconnu ${k}`);
  }
  if (erreurs.length) return echec(erreurs);

  const garde = new Set(ids);
  for (const q of possessionsDeSorte(systeme, etat, et.sorte)) {
    if (garde.has(q.entree)) continue;
    for (const arbre of systeme.arbres.values()) {
      if (arbre.ouvertPar === q.entree && etat.noeuds[arbre.id]?.length)
        erreurs.push(`Des nœuds de l’arbre « ${arbre.nom} » dépendent de ${q.entree}`);
    }
  }
  if (erreurs.length) return echec(erreurs);

  const suivant = copier(etat);
  suivant.possessions = suivant.possessions.filter(
    (q) => systeme.entrees.get(q.entree)?.sorte !== et.sorte,
  );
  for (const s of selection) {
    const existante = etat.possessions.find((q) => q.entree === s.entree);
    const poss = existante ? copierPossession(existante) : nouvellePossession(s.entree);
    if (s.choix)
      poss.choix = Object.fromEntries(Object.entries(s.choix).map(([k, v]) => [k, [...v]]));
    suivant.possessions.push(poss);
  }
  return valider(systeme, suivant, et);
}

/**
 * Étape « répartir » : enregistre les valeurs données (les autres attributs
 * visés gardent leur valeur), puis vérifie bornes et budget.
 */
export function repartirEtape(
  systeme: SystemeCharge,
  etat: EtatEntite,
  etapeId: string,
  valeurs: Record<string, number>,
): ResultatEtat {
  const p = preparer(systeme, etat, etapeId, 'repartir');
  if (!p.ok) return p;
  const cibles = new Set(ciblesBase(systeme, etat, p.etape).map((a) => a.cle));
  const erreurs: string[] = [];
  const suivant = copier(etat);
  for (const [cle, v] of Object.entries(valeurs)) {
    if (!cibles.has(cle)) erreurs.push(`${cle} ne se répartit pas à l’étape « ${p.etape.nom} »`);
    else if (!Number.isFinite(v)) erreurs.push(`${cle} : nombre attendu`);
    else suivant.valeurs[cle] = v;
  }
  if (erreurs.length) return echec(erreurs);
  return valider(systeme, suivant, p.etape);
}

/**
 * Étape « tirer » : lance la formule une fois par attribut visé. La
 * contrainte porte sur le tirage complet (variables `total`, `min`, `max`,
 * `nombre`, `pairs`, `impairs`, et `somme_modificateurs` : modificateur
 * commun du système appliqué à chaque valeur, 0 s'il n'y en a pas).
 *
 * Un tirage qui ne respecte pas la contrainte consomme un essai, dans la
 * limite de `essais` ; avec `relancer`, il est refait automatiquement sans
 * consommer d'essai (au plus `LIMITE_RELANCES` fois). Le premier tirage
 * valide est retenu.
 */
export function tirerEtape(
  systeme: SystemeCharge,
  etat: EtatEntite,
  etapeId: string,
  aleatoire: Generateur,
): ResultatTirage {
  const p = preparer(systeme, etat, etapeId, 'tirer');
  if (!p.ok) return { ...p, tirages: [] };
  const et = p.etape;
  const cibles = ciblesBase(systeme, etat, et);
  if (!cibles.length)
    return { ok: false, erreur: `${et.nom} : aucun attribut à tirer`, tirages: [] };

  const fiche = calculer(systeme, etat);
  const formule = systeme.formule(chemins.etape(etat.type, et.id, 'formule'));
  const contrainte = systeme.formules.get(chemins.etape(etat.type, et.id, 'contrainte'));
  const modificateur = systeme.formules.get(chemins.modificateurSysteme());
  const tirages: Tirage[] = [];
  let retenu: Tirage | undefined;

  /** Un tirage complet (une valeur par attribut), ou le message d'une erreur de formule. */
  const tirageComplet = (relances: number): Tirage | string => {
    const valeurs: number[] = [];
    const jets: JetDes[][] = [];
    for (let i = 0; i < cibles.length; i++) {
      const r = essayer(fiche, formule, { aleatoire });
      if (!r.ok) return r.message;
      valeurs.push(Number(r.valeur));
      jets.push(r.jets);
    }
    const total = valeurs.reduce((s, v) => s + v, 0);
    const min = Math.min(...valeurs);
    const max = Math.max(...valeurs);
    let valide = true;
    if (contrainte) {
      let mods = 0;
      if (modificateur) {
        for (const v of valeurs) {
          const r = essayer(fiche, modificateur, { variable: variables({ valeur: v }) });
          if (!r.ok) return r.message;
          mods += Number(r.valeur);
        }
      }
      const pairs = valeurs.filter((v) => v % 2 === 0).length;
      const r = essayer(fiche, contrainte, {
        variable: variables({
          total,
          min,
          max,
          nombre: valeurs.length,
          pairs,
          impairs: valeurs.length - pairs,
          somme_modificateurs: mods,
        }),
      });
      if (!r.ok) return r.message;
      valide = r.valeur === true;
    }
    return { valeurs, jets, total, min, max, valide, relances };
  };

  for (let essai = 0; essai < et.essais && !retenu; essai++) {
    let t = tirageComplet(0);
    // `relancer` : les tirages hors contrainte sont refaits sans consommer d'essai
    for (let n = 1; et.relancer && typeof t !== 'string' && !t.valide && n <= LIMITE_RELANCES; n++)
      t = tirageComplet(n);
    if (typeof t === 'string') return { ok: false, erreur: t, tirages };
    tirages.push(t);
    if (t.valide) retenu = t;
  }

  if (!retenu) {
    return {
      ok: false,
      erreur: `${et.nom} : aucun tirage ne respecte « ${contrainte?.texte} » en ${et.essais} essai(s)`,
      tirages,
    };
  }
  const garde = retenu;
  const cles = cibles.map((a) => a.cle);

  const attribuer = (affectation?: Record<string, number>): ResultatEtat => {
    const suivant = copier(etat);
    if (et.attribution === 'ordre') {
      cles.forEach((cle, i) => (suivant.valeurs[cle] = garde.valeurs[i]!));
      return { ok: true, etat: suivant };
    }
    if (!affectation) return echec([`${et.nom} : indiquer quelle valeur va à quel attribut`]);
    const erreurs: string[] = [];
    const utilises = new Set<number>();
    for (const k of Object.keys(affectation))
      if (!cles.includes(k)) erreurs.push(`${k} ne se tire pas à l’étape « ${et.nom} »`);
    for (const cle of cles) {
      const i = affectation[cle];
      if (i === undefined) erreurs.push(`${cle} : aucune valeur attribuée`);
      else if (!Number.isInteger(i) || i < 0 || i >= garde.valeurs.length)
        erreurs.push(`${cle} : valeur n°${i} inexistante`);
      else if (utilises.has(i)) erreurs.push(`${cle} : valeur n°${i} déjà attribuée`);
      else {
        utilises.add(i);
        suivant.valeurs[cle] = garde.valeurs[i]!;
      }
    }
    return erreurs.length ? echec(erreurs) : { ok: true, etat: suivant };
  };

  return { ok: true, tirages, retenu, attribution: et.attribution, attributs: cles, attribuer };
}

/** Étape « saisir » : valeurs libres, vérifiées selon la nature de chaque attribut. */
export function saisirEtape(
  systeme: SystemeCharge,
  etat: EtatEntite,
  etapeId: string,
  valeurs: Record<string, Valeur>,
): ResultatEtat {
  const p = preparer(systeme, etat, etapeId, 'saisir');
  if (!p.ok) return p;
  const cibles = new Map(ciblesSaisie(systeme, etat, p.etape).map((a) => [a.cle, a]));
  const erreurs: string[] = [];
  const suivant = copier(etat);
  for (const [cle, v] of Object.entries(valeurs)) {
    if (!cibles.has(cle)) erreurs.push(`${cle} ne se saisit pas à l’étape « ${p.etape.nom} »`);
    else suivant.valeurs[cle] = v;
  }
  if (erreurs.length) return echec(erreurs);
  const fiche = calculer(systeme, suivant);
  for (const [cle, v] of Object.entries(valeurs)) {
    const err = erreurSaisie(fiche, cibles.get(cle)!, v);
    if (err) erreurs.push(err);
  }
  return erreurs.length ? echec(erreurs) : { ok: true, etat: suivant };
}

/** Étape « acheter » : un des achats autorisés par l'étape, délégué à `acheter`. */
export function acheterEtape(
  systeme: SystemeCharge,
  etat: EtatEntite,
  etapeId: string,
  demande: DemandeAchat,
): ResultatAchat {
  const p = preparer(systeme, etat, etapeId, 'acheter');
  if (!p.ok) return p;
  if (!p.etape.achats.includes(demande.achat)) {
    return {
      ok: false,
      erreur: `« ${demande.achat} » n’est pas proposé à l’étape « ${p.etape.nom} »`,
    };
  }
  return acheter(systeme, etat, demande);
}

/**
 * Termine la création si toutes les étapes sont faites, et fixe les
 * ressources non saisies à leur valeur initiale.
 */
export function terminerCreation(systeme: SystemeCharge, etat: EtatEntite): ResultatEtat {
  if (!etat.creation) return { ok: false, erreur: 'La création est déjà terminée' };
  const restantes = etapesCreation(systeme, etat).filter((e) => e.statut !== 'faite');
  if (restantes.length) return echec(restantes.flatMap((e) => e.raisons));
  const suivant = copier(etat);
  suivant.creation = false;
  const fiche = calculer(systeme, suivant);
  for (const a of fiche.entite.attributs.values()) {
    if (a.nature === 'ressource' && typeof suivant.valeurs[a.cle] !== 'number')
      suivant.valeurs[a.cle] = fiche.valeur(a.cle);
  }
  return { ok: true, etat: suivant };
}
