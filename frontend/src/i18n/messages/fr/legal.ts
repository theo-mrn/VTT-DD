/** Cadre des pages légales ; leur texte est écrit par langue dans `components/legal/<page>/`. */
export default {
  updatedAt: 'Dernière mise à jour : {date}',
  /** Affiché seulement sur une version traduite. */
  translationNotice:
    'Cette traduction est fournie pour votre confort ; seule la version française fait foi.',
} as const;
