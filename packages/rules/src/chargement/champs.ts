/**
 * Champs des objets : formules des champs `formule` (celles du catalogue et celles qu'un
 * exemplaire se donne), et vérification des valeurs propres d'un exemplaire. Une seule
 * implémentation pour le chargeur, le calcul, les actions, le service et le front.
 *
 * Formule d'un champ : elle lit les attributs du porteur (`@CON`, `mod(@DEX)`), les autres
 * champs de l'objet (`source.nbDes`) et son `rang`, `actif`, `quantite` ; un champ déclaré
 * `des` (formule de jet) peut lancer des dés, tirés pendant l'action qui le lit.
 */
import { normaliserFormuleJet } from '../calcul/formule-jet.js';
import { compiler, type FormuleVerifiee, type TypeValeur, type Valeur } from '../formules/index.js';
import type { Champ, Entree, Possession, Sorte } from '../schema/index.js';
import { chemins, type SystemeCharge } from './charger.js';
import { appelsLitteraux } from './effets.js';
import { AGREGATS, env, typeChamp, type Attributs } from './environnements.js';

/** Longueur maximale de la formule propre d'un exemplaire. */
export const LONGUEUR_FORMULE_EXEMPLAIRE = 500;

/** Longueur maximale d'un texte propre d'un exemplaire (nom, description…). */
export const LONGUEUR_TEXTE_EXEMPLAIRE = 10_000;

type ChampFormule = Extract<Champ, { type: 'formule' }>;

/**
 * Variables d'une formule de champ : état de l'objet et ses autres champs (pas les champs
 * `formule`, pour qu'une formule n'en lise jamais une autre).
 */
export function variablesFormuleChamp(sorte: Sorte): Record<string, TypeValeur> {
  const r: Record<string, TypeValeur> = { rang: 'nombre', actif: 'booleen', quantite: 'nombre' };
  for (const c of sorte.champs) {
    if (c.type === 'formule') continue;
    const t = typeChamp(c);
    if (t) r[`source.${c.id}`] = t;
  }
  return r;
}

/** Attributs des types d'entité qui peuvent posséder la sorte. */
function porteurs(systeme: SystemeCharge, sorte: Sorte): Attributs[] {
  return sorte.pour
    .map((t) => systeme.entites.get(t)?.attributs)
    .filter((a): a is Attributs => !!a);
}

/** Environnement de typage d'une formule de champ (catalogue ou exemplaire). */
export function envFormuleChamp(systeme: SystemeCharge, sorte: Sorte, champ: ChampFormule) {
  return env({
    entite: porteurs(systeme, sorte),
    variables: variablesFormuleChamp(sorte),
    des: champ.des === true,
    entree: (id) => systeme.entrees.has(id),
  });
}

export type FormuleChampCompilee =
  { ok: true; formule: FormuleVerifiee; texte: string } | { ok: false; erreurs: string[] };

const cache = new WeakMap<SystemeCharge, Map<string, FormuleChampCompilee>>();

/**
 * Compile la formule propre d'un exemplaire pour un champ `formule` de sa sorte : même
 * environnement que la formule du catalogue, longueur bornée. Elle s'écrit comme au
 * lanceur de dés, en clés nues (`1d6-CON+8`) : `normaliserFormuleJet` la réécrit pour le
 * type d'entité du porteur (par défaut, le premier de la sorte), variables de l'objet
 * (`source.nbDes`, `rang`…) respectées. `texte` : la formule saisie, forme enregistrée et
 * affichée. Résultat gardé en mémoire par système, type d'entité et texte.
 */
export function compilerFormuleChamp(
  systeme: SystemeCharge,
  sorte: Sorte,
  champ: Champ,
  texte: string,
  entite: string | undefined = sorte.pour[0],
): FormuleChampCompilee {
  if (champ.type !== 'formule')
    return { ok: false, erreurs: [`${champ.nom} n’est pas une formule`] };
  let memo = cache.get(systeme);
  if (!memo) cache.set(systeme, (memo = new Map()));
  const cle = `${sorte.id}\n${champ.id}\n${entite ?? ''}\n${texte}`;
  const connu = memo.get(cle);
  if (connu) return connu;

  let r: FormuleChampCompilee;
  const saisie = texte.trim();
  if (!saisie) r = { ok: false, erreurs: [`${champ.nom} : formule vide`] };
  else if (saisie.length > LONGUEUR_FORMULE_EXEMPLAIRE)
    r = {
      ok: false,
      erreurs: [`${champ.nom} : ${LONGUEUR_FORMULE_EXEMPLAIRE} caractères au plus`],
    };
  else r = compilerSaisie(systeme, sorte, champ, saisie, entite ?? '');
  if (memo.size > 1000) memo.clear();
  memo.set(cle, r);
  return r;
}

/** Formule saisie non vide : clés nues réécrites, puis compilée dans l'environnement du champ. */
function compilerSaisie(
  systeme: SystemeCharge,
  sorte: Sorte,
  champ: ChampFormule,
  saisie: string,
  entite: string,
): FormuleChampCompilee {
  const n = normaliserFormuleJet(systeme, entite, saisie, {
    variables: Object.keys(variablesFormuleChamp(sorte)),
  });
  if (!n.ok) return { ok: false, erreurs: [`${champ.nom} : ${n.erreur.message}`] };
  const c = compiler(n.formule, envFormuleChamp(systeme, sorte, champ), 'nombre');
  if (!c.ok) return { ok: false, erreurs: c.erreurs.map((e) => `${champ.nom} : ${e.message}`) };
  const erreurs: string[] = [];
  for (const appel of appelsLitteraux(c.formule.noeud)) {
    const [s] = appel.args;
    if (AGREGATS.includes(appel.fn) && s !== undefined && !systeme.sortes.has(s))
      erreurs.push(`${champ.nom} : sorte inconnue : ${s}`);
  }
  return erreurs.length ? { ok: false, erreurs } : { ok: true, formule: c.formule, texte: saisie };
}

/**
 * Formule d'un champ `formule` pour un exemplaire : la sienne (champ propre, texte d'une
 * formule valide), sinon celle de l'entrée (catalogue, ou défaut de la sorte).
 */
export function formuleChamp(
  systeme: SystemeCharge,
  entree: Entree,
  champ: Champ,
  ex?: Pick<Possession, 'champs'>,
  entite?: string,
): FormuleVerifiee | undefined {
  if (champ.type !== 'formule') return undefined;
  const propre = ex?.champs[champ.id];
  if ((typeof propre === 'string' && propre.trim()) || typeof propre === 'number') {
    const sorte = systeme.sortes.get(entree.sorte);
    const r = sorte
      ? compilerFormuleChamp(systeme, sorte, champ, String(propre), entite)
      : undefined;
    // Formule propre devenue invalide (système modifié) : celle de l'entrée
    if (r?.ok) return r.formule;
  }
  return systeme.formules.get(chemins.champ(entree.id, champ.id));
}

/** Valeur brute d'un champ pour un exemplaire : la sienne, sinon celle de l'entrée, sinon le défaut. */
export function valeurChamp(
  entree: Entree,
  champ: Champ,
  ex?: Pick<Possession, 'champs'>,
): Valeur | undefined {
  const propre = ex?.champs[champ.id];
  if (propre !== undefined) return propre;
  const v = entree.champs[champ.id];
  if (v !== undefined && !Array.isArray(v)) return v;
  return 'defaut' in champ && champ.defaut !== undefined ? champ.defaut : undefined;
}

/**
 * Variables d'une formule de champ pour un objet : `rang`, `actif`, `quantite` et
 * `source.<champ>` (champs non formules, valeur de l'exemplaire, sinon de l'entrée).
 */
export function variablesObjet(
  entree: Entree,
  sorte: Sorte,
  etat: { rang: number; actif: boolean; quantite: number },
  ex?: Pick<Possession, 'champs'>,
): (nom: string) => Valeur | undefined {
  return (nom) => {
    if (nom === 'rang') return etat.rang;
    if (nom === 'actif') return etat.actif;
    if (nom === 'quantite') return etat.quantite;
    if (!nom.startsWith('source.')) return undefined;
    const c = sorte.champs.find((x) => x.id === nom.slice('source.'.length));
    if (!c || c.type === 'formule' || c.type === 'entrees') return undefined;
    const v = valeurChamp(entree, c, ex);
    return v ?? VIDE_PAR_TYPE[c.type] ?? '';
  };
}

/** Valeur d'un champ d'exemplaire saisie. */
type ValeurChamp = number | string | boolean;

export interface ChampsVerifies {
  /** Valeurs à enregistrer (formules telles que saisies, espaces de bord retirés). */
  champs: Record<string, ValeurChamp>;
  erreurs: string[];
}

/**
 * Vérifie les valeurs propres d'un exemplaire contre les champs de sa sorte : champ connu,
 * type de valeur, option d'un `choix`, attribut ou entrée existants, formule compilable
 * (clés nues comprises, gardée telle que saisie). Chaîne vide : retour à la valeur de l'entrée.
 */
type ChampSorte = Sorte['champs'][number];

/** Valeur retenue d'un champ d'exemplaire, ou ses erreurs. */
function lireChampExemplaire(
  systeme: SystemeCharge,
  sorte: Sorte,
  c: ChampSorte,
  v: ValeurChamp,
  entite: string | undefined,
): { valeur: ValeurChamp } | { erreurs: string[] } {
  if (c.type === 'formule') return lireFormuleExemplaire(systeme, sorte, c, v, entite);
  const erreur = refusChampExemplaire(systeme, c, v);
  return erreur ? { erreurs: [erreur] } : { valeur: v };
}

/** Formule propre d'un exemplaire : vide (celle de l'entrée), ou compilée et normalisée. */
function lireFormuleExemplaire(
  systeme: SystemeCharge,
  sorte: Sorte,
  c: Extract<ChampSorte, { type: 'formule' }>,
  v: ValeurChamp,
  entite: string | undefined,
): { valeur: ValeurChamp } | { erreurs: string[] } {
  if (typeof v !== 'string' && typeof v !== 'number')
    return { erreurs: [`${c.nom} : formule attendu`] };
  const texte = String(v);
  if (!texte.trim()) return { valeur: '' };
  const f = compilerFormuleChamp(systeme, sorte, c, texte, entite);
  return f.ok ? { valeur: f.texte } : { erreurs: f.erreurs };
}

/** Message si la condition n'est pas remplie, sinon null. */
const sauf = (ok: boolean, message: string): string | null => (ok ? null : message);

/** Refus d'une valeur de champ d'exemplaire (hors formule), ou null. */
function refusChampExemplaire(
  systeme: SystemeCharge,
  c: ChampSorte,
  v: ValeurChamp,
): string | null {
  switch (c.type) {
    case 'nombre':
      return sauf(typeof v === 'number' && Number.isFinite(v), `${c.nom} : nombre attendu`);
    case 'booleen':
      return sauf(typeof v === 'boolean', `${c.nom} : oui ou non attendu`);
    case 'texte':
      if (typeof v !== 'string') return `${c.nom} : texte attendu`;
      return sauf(
        v.length <= LONGUEUR_TEXTE_EXEMPLAIRE,
        `${c.nom} : ${LONGUEUR_TEXTE_EXEMPLAIRE} caractères au plus`,
      );
    case 'choix':
      return sauf(
        typeof v === 'string' && c.options.some((o) => o.valeur === v),
        `${c.nom} : option inconnue « ${String(v)} » (${c.options.map((o) => o.valeur).join(', ')})`,
      );
    case 'attribut':
      return sauf(
        typeof v === 'string' && systeme.entites.get(c.entite)?.attributs.has(v) === true,
        `${c.nom} : attribut inconnu « ${String(v)} »`,
      );
    case 'entree':
      return sauf(
        typeof v === 'string' && systeme.entrees.get(v)?.sorte === c.sorte,
        `${c.nom} : entrée de sorte ${c.sorte} attendue`,
      );
    case 'entrees':
      return `${c.nom} : liste non modifiable sur un exemplaire`;
    default:
      return null;
  }
}

export function verifierChampsExemplaire(
  systeme: SystemeCharge,
  entree: Entree,
  champs: Record<string, ValeurChamp>,
  /** Type d'entité du porteur, pour les clés nues des formules (défaut : le premier de la sorte). */
  entite?: string,
): ChampsVerifies {
  const sorte = systeme.sortes.get(entree.sorte);
  const erreurs: string[] = [];
  const r: Record<string, ValeurChamp> = {};
  if (!sorte) return { champs: r, erreurs: [`Sorte inconnue : ${entree.sorte}`] };
  for (const [id, v] of Object.entries(champs)) {
    const c = sorte.champs.find((x) => x.id === id);
    if (!c) {
      erreurs.push(`Champ inconnu de ${sorte.nom} : ${id}`);
      continue;
    }
    const lu = lireChampExemplaire(systeme, sorte, c, v, entite);
    if ('erreurs' in lu) erreurs.push(...lu.erreurs);
    else r[id] = lu.valeur;
  }
  return { champs: r, erreurs };
}

/** Valeur d'un champ absent, selon son type (texte vide par défaut). */
const VIDE_PAR_TYPE: Partial<Record<string, number | boolean>> = { nombre: 0, booleen: false };
