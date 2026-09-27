/**
 * Effets d'une entité un par un, pour les activer ou les désactiver sans toucher à leur
 * source (l'objet reste équipé, le talent possédé). Chaque effet a une clé stable
 * (`cleEffet` : `<source>/<index>`) ; les clés coupées vivent dans `etat.effetsDesactives`.
 *
 * Aucune règle propre à un jeu : les sources sont celles de `calculer` (entrées possédées,
 * exemplaires, bonus libres), toutes sortes confondues.
 */
import {
  cleEffet,
  lireCleEffet,
  sourceExemplaire,
  type BonusLibre,
  type Effet,
  type EtatEntite,
  type Possession,
} from '../schema/index.js';
import {
  estEffective,
  nomSourceExemplaire,
  type Fiche,
  type PossessionEffective,
} from './fiche.js';

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
  possession?: PossessionEffective;
  exemplaire?: Possession;
  bonus?: BonusLibre;
}

/**
 * Tous les effets de l'entité, actifs ou non : effets du catalogue de chaque entrée
 * possédée, effets propres de chaque exemplaire, effets des bonus libres. Dans l'ordre :
 * possessions (ordre de calcul), puis bonus libres.
 */
export function listerEffets(fiche: Fiche): EffetListe[] {
  const coupes = new Set(fiche.etat.effetsDesactives);
  const r: EffetListe[] = [];
  const pousser = (
    base: Omit<EffetListe, 'cle' | 'index' | 'effet' | 'statut' | 'raison'>,
    effets: readonly Effet[],
    raison: RaisonInactif | undefined,
  ) =>
    effets.forEach((effet, index) => {
      const cle = cleEffet(base.source, index);
      const coupe = base.basculable && coupes.has(cle);
      r.push({
        ...base,
        cle,
        index,
        effet,
        statut: coupe ? 'desactive' : raison ? 'inactif' : 'actif',
        ...(raison ? { raison } : {}),
      });
    });

  for (const p of fiche.possessions.values()) {
    const raisonEntree: RaisonInactif | undefined = !estEffective(p)
      ? 'non-effective'
      : !p.actif
        ? 'inactive'
        : undefined;
    pousser(
      { source: p.entree.id, nom: p.entree.nom, genre: 'entree', basculable: true, possession: p },
      p.entree.effets,
      raisonEntree,
    );
    for (const ex of p.exemplaires) {
      const raison: RaisonInactif | undefined = !estEffective(p)
        ? 'non-effective'
        : p.sorte.activable && !ex.actif
          ? 'inactive'
          : undefined;
      pousser(
        {
          source: sourceExemplaire(ex),
          nom: nomSourceExemplaire(p, ex),
          genre: 'exemplaire',
          basculable: true,
          possession: p,
          exemplaire: ex,
        },
        ex.effets,
        raison,
      );
    }
  }
  for (const b of fiche.etat.bonus) {
    pousser(
      { source: `bonus:${b.id}`, nom: b.nom, genre: 'bonus', basculable: false, bonus: b },
      b.effets,
      b.actif ? undefined : 'bonus-inactif',
    );
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
  | { ok: true; etat: EtatEntite; effet: EffetListe; change: boolean }
  | { ok: false; erreur: string; introuvable?: boolean };

/**
 * Active ou coupe un effet (idempotent : le demander deux fois ne change rien de plus).
 * Refusé pour un effet inconnu et pour un effet de bonus libre (qui s'active en entier).
 * La source n'est pas touchée : un objet rangé reste rangé, son effet coupé ou non.
 */
export function basculerEffet(fiche: Fiche, cle: string, actif: boolean): ResultatBascule {
  const effet = listerEffets(fiche).find((e) => e.cle === cle);
  if (!effet) return { ok: false, erreur: `Effet introuvable : ${cle}`, introuvable: true };
  if (!effet.basculable)
    return {
      ok: false,
      erreur: `${effet.nom} : un bonus libre s’active ou se désactive en entier`,
    };
  const etat = fiche.etat;
  const coupe = etat.effetsDesactives.includes(cle);
  if (coupe === !actif) return { ok: true, etat, effet, change: false };
  const effetsDesactives = actif
    ? etat.effetsDesactives.filter((c) => c !== cle)
    : [...etat.effetsDesactives, cle];
  return { ok: true, etat: { ...etat, effetsDesactives }, effet, change: true };
}
