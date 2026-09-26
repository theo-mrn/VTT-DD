/**
 * Dés et jets, génériques : tout vient du système chargé (`@vtt/rules`) et de
 * sa présentation.
 *
 * - `LanceurDes` : lanceur libre (dés à symboles du système, notation `2d6 + 3`).
 * - `ResultatJet` : affichage d'un résultat d'action ou d'un lancer libre.
 * - `PanneauActions` : actions d'un personnage, paramètres, aperçu, lancer par l'API.
 */
export {
  DiceLauncher as LanceurDes,
  type DiceLauncherProps as LanceurDesProps,
} from './dice-launcher';
export {
  RollResult as ResultatJet,
  summarizeRoll as resumerJet,
  type DisplayedRoll as JetAffiche,
  type RollResultProps as ResultatJetProps,
} from './roll-result';
export {
  PoolPreview as ApercuPool,
  ActionsPanel as PanneauActions,
  type ActionTarget as CibleAction,
  type ActionsPanelProps as PanneauActionsProps,
} from './actions-panel';
export {
  kindAppearance as apparenceSorte,
  symbolAppearance as apparenceSymbole,
  SymbolBadge as BadgeSymbole,
  ShapedDie as DeForme,
  LucideIcon as IconeLucide,
  SymbolIcon as IconeSymbole,
  type KindAppearance as ApparenceSorte,
  type DisplayedSymbolAppearance as ApparenceSymboleAffiche,
} from './appearance';
export {
  Throw3D as Lancer3D,
  type Die3D as De3D,
  type Die3DSymbol as SymboleDe3D,
  type Throw3DHandle as Lancer3DHandle,
} from './throw-3d';
export { symbolFaces3D } from './dice-3d-input';
