/**
 * Dés et jets, génériques : tout vient du système chargé (`@vtt/rules`) et de
 * sa présentation.
 *
 * - `LanceurDes` : lanceur libre (dés à symboles du système, notation `2d6 + 3`).
 * - `ResultatJet` : affichage d'un résultat d'action ou d'un lancer libre.
 * - `PanneauActions` : actions d'un personnage, paramètres, aperçu, lancer par l'API.
 */
export { LanceurDes, type LanceurDesProps } from './dice-launcher';
export { ResultatJet, resumerJet, type JetAffiche, type ResultatJetProps } from './roll-result';
export {
  ApercuPool,
  PanneauActions,
  type CibleAction,
  type PanneauActionsProps,
} from './actions-panel';
export {
  apparenceSorte,
  apparenceSymbole,
  BadgeSymbole,
  DeForme,
  IconeLucide,
  IconeSymbole,
  type ApparenceSorte,
  type ApparenceSymboleAffiche,
} from './appearance';
export { Lancer3D, type De3D, type Lancer3DHandle } from './throw-3d';
