/** Parcours de bienvenue après l’inscription. */
export default {
  steps: {
    bienvenue: 'Bienvenue',
    profil: 'Votre profil',
    depart: 'Premier pas',
  },
  skip: 'Passer',
  welcome: 'Bienvenue sur Yner',
  hello: 'Salut, <b>{name}</b>.',
  lead: "Quatre questions pour préparer votre table : qui vous êtes, comment vous jouez, et vos univers favoris. Moins d'une minute.",
  start: 'Commencer',
  nameQuestion: 'Comment vous appelle-t-on à la table ?',
  nameHint: "C'est ce que verront vos compagnons d'aventure. Vous pourrez tout changer plus tard.",
  pickAvatar: 'Choisir un avatar',
  avatarFormats: 'PNG, JPEG, WebP, 5 Mo max.',
  aboutYou: 'Quelques mots sur vous',
  optional: 'Facultatif',
  bioPlaceholder: 'Rôliste depuis le lycée, fan de donjons humides et de PNJ bavards…',
  whereStart: "Par où commence l'aventure ?",
  whereStartHint:
    'Rejoignez la table de votre MJ, une campagne ouverte, ou ouvrez la vôtre. Votre héros se crée ensuite dans la campagne, avec son système de jeu.',
  joinCampaign: 'Rejoindre une campagne',
  campaignCode: 'Code de la campagne',
  openCampaigns: 'Campagnes ouvertes',
  openCampaignsHint: 'Pas de code ? Ces tables publiques accueillent de nouveaux joueurs.',
  createCampaign: 'Créer une campagne',
  createCampaignHint:
    "Vous êtes le MJ : choisissez le système et l'ambiance, puis invitez vos joueurs.",
  explore: 'Explorer par moi-même',
} as const;
