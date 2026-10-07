/** Trajet des déplacements (docs/carte.md § 10) : bascule, règle de la table. */
export default {
  show: 'Afficher les trajets',
  hide: 'Masquer les trajets',
  forcedShown: 'Trajets affichés par le MJ',
  forcedHidden: 'Trajets masqués par le MJ',
  tableRule: 'Trajets pour la table',
  /** Libellé de l'historique quand le MJ change la règle de la table. */
  tableRuleCommand: 'Trajets des déplacements',
  rules: {
    free: 'Au choix de chacun',
    shown: 'Toujours affichés',
    hidden: 'Masqués',
  },
} as const;
