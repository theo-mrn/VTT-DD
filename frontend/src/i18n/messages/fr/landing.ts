/** Page d'accueil publique (landing) et son pied de page, partagé par les pages légales. */
export default {
  nav: {
    label: 'Navigation principale',
    home: 'Yner, accueil',
    features: 'Fonctionnalités',
    signIn: 'Se connecter',
    start: 'Commencer',
  },
  cta: {
    startFree: 'Commencer gratuitement',
    openApp: 'Ouvrir Yner',
  },
  hero: {
    eyebrow: 'Table de jeu de rôle en ligne',
    /** « une vraie table » est mis en valeur (police d'ambiance, couleur dorée). */
    title: 'Vos campagnes méritent <accent>une vraie table</accent>',
    lead: 'Cartes vivantes, brouillard de guerre, fiches qui calculent pour vous et dés en 3D. Tout ce qu’il faut pour jouer, dans votre navigateur.',
    discover: 'Découvrir',
    perks: {
      free: 'Gratuit',
      noInstall: 'Sans installation',
      systems: 'D&D, Star Wars et plus',
    },
    imageAlt:
      'La table de jeu Yner : une taverne de nuit, le groupe face aux bandits, l’ordre d’initiative du combat en haut de l’écran.',
  },
  features: {
    title: 'Tout pour jouer, rien de superflu',
    lead: 'Le maître du jeu prépare, les joueurs jouent. Yner s’occupe du reste.',
    combat: {
      eyebrow: 'Combat',
      title: 'Des combats qui s’enchaînent tout seuls',
      text: 'L’initiative est tirée, l’ordre affiché, chaque tour mis en avant. Attaques et dégâts s’appliquent directement sur les fiches, sans calcul à la main.',
      points: {
        first: 'Initiative automatique',
        second: 'Tour par tour ou par camp',
        third: 'Dégâts appliqués aux fiches',
      },
      imageAlt:
        'Un combat en cours : l’ordre d’initiative en haut de la carte, le tour du nain Borin en surbrillance.',
    },
    vision: {
      eyebrow: 'Vision',
      title: 'Vos joueurs ne voient que ce que leur personnage voit',
      text: 'Brouillard de guerre, lignes de vue, lumières dynamiques et météo : la carte se dévoile au fil de l’exploration, et ce qui rôde dans l’ombre y reste.',
      points: {
        first: 'Brouillard et lignes de vue',
        second: 'Lumières et ombres en temps réel',
        third: 'Pluie, neige, braises, tempête',
      },
      imageAlt:
        'La vue d’une joueuse dans un cimetière : la chapelle et les tombes visibles, l’ombre d’un tombeau qui cache ce qui se trouve derrière, le brouillard sur le côté.',
    },
    sheets: {
      eyebrow: 'Fiches',
      title: 'Des fiches qui font les calculs',
      text: 'Caractéristiques, défense, bonus et capacités : les règles du système sont appliquées pour vous. Votre personnage progresse, sa fiche suit.',
      points: {
        first: 'Création guidée, étape par étape',
        second: 'Règles de D&D, Star Wars et plus',
        third: 'Capacités, inventaire et progression',
      },
      imageAlt:
        'La fiche d’Aelwen, rôdeuse elfe : portrait, caractéristiques, points de vie, défense, attaques et voies de capacités.',
    },
  },
  dice: {
    eyebrow: 'Dés 3D',
    title: 'Des dés qu’on a envie de lancer',
    lead: 'Plus de 70 dés en 3D, lancés avec une vraie physique : métaux précieux, cristaux, résines et orbes enchantés. Tous offerts.',
    points: {
      visibility: 'Jets publics, privés ou réservés au MJ',
      symbols: 'Dés à symboles pour Star Wars',
      skins: 'Chaque joueur choisit son skin',
    },
    rollD20: 'Lancer un dé 20',
    rollHint: 'Lancer un dé',
  },
  tools: {
    title: 'Et tout le reste de la table',
    lead: 'De la première partie à la centième, tout est déjà là.',
    sound: {
      title: 'Ambiance sonore',
      text: 'Des musiques posées sur la carte, qui montent quand on s’approche. Fichiers ou YouTube.',
      track: 'La Taverne d’Elfsong',
      zone: 'Zone musicale · 6 cases',
    },
    bestiary: {
      title: 'Bestiaire',
      text: 'Posez une créature en un clic : sa fiche complète arrive avec elle, prête au combat.',
      count: 'créatures D&D',
    },
    discord: {
      title: 'Bot Discord',
      text: 'Lancez les dés de votre personnage depuis votre serveur.',
    },
    invite: {
      title: 'Invitation en un code',
      text: 'Vos joueurs rejoignent la campagne avec six caractères.',
    },
    weather: {
      title: 'Météo',
      text: 'Pluie, neige, braises ou tempête, réglées au vent près.',
    },
    templates: {
      title: 'Gabarits de sorts',
      text: 'Cônes, cercles et lignes pour viser juste.',
    },
    systems: {
      title: 'Plusieurs systèmes de jeu',
      text: 'Les règles de chaque système sont appliquées pour vous : création, fiches, combat.',
      dnd: 'D&D classique',
      starWars: 'Star Wars — Aux confins de l’Empire',
      nooblies: 'Nooblies Chroniques',
    },
    notes: {
      title: 'Notes et documents',
      text: 'Lettres, cartes et indices, montrés aux joueurs au bon moment.',
    },
    history: {
      title: 'Historique',
      text: 'Chaque jet, chaque coup, chaque découverte, gardés pour la suite.',
    },
    library: {
      title: 'Bibliothèque',
      text: 'Près de 4 000 cartes, portraits et objets prêts à poser.',
    },
    portals: {
      title: 'Portails et scènes',
      text: 'Escaliers, portes et passages qui mènent le groupe d’une carte à l’autre.',
    },
    layers: {
      title: 'Calques du MJ',
      text: 'Préparez en coulisses, révélez quand il le faut.',
    },
    realtime: {
      title: 'Temps réel',
      text: 'Chaque geste se synchronise à l’instant pour toute la table.',
    },
  },
  finalCta: {
    /** « commence ici » est mis en valeur. */
    title: 'Votre prochaine session <accent>commence ici</accent>',
    lead: 'Créez votre table en une minute, invitez vos joueurs avec un code.',
    button: 'Créer ma table',
  },
  footer: {
    notice: 'Mentions légales',
    privacy: 'Confidentialité',
    terms: 'Conditions',
    credits: 'Crédits',
  },
} as const;
