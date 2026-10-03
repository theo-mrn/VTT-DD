/**
 * Vue de l'acteur sur le résultat d'une action à cible : ce que voit le joueur qui attaque, et
 * le jet transmis à l'historique des dés. Ses dés et leur total (ou son pool), l'issue, les
 * valeurs que le système lui montre (`visibilite: acteur`) et un déroulé reconstruit à partir
 * de ces seules parties.
 *
 * Jamais : un attribut, une variable, une résistance, une modification ou une table de la
 * cible. Les lignes venues de la cible (défense active, effets `cote: cible`) sont
 * anonymisées : « Défense de la cible ».
 */
import type { SystemeCharge } from '../chargement/index.js';
import type { Action, Parametre } from '../schema/index.js';
import type { Valeur } from '../formules/index.js';
import {
  defautParametre,
  expliquerNumerique,
  expliquerSymboles,
  type BonusJet,
  type EtapePool,
  type JetNumeriqueResultat,
  type JetSymbolesResultat,
  type ResultatAction,
} from './actions.js';

/** Nom et source des lignes venues de la cible, dans la vue de l'acteur. */
export const LIGNE_CIBLE = { source: 'cible', nom: 'Défense de la cible' } as const;

export interface ValeurVisible {
  cle: string;
  nom?: string;
  valeur: Valeur;
}

export interface VueActeur {
  action: string;
  reussi: boolean;
  critique: boolean;
  fumble: boolean;
  /** Jet de l'acteur, lignes de la cible anonymisées. */
  jet: JetNumeriqueResultat | JetSymbolesResultat;
  /** Valeurs déclarées `visibilite: acteur` par l'action, dans l'ordre de calcul. */
  valeurs: ValeurVisible[];
  explications: string[];
  /** Le jet porte des ajustements libres (hors règles). */
  ajuste: boolean;
}

const anonymiserBonus = (b: BonusJet): BonusJet =>
  b.cote === 'cible' ? { ...b, ...LIGNE_CIBLE } : b;
const anonymiserEtape = (e: EtapePool): EtapePool =>
  e.cote === 'cible' ? { ...e, ...LIGNE_CIBLE } : e;

/**
 * Projection du résultat pour l'acteur. `resultat` vient d'une exécution de l'action `systeme`
 * (le système qui l'a résolue, pour les noms et la visibilité des valeurs).
 */
/** Ligne d'une situation déclarée par l'acteur, sauf la neutre. */
function situationDeclaree(p: Parametre, v: Valeur | undefined): string[] {
  if (p.section !== 'situation' || p.par === 'cible' || v === undefined) return [];
  if (v === defautParametre(p)) return [];
  const option = p.type === 'choix' ? p.options.find((o) => o.valeur === v)?.nom : undefined;
  return [`${p.nom} : ${option ?? String(v)}`];
}

/** Variables `visibilite: acteur` de l'action, avec leur valeur. */
function valeursVisibles(action: Action | undefined, resultat: ResultatAction): ValeurVisible[] {
  return [...(action?.variables ?? []), ...(action?.apres ?? [])].flatMap((v) => {
    const valeur = resultat.variables[v.cle];
    if (v.visibilite !== 'acteur' || valeur === undefined) return [];
    return [{ cle: v.cle, ...(v.nom ? { nom: v.nom } : {}), valeur }];
  });
}

export function vueActeur(systeme: SystemeCharge, resultat: ResultatAction): VueActeur {
  const action = systeme.actions.get(resultat.action);
  // Situation déclarée par qui agit (couvert, avantage…) : il la connaît, elle éclaire le jet
  const explications = (action?.parametres ?? []).flatMap((p) =>
    situationDeclaree(p, resultat.parametres[p.id]),
  );
  const src = resultat.jet;
  let jet: JetNumeriqueResultat | JetSymbolesResultat;

  if (src.type === 'numerique') {
    const bonus = src.bonus.map(anonymiserBonus);
    jet = { ...src, bonus };
    explications.push(...expliquerNumerique({ ...src, bonus }));
  } else {
    const construction = src.construction.map(anonymiserEtape);
    jet = { ...src, construction };
    explications.push(...expliquerSymboles(systeme, { ...src, construction }));
  }
  if (resultat.force) explications.push('Issue corrigée par le MJ');
  explications.push(resultat.reussi ? 'Réussite' : 'Échec');

  // Valeurs montrées à l'acteur : `visibilite: acteur`, dans l'ordre de calcul
  const valeurs = valeursVisibles(action, resultat);
  for (const v of valeurs) explications.push(`${v.nom ?? v.cle} : ${String(v.valeur)}`);

  return {
    action: resultat.action,
    reussi: resultat.reussi,
    critique: src.type === 'numerique' ? src.critique : false,
    fumble: src.type === 'numerique' ? src.fumble : false,
    jet,
    valeurs,
    explications,
    ajuste: resultat.ajuste === true,
  };
}
