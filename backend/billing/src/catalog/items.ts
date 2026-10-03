/**
 * Prix de la boutique, en centimes d’euro : seule source des montants envoyés
 * à Stripe (le client n’envoie que l’identifiant de l’article). Données reprises
 * telles quelles de l’ancienne app : dés de
 * legacy/src/components/(dices)/dice-definitions.ts (identiques à
 * frontend/src/components/(dices)/dice-definitions.ts), cadres de
 * legacy/src/components/(fiches)/token-definitions.ts. Les identifiants des dés
 * sont ceux du catalogue du service dice (backend/dice/src/skins/catalog.ts).
 *
 * steampunk_copper vaut 0 ici : l’ancienne boutique le donnait à tous
 * (DEFAULT_DICE_INVENTORY) et le service dice le compte parmi les skins gratuits.
 */
import type { CatalogEntry } from './catalog.js';

/** Skins de dés (DICE_SKINS). */
export const DICE_ITEMS: readonly CatalogEntry[] = [
  {
    id: 'kyber_bleu',
    name: 'Cristal Kyber — Bleu',
    price: 2000,
    description: "Le cœur d'un sabre Jedi. La lame bourdonne encore, prisonnière du cristal.",
  },
  {
    id: 'kyber_vert',
    name: 'Cristal Kyber — Vert',
    price: 2000,
    description: 'Taillé sur une lune oubliée. La sérénité du gardien, forgée en lame.',
  },
  {
    id: 'kyber_violet',
    name: 'Cristal Kyber — Améthyste',
    price: 2500,
    description:
      "Une couleur qu'un seul maître osa porter. Ni tout à fait lumière, ni tout à fait ombre.",
  },
  {
    id: 'kyber_rouge',
    name: 'Cristal Kyber — Saigné',
    price: 2500,
    description: "Un cristal brisé par la haine jusqu'à saigner. Sa lumière est une plaie.",
  },
  {
    id: 'kyber_or',
    name: 'Cristal Kyber — Or',
    price: 2500,
    description: "Le cristal des maîtres. Sa lame d'or ne tremble jamais — la marque du triomphe.",
  },
  {
    id: 'etoile_mort',
    name: 'Étoile de la Mort',
    price: 2500,
    description:
      'Cette station de combat est votre arme ultime. Le superlaser se charge à chaque lancer.',
  },
  {
    id: 'cote_obscur',
    name: 'Côté Obscur',
    price: 2500,
    description: 'La Force en colère. Les éclairs rampent sous la surface, cherchant une proie.',
  },
  {
    id: 'cote_lumineux',
    name: 'Côté Lumineux',
    price: 2500,
    description:
      'La Force en paix. Une énergie sereine circule sous la surface, veillant sur son porteur.',
  },
  {
    id: 'esprit_force',
    name: 'Esprit de la Force',
    price: 2500,
    description: 'La Force elle-même : lumière et ténèbres enlacées, éternellement en équilibre.',
  },
  {
    id: 'hyperespace',
    name: 'Saut Hyperespace',
    price: 2000,
    description:
      "Accroche-toi. Les étoiles s'étirent et l'univers file — c'est parti pour la vitesse-lumière.",
  },
  {
    id: 'aqua_orb',
    name: 'Orbe Aquatique',
    price: 500,
    description: 'Une coque de verre vivante avec un cœur de lumière flottant.',
  },
  {
    id: 'eye_orb',
    name: 'Œil du Gardien',
    price: 750,
    description: 'Un œil ancien scellé dans le verre. Il vous observe.',
  },
  {
    id: 'shield_orb',
    name: 'Gardien',
    price: 1500,
    description: "Aucune lame n'a jamais franchi cette protection.",
  },
  {
    id: 'book_orb',
    name: 'Grimoire Ancien',
    price: 1500,
    description: 'Un savoir interdit, scellé pour le bien de tous.',
  },
  {
    id: 'potion_orb',
    name: 'Élixir Mystique',
    price: 1500,
    description: "Un breuvage chatoyant dont nul ne connaît l'effet.",
  },
  {
    id: 'mug_orb',
    name: 'Chope du Tavernier',
    price: 1500,
    description: 'Toujours pleine, jamais vide. Le rêve de tout aventurier.',
  },
  {
    id: 'mimique_orb',
    name: 'Mimique Captive',
    price: 1500,
    description: 'Un coffre qui mord, prisonnier de sa propre cupidité.',
  },
  {
    id: 'ring_orb',
    name: 'Anneau Scellé',
    price: 1500,
    description: "Un anneau de pouvoir scellé dans le verre. Un seul l'enchaîne.",
  },
  {
    id: 'beholder_orb',
    name: 'Œil Tyrannique',
    price: 1500,
    description: 'Un beholder miniature scellé dans une sphère de verre.',
  },
  {
    id: 'butterfly_orb',
    name: 'Papillon Éphémère',
    price: 1500,
    description: 'Une âme légère, figée en plein envol dans le verre.',
  },
  {
    id: 'singularite',
    name: 'Singularité',
    price: 2500,
    description: "Un fragment d'univers, volé au ciel d'une nuit qui n'existe plus.",
  },
  {
    id: 'prism',
    name: 'Opale Prismatique',
    price: 2000,
    description: "Chaque angle révèle une couleur que personne d'autre ne verra.",
  },
  {
    id: 'magma',
    name: 'Cœur de Magma',
    price: 2000,
    description: 'Le sang de la terre coule encore sous sa croûte brisée.',
  },
  {
    id: 'storm',
    name: "Cœur de l'Orage",
    price: 2000,
    description: "L'orage vit à l'intérieur. Chaque lancer réveille la foudre.",
  },
  {
    id: 'eclipse',
    name: 'Éclipse',
    price: 2000,
    description: "Un soleil mort, couronné d'un feu qui refuse de s'éteindre.",
  },
  {
    id: 'spectre',
    name: 'Âme Errante',
    price: 1500,
    description: 'Une âme prisonnière, à jamais à la dérive entre deux mondes.',
  },
  {
    id: 'ocean_heart',
    name: "Cœur de l'Océan",
    price: 2000,
    description: "Un océan entier, scellé dans le verre. Les vagues n'ont jamais cessé de rouler.",
  },
  {
    id: 'ecailles_ancestrales',
    name: 'Écailles Ancestrales',
    price: 500,
    description:
      'Une mue de dragon ancien, chaque écaille encore chaude du souvenir de son porteur.',
  },
  {
    id: 'bismuth',
    name: 'Ziggourat de Bismuth',
    price: 500,
    description:
      'Un cristal minéral en escalier, où chaque marche vole une couleur différente à la lumière.',
  },
  {
    id: 'poison',
    name: 'Fiel Corrosif',
    price: 1500,
    description: "Un poison si virulent qu'il ronge la réalité elle-même.",
  },
  {
    id: 'onyx_dore',
    name: 'Onyx Doré',
    price: 750,
    description: "Ténèbres polies, veinées d'or pur. La richesse dans l'ombre.",
  },
  {
    id: 'sang_ancien',
    name: 'Sang Ancien',
    price: 750,
    description: "Le sang d'un dieu déchu coule encore dans ses veines.",
  },
  {
    id: 'marbre_saphir',
    name: 'Marbre Saphir',
    price: 500,
    description: "Bleu nuit profond, strié de veines d'argent lunaire.",
  },
  {
    id: 'gold',
    name: 'Or Royal',
    price: 0,
    description: "L'élégance intemporelle pour les aventuriers fortunés.",
  },
  {
    id: 'silver',
    name: 'Argent',
    price: 0,
    description: 'Brillant et pur, efficace contre les lycanthropes.',
  },
  {
    id: 'ruby',
    name: 'Rubis',
    price: 250,
    description: "Une gemme ardente pulsant d'énergie magique.",
    image: 'https://assets.yner.fr/textures/rubis_diffuse.jpg',
  },
  {
    id: 'obsidian',
    name: 'Obsidienne',
    price: 500,
    description: "Forgé dans les ténèbres, pour ceux qui embrassent l'ombre.",
  },
  {
    id: 'jade',
    name: 'Jade',
    price: 125,
    description: 'Symbole de sérénité et de chance.',
    image: 'https://assets.yner.fr/textures/jade.jpg',
  },
  {
    id: 'crystal',
    name: 'Cristal',
    price: 250,
    description: 'Transparent comme vos intentions... ou pas.',
  },
  {
    id: 'sapphire',
    name: 'Saphir',
    price: 250,
    description: "Aussi profond que l'océan, aussi dur que l'acier.",
    image: 'https://assets.yner.fr/textures/saphire_diffuse.jpg',
  },
  {
    id: 'amethyst',
    name: 'Améthyste',
    price: 250,
    description: 'Mystique et royale, favorisée par les mages.',
    image: 'https://assets.yner.fr/textures/amethyst_diffuse.jpg',
  },
  {
    id: 'inferno',
    name: 'Inferno',
    price: 500,
    description: "Brûle d'une flamme éternelle qui ne consume que vos ennemis.",
  },
  {
    id: 'frost',
    name: 'Givre',
    price: 250,
    description: 'Froid comme la mort, tranchant comme un blizzard.',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon',
    price: 1250,
    description: "Une technologie perdue d'une autre dimension.",
  },
  {
    id: 'bleu_marble',
    name: 'Marbre Bleu',
    price: 125,
    description: 'Élégance classique avec une touche royale.',
    image: 'https://assets.yner.fr/textures/marblebleu_diffuse.jpg',
  },
  {
    id: 'cosmos',
    name: 'Cosmos',
    price: 1250,
    description: 'Contient des galaxies entières dans chaque face.',
    image: 'https://assets.yner.fr/textures/cosmos_diffuse.jpeg',
  },
  {
    id: 'space',
    name: 'Espace',
    price: 500,
    description: 'Le vide infini entre les étoiles.',
    image: 'https://assets.yner.fr/textures/space_diifuse.avif',
  },
  {
    id: 'ocean',
    name: 'Océan',
    price: 250,
    description: "Pour ceux qui entendent l'appel du large.",
    image: 'https://assets.yner.fr/textures/ocean_diffuse.webp',
  },
  {
    id: 'metal_lourd',
    name: 'Métal Lourd',
    price: 125,
    description: 'Un alliage robuste, forgé pour durer.',
  },
  {
    id: 'merveille',
    name: 'Merveille',
    price: 1250,
    description: "Une merveille d'artisanat magique.",
    image: 'https://assets.yner.fr/textures/merveille_diffuse.png',
  },
  {
    id: 'ancient_bone',
    name: 'Os Ancien',
    price: 125,
    description: "Sculpté dans les os d'une créature oubliée.",
  },
  {
    id: 'void_walker',
    name: 'Marcheur du Vide',
    price: 500,
    description: "Il n'y a rien ici... absolument rien.",
  },
  {
    id: 'celestial_starlight',
    name: 'Lumière Stellaire',
    price: 1250,
    description: 'Guide les voyageurs perdus dans la nuit.',
  },
  {
    id: 'blood_pact',
    name: 'Pacte de Sang',
    price: 500,
    description: 'Un serment qui ne peut être brisé.',
  },
  {
    id: 'steampunk_copper',
    name: 'Steampunk Cuivre',
    price: 0,
    description: "Rouages et vapeur, pour l'ingénieur moderne.",
  },
  { id: 'royal_marble', name: 'Marbre Royal', price: 250, description: "Digne d'un trône." },
  {
    id: 'galactic_nebula',
    name: 'Nébuleuse',
    price: 1250,
    description: 'Là où naissent les étoiles.',
  },
  {
    id: 'dragon_scale',
    name: 'Écaille de Dragon',
    price: 1250,
    description: 'Dur, brillant et extrêmement précieux.',
  },
  {
    id: 'moonstone',
    name: 'Pierre de Lune',
    price: 1250,
    description: 'Baignée dans la lumière de séluné.',
  },
  {
    id: 'bois_noble',
    name: 'Bois Noble',
    price: 50,
    description: 'Simple, robuste et fiable. Comme un bon nain.',
    image: 'https://assets.yner.fr/textures/wood_diffuse.png',
  },
  {
    id: 'marbre_blanc',
    name: 'Marbre Blanc',
    price: 125,
    description: "Poli à la perfection, veiné d'or, pour les temples sacrés.",
  },
  {
    id: 'cuir_ancien',
    name: 'Cuir Ancien',
    price: 50,
    description: "Sent le vieux livre et l'aventure.",
    image: 'https://assets.yner.fr/textures/leather_diffuse.png',
  },
  {
    id: 'pierre_donjon',
    name: 'Pierre de Donjon',
    price: 0,
    description: "Aussi froid que le sol d'un cachot.",
    image: 'https://assets.yner.fr/textures/stone_diffuse.png',
  },
  {
    id: 'fer_rouille',
    name: 'Fer Rouillé',
    price: 25,
    description: 'Oublié depuis longtemps, mais toujours solide.',
    image: 'https://assets.yner.fr/textures/rust_diffuse.png',
  },
  {
    id: 'roche_volcanique',
    name: 'Roche Volcanique',
    price: 250,
    description: "Attention, c'est chaud !",
    image: 'https://assets.yner.fr/textures/lava_diffuse.png',
  },
  {
    id: 'glace_eternelle',
    name: 'Glace Éternelle',
    price: 250,
    description: 'Ne fond jamais, même dans un volcan.',
    image: 'https://assets.yner.fr/textures/ice_diffuse.png',
  },
  {
    id: 'ecorce_ancienne',
    name: 'Écorce Ancienne',
    price: 125,
    description: 'La nature reprend toujours ses droits.',
    image: 'https://assets.yner.fr/textures/bark_diffuse.png',
  },
  {
    id: 'parchemin_ancien',
    name: 'Parchemin Ancien',
    price: 50,
    description: 'Les mots ont un pouvoir.',
    image: 'https://assets.yner.fr/textures/parchment_diffuse.png',
  },
  {
    id: 'meteore_sang',
    name: 'Météore',
    price: 1500,
    description: 'Tombé du ciel pendant une éclips de sang.',
    image: 'https://assets.yner.fr/textures/lava_diffuse.png',
  },
  {
    id: 'marbre_emeraude',
    name: 'Marbre Émeraude',
    price: 500,
    description: 'Un mélange élégant de vagues émeraudes et de veines dorées.',
  },
  {
    id: 'marbre_ambre',
    name: 'Marbre Ambré',
    price: 500,
    description: 'Un mélange élégant de vagues ambrées et de veines dorées.',
  },
];

/** Cadres de jetons (TOKEN_DEFINITIONS), achetés sous l’identifiant `token_<id>`. */
export const TOKEN_ITEMS: readonly CatalogEntry[] = [
  {
    id: 'Token1',
    name: 'Cadre Classique',
    price: 0,
    description: 'Un cadre simple et élégant, parfait pour commencer.',
  },
  {
    id: 'Token2',
    name: 'Cadre Argenté',
    price: 0,
    description: "Reflets d'argent sur métal sombre.",
  },
  {
    id: 'Token3',
    name: 'Cadre Doré',
    price: 399,
    description: "Ornez votre portrait des richesses d'antan.",
  },
  {
    id: 'Token4',
    name: 'Cadre Sanguin',
    price: 399,
    description: 'Forgé dans le sang de vos ennemis.',
  },
  {
    id: 'Token5',
    name: 'Cadre Sylvestre',
    price: 399,
    description: 'Protégé par les esprits de la forêt.',
  },
  {
    id: 'Token6',
    name: 'Cadre Abyssal',
    price: 399,
    description: 'Sondant les profondeurs inconnues.',
  },
  {
    id: 'Token7',
    name: 'Cadre Céleste',
    price: 399,
    description: 'Brille de la lumière des étoiles.',
  },
];
