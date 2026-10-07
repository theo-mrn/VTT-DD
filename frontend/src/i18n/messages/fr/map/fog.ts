export default {
  modes: {
    fog: 'Ajouter du brouillard',
    clear: 'Retirer du brouillard',
  },
  shapes: {
    rect: {
      label: 'Rectangle',
      hint: 'Glisser un rectangle. Alt : mode inverse le temps du geste.',
    },
    circle: {
      label: 'Cercle',
      hint: 'Glisser depuis le centre. ⇧ : rayon en cases entières. Alt : mode inverse.',
    },
    lasso: {
      label: 'Main levée',
      hint: 'Tracer le contour à main levée. Alt : mode inverse.',
    },
    select: {
      label: 'Sélection',
      hint: 'Cliquer, glisser, redimensionner ou supprimer (Suppr) les zones.',
    },
  },
  shape: 'Forme',
  mode: 'Mode',
  add: 'Ajouter',
  remove: 'Retirer',
  coverAllHint: 'Toute la carte sous le brouillard (les zones posées disparaissent)',
  clearAllHint: 'Plus aucun brouillard (les zones posées disparaissent)',
  coverAll: 'Tout couvrir',
  clearAll: 'Tout découvrir',
  fog: 'Brouillard',
  cleared: 'Découvert',
  order:
    '{shape}. Les zones s’appliquent dans l’ordre de leur création : la plus récente qui couvre un point décide.',
  changeMode: 'Changer le mode',
  zone: 'Zone de brouillard',
  clearedZone: 'Zone découverte',
  toFog: 'En faire du brouillard',
  toCleared: 'En faire une zone découverte',
  coverAllWithFog: 'Tout couvrir de brouillard',
} as const;
