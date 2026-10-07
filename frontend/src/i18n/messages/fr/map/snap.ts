export default {
  steps: {
    off: {
      label: 'Libre',
      hint: 'Posé exactement sous le pointeur',
    },
    cell: {
      label: 'Grille : une case',
      hint: 'Centré dans la case',
    },
    half: {
      label: 'Grille : demi-case',
      hint: 'Deux crans par case',
    },
    quarter: {
      label: 'Grille : quart de case',
      hint: 'Quatre crans par case',
    },
  },
  title: 'Aimantation',
  altHint: 'Alt pendant le geste inverse le réglage. Les extrémités des murs s’aimantent toujours.',
  current: 'Aimantation : {label}',
} as const;
