/**
 * Dés et jets, génériques : tout vient du système chargé (`@vtt/rules`) et de
 * sa présentation.
 *
 * - `LanceurDes` : lanceur libre (dés à symboles du système, notation `2d6 + 3`).
 * - `ResultatJet` : affichage d'un résultat d'action ou d'un lancer libre.
 * - `PanneauActions` : actions d'un personnage, paramètres, aperçu, lancer par l'API.
 */
export { LanceurDes, type LanceurDesProps } from './lanceur-des';
export { ResultatJet, resumerJet, type JetAffiche, type ResultatJetProps } from './resultat-jet';
export {
  ApercuPool,
  PanneauActions,
  type CibleAction,
  type PanneauActionsProps,
} from './panneau-actions';
export {
  apparenceSorte,
  apparenceSymbole,
  BadgeSymbole,
  DeForme,
  IconeLucide,
  IconeSymbole,
  type ApparenceSorte,
  type ApparenceSymboleAffiche,
} from './apparence';
export { Lancer3D, type De3D, type Lancer3DHandle } from './lancer-3d';
