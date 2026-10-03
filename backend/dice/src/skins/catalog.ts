/**
 * Catalogue des skins de dés (identifiants repris de l'ancienne app,
 * legacy/src/components/(dices)/dice-definitions.ts). Le rendu (couleurs,
 * matériaux, particules) appartient au front ; le service ne connaît que
 * l'identifiant et la gratuité.
 *
 * Gratuits : prix 0 dans l'ancienne app (gold, silver, pierre_donjon) et
 * steampunk_copper, que l'ancienne boutique donnait à tous
 * (DEFAULT_DICE_INVENTORY). Les autres s'obtiennent par la boutique ou les défis.
 */
export interface Skin {
  id: string;
  free: boolean;
}

const FREE = new Set([
  'gold',
  'silver',
  'pierre_donjon',
  'steampunk_copper',
  // Série « Résine » : matériau à l'essai, offerte à tous le temps du test
  'resine_marbre',
  'resine_nuit',
  'resine_fumee',
  'resine_jade',
]);

const IDS = [
  'resine_marbre',
  'resine_nuit',
  'resine_fumee',
  'resine_jade',
  'kyber_bleu',
  'kyber_vert',
  'kyber_violet',
  'kyber_rouge',
  'kyber_or',
  'etoile_mort',
  'cote_obscur',
  'cote_lumineux',
  'esprit_force',
  'hyperespace',
  'aqua_orb',
  'eye_orb',
  'shield_orb',
  'book_orb',
  'potion_orb',
  'mug_orb',
  'mimique_orb',
  'ring_orb',
  'beholder_orb',
  'butterfly_orb',
  'singularite',
  'prism',
  'magma',
  'storm',
  'eclipse',
  'spectre',
  'ocean_heart',
  'ecailles_ancestrales',
  'bismuth',
  'poison',
  'onyx_dore',
  'sang_ancien',
  'marbre_saphir',
  'gold',
  'silver',
  'ruby',
  'obsidian',
  'jade',
  'crystal',
  'sapphire',
  'amethyst',
  'inferno',
  'frost',
  'cyber_neon',
  'bleu_marble',
  'cosmos',
  'space',
  'ocean',
  'metal_lourd',
  'merveille',
  'ancient_bone',
  'void_walker',
  'celestial_starlight',
  'blood_pact',
  'steampunk_copper',
  'royal_marble',
  'galactic_nebula',
  'dragon_scale',
  'moonstone',
  'bois_noble',
  'marbre_blanc',
  'cuir_ancien',
  'pierre_donjon',
  'fer_rouille',
  'roche_volcanique',
  'glace_eternelle',
  'ecorce_ancienne',
  'parchemin_ancien',
  'meteore_sang',
  'marbre_emeraude',
  'marbre_ambre',
] as const;

export const SKINS: readonly Skin[] = IDS.map((id) => ({ id, free: FREE.has(id) }));

/** Skin par défaut d'un utilisateur sans préférence (DEFAULT_SKIN de l'ancienne app). */
export const DEFAULT_SKIN = 'gold';

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));

export const skin = (id: string): Skin | undefined => BY_ID.get(id);

/** Skins gratuits, toujours disponibles sans être dans l'inventaire. */
export const FREE_SKINS: readonly string[] = SKINS.filter((s) => s.free).map((s) => s.id);
