/**
 * Effets d'une entité un par un, pour les activer ou les désactiver sans toucher à leur
 * source (l'objet reste équipé, le talent possédé). Chaque effet a une clé stable
 * (`cleEffet` : `<source>/<index>`) ; les clés coupées vivent dans `etat.effetsDesactives`.
 *
 * Aucune règle propre à un jeu : les sources sont celles de `calculer` (entrées possédées,
 * exemplaires, bonus libres), toutes sortes confondues.
 */
import { evaluer, type FormuleVerifiee, type Valeur } from '../formules/index.js';
import {
  cleEffet,
  lireCleEffet,
  type BonusLibre,
  type Effet,
  type EtatEntite,
  type Possession,
} from '../schema/index.js';
import { estEffective, type Fiche, type PossessionEffective, type SourceEffets } from './fiche.js';

/** Ordre brut des chaînes (unités UTF-16), indépendant de la langue. */
const ordreBrut = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

/**
 * Pourquoi un effet ne s'applique pas alors qu'il n'est pas coupé :
 * - `inactive`     : sa source est une possession activable non active (objet rangé) ;
 * - `non-effective`: l'entrée se possède par rangs et n'en a aucun ;
 * - `bonus-inactif`: bonus libre désactivé (son `actif`) ;
 * - `regle-desactivee` : sa condition lit une règle optionnelle éteinte pour la campagne
 *   (`option("encombrement") et …`) et ne tient pas.
 */
export type RaisonInactif = 'inactive' | 'non-effective' | 'bonus-inactif' | 'regle-desactivee';

export interface EffetListe {
  /** Clé stable de l'effet (`<source>/<index>`), celle de `etat.effetsDesactives`. */
  cle: string;
  /** Identifiant de la source, comme dans les explications de la fiche. */
  source: string;
  /** Nom affiché de la source (entrée, exemplaire nommé, bonus libre). */
  nom: string;
  genre: 'entree' | 'exemplaire' | 'bonus' | 'regle';
  index: number;
  effet: Effet;
  /**
   * `actif` : l'effet s'applique ; `desactive` : coupé à la main ; `inactif` : sa source ne
   * s'applique pas (voir `raison`).
   */
  statut: 'actif' | 'desactive' | 'inactif';
  raison?: RaisonInactif;
  /**
   * L'effet se coupe un à un (effets d'une entrée ou d'un exemplaire ; ni d'un bonus libre,
   * ni d'une règle).
   */
  basculable: boolean;
  /**
   * Valeur principale évaluée sur la fiche (modificateur d'un attribut, nombre de dés ou
   * bonus d'un jet, rangs donnés, réduction de dégâts) ; absente si elle ne s'évalue pas.
   */
  valeur?: Valeur;
  possession?: PossessionEffective;
  exemplaire?: Possession;
  bonus?: BonusLibre;
}

/** Champ de l'effet qui porte sa valeur principale (évaluée pour l'affichage). */
function champValeur(e: Effet): string | undefined {
  switch (e.sur) {
    case 'attribut':
    case 'rang':
    case 'degats':
      return 'valeur';
    case 'jet':
      if (!e.ajout) return undefined;
      if ('bonus' in e.ajout) return 'bonus';
      return 'variable' in e.ajout ? 'ajouter' : 'nombre';
    case 'marque':
      return undefined;
  }
}

/**
 * Tous les effets de l'entité, actifs ou non : effets du catalogue de chaque entrée
 * possédée, effets propres de chaque exemplaire, effets des bonus libres. Dans l'ordre :
 * possessions (ordre de calcul), puis bonus libres. La valeur principale de chaque effet
 * est évaluée sur la fiche quand c'est possible (sans dés).
 */
export function listerEffets(fiche: Fiche): EffetListe[] {
  const coupes = new Set(fiche.etat.effetsDesactives);
  const r: EffetListe[] = [];
  for (const s of fiche.toutesSources()) {
    const p = s.possession;
    const raison = raisonInactive(s, p);
    const basculable = s.genre !== 'bonus' && s.genre !== 'regle';
    s.effets.forEach((effet, index) => {
      const cle = cleEffet(s.id, index);
      // Condition qui lit une option éteinte et ne tient pas : la règle est désactivée
      const cond = effet.condition !== undefined ? s.formule(index, 'condition') : undefined;
      const regleEteinte =
        !!cond &&
        [...cond.options].some((o) => fiche.options[o] !== true) &&
        evaluerSans(fiche, cond, s.variable) === false;
      const raisonEffet: RaisonInactif | undefined =
        raison ?? (regleEteinte ? 'regle-desactivee' : undefined);
      const coupe = basculable && coupes.has(cle);
      const champ = champValeur(effet);
      const f = champ ? s.formule(index, champ) : undefined;
      let valeur: Valeur | undefined;
      if (f) {
        try {
          valeur = evaluer(f.noeud, fiche.contexte({ variable: s.variable })).valeur;
        } catch {
          valeur = undefined;
        }
      }
      r.push({
        cle,
        source: s.id,
        nom: s.nom,
        genre: s.genre,
        index,
        effet,
        statut: statutEffet(coupe, raisonEffet),
        ...(raisonEffet ? { raison: raisonEffet } : {}),
        basculable,
        ...(valeur !== undefined ? { valeur } : {}),
        ...(p ? { possession: p } : {}),
        ...(s.exemplaire ? { exemplaire: s.exemplaire } : {}),
        ...(s.bonus ? { bonus: s.bonus } : {}),
      });
    });
  }
  return r;
}

/** Valeur d'une formule sur la fiche, `undefined` si elle ne s'évalue pas. */
function evaluerSans(
  fiche: Fiche,
  f: FormuleVerifiee,
  variable: (nom: string) => Valeur,
): Valeur | undefined {
  try {
    return evaluer(f.noeud, fiche.contexte({ variable })).valeur;
  } catch {
    return undefined;
  }
}

/**
 * Erreurs des effets coupés d'un état, au regard de la fiche calculée :
 * - une clé d'un bonus libre est refusée (un bonus libre s'active par son `actif`) ;
 * - une clé en double est refusée.
 * Une clé dont la source n'existe plus (objet retiré, nœud rendu) n'est pas une erreur :
 * `nettoyerEffetsDesactives` la retire.
 */
export function erreursEffetsDesactives(etat: EtatEntite): string[] {
  const erreurs: string[] = [];
  const vues = new Set<string>();
  for (const cle of etat.effetsDesactives) {
    if (vues.has(cle)) erreurs.push(`Effet coupé en double : ${cle}`);
    vues.add(cle);
    if (lireCleEffet(cle)?.source.startsWith('bonus:'))
      erreurs.push(`${cle} : un bonus libre s’active ou se désactive en entier (actif)`);
  }
  return erreurs;
}

/**
 * Clés coupées qui désignent encore un effet de l'entité (source présente, position dans
 * sa liste), dans leur ordre. Les autres (objet retiré, effet supprimé, source disparue)
 * sont oubliées : un nouvel exemplaire qui reprendrait l'identifiant n'hérite de rien.
 */
export function nettoyerEffetsDesactives(fiche: Fiche): string[] {
  const connues = new Set(
    listerEffets(fiche)
      .filter((e) => e.basculable)
      .map((e) => e.cle),
  );
  return [...new Set(fiche.etat.effetsDesactives)].filter((c) => connues.has(c));
}

export type ResultatBascule =
  | { ok: true; etat: EtatEntite; effets: EffetListe[]; change: boolean }
  | { ok: false; erreur: string; introuvable?: boolean };

/**
 * Active ou coupe des effets (tous ceux d'une source d'un coup, ou un seul). Idempotent : le
 * redemander ne change rien de plus. Refusé en entier si une clé est inconnue ou désigne un
 * effet de bonus libre (qui s'active en entier). La source n'est pas touchée : un objet rangé
 * reste rangé, ses effets coupés ou non.
 */
export function basculerEffets(
  fiche: Fiche,
  cles: readonly string[],
  actif: boolean,
): ResultatBascule {
  const tous = new Map(listerEffets(fiche).map((e) => [e.cle, e]));
  const effets: EffetListe[] = [];
  const oublies: string[] = [];
  for (const cle of new Set(cles)) {
    const effet = tous.get(cle);
    // Réactiver un effet coupé dont la source a disparu (rang gratuit coupé…) : on l'oublie
    if (!effet && actif && fiche.etat.effetsDesactives.includes(cle)) {
      oublies.push(cle);
      continue;
    }
    if (!effet) return { ok: false, erreur: `Effet introuvable : ${cle}`, introuvable: true };
    if (!effet.basculable)
      return {
        ok: false,
        erreur:
          effet.genre === 'regle'
            ? `${effet.nom} : une règle ne se coupe pas à la main`
            : `${effet.nom} : un bonus libre s’active ou se désactive en entier`,
      };
    effets.push(effet);
  }
  const etat = fiche.etat;
  const coupes = new Set(etat.effetsDesactives);
  const vises = [...effets.map((e) => e.cle), ...oublies].filter((c) => coupes.has(c) === actif);
  if (!vises.length) return { ok: true, etat, effets, change: false };
  const effetsDesactives = actif
    ? etat.effetsDesactives.filter((c) => !vises.includes(c))
    : [...etat.effetsDesactives, ...vises];
  return { ok: true, etat: { ...etat, effetsDesactives }, effets, change: true };
}

/** Active ou coupe un seul effet (voir `basculerEffets`). */
export function basculerEffet(fiche: Fiche, cle: string, actif: boolean): ResultatBascule {
  return basculerEffets(fiche, [cle], actif);
}

/** Texte comparable d'une valeur JSON, clés triées (deux effets de même contenu). */
function empreinte(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(empreinte).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort(ordreBrut)
      .map((k) => `${JSON.stringify(k)}:${empreinte((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/**
 * Effets coupés après le remplacement de la liste d'effets d'une source (`effets` propres
 * d'un exemplaire) : un effet coupé qui reste dans la nouvelle liste (même contenu) garde
 * son état à sa nouvelle position ; la clé d'un effet retiré est oubliée. Sans ce report,
 * retirer un effet décalerait les positions et couperait son voisin. Les clés des autres
 * sources ne changent pas, dans le même ordre.
 */
export function reporterEffetsDesactives(
  effetsDesactives: readonly string[],
  source: string,
  avant: readonly Effet[],
  apres: readonly Effet[],
): string[] {
  const nouvelles = apres.map(empreinte);
  const prises = new Set<number>();
  const r: string[] = [];
  for (const cle of effetsDesactives) {
    const k = lireCleEffet(cle);
    if (!k || k.source !== source) {
      r.push(cle);
      continue;
    }
    const effet = avant[k.index];
    if (!effet) continue;
    const e = empreinte(effet);
    // Même position si l'effet n'a pas bougé, sinon le premier effet identique libre
    const j =
      nouvelles[k.index] === e && !prises.has(k.index)
        ? k.index
        : nouvelles.findIndex((x, i) => x === e && !prises.has(i));
    if (j < 0) continue;
    prises.add(j);
    r.push(cleEffet(source, j));
  }
  return r;
}

/** Pourquoi une source n'agit pas (absente : elle agit). */
function raisonInactive(s: SourceEffets, p: SourceEffets['possession']): RaisonInactif | undefined {
  if (s.genre === 'bonus') return s.bonus?.actif ? undefined : 'bonus-inactif';
  if (p && !estEffective(p)) return 'non-effective';
  if (s.genre === 'entree') return p?.actif ? undefined : 'inactive';
  return p?.sorte.activable && !s.exemplaire?.actif ? 'inactive' : undefined;
}

function statutEffet(coupe: boolean, raison: unknown): 'desactive' | 'inactif' | 'actif' {
  if (coupe) return 'desactive';
  return raison ? 'inactif' : 'actif';
}
