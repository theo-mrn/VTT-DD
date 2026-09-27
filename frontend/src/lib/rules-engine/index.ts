/**
 * Moteur de formules de l'ancienne app (lib/rules-engine), réduit à ce qu'utilisent les
 * composants repris de la carte : formules des stats et résolution des valeurs. Le nouveau
 * moteur de règles est `@vtt/rules` (packages/rules).
 */
export {
  evaluateFormula,
  resolveStatValue,
  resolveStatModifier,
  getFormulaDependencies,
  describeFormulaTerms,
  FormulaCycleError,
  type FormulaContext,
  type FormulaTerm,
} from './formula';
export {
  resolveCharacterStats,
  buildFormulaContext,
  buildDiceVariables,
  applyVariablesToNotation,
  getRollableStats,
  getLegacyCustomFieldVariables,
  statsToDefaults,
  groupStats,
  type ResolvedStats,
  type RollableStat,
  type StatGroupEntry,
} from './resolver';
export { parseFormulaText, formulaToText, type FormulaParseResult } from './formula-parser';
export { rollDice, parseDiceNotation, type DiceRollResult } from './dice';
