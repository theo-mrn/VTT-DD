/**
 * Panneau de dés repris de l'ancienne app, branché sur le service des dés
 * (docs/api-dice.md) : lanceur, historique de la salle, statistiques, skins.
 */
export { DiceRoller, type DiceRollerCharacter } from './dice-roller';
export { DiceStats } from './dice-stats';
export { StoreModal } from './store-modal';
export { useDicePreferences } from './use-dice-preferences';
export { useRollHistory, type RollHistory } from './use-roll-history';
