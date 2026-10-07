/**
 * Champ `formule` d'une entrée évalué sur une fiche : la formule de l'exemplaire possédé, sinon
 * celle du catalogue, avec les variables de l'objet (`rang`, `actif`, `quantite`,
 * `source.<champ>`). Une formule de jet (`des`) tire ses dés par `aleatoire` ; sans lui, elle
 * ne se calcule pas.
 */
import { formuleChamp, variablesObjet } from '../chargement/index.js';
import { ErreurEvaluation, evaluer, type Generateur, type Valeur } from '../formules/index.js';
import type { Fiche } from './fiche.js';

/** Valeur du champ ; absent : pas de tel champ formule, pas de formule, ou elle échoue. */
export function evaluerChampEntree(
  fiche: Fiche,
  entree: string,
  champ: string,
  o: { actif?: boolean; aleatoire?: Generateur } = {},
): Valeur | undefined {
  const systeme = fiche.systeme;
  const e = systeme.entrees.get(entree);
  const sorte = e && systeme.sortes.get(e.sorte);
  const def = sorte?.champs.find((c) => c.id === champ);
  if (!e || !sorte || def?.type !== 'formule') return undefined;
  const p = fiche.possessions.get(entree);
  const f = formuleChamp(systeme, e, def, p?.possession, fiche.etat.type);
  if (!f) return undefined;
  const lire = variablesObjet(
    e,
    sorte,
    { rang: p?.rang ?? 0, actif: o.actif ?? p?.actif ?? true, quantite: p?.quantite ?? 1 },
    p?.possession,
  );
  const variable = (n: string): Valeur => {
    const x = lire(n);
    if (x === undefined) throw new ErreurEvaluation(`Variable inconnue : ${n}`, 0);
    return x;
  };
  try {
    return evaluer(
      f.noeud,
      fiche.contexte({ variable, ...(o.aleatoire ? { aleatoire: o.aleatoire } : {}) }),
    ).valeur;
  } catch (e) {
    if (e instanceof ErreurEvaluation) return undefined;
    throw e;
  }
}
