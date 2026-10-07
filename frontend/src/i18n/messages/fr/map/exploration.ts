/** Mémoire de l'exploration (docs/exploration.md) : outil, options, actions du MJ. */
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
  shapes: {
    rect: 'Rectangle',
    circle: 'Cercle',
    lasso: 'Main levée',
  },
  modes: {
    reveal: {
      label: 'Révéler',
      hint: 'Ajouter à la mémoire du groupe (Alt : l’inverse)',
    },
    forget: {
      label: 'Oublier',
      hint: 'Retirer de la mémoire du groupe (Alt : l’inverse)',
    },
  },
  memoryHint: 'Mémoire de ce que le groupe a vu sur cette scène',
  sceneSwitch: 'Exploration de la scène',
  shape: 'Forme',
  mode: 'Mode',
  reset: 'Réinitialiser',
  resetHint: 'Oublier tout ce que le groupe a exploré sur cette scène',
} as const;
