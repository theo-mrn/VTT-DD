/**
 * Catalogue des skins de dés (identifiants repris de l'ancienne app,
 * legacy/src/components/(dices)/dice-definitions.ts). Le rendu (couleurs,
 * matériaux, particules) appartient au front ; le service ne connaît que
 * l'identifiant et la gratuité.
 *
 * Tous les skins sont ouverts à tous : Yner ne vend rien (décision du
 * 2026-10-05, soutien par dons). SKINS_FOR_SALE=on rétablit la règle de
 * l'ancienne app : gratuits ceux à prix 0 (gold, silver, pierre_donjon) et
 * steampunk_copper (DEFAULT_DICE_INVENTORY), les autres par la boutique
 * (service billing, docs/paiement.md) ou les défis.
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

/** Vente des skins activée (boutique billing) ; sinon tous gratuits. */
export const SKINS_FOR_SALE = process.env.SKINS_FOR_SALE === 'on';

export const SKINS: readonly Skin[] = IDS.map((id) => ({
  id,
  free: !SKINS_FOR_SALE || FREE.has(id),
}));

/** Skin par défaut d'un utilisateur sans préférence (DEFAULT_SKIN de l'ancienne app). */
export const DEFAULT_SKIN = 'gold';

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));

export const skin = (id: string): Skin | undefined => BY_ID.get(id);

/** Skins gratuits, toujours disponibles sans être dans l'inventaire. */
export const FREE_SKINS: readonly string[] = SKINS.filter((s) => s.free).map((s) => s.id);
