import type { FormulaNode, StatDefinition } from '@/modules/game-system/types';
import { rollDice } from './dice';

export class FormulaCycleError extends Error {
  constructor(public readonly key: string) {
    super(`Cycle de dépendance détecté en résolvant la stat "${key}"`);
    this.name = 'FormulaCycleError';
  }
}

export interface FormulaContext {
  /** Valeurs de base stockées sur le perso (clé -> valeur brute, avant bonus/modificateur). */
  rawStats: Record<string, number | string | boolean | undefined>;
  /** Bonus agrégés par clé de stat (inventaire + compétences actives). */
  bonuses?: Record<string, number>;
  /** Schéma complet (abilities + dérivées + table-custom) pour résoudre les dépendances. */
  statDefs: Record<string, StatDefinition>;
  /** Tirage de dé injectable (déterministe pour les tests, Math.random par défaut). */
  roll?: (notation: string) => number;
  /** @internal garde-fou anti-cycle */
  _visiting?: Set<string>;
  /** @internal cache de valeurs déjà résolues, partagé par référence sur toute une résolution de personnage
   *  — garantit qu'une stat dérivée contenant un jet de dé (dice/diceField) n'est évaluée qu'une seule fois
   *  même si elle est référencée depuis plusieurs formules (ex PV_Max référencé par PV.maxFormula ET affiché directement). */
  _memo?: Map<string, number>;
  /** @internal vrai pendant l'évaluation d'un modifierFormula : { type:'stat', key } doit alors résoudre la
   *  valeur BRUTE (sans bonus) de la stat référencée, jamais sa valeur finale déjà bonifiée — évite un double
   *  comptage du bonus quand le modificateur d'une ability référence sa propre valeur (ex mod(FOR) = floor((FOR-10)/2)). */
  _rawContext?: boolean;
  /** Formule de modificateur GLOBALE du système (GameSystemDefinition.modifierFormula), utilisée en
   *  priorité par resolveStatModifier pour toute ability sans modifierFormula par-stat explicite. */
  gameSystemModifierFormula?: FormulaNode;
  /** @internal valeur brute de la stat en cours d'évaluation — résolue par {type:'self'}, utilisée
   *  uniquement lors de l'évaluation de gameSystemModifierFormula (formule commune à toutes les abilities). */
  self?: number;
}

function toNumber(value: number | string | boolean | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

/** Évalue un noeud d'AST de formule en nombre. Aucun eval/new Function — simple switch sur une union fermée. */
export function evaluateFormula(node: FormulaNode, ctx: FormulaContext): number {
  switch (node.type) {
    case 'const':
      return node.value;
    case 'stat':
      // Dans le contexte d'un modifierFormula, "stat" désigne la valeur BRUTE (sans bonus) —
      // sinon mod(FOR) inclurait déjà le bonus avant même que resolveStatModifier ne l'ajoute.
      return ctx._rawContext ? toNumber(ctx.rawStats[node.key]) : resolveStatValue(node.key, ctx);
    case 'modifier':
      return resolveStatModifier(node.key, ctx) ?? 0;
    case 'bonus':
      return ctx.bonuses?.[node.key] ?? 0;
    case 'self':
      return ctx.self ?? 0;
    case 'dice': {
      const roll = ctx.roll ?? ((notation: string) => rollDice(notation).total);
      return roll(node.notation);
    }
    case 'diceField': {
      const notation = String(ctx.rawStats[node.key] ?? '');
      if (!notation) return 0;
      const roll = ctx.roll ?? ((n: string) => rollDice(n).total);
      return roll(notation);
    }
    case 'add':
      return node.args.reduce((sum, arg) => sum + evaluateFormula(arg, ctx), 0);
    case 'sub':
      return node.args.reduce((acc, arg, i) => (i === 0 ? evaluateFormula(arg, ctx) : acc - evaluateFormula(arg, ctx)), 0);
    case 'mul':
      return node.args.reduce((acc, arg) => acc * evaluateFormula(arg, ctx), 1);
    case 'div':
      return node.args.reduce((acc, arg, i) => {
        if (i === 0) return evaluateFormula(arg, ctx);
        const divisor = evaluateFormula(arg, ctx);
        return divisor === 0 ? acc : acc / divisor;
      }, 0);
    case 'min':
      return Math.min(...node.args.map((arg) => evaluateFormula(arg, ctx)));
    case 'max':
      return Math.max(...node.args.map((arg) => evaluateFormula(arg, ctx)));
    case 'floor':
      return Math.floor(evaluateFormula(node.arg, ctx));
    case 'ceil':
      return Math.ceil(evaluateFormula(node.arg, ctx));
    case 'clamp': {
      const value = evaluateFormula(node.arg, ctx);
      const lo = evaluateFormula(node.lo, ctx);
      const hi = evaluateFormula(node.hi, ctx);
      return Math.min(Math.max(value, lo), hi);
    }
  }
}

/** Valeur finale (avec bonus) d'une stat, en résolvant récursivement sa formule si elle est dérivée. */
export function resolveStatValue(key: string, ctx: FormulaContext): number {
  const memo = ctx._memo;
  const cached = memo?.get(key);
  if (cached !== undefined) return cached;

  const visiting = ctx._visiting ?? new Set<string>();
  if (visiting.has(key)) throw new FormulaCycleError(key);

  const def = ctx.statDefs[key];
  const bonus = ctx.bonuses?.[key] ?? 0;

  let result: number;
  if (!def) {
    // Stat inconnue du schéma (ex champ libre non déclaré) : retomber sur la valeur brute.
    result = toNumber(ctx.rawStats[key]) + bonus;
  } else if (def.category === 'derived' && def.valueFormula) {
    const nextCtx: FormulaContext = { ...ctx, _visiting: new Set(visiting).add(key) };
    result = evaluateFormula(def.valueFormula, nextCtx) + bonus;
  } else {
    result = toNumber(ctx.rawStats[key]) + bonus;
  }

  memo?.set(key, result);
  return result;
}

/** Clés de stat référencées par une formule (noeuds 'stat'/'modifier'/'bonus'), à n'importe quelle
 *  profondeur — utilisé pour ordonner le tirage des abilities dont la rollFormula référence une
 *  autre ability déjà tirée (ex FORM = FOR + mod(FOR) + 1, tirée après FOR), et pour détecter à
 *  l'édition qu'une rollFormula introduirait un cycle (ex FOR dépend de FORM qui dépend de FOR). */
export function getFormulaDependencies(node: FormulaNode): string[] {
  switch (node.type) {
    case 'stat':
    case 'modifier':
    case 'bonus':
      return [node.key];
    case 'const':
    case 'dice':
    case 'self':
      return [];
    case 'diceField':
      return [];
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'min':
    case 'max':
      return node.args.flatMap(getFormulaDependencies);
    case 'floor':
    case 'ceil':
      return getFormulaDependencies(node.arg);
    case 'clamp':
      return [...getFormulaDependencies(node.arg), ...getFormulaDependencies(node.lo), ...getFormulaDependencies(node.hi)];
  }
}

/** Vrai si l'AST contient un noeud de tirage de dé (dice/diceField), à n'importe quelle profondeur. */
export function formulaContainsDice(node: FormulaNode): boolean {
  switch (node.type) {
    case 'dice':
    case 'diceField':
      return true;
    case 'const':
    case 'stat':
    case 'modifier':
    case 'bonus':
    case 'self':
      return false;
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'min':
    case 'max':
      return node.args.some(formulaContainsDice);
    case 'floor':
    case 'ceil':
      return formulaContainsDice(node.arg);
    case 'clamp':
      return formulaContainsDice(node.arg) || formulaContainsDice(node.lo) || formulaContainsDice(node.hi);
  }
}

/**
 * Modificateur d'une stat, ou undefined si la stat n'en définit pas (ex système narratif).
 * Règle du jeu (confirmée) : le bonus s'ajoute APRÈS le calcul du modificateur — mod(FOR) + bonus,
 * jamais mod(FOR + bonus). Cohérent avec CharacterContext.tsx/Discord (comportement de référence).
 *
 * mod(key) est TOUJOURS calculable pour une stat 'ability', par ordre de priorité :
 * 1. ctx.gameSystemModifierFormula — formule GLOBALE définie une fois pour tout le système (utilise
 *    {type:'self'} pour référencer la valeur de la stat en cours), configurée dans un onglet dédié
 *    de l'éditeur de règles plutôt que répétée par stat.
 * 2. StatDefinition.modifierFormula — formule par-stat explicite (legacy dnd-classic, {type:'stat',key}
 *    référence la stat elle-même par sa clé).
 * 3. floor((v-10)/2) — calcul standard D&D par défaut.
 * Indépendant de l'affichage de la stat elle-même en tant que modificateur (piloté séparément par
 * rollUsesModifier) : le fait qu'une AUTRE stat référence mod(FOR) dans sa propre formule ne dépend
 * jamais de la configuration d'affichage de FOR.
 */
const DEFAULT_ABILITY_MODIFIER_FORMULA = (key: string): FormulaNode => ({
  type: 'floor',
  arg: { type: 'div', args: [{ type: 'sub', args: [{ type: 'stat', key }, { type: 'const', value: 10 }] }, { type: 'const', value: 2 }] },
});

export function resolveStatModifier(key: string, ctx: FormulaContext): number | undefined {
  const def = ctx.statDefs[key];
  if (!def) return undefined;
  if (!ctx.gameSystemModifierFormula && !def.modifierFormula && def.category !== 'ability') return undefined;
  const modifierFormula = ctx.gameSystemModifierFormula ?? def.modifierFormula ?? DEFAULT_ABILITY_MODIFIER_FORMULA(key);

  const visiting = ctx._visiting ?? new Set<string>();
  if (visiting.has(`${key}:mod`)) throw new FormulaCycleError(key);

  const nextCtx: FormulaContext = {
    ...ctx,
    _visiting: new Set(visiting).add(`${key}:mod`),
    _rawContext: true,
    self: toNumber(ctx.rawStats[key]),
  };
  const rawModifier = evaluateFormula(modifierFormula, nextCtx);
  return rawModifier + (ctx.bonuses?.[key] ?? 0);
}
