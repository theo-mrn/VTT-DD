/**
 * Résultat d'une attaque tel que le menu le met en scène (docs/combat.md § 12.1, 3) : grand
 * chiffre du jet (dés + mod = total, ou symboles), TOUCHÉ ou RATÉ par cible, puis grand chiffre
 * des dégâts avec leur détail, dévoilés l'un après l'autre.
 *
 * Tout part de `targetDisplay` (view.ts) : un joueur ne voit que la vue de l'attaquant envoyée
 * par le serveur (ses dés, l'issue, les valeurs que le système lui montre), jamais une valeur
 * de la cible ; le MJ voit en plus les modifications proposées.
 */
import type { Attack, NumericRoll, RollBonus, SymbolRoll } from '@vtt/contracts';
import {
  decisionLabel,
  outcomeLabel,
  targetDisplay,
  type OutcomeTone,
  type TargetDisplay,
} from './view';

export type RollFigure =
  | {
      kind: 'numeric';
      /** Somme des dés gardés. */
      dice: number;
      /** Tout le reste : modificateurs de la formule et bonus des effets. */
      modifier: number;
      total: number;
      formula: string;
      bonuses: readonly RollBonus[];
      roll: NumericRoll;
    }
  | { kind: 'symbols'; roll: SymbolRoll };

export interface DamageFigure {
  value: number;
  /** Nom donné par le système (« Dégâts », « Dégâts bruts »…), sinon null. */
  name: string | null;
  /** Sens connu (MJ : la modification proposée) : retire, ajoute ; null sinon. */
  sense: 'subtract' | 'add' | null;
  /** Autres valeurs montrées, et pour le MJ le détail des modifications. */
  details: { label: string; value: string }[];
}

export interface TargetSummary {
  characterId: string;
  figure: RollFigure | null;
  outcome: { label: string; tone: OutcomeTone } | null;
  /** Touché (vrai), raté (faux), sans condition de réussite (null). */
  hit: boolean | null;
  damage: DamageFigure | null;
  error: string | null;
  decision: string | null;
  display: TargetDisplay;
}

/** Grand chiffre d'un jet : dés + mod = total, ou le pool à symboles. */
export function rollFigure(roll: TargetDisplay['roll']): RollFigure | null {
  if (!roll) return null;
  if (roll.kind === 'symbols') return { kind: 'symbols', roll };
  return {
    kind: 'numeric',
    dice: roll.natural,
    modifier: roll.total - roll.natural,
    total: roll.total,
    formula: roll.formula,
    bonuses: roll.bonuses,
    roll,
  };
}

function text(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  return String(v);
}

/**
 * Dégâts (ou soins) à mettre en avant : la première valeur numérique que le système montre à
 * l'attaquant ; pour le MJ sans telle valeur, la première modification d'un attribut de la
 * cible. Rien sur un raté : les dégâts ne se lancent que si l'action touche.
 */
export function damageFigure(
  d: TargetDisplay,
  hit: boolean | null,
  attributeName: (key: string) => string = (k) => k,
): DamageFigure | null {
  if (hit === false) return null;
  const numeric = d.values.filter((v) => typeof v.value === 'number');
  const targetMods = d.modifications.filter(
    (m) => m.kind === 'attribute' && m.entity === 'target' && m.operation !== 'set',
  );
  const firstMod = targetMods[0]?.kind === 'attribute' ? targetMods[0] : null;
  const sense = senseOf(firstMod);
  const main = mainFigure(numeric, firstMod, attributeName);
  const details: DamageFigure['details'] = numeric.slice(1).map(valueDetail);
  for (const v of d.values) if (typeof v.value !== 'number') details.push(valueDetail(v));
  if (!main) return null;
  for (const m of targetMods)
    if (m.kind === 'attribute') details.push(modificationDetail(m, attributeName));
  return { ...main, sense, details };
}

type DisplayValue = TargetDisplay['values'][number];
type AttributeModification = Extract<TargetDisplay['modifications'][number], { kind: 'attribute' }>;

/** Sens de la première modification de la cible (ajout ou retrait), s'il y en a une. */
function senseOf(mod: AttributeModification | null): 'add' | 'subtract' | null {
  if (!mod) return null;
  return mod.operation === 'add' ? 'add' : 'subtract';
}

/** Valeur mise en avant : la première valeur numérique, sinon la première modification. */
function mainFigure(
  numeric: readonly DisplayValue[],
  firstMod: AttributeModification | null,
  attributeName: (key: string) => string,
): { value: number; name: string | null } | null {
  const first = numeric[0];
  if (first) return { value: first.value as number, name: first.name ?? null };
  if (firstMod) return { value: firstMod.value, name: attributeName(firstMod.attribute) };
  return null;
}

/** Détail d'une valeur montrée (« oui » / « non » pour un booléen). */
const valueDetail = (v: DisplayValue) => ({ label: v.name ?? v.key, value: text(v.value) });

/** Détail d'une modification : « −7 (10 avant réduction) ». */
function modificationDetail(m: AttributeModification, attributeName: (key: string) => string) {
  const sign = m.operation === 'add' ? '+' : '−';
  const raw = m.raw !== undefined && m.raw !== m.value ? ` (${m.raw} avant réduction)` : '';
  return { label: attributeName(m.attribute), value: `${sign}${m.value}${raw}` };
}

/** Ce que le menu montre d'une cible après la résolution. */
export function summarizeTarget(
  attack: Attack,
  target: Attack['targets'][number],
  o: { successRule: boolean; attributeName?: (key: string) => string },
): TargetSummary {
  const d = targetDisplay(attack, target);
  const outcome = outcomeLabel(d.outcome, o.successRule);
  const tranche = d.outcome && (o.successRule || d.outcome.critical);
  const hit = tranche ? d.outcome!.success : null;
  return {
    characterId: d.characterId,
    figure: rollFigure(d.roll),
    outcome,
    hit,
    damage: d.outcome ? damageFigure(d, hit, o.attributeName) : null,
    error: d.error,
    decision: decisionLabel(d.decision),
    display: d,
  };
}

/**
 * Un seul grand chiffre pour toutes les cibles : jet commun (zone), ou une seule cible. Sinon
 * chaque cible a sa rangée, avec son propre jet.
 */
export const sharedRoll = (attack: Attack) =>
  attack.targets.length === 1 || attack.rollMode === 'shared';

export interface RevealTimeline {
  /** Délais (ms) avant l'issue, les dégâts, puis la fin (boutons, statut du rapport). */
  outcome: number;
  damage: number;
  done: number;
}

/**
 * Rythme du dévoilement (§ 12.1, 3) : le jet, puis TOUCHÉ ou RATÉ, puis les dégâts, cible
 * après cible. Mouvement réduit, ou attaque déjà vue : tout d'un coup.
 */
export function revealTimeline(o: {
  targets: number;
  damage: boolean;
  instant: boolean;
}): RevealTimeline {
  if (o.instant) return { outcome: 0, damage: 0, done: 0 };
  const stagger = Math.min(Math.max(o.targets - 1, 0), 4) * 120;
  const outcome = 550;
  const damage = outcome + 500 + stagger;
  return { outcome, damage, done: (o.damage ? damage : outcome + stagger) + 450 };
}
