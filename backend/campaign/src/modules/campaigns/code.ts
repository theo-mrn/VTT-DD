/**
 * Code court d'une campagne (« Code de la salle » de l'ancienne app) : 6
 * caractères base32 sans 0, O, 1 ni I, faciles à lire et à dicter. Environ
 * un milliard de codes : la limite de débit de /v1/campaigns/join empêche de
 * les parcourir. Les codes à 6 chiffres des campagnes importées restent valides.
 */
import { randomBytes } from 'node:crypto';

export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/** Forme acceptée (codes générés et codes numériques importés), comme en base. */
export const CAMPAIGN_CODE_FORMAT = /^[0-9A-Z]{6}$/;

export function newCampaignCode(): string {
  // 32 symboles : 5 bits par octet aléatoire, sans biais
  return [...randomBytes(CODE_LENGTH)].map((b) => CODE_ALPHABET[b & 31]).join('');
}

/** Saisie tolérante : majuscules, sans espaces ni tirets (« abc-def » → « ABCDEF »). */
export function normalizeCampaignCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
