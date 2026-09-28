/**
 * Bonus saisis à la main sur une possession (objet, compétence, talent) : attributs qu'ils
 * peuvent modifier, effet construit depuis la saisie, erreurs vérifiées par le moteur comme
 * le fera le service. Partagé par l'inventaire et le détail des compétences ; rien n'est
 * propre à un jeu.
 */
import { compilerEffets, variablesSource, type Effet, type Fiche, type Sorte } from '@vtt/rules';

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
