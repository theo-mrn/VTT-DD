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
import type { Valeur } from '../formules/index.js';
import {
  decrireEtape,
  decrireJet,
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

const signe = (n: number) => (n < 0 ? `− ${-n}` : `+ ${n}`);

const anonymiserBonus = (b: BonusJet): BonusJet =>
  b.cote === 'cible' ? { ...b, ...LIGNE_CIBLE } : b;
const anonymiserEtape = (e: EtapePool): EtapePool =>
  e.cote === 'cible' ? { ...e, ...LIGNE_CIBLE } : e;

/**
 * Projection du résultat pour l'acteur. `resultat` vient d'une exécution de l'action `systeme`
 * (le système qui l'a résolue, pour les noms et la visibilité des valeurs).
 */
export function vueActeur(systeme: SystemeCharge, resultat: ResultatAction): VueActeur {
  const action = systeme.actions.get(resultat.action);
  const explications: string[] = [];
  const src = resultat.jet;
  let jet: JetNumeriqueResultat | JetSymbolesResultat;

  if (src.type === 'numerique') {
    const bonus = src.bonus.map(anonymiserBonus);
    jet = { ...src, bonus };
    const des = src.jets.length ? ` [${src.jets.map(decrireJet).join(' ; ')}]` : '';
    explications.push(`Jet ${src.formule} = ${src.valeur}${des}`);
    for (const b of bonus) explications.push(`${b.nom} : ${signe(b.valeur)}`);
    if (bonus.length) explications.push(`Total : ${src.total}`);
    if (src.critique) explications.push('Critique');
    if (src.fumble) explications.push('Échec critique');
  } else {
    const construction = src.construction.map(anonymiserEtape);
    jet = { ...src, construction };
    const sortes = systeme.source.des?.sortes ?? [];
    const nomDe = (id: string) => sortes.find((s) => s.id === id)?.nom ?? id;
    for (const e of construction) {
      if (e.source === 'action' && e.operation === 'ajouter') continue;
      explications.push(decrireEtape(e, nomDe));
    }
    explications.push(
      `Pool : ${src.pool.map((p) => `${p.nombre} × ${nomDe(p.de)}`).join(', ') || 'aucun dé'}`,
    );
    const symboles = systeme.source.des?.symboles ?? [];
    const sortis = symboles.filter((s) => (src.symboles[s.id] ?? 0) > 0);
    explications.push(
      `Symboles : ${sortis.map((s) => `${s.nom} ${src.symboles[s.id]}`).join(', ') || 'aucun'}`,
    );
    const lus = systeme.source.des?.resultats.filter((r) => r.visible) ?? [];
    if (lus.length)
      explications.push(lus.map((r) => `${r.nom} : ${src.resultats[r.cle] ?? 0}`).join(', '));
  }
  if (resultat.force) explications.push('Issue corrigée par le MJ');
  explications.push(resultat.reussi ? 'Réussite' : 'Échec');

  // Valeurs montrées à l'acteur : `visibilite: acteur`, dans l'ordre de calcul
  const valeurs: ValeurVisible[] = [];
  for (const v of [...(action?.variables ?? []), ...(action?.apres ?? [])]) {
    if (v.visibilite !== 'acteur') continue;
    const valeur = resultat.variables[v.cle];
    if (valeur === undefined) continue;
    valeurs.push({ cle: v.cle, ...(v.nom ? { nom: v.nom } : {}), valeur });
    explications.push(`${v.nom ?? v.cle} : ${String(valeur)}`);
  }

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
