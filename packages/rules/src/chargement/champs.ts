/**
 * Champs des objets : formules des champs `formule` (celles du catalogue et celles qu'un
 * exemplaire se donne), et vérification des valeurs propres d'un exemplaire. Une seule
 * implémentation pour le chargeur, le calcul, les actions, le service et le front.
 *
 * Formule d'un champ : elle lit les attributs du porteur (`@CON`, `mod(@DEX)`), les autres
 * champs de l'objet (`source.nbDes`) et son `rang`, `actif`, `quantite` ; un champ déclaré
 * `des` (formule de jet) peut lancer des dés, tirés pendant l'action qui le lit.
 */
import {
  analyser,
  compiler,
  type FormuleVerifiee,
  type Noeud,
  type TypeValeur,
  type Valeur,
} from '../formules/index.js';
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

/** Attribut désigné sans `@` : clé exacte, sinon clé ou abréviation sans casse (unique). */
function attributNu(tables: Attributs[], nom: string): string | undefined {
  for (const t of tables) if (t.has(nom)) return nom;
  const bas = nom.toLowerCase();
  const trouves = new Set<string>();
  for (const t of tables)
    for (const a of t.values())
      if (a.cle.toLowerCase() === bas || a.abrege?.toLowerCase() === bas) trouves.add(a.cle);
  return trouves.size === 1 ? [...trouves][0] : undefined;
}

/**
 * Écriture simple d'une formule : un nom nu qui désigne un attribut du porteur (et pas une
 * variable de la formule) devient une lecture d'attribut. « 1d6-CON+8 » → « 1d6 - @CON + 8 ».
 * Une formule sans nom nu reste telle quelle ; une formule illisible aussi (la compilation
 * dira pourquoi).
 */
export function normaliserFormule(
  texte: string,
  attributs: Attributs[],
  variables: Record<string, TypeValeur> = {},
): string {
  const brut = texte.trim();
  const a = analyser(brut);
  if (!a.ok) return brut;
  // Noms nus à remplacer, à leur position dans le texte (l'écriture de l'auteur est gardée)
  const remplacements: { pos: number; nom: string; cle: string }[] = [];
  const visiter = (n: Noeud): void => {
    switch (n.t) {
      case 'variable': {
        if (n.nom in variables) return;
        const cle = attributNu(attributs, n.nom);
        if (cle) remplacements.push({ pos: n.pos, nom: n.nom, cle });
        return;
      }
      case 'appel':
        return n.args.forEach(visiter);
      case 'unaire':
        return visiter(n.arg);
      case 'binaire':
        visiter(n.g);
        return visiter(n.d);
      case 'si':
        visiter(n.condition);
        visiter(n.alors);
        return visiter(n.sinon);
      case 'des':
        visiter(n.nombre);
        visiter(n.faces);
        if (n.garder) visiter(n.garder.n);
        return;
      default:
        return;
    }
  };
  visiter(a.noeud);
  let r = brut;
  for (const x of remplacements.sort((p, q) => q.pos - p.pos)) {
    if (r.slice(x.pos, x.pos + x.nom.length) !== x.nom) return brut;
    r = `${r.slice(0, x.pos)}@${x.cle}${r.slice(x.pos + x.nom.length)}`;
  }
  return r;
}

export type FormuleChampCompilee =
  { ok: true; formule: FormuleVerifiee; texte: string } | { ok: false; erreurs: string[] };

const cache = new WeakMap<SystemeCharge, Map<string, FormuleChampCompilee>>();

/**
 * Compile la formule propre d'un exemplaire pour un champ `formule` de sa sorte : même
 * environnement que la formule du catalogue, écriture simple normalisée (`texte`, forme
 * enregistrée), longueur bornée. Résultat gardé en mémoire par système et par texte.
 */
export function compilerFormuleChamp(
  systeme: SystemeCharge,
  sorte: Sorte,
  champ: Champ,
  texte: string,
): FormuleChampCompilee {
  if (champ.type !== 'formule')
    return { ok: false, erreurs: [`${champ.nom} n’est pas une formule`] };
  let memo = cache.get(systeme);
  if (!memo) cache.set(systeme, (memo = new Map()));
  const cle = `${sorte.id}\n${champ.id}\n${texte}`;
  const connu = memo.get(cle);
  if (connu) return connu;

  let r: FormuleChampCompilee;
  const variables = variablesFormuleChamp(sorte);
  const normalise = normaliserFormule(texte, porteurs(systeme, sorte), variables);
  if (!normalise) r = { ok: false, erreurs: [`${champ.nom} : formule vide`] };
  else if (normalise.length > LONGUEUR_FORMULE_EXEMPLAIRE)
    r = {
      ok: false,
      erreurs: [`${champ.nom} : ${LONGUEUR_FORMULE_EXEMPLAIRE} caractères au plus`],
    };
  else {
    const c = compiler(normalise, envFormuleChamp(systeme, sorte, champ), 'nombre');
    if (!c.ok) {
      r = { ok: false, erreurs: c.erreurs.map((e) => `${champ.nom} : ${e.message}`) };
    } else {
      const erreurs: string[] = [];
      for (const appel of appelsLitteraux(c.formule.noeud)) {
        const [s] = appel.args;
        if (AGREGATS.includes(appel.fn) && s !== undefined && !systeme.sortes.has(s))
          erreurs.push(`${champ.nom} : sorte inconnue : ${s}`);
      }
      r = erreurs.length
        ? { ok: false, erreurs }
        : { ok: true, formule: c.formule, texte: normalise };
    }
  }
  if (memo.size > 1000) memo.clear();
  memo.set(cle, r);
  return r;
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
): FormuleVerifiee | undefined {
  if (champ.type !== 'formule') return undefined;
  const propre = ex?.champs[champ.id];
  if ((typeof propre === 'string' && propre.trim()) || typeof propre === 'number') {
    const sorte = systeme.sortes.get(entree.sorte);
    const r = sorte ? compilerFormuleChamp(systeme, sorte, champ, String(propre)) : undefined;
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
    return v ?? (c.type === 'booleen' ? false : c.type === 'nombre' ? 0 : '');
  };
}

export interface ChampsVerifies {
  /** Valeurs à enregistrer (formules sous leur forme normalisée). */
  champs: Record<string, number | string | boolean>;
  erreurs: string[];
}

/**
 * Vérifie les valeurs propres d'un exemplaire contre les champs de sa sorte : champ connu,
 * type de valeur, option d'un `choix`, attribut ou entrée existants, formule compilable
 * (écriture simple normalisée). Chaîne vide : retour à la valeur de l'entrée.
 */
export function verifierChampsExemplaire(
  systeme: SystemeCharge,
  entree: Entree,
  champs: Record<string, number | string | boolean>,
): ChampsVerifies {
  const sorte = systeme.sortes.get(entree.sorte);
  const erreurs: string[] = [];
  const r: Record<string, number | string | boolean> = {};
  if (!sorte) return { champs: r, erreurs: [`Sorte inconnue : ${entree.sorte}`] };
  for (const [id, v] of Object.entries(champs)) {
    const c = sorte.champs.find((x) => x.id === id);
    if (!c) {
      erreurs.push(`Champ inconnu de ${sorte.nom} : ${id}`);
      continue;
    }
    const attendu = (type: string) => erreurs.push(`${c.nom} : ${type} attendu`);
    switch (c.type) {
      case 'nombre':
        if (typeof v !== 'number' || !Number.isFinite(v)) attendu('nombre');
        else r[id] = v;
        break;
      case 'booleen':
        if (typeof v !== 'boolean') attendu('oui ou non');
        else r[id] = v;
        break;
      case 'texte':
        if (typeof v !== 'string') attendu('texte');
        else if (v.length > LONGUEUR_TEXTE_EXEMPLAIRE)
          erreurs.push(`${c.nom} : ${LONGUEUR_TEXTE_EXEMPLAIRE} caractères au plus`);
        else r[id] = v;
        break;
      case 'choix':
        if (typeof v !== 'string' || !c.options.some((o) => o.valeur === v))
          erreurs.push(
            `${c.nom} : option inconnue « ${String(v)} » (${c.options.map((o) => o.valeur).join(', ')})`,
          );
        else r[id] = v;
        break;
      case 'attribut':
        if (typeof v !== 'string' || !systeme.entites.get(c.entite)?.attributs.has(v))
          erreurs.push(`${c.nom} : attribut inconnu « ${String(v)} »`);
        else r[id] = v;
        break;
      case 'entree':
        if (typeof v !== 'string' || systeme.entrees.get(v)?.sorte !== c.sorte)
          erreurs.push(`${c.nom} : entrée de sorte ${c.sorte} attendue`);
        else r[id] = v;
        break;
      case 'entrees':
        erreurs.push(`${c.nom} : liste non modifiable sur un exemplaire`);
        break;
      case 'formule': {
        if (typeof v !== 'string' && typeof v !== 'number') {
          attendu('formule');
          break;
        }
        const texte = String(v);
        if (!texte.trim()) {
          r[id] = '';
          break;
        }
        const f = compilerFormuleChamp(systeme, sorte, c, texte);
        if (f.ok) r[id] = f.texte;
        else erreurs.push(...f.erreurs);
        break;
      }
    }
  }
  return { champs: r, erreurs };
}
