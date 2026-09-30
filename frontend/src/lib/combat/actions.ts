/**
 * Actions du menu d'attaque (docs/combat.md § 5.2, § 12.1, § 14) : toutes les actions du
 * système qui déclarent une `cible` (attaques, sorts, soins, tests contre un personnage),
 * permises au type d'entité de l'attaquant et dont l'`exige` est vrai pour lui ; groupées par
 * la présentation (`combat.groupes`) ; mode de jet et plafond de cibles déclarés par l'action
 * (`multicible`) ; aperçu du jet de l'attaquant. Aucune clé de jeu : tout vient des données.
 *
 * `multicible` et `combat.groupes` sont lus sans supposer leur présence dans le schéma (ajout
 * du lot « règles ») : une donnée absente donne le comportement par défaut.
 */
import type { AttackRollMode } from '@vtt/contracts';
import { ATTACK_TARGETS_MAX } from '@vtt/contracts';
import {
  apercuFormule,
  apercuVariables,
  chemins,
  type Action,
  type Fiche,
  type Presentation,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { attackerParams, defaultParamValue, isChoiceParam, paramAllowed } from './params';

// ─── Actions à cible ─────────────────────────────────────────────────────────

/** L'action se joue contre une cible (menu d'attaque), pas depuis la fiche seule. */
export const isTargeted = (a: Action) => Boolean(a.cible?.length);

/** L'`exige` de l'action est vrai pour l'attaquant (vrai sans condition). */
export function actionAllowed(systeme: SystemeCharge, action: Action, fiche: Fiche): boolean {
  const exige = systeme.formules.get(chemins.action(action.id, 'exige'));
  if (!exige) return true;
  try {
    return fiche.evaluer(exige, {}, false) === true;
  } catch {
    return false;
  }
}

/** Actions à cible que ce personnage peut jouer, dans l'ordre du système. */
export function targetedActions(systeme: SystemeCharge, fiche: Fiche): Action[] {
  return [...systeme.actions.values()].filter(
    (a) => isTargeted(a) && a.pour.includes(fiche.etat.type) && actionAllowed(systeme, a, fiche),
  );
}

// ─── Groupes du menu ─────────────────────────────────────────────────────────

export interface ActionGroup {
  id: string;
  title: string | null;
  actions: Action[];
}

interface CombatPresentation {
  groupes?: { titre?: unknown; actions?: unknown }[];
}

/** Groupes déclarés par la présentation (`combat.groupes`), lus sans supposer le schéma. */
export function presentationGroups(
  presentation: Presentation | null | undefined,
): { title: string; actions: string[] }[] {
  const combat = (presentation as unknown as { combat?: CombatPresentation } | null)?.combat;
  const groups = Array.isArray(combat?.groupes) ? combat.groupes : [];
  return groups.flatMap((g) =>
    typeof g?.titre === 'string' && Array.isArray(g.actions)
      ? [{ title: g.titre, actions: g.actions.filter((a): a is string => typeof a === 'string') }]
      : [],
  );
}

/**
 * Actions groupées comme la présentation le déclare, dans son ordre ; celles qu'elle ne range
 * nulle part suivent, dans un groupe sans titre (ou « Autres actions » s'il y a des groupes).
 */
export function groupActions(
  actions: readonly Action[],
  presentation: Presentation | null | undefined,
): ActionGroup[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const placed = new Set<string>();
  const out: ActionGroup[] = [];
  presentationGroups(presentation).forEach((g, i) => {
    const list = g.actions.flatMap((id) => {
      const a = byId.get(id);
      if (!a || placed.has(id)) return [];
      placed.add(id);
      return [a];
    });
    if (list.length) out.push({ id: `groupe-${i}`, title: g.title, actions: list });
  });
  const rest = actions.filter((a) => !placed.has(a.id));
  if (rest.length)
    out.push({ id: 'autres', title: out.length ? 'Autres actions' : null, actions: rest });
  return out;
}

// ─── Plusieurs cibles ────────────────────────────────────────────────────────

export interface Multitarget {
  /** Mode de jet proposé par défaut. */
  rollMode: AttackRollMode;
  /** Plafond de cibles. */
  max: number;
}

/** Ce que l'action déclare pour plusieurs cibles (`multicible`), défauts sinon. */
export function multitargetOf(action: Action | null | undefined): Multitarget {
  const m = (action as unknown as { multicible?: { jet?: unknown; max?: unknown } } | null)
    ?.multicible;
  const max =
    typeof m?.max === 'number' && m.max >= 1
      ? Math.min(m.max, ATTACK_TARGETS_MAX)
      : ATTACK_TARGETS_MAX;
  return { rollMode: m?.jet === 'commun' ? 'shared' : 'per_target', max };
}

/** L'action déclare une condition de réussite (sinon « touché » n'a pas de sens). */
export const hasSuccessRule = (action: Action | null | undefined) => Boolean(action?.jet.reussite);

// ─── Aperçu du jet de l'attaquant ────────────────────────────────────────────

/** Une formule dépend de la cible : l'aperçu la dit « selon la cible ». */
const TARGET_REF = /@cible\b|\bcible_(possede|rang)\b/;

export type RollPreview =
  | { kind: 'numeric'; formula: string; dependsOnTarget: boolean }
  | {
      kind: 'symbols';
      dice: { die: string; name: string; count: number | null }[];
      upgrades: { die: string; to: string; name: string; count: number | null }[];
      dependsOnTarget: boolean;
    };

/**
 * Variables de l'action calculées par le moteur sans cible ni dés (`apercuVariables` :
 * avantages de la situation, bonus des effets de l'attaquant…) ; null si la demande est
 * refusée ou incomplète.
 */
function engineVariables(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
  params: Record<string, Valeur>,
): ReadonlyMap<string, Valeur> | null {
  const ids = new Set(action.parametres.map((p) => p.id));
  const parametres = Object.fromEntries(Object.entries(params).filter(([k]) => ids.has(k)));
  try {
    return apercuVariables(systeme, { action: action.id, acteur: fiche, parametres });
  } catch {
    return null;
  }
}

/**
 * Variables connues avant le jet pour l'aperçu : celles du moteur (variables de l'action),
 * puis valeurs des paramètres et champs simples de l'entrée choisie (`arme.competence`,
 * `arme.rang`). Ce qui ne se calcule pas reste écrit.
 */
function previewVariables(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
  params: Record<string, Valeur>,
): (name: string) => Valeur | undefined {
  const values = new Map<string, Valeur>();
  for (const p of attackerParams(systeme, action, fiche)) {
    const v = params[p.id];
    if (v === undefined) continue;
    values.set(p.id, v);
    if (p.type !== 'entree' || typeof v !== 'string' || !v) continue;
    const id = v.split('#', 1)[0]!;
    const entry = systeme.entrees.get(id);
    values.set(`${p.id}.rang`, fiche.possessions.get(id)?.rang ?? 0);
    for (const [champ, value] of Object.entries(entry?.champs ?? {}))
      if (typeof value === 'number' || typeof value === 'boolean')
        values.set(`${p.id}.${champ}`, value);
  }
  // Paramètres cachés : leur défaut (le moteur fait de même), un choix compris
  for (const p of action.parametres)
    if (!values.has(p.id) && !paramAllowed(systeme, action, p, fiche)) {
      if (p.type === 'nombre' || p.type === 'booleen') values.set(p.id, p.defaut);
      else if (isChoiceParam(p)) values.set(p.id, defaultParamValue(fiche, p));
    }
  const computed = engineVariables(systeme, action, fiche, params);
  return (name) => computed?.get(name) ?? values.get(name);
}

/**
 * Aperçu du jet de l'attaquant (§ 5.2) : formule avec les valeurs de sa fiche (« 1d20 + 5 »),
 * ou pool de dés à symboles ; une part qui dépend de la cible est signalée, jamais calculée
 * (un joueur n'a pas la fiche de sa cible).
 */
export function previewRoll(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
  params: Record<string, Valeur>,
): RollPreview | null {
  const variable = previewVariables(systeme, action, fiche, params);
  const text = (path: string): { value: string; target: boolean } | null => {
    const f = systeme.formules.get(chemins.action(action.id, path));
    if (!f) return null;
    try {
      return { value: apercuFormule(fiche, f, variable), target: TARGET_REF.test(f.texte) };
    } catch {
      return { value: f.texte, target: TARGET_REF.test(f.texte) };
    }
  };
  const jet = action.jet;
  if (jet.type === 'numerique') {
    const f = text('jet/formule');
    return f ? { kind: 'numeric', formula: f.value, dependsOnTarget: f.target } : null;
  }
  const names = new Map((systeme.source.des?.sortes ?? []).map((s) => [s.id, s.nom]));
  const count = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  };
  let dependsOnTarget = false;
  const dice = jet.pool.flatMap((p, i) => {
    const f = text(`jet/pool/${i}`);
    if (f?.target) dependsOnTarget = true;
    const n = f && !f.target ? count(f.value) : null;
    if (n === 0) return [];
    return [{ die: p.de, name: names.get(p.de) ?? p.de, count: n }];
  });
  const upgrades = jet.ameliorations.flatMap((p, i) => {
    const f = text(`jet/ameliorations/${i}`);
    if (f?.target) dependsOnTarget = true;
    const n = f && !f.target ? count(f.value) : null;
    if (n === 0) return [];
    return [{ die: p.de, to: p.vers, name: names.get(p.vers) ?? p.vers, count: n }];
  });
  return { kind: 'symbols', dice, upgrades, dependsOnTarget };
}

/**
 * Nombre de dés de chaque sorte que l'aperçu donne à l'attaquant, améliorations comprises
 * (un dé amélioré passe de sa sorte à `vers`) : la valeur « de la fiche » des compteurs du
 * pool (§ 12.1, 2). `null` : dépend de la cible, inconnu avant le jet.
 */
export function poolCounts(preview: RollPreview | null): Readonly<Record<string, number | null>> {
  if (!preview || preview.kind !== 'symbols') return {};
  const counts: Record<string, number | null> = {};
  for (const d of preview.dice)
    counts[d.die] =
      d.count === null || counts[d.die] === null ? null : (counts[d.die] ?? 0) + d.count;
  for (const u of preview.upgrades) {
    const from = counts[u.die];
    if (u.count === null || from === null) {
      counts[u.to] = null;
      continue;
    }
    // On n'améliore que les dés présents ; le reste reste de la sorte d'origine
    const moved = Math.min(u.count, from ?? 0);
    counts[u.die] = (from ?? 0) - moved;
    counts[u.to] = counts[u.to] === null ? null : (counts[u.to] ?? 0) + moved;
  }
  return counts;
}

/**
 * Attributs de la cible que lisent les formules de l'action (`@cible.X`) : l'aperçu par cible
 * du MJ les montre (Défense, Encaissement…), sans rien supposer du jeu.
 */
export function targetAttributeKeys(systeme: SystemeCharge, action: Action): string[] {
  const prefix = chemins.action(action.id, '');
  const keys = new Set<string>();
  for (const [path, f] of systeme.formules) {
    if (!path.startsWith(prefix)) continue;
    for (const k of f.dependancesExternes.get('cible') ?? []) keys.add(k);
  }
  return [...keys];
}

/** Actions dans l'ordre de leurs groupes (raccourcis 1 à 9). */
export const flatActions = (groups: readonly ActionGroup[]) => groups.flatMap((g) => g.actions);

/**
 * Champs d'une entrée que l'action lit par son paramètre (`arme.degats`, `arme.critique`…) :
 * ceux que la carte d'arme montre, sans nommer un champ du jeu.
 */
export function paramFieldRefs(systeme: SystemeCharge, action: Action, paramId: string): string[] {
  const prefix = chemins.action(action.id, '');
  const escaped = paramId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\w.@])${escaped}\\.([A-Za-z_][\\w]*)`, 'g');
  const refs = new Set<string>();
  for (const [path, f] of systeme.formules) {
    if (!path.startsWith(prefix)) continue;
    for (const m of f.texte.matchAll(re)) refs.add(m[1]!);
  }
  return [...refs];
}
