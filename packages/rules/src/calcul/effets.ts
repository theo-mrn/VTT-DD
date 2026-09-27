/**
 * Effets d'une entité un par un, pour les activer ou les désactiver sans toucher à leur
 * source (l'objet reste équipé, le talent possédé). Chaque effet a une clé stable
 * (`cleEffet` : `<source>/<index>`) ; les clés coupées vivent dans `etat.effetsDesactives`.
 *
 * Aucune règle propre à un jeu : les sources sont celles de `calculer` (entrées possédées,
 * exemplaires, bonus libres), toutes sortes confondues.
 */
import { evaluer, type Valeur } from '../formules/index.js';
import {
  cleEffet,
  lireCleEffet,
  type BonusLibre,
  type Effet,
  type EtatEntite,
  type Possession,
} from '../schema/index.js';
import { estEffective, type Fiche, type PossessionEffective } from './fiche.js';

/**
 * Pourquoi un effet ne s'applique pas alors qu'il n'est pas coupé :
 * - `inactive`     : sa source est une possession activable non active (objet rangé) ;
 * - `non-effective`: l'entrée se possède par rangs et n'en a aucun ;
 * - `bonus-inactif`: bonus libre désactivé (son `actif`).
 */
export type RaisonInactif = 'inactive' | 'non-effective' | 'bonus-inactif';

export interface EffetListe {
  /** Clé stable de l'effet (`<source>/<index>`), celle de `etat.effetsDesactives`. */
  cle: string;
  /** Identifiant de la source, comme dans les explications de la fiche. */
  source: string;
  /** Nom affiché de la source (entrée, exemplaire nommé, bonus libre). */
  nom: string;
  genre: 'entree' | 'exemplaire' | 'bonus';
  index: number;
  effet: Effet;
  /**
   * `actif` : l'effet s'applique ; `desactive` : coupé à la main ; `inactif` : sa source ne
   * s'applique pas (voir `raison`).
   */
  statut: 'actif' | 'desactive' | 'inactif';
  raison?: RaisonInactif;
  /** L'effet se coupe un à un (effets d'une entrée ou d'un exemplaire, pas d'un bonus libre). */
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
      return 'bonus' in e.ajout ? 'bonus' : 'variable' in e.ajout ? 'ajouter' : 'nombre';
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
    const raison: RaisonInactif | undefined =
      s.genre === 'bonus'
        ? s.bonus?.actif
          ? undefined
          : 'bonus-inactif'
        : p && !estEffective(p)
          ? 'non-effective'
          : s.genre === 'entree'
            ? p?.actif
              ? undefined
              : 'inactive'
            : p?.sorte.activable && !s.exemplaire?.actif
              ? 'inactive'
              : undefined;
    const basculable = s.genre !== 'bonus';
    s.effets.forEach((effet, index) => {
      const cle = cleEffet(s.id, index);
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
        statut: coupe ? 'desactive' : raison ? 'inactif' : 'actif',
        ...(raison ? { raison } : {}),
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
        erreur: `${effet.nom} : un bonus libre s’active ou se désactive en entier`,
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
