/** Page d'accueil publique (landing) et son pied de page, partagé par les pages légales. */
export default {
  play: 'Lire la vidéo',
  skip: 'Aller au contenu',
  nav: {
    label: 'Navigation principale',
    home: 'Yner, accueil',
    benefices: 'Fonctionnalités',
    etapes: 'Comment ça marche',
    faq: 'Questions',
    signIn: 'Se connecter',
    start: 'Créer ma table',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
  },
  cta: {
    start: 'Créer ma table gratuitement',
    openApp: 'Ouvrir Yner',
  },
  hero: {
    eyebrow: 'Table de jeu de rôle en ligne',
    /** Deux lignes, coupées là où la phrase respire. */
    title: '<l>Menez votre campagne en ligne</l><l>sans jongler entre cinq outils</l>',
    lead: 'Carte avec brouillard et lignes de vue, fiches qui appliquent les règles, combat, dés 3D et voix : toute la partie tient dans un onglet. Pour D&D classique, Nooblies Chroniques et Star Wars.',
    proof: 'Gratuit et sans installation. Près de 4 000 cartes, portraits et objets prêts à poser.',
    imageAlt:
      'La table de jeu Yner : survol d’un camp gobelin animé, le groupe et les gobelins posés sur la carte.',
  },
  problem: {
    title: 'Une partie en ligne, c’est souvent cinq onglets ouverts',
    text: 'Un logiciel pour la carte, un PDF pour les fiches, un bot pour les dés, un salon vocal et une playlist à part. Le MJ passe la séance à jongler pendant que la table attend.',
    answer:
      'Sur Yner, tout est sur la même table, et les règles de votre système sont appliquées pour vous.',
    tools: {
      map: { before: 'Un logiciel de carte', after: 'Des scènes avec murs et brouillard' },
      sheets: { before: 'Des fiches en PDF', after: 'Des fiches qui font les calculs' },
      dice: { before: 'Un bot de dés', after: 'Des dés 3D liés aux fiches' },
      voice: { before: 'Un salon vocal', after: 'La voix intégrée à la table' },
      music: { before: 'Une playlist à part', after: 'Des musiques posées sur la carte' },
    },
  },
  benefits: {
    title: 'Le MJ raconte, la table fait le reste',
    lead: 'Quatre choses que vous n’aurez plus à gérer à la main, filmées dans Yner.',
    combat: {
      eyebrow: 'Combat',
      title: 'Moins de calcul, plus de jeu',
      text: 'L’initiative se tire seule et chaque attaque arrive chez le MJ avec ses dés et ses bonus. Il l’applique d’un clic, les points de vie suivent sur les fiches.',
      points: {
        first: 'Initiative et ordre des tours automatiques',
        second: 'Attaque en trois clics : cible, arme, dés',
        third: 'Moitié, double, résistance et états appliqués aux fiches',
      },
      imageAlt:
        'Un combat en cours : l’ordre d’initiative en haut de la carte, le tour du nain Borin en surbrillance.',
    },
    vision: {
      eyebrow: 'Vision',
      title: 'Du mystère qui tient jusqu’au bout',
      text: 'Murs, brouillard et lumières découpent ce que voit chaque personnage, en direct. Ce qui rôde dans l’ombre y reste jusqu’à ce que vous décidiez de le montrer.',
      points: {
        first: 'Lignes de vue propres à chaque personnage',
        second: 'Brouillard qui se lève au fil de l’exploration',
        third: 'Lumières et ombres en temps réel',
      },
      imageAlt:
        'La vue de Kaelith dans un cimetière : en marchant, les ombres des tombes tournent ; un mur posé par le MJ coupe sa vue.',
    },
    sheets: {
      eyebrow: 'Fiches',
      title: 'Des fiches justes dès la création',
      text: 'Caractéristiques, défense, bonus et capacités suivent les règles du système. La création guide pas à pas, et la fiche suit chaque niveau.',
      points: {
        first: 'Création guidée, voies et capacités à votre façon',
        second: 'D&D classique, Nooblies Chroniques et Star Wars',
        third: 'Une fiche Noobliés s’importe par son lien',
      },
      imageAlt:
        'La fiche d’Aelwen, rôdeuse elfe : portrait, caractéristiques, points de vie, défense, attaques et voies de capacités.',
    },
    mood: {
      eyebrow: 'Ambiance',
      title: 'Une ambiance qui se règle en un clic',
      text: 'Orage, blizzard ou brume sur la carte, musique qui monte quand on approche du feu de camp. Toute la table le voit et l’entend au même instant.',
      points: {
        first: 'Pluie, neige, braises, orage et brouillard',
        second: 'Zones sonores qui suivent la distance',
        third: 'Voix à la table ou en proximité',
      },
      imageAlt: 'Le camp gobelin sous l’orage, puis le blizzard, puis le brouillard.',
    },
  },
  tagline: {
    first: 'Vous préparez l’histoire.',
    second: 'Yner tient la carte, les fiches et les dés.',
  },
  scene: {
    label: 'Une rencontre à la taverne',
    imageAlt:
      'La taverne d’Elfsong sur Yner : Borin, Vorthax, Kaelith et Sylvara face au capitaine des bandits et à ses trois hommes',
    chapters: {
      dark: {
        eyebrow: 'Vision des personnages',
        title: 'Vos joueurs entrent dans le noir',
        text: 'Chacun ne voit que ce que voit son personnage : la lueur de sa torche, pas un pas de plus.',
      },
      reveal: {
        eyebrow: 'Révélation du MJ',
        title: 'Vous dévoilez l’embuscade',
        text: 'Un clic éclaire la salle : le capitaine et ses trois bandits attendaient au fond. Votre signal montre à toute la table où regarder.',
      },
      grid: {
        eyebrow: 'Grille',
        title: 'La grille se pose sur la carte',
        text: 'Des cases calées sur le plan, sous les jetons : chacun compte ses déplacements et la portée de ses sorts d’un coup d’œil.',
      },
      initiative: {
        eyebrow: 'Initiative',
        title: 'Le combat s’ordonne tout seul',
        text: 'L’initiative est lancée pour chaque héros et chaque bandit, l’ordre du tour se range, et l’on passe au suivant d’un clic.',
      },
    },
  },
  steps: {
    title: 'Votre première séance en trois étapes',
    create: {
      title: 'Créez votre campagne',
      text: 'Choisissez D&D classique, Nooblies Chroniques ou Star Wars : règles, fiches et combat sont prêts.',
      systems: { dnd: 'D&D classique', nooblies: 'Nooblies Chroniques', starwars: 'Star Wars' },
    },
    invite: {
      title: 'Invitez vos joueurs',
      text: 'Partagez un code de six caractères. Ils rejoignent depuis leur navigateur, sans rien installer.',
      code: 'Code de la campagne',
      joined: '{count, plural, one {# joueur à la table} other {# joueurs à la table}}',
    },
    play: {
      title: 'Lancez la séance',
      text: 'Ouvrez une scène, posez les personnages et les créatures du bestiaire, et jouez.',
      imageAlt: 'Une scène en cours de partie, avec les jetons des personnages sur la carte',
    },
  },
  dice: {
    eyebrow: 'Dés 3D',
    title: 'Des dés qu’on a envie de lancer',
    lead: 'Des dés en 3D lancés avec une vraie physique, à chaque jet de la table. Premium ajoute des dizaines de skins : métaux précieux, cristaux, résines et orbes enchantés.',
    points: {
      visibility: 'Jets publics, privés ou réservés au MJ',
      symbols: 'Dés à symboles pour Star Wars',
      skins: 'Chaque joueur choisit son skin',
    },
    imageAlt:
      'Un dé 20 de la boutique en gros plan, en 3D, qui tourne au fil du défilement dans six skins : Âme Errante, Cyber Néon, Éclipse, Singularité, Marbre Saphir, Résine Fumée.',
    rollD20: 'Lancer un dé 20',
    rollHint: 'Lancer un dé',
  },
  tools: {
    title: 'Et tout le reste de la table',
    lead: 'De la première séance à la centième, tout est déjà là.',
    voice: {
      title: 'Voix à la table',
      text: 'Parlez directement, à toute la table ou selon la distance des personnages.',
    },
    chat: {
      title: 'Discussion',
      text: 'Écrivez à toute la table ou en privé, mentionnez un joueur.',
    },
    ping: {
      title: 'Signal sur la carte',
      text: 'Alt et clic : toute la table regarde au même endroit.',
    },
    bestiary: {
      title: 'Bestiaire',
      text: 'Posez une créature en un clic : sa fiche complète arrive avec elle, prête au combat.',
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
    notes: {
      title: 'Notes et documents',
      text: 'Journaux, PNJ, lieux et quêtes : chacun tient ses notes et partage ce qu’il veut.',
    },
    discord: {
      title: 'Bot Discord',
      text: 'Lancez les dés de votre personnage depuis votre serveur.',
    },
  },
  promo: {
    eyebrow: 'En vidéo',
    title: 'Regardez une vraie partie',
    lead: 'Le camp gobelin, du premier jet au dernier coup, filmé dans Yner.',
    play: 'Lire la vidéo',
  },
  faq: {
    title: 'Vos questions avant la première séance',
    items: {
      free: {
        q: 'Combien coûte Yner ?',
        a: 'Rien. Créer une campagne, inviter vos joueurs et jouer ne coûte rien. Premium, facultatif, ajoute des skins de dés et des cadres de jetons : rien de ce qui sert à jouer n’est payant.',
      },
      install: {
        q: 'Mes joueurs ont quelque chose à installer ?',
        a: 'Non. Un navigateur récent suffit, pour le MJ comme pour les joueurs.',
      },
      systems: {
        q: 'Quels systèmes de jeu sont pris en charge ?',
        a: 'D&D classique, Nooblies Chroniques et Star Wars : Aux confins de l’Empire. Pour chacun, la création, les fiches et le combat appliquent les règles du système.',
      },
      join: {
        q: 'Comment mes joueurs rejoignent la campagne ?',
        a: 'Vous leur donnez un code de six caractères, ou vous les invitez directement depuis votre liste d’amis.',
      },
      voice: {
        q: 'Et pour se parler, sans Discord ?',
        a: 'La voix est intégrée à la table : tout le monde s’entend, ou chacun entend selon la distance des personnages. Un bot Discord reste disponible pour lancer vos dés depuis votre serveur.',
      },
      vision: {
        q: 'Les joueurs voient toute la carte ?',
        a: 'Non. Chaque joueur voit ce que voit son personnage : murs, brouillard et lumières coupent la vue en direct, et le MJ décide de ce qu’il révèle.',
      },
      import: {
        q: 'Je peux reprendre une fiche existante ?',
        a: 'Une fiche Noobliés s’importe par son lien. Pendant la création, vous pouvez aussi modifier les voies et créer vos propres capacités.',
      },
      prep: {
        q: 'Il faut beaucoup préparer avant de jouer ?',
        a: 'Non. Près de 4 000 cartes, portraits et objets sont prêts à poser, et le bestiaire place une créature avec sa fiche complète en un clic.',
      },
    },
  },
  finalCta: {
    title: 'Votre prochaine séance commence ici',
    lead: 'Créez votre table, partagez le code à vos joueurs, jouez ce soir.',
    reassurance: 'Gratuit, sans carte bancaire, sans installation.',
  },
  footer: {
    notice: 'Mentions légales',
    privacy: 'Confidentialité',
    terms: 'Conditions',
    credits: 'Crédits',
  },
} as const;
