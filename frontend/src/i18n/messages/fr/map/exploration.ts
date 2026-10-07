/** Mémoire de l'exploration (docs/exploration.md) : actions du MJ (gestes : outil Brouillard). */
export default {
  commands: {
    enable: 'Activer l’exploration',
    disable: 'Couper l’exploration',
    reveal: 'Révéler une zone',
    forget: 'Oublier une zone',
    reset: 'Réinitialiser l’exploration',
  },
  resetConfirm: {
    title: 'Réinitialiser l’exploration',
    message: 'Tout ce que le groupe a exploré sur cette scène sera oublié.',
  },
  reset: 'Réinitialiser',
} as const;
