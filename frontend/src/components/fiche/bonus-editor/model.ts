/**
 * Bonus saisis à la main sur une possession (objet, compétence, talent) : attributs qu'ils
 * peuvent modifier, effet construit depuis la saisie, erreurs vérifiées par le moteur comme
 * le fera le service. Partagé par l'inventaire et le détail des compétences ; rien n'est
 * propre à un jeu.
 */
import {
  compilerEffets,
  variablesSource,
  type Effet,
  type Fiche,
  type Possession,
  type Sorte,
} from '@vtt/rules';

/** Attributs qu'un bonus d'objet peut modifier : numériques et visibles de l'utilisateur. */
export function attributsBonus(
  fiche: Fiche,
  mj = false,
): { cle: string; nom: string; groupe?: string }[] {
  return [...fiche.entite.attributs.values()]
    .filter(
      (a) =>
        (mj || a.visibilite !== 'mj') &&
        (a.nature === 'base' ||
          a.nature === 'ressource' ||
          (a.nature === 'derivee' && a.type === 'nombre')),
    )
    .map((a) => ({
      cle: a.cle,
      nom: a.abrege && a.abrege !== a.nom ? `${a.nom} (${a.abrege})` : a.nom,
      ...(a.groupe
        ? { groupe: fiche.entite.type.groupes.find((g) => g.id === a.groupe)?.nom ?? a.groupe }
        : {}),
    }));
}

/** Bonus d'objet sur un attribut : « +2 en DEF ». */
export function effetBonus(attribut: string, valeur: string, description?: string): Effet {
  return {
    sur: 'attribut',
    attribut,
    operation: 'ajouter',
    valeur,
    ...(description?.trim() ? { description: description.trim() } : {}),
  } as Effet;
}

/**
 * Erreurs d'un bonus saisi, comme le service les donnera : effet compilé par le moteur
 * pour le type d'entité, avec les variables de la sorte (`source.<champ>`).
 */
export function erreursBonus(fiche: Fiche, sorte: Sorte, effet: Effet): string[] {
  return compilerEffets(
    fiche.systeme,
    fiche.etat.type,
    [effet],
    (i, x) => `bonus/${i}/${x}`,
    variablesSource(sorte),
  ).erreurs.map((e) => e.message);
}

/** Où poser les bonus propres d'une entrée possédée (voir `cibleBonusPropres`). */
export type CibleBonusPropres =
  | {
      ok: true;
      sorte: Sorte;
      /** Possession explicite qui les porte ; absente : elle sera créée (rang 0). */
      possession?: Possession;
      /** État actif à garder pour une possession créée (celui de l'entrée aujourd'hui). */
      actif: boolean;
    }
  | { ok: false; raison: string };

/**
 * Où poser les bonus propres d'une entrée possédée : sur sa possession explicite, ou sur une
 * possession à créer au rang 0 quand la sorte se possède par rangs (les rangs gratuits d'une
 * voie ou d'un nœud restent comptés à part ; seule, la possession créée ne donne rien).
 * Une entrée sans rangs obtenue sans possession (espèce, choix, nœud) n'en reçoit pas : la
 * possession créée la garderait après la perte de sa source. Le maximum de la sorte compte.
 */
export function cibleBonusPropres(fiche: Fiche, entree: string): CibleBonusPropres {
  const p = fiche.possessions.get(entree);
  if (!p) return { ok: false, raison: 'Entrée non possédée.' };
  if (p.possession) return { ok: true, sorte: p.sorte, possession: p.possession, actif: p.actif };
  if (!p.sorte.rangs)
    return {
      ok: false,
      raison: `${p.entree.nom} est obtenu sans possession propre : un bonus ajouté resterait après la perte de sa source.`,
    };
  const n = fiche.etat.possessions.filter(
    (x) => fiche.systeme.entrees.get(x.entree)?.sorte === p.sorte.id,
  ).length;
  if (p.sorte.maximum !== undefined && n >= p.sorte.maximum)
    return {
      ok: false,
      raison: `Maximum de ${p.sorte.maximum} ${p.sorte.nomPluriel ?? p.sorte.nom} atteint.`,
    };
  return { ok: true, sorte: p.sorte, actif: p.actif };
}
