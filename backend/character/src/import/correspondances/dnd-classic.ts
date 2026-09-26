/**
 * D&D classique : identifiants legacy → nouveaux ids.
 *
 * Généré une fois depuis legacy/public/tabs (race.json, profile.json et les
 * fichiers de voies) et le système packages/systemes/systemes/dnd-classic,
 * puis relu. Les races et profils gardent leur id (race.json, profile.json) ;
 * seules les graphies anciennes ou d'affichage sont listées ici.
 */

/**
 * Race (`Race`) : l'id de race.json est l'id du système. Graphies rencontrées
 * ailleurs dans l'ancienne app (noms de fichiers de voies, libellés), en `slug`.
 * Wolfer, ogre et frouin n'ont qu'une voie raciale, pas de race : la voie
 * reste migrée, la race devient un avertissement.
 */
export const RACES: Readonly<Record<string, string>> = {
  'ame-forgee': 'ame_forgee',
  ameforgee: 'ame_forgee',
  'elfe-noir': 'elfe_noir',
  elfenoir: 'elfe_noir',
  'elfe-sylvain': 'elfe_sylvain',
  elfesylvain: 'elfe_sylvain',
};

/** Profil (`Profile`), en `slug` : même id, accents et majuscules en moins (`Nécromancien`). */
export const PROFILS: Readonly<Record<string, string>> = {
  barbare: 'barbare',
  barde: 'barde',
  chevalier: 'chevalier',
  druide: 'druide',
  ensorceleur: 'ensorceleur',
  forgesort: 'forgesort',
  guerrier: 'guerrier',
  invocateur: 'invocateur',
  magicien: 'magicien',
  moine: 'moine',
  necromancien: 'necromancien',
  pretre: 'pretre',
  psionique: 'psionique',
  rodeur: 'rodeur',
  samourai: 'samourai',
  voleur: 'voleur',
};

/**
 * Voie (`Voie1`…`Voie10`, nom de fichier de legacy/public/tabs sans `.json`)
 * → voie. Appariement par le nom de la voie (champ `Voie` du fichier), parmi
 * les voies du même profil, de la même classe de prestige ou des races (deux
 * voies portent le même nom dans deux profils : « Voie de l'envoûteur »).
 * Non migrables : `custom:<nom>` (voie personnalisée) et `voie_vide`
 * (squelette des fiches Noobliés importées) : leurs capacités n'existent
 * que dans les customCompetences.
 */
export const VOIES: Readonly<Record<string, string>> = {
  'Ame-forgee': 'race-ame-forgee',
  Barbare1: 'barbare-brute',
  Barbare2: 'barbare-rage',
  Barbare3: 'barbare-pagne',
  Barbare4: 'barbare-pourfendeur',
  Barbare5: 'barbare-primitif',
  Barde1: 'barde-seduction',
  Barde2: 'barde-escrime',
  Barde3: 'barde-musicien',
  Barde4: 'barde-saltimbanque',
  Barde5: 'barde-vagabond',
  Chevalier1: 'chevalier-guerre',
  Chevalier2: 'chevalier-noblesse',
  Chevalier3: 'chevalier-cavalier',
  Chevalier4: 'chevalier-heros',
  Chevalier5: 'chevalier-meneur-d-homme',
  Drakonide: 'race-drakonide',
  Druide1: 'druide-nature',
  Druide2: 'druide-animaux',
  Druide3: 'druide-fauve',
  Druide4: 'druide-vegetaux',
  Druide5: 'druide-protecteur',
  Elfe: 'race-haut-elfe',
  Elfenoir: 'race-elfe-noir',
  Elfesylvain: 'race-elfe-sylvain',
  Ensorceleur1: 'ensorceleur-divination',
  Ensorceleur2: 'ensorceleur-air',
  Ensorceleur3: 'ensorceleur-envouteur',
  Ensorceleur4: 'ensorceleur-illusions',
  Ensorceleur5: 'ensorceleur-invocation',
  Forgesort1: 'forgesort-elixirs',
  Forgesort2: 'forgesort-artefacts',
  Forgesort3: 'forgesort-runes',
  Forgesort4: 'forgesort-golem',
  Forgesort5: 'forgesort-metal',
  Frouin: 'race-frouin',
  Guerrier1: 'guerrier-resistance',
  Guerrier2: 'guerrier-bouclier',
  Guerrier3: 'guerrier-combat',
  Guerrier4: 'guerrier-maitre-d-armes',
  Guerrier5: 'guerrier-soldat',
  Halfelin: 'race-halfelin',
  Humain: 'race-humain',
  Invocateur1: 'invocateur-conjuration',
  Invocateur2: 'invocateur-entite',
  Invocateur3: 'invocateur-mutations',
  Invocateur4: 'invocateur-portes',
  Invocateur5: 'invocateur-familier',
  Magicien1: 'magicien-magie-des-arcanes',
  Magicien2: 'magicien-magie-destructrice',
  Magicien3: 'magicien-magie-elementaire',
  Magicien4: 'magicien-magie-protectrice',
  Magicien5: 'magicien-magie-universelle',
  Minotaure: 'race-minotaure',
  Moine1: 'moine-maitrise',
  Moine2: 'moine-meditation',
  Moine3: 'moine-poing',
  Moine4: 'moine-vent',
  Moine5: 'moine-energie-vitale',
  Nain: 'race-nain',
  Necromancien1: 'necromancien-mort',
  Necromancien2: 'necromancien-sombre-magie',
  Necromancien3: 'necromancien-demon',
  Necromancien4: 'necromancien-outre-tombe',
  Necromancien5: 'necromancien-sang',
  Ogre: 'race-ogre',
  Orque: 'race-orque',
  Pretre1: 'pretre-foi',
  Pretre2: 'pretre-guerre-sainte',
  Pretre3: 'pretre-priere',
  Pretre4: 'pretre-spiritualite',
  Pretre5: 'pretre-soins',
  Psionique1: 'psionique-telekinesie',
  Psionique2: 'psionique-telepathie',
  Psionique3: 'psionique-attaque-mentale',
  Psionique4: 'psionique-empathie',
  Psionique5: 'psionique-envouteur',
  Rodeur1: 'rodeur-archer',
  Rodeur2: 'rodeur-survie',
  Rodeur3: 'rodeur-escarmouche',
  Rodeur4: 'rodeur-compagnon-animal',
  Rodeur5: 'rodeur-traqueur',
  Samourai1: 'samourai-honneur',
  Samourai2: 'samourai-dirigeant',
  Samourai3: 'samourai-ki',
  Samourai4: 'samourai-arc-et-du-cheval',
  Samourai5: 'samourai-sabre',
  Voleur1: 'voleur-assassin',
  Voleur2: 'voleur-aventurier',
  Voleur3: 'voleur-deplacement',
  Voleur4: 'voleur-roublard',
  Voleur5: 'voleur-spadassin',
  Wolfer: 'race-wolfer',
  prestige_arquebusier1: 'prestige-arquebusier-flibustier',
  prestige_arquebusier2: 'prestige-arquebusier-messager',
  prestige_arquebusier3: 'prestige-arquebusier-chasseur-de-gros-gibier',
  prestige_barbare1: 'prestige-barbare-glaces',
  prestige_barbare2: 'prestige-barbare-beornide',
  prestige_barde1: 'prestige-barde-bouffon',
  prestige_barde2: 'prestige-barde-conteur',
  prestige_barde3: 'prestige-barde-voix',
  prestige_chevalier1: 'prestige-chevalier-chevalier-dragon',
  prestige_chevalier2: 'prestige-chevalier-grand-veneur',
  prestige_chevalier3: 'prestige-chevalier-tournoi',
  prestige_druide1: 'prestige-druide-elements',
  prestige_druide2: 'prestige-druide-vermines',
  prestige_ensorceleur1: 'prestige-ensorceleur-sang-dragon',
  prestige_ensorceleur2: 'prestige-ensorceleur-gel',
  prestige_forgesort1: 'prestige-forgesort-cristaux',
  prestige_forgesort2: 'prestige-forgesort-enchanteur',
  prestige_forgesort3: 'prestige-forgesort-mecanicien',
  prestige_guerrier1: 'prestige-guerrier-armes-a-2-mains',
  prestige_guerrier2: 'prestige-guerrier-danseur-de-guerre',
  prestige_moine1: 'prestige-moine-armure-sainte',
  prestige_moine2: 'prestige-moine-contact-mortel',
  prestige_moine3: 'prestige-moine-pierre',
  prestige_necromancien1: 'prestige-necromancien-golem-de-chair',
  prestige_necromancien2: 'prestige-necromancien-magie-primitive',
  prestige_pretre1: 'prestige-pretre-archange',
  prestige_pretre2: 'prestige-pretre-commerce',
  prestige_pretre3: 'prestige-pretre-guerisseur',
  prestige_rodeur1: 'prestige-rodeur-archer-arcanique',
  prestige_rodeur2: 'prestige-rodeur-chasseur-de-corruption',
  prestige_rodeur3: 'prestige-rodeur-fusion-lycanthropique',
  prestige_voleur1: 'prestige-voleur-casse-cou',
  prestige_voleur2: 'prestige-voleur-espion',
  prestige_voleur3: 'prestige-voleur-maitre-des-poisons',
  // Doublon de Moine5.json laissé par une synchronisation (« Name Clash ») : même contenu
  'Moine5 (# Name Clash 2024-10-11 4ndOUub #)': 'moine-energie-vitale',
};

/**
 * Objets proposés par l'ancien inventaire D&D (`predefinedItems` de
 * components/(inventaire)/inventaire.tsx), en `slug` → arme ou armure. Les
 * autres noms sont cherchés tels quels dans le catalogue (`Katana`,
 * `Épée longue`). Choix discutables, faute d'équivalent exact :
 *  - « Épée à une main » : épée longue (1d8, à une main) ;
 *  - « Couteaux de lancer » : dague (1d4, se lance) ;
 *  - « Armure légère » : cuir (DEF +2), la plus légère des armures courantes ;
 *  - « Armure lourde » : plaque complète (DEF +8, lourde).
 * Sans équivalent (avertissement) : rapière, marteau, potions, nourriture.
 */
export const EQUIPEMENT: Readonly<Record<string, string>> = {
  'epee-a-une-main': 'epee-longue',
  'epee-a-deux-mains': 'epee-a-2-mains',
  hache: 'hache-a-1-main',
  'arc-leger': 'arc-court',
  'arc-lourd': 'arc-long',
  arbalete: 'arbalete-legere',
  'couteaux-de-lancer': 'dague',
  'armure-legere': 'cuir',
  'armure-de-cuir': 'cuir',
  'armure-lourde': 'plaque-complete',
  'cote-de-maille': 'cotte-de-mailles',
  'cotte-de-maille': 'cotte-de-mailles',
};

/**
 * Pièces de l'ancienne bourse (catégorie `bourse`), en `slug` → valeur en
 * pièces d'argent (attribut `bourse`) : 1 po = 10 pa, 1 pa = 10 pc.
 */
export const PIECES: Readonly<Record<string, number>> = {
  'piece-d-or': 10,
  'pieces-d-or': 10,
  'piece-d-argent': 1,
  'pieces-d-argent': 1,
  'piece-de-cuivre': 0.1,
  'pieces-de-cuivre': 0.1,
};
