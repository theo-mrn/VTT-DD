/**
 * Ce que le panneau de dés lit sur le personnage incarné, sans clé de jeu :
 *
 * - les attributs à modificateur, proposés en raccourcis comme les
 *   caractéristiques de l'ancienne app (insérés par leur clé, `+ FOR` : le
 *   service des dés lit le modificateur sur le personnage) ;
 * - les pools des jets de compétence : actions du système à dés à symboles,
 *   sans cible, dont le seul choix est une entrée (compétence…). Le pool est
 *   calculé localement par le moteur (aperçu à dés fictifs) puis chargé dans
 *   le panneau : le joueur ajoute ensuite la difficulté à la main, comme avant.
 */
import {
  aleatoireGraine,
  chemins,
  executerAction,
  type Action,
  type Fiche,
  type Pool,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';

export interface StatShortcut {
  key: string;
  label: string;
  value: number;
}

/** Attributs numériques visibles à modificateur, dans l'ordre du système. */
export function statShortcuts(sheet: Fiche): StatShortcut[] {
  const list: StatShortcut[] = [];
  for (const a of sheet.entite.attributs.values()) {
    if (a.visibilite === 'mj') continue;
    if (a.nature !== 'base' && !(a.nature === 'derivee' && a.type === 'nombre')) continue;
    if (!a.modificateur) continue;
    const mod = sheet.valeurs.get(a.cle)?.modificateur;
    if (typeof mod !== 'number') continue;
    list.push({ key: a.cle, label: a.abrege ?? a.nom, value: mod });
  }
  return list;
}

export interface SkillPool {
  id: string;
  /** Nom de l'action (groupe de la liste). */
  group: string;
  label: string;
  rank: number;
  pool: Pool;
}

type Parameter = Action['parametres'][number];

function conditionMet(system: SystemeCharge, sheet: Fiche, path: string): boolean {
  const f = system.formules.get(path);
  return !f || sheet.evaluer(f, {}, false) === true;
}

function previewPool(
  system: SystemeCharge,
  sheet: Fiche,
  action: Action,
  parameters: Record<string, Valeur>,
): Pool | null {
  try {
    const r = executerAction(system, {
      action: action.id,
      acteur: sheet,
      parametres: parameters,
      aleatoire: aleatoireGraine('panneau-des'),
    });
    if (!r.ok || r.resultat.jet.type !== 'symboles') return null;
    return r.resultat.jet.pool.filter((p) => p.nombre > 0);
  } catch {
    return null;
  }
}

/** Pools des jets de compétence du personnage (vide pour un système sans dés à symboles). */
export function skillPools(system: SystemeCharge, sheet: Fiche): SkillPool[] {
  if (!system.source.des?.sortes.length) return [];
  const out: SkillPool[] = [];
  for (const action of system.actions.values()) {
    if (!action.pour.includes(sheet.etat.type)) continue;
    if (action.jet.type !== 'symboles' || action.cible) continue;
    if (!conditionMet(system, sheet, chemins.action(action.id, 'exige'))) continue;
    const entries = action.parametres.filter(
      (p): p is Extract<Parameter, { type: 'entree' }> => p.type === 'entree',
    );
    if (entries.length > 1 || action.parametres.some((p) => p.type === 'attribut')) continue;
    const param = entries[0];
    if (!param) {
      const pool = previewPool(system, sheet, action, {});
      if (pool?.length)
        out.push({ id: action.id, group: action.nom, label: action.nom, rank: 0, pool });
      continue;
    }
    const options: { id: string; name: string; rank: number }[] = [];
    for (const e of system.entrees.values()) {
      if (e.sorte !== param.sorte) continue;
      if (param.etiquette && !e.etiquettes.includes(param.etiquette)) continue;
      const owned = sheet.possessions.get(e.id);
      if (owned && !owned.actif) continue;
      if (!owned && param.possedee) continue;
      options.push({ id: e.id, name: e.nom, rank: owned?.rang ?? 0 });
    }
    options.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    for (const o of options) {
      const pool = previewPool(system, sheet, action, { [param.id]: o.id });
      if (pool?.length)
        out.push({
          id: `${action.id}:${o.id}`,
          group: action.nom,
          label: o.name,
          rank: o.rank,
          pool,
        });
    }
  }
  return out;
}
