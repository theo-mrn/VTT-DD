/**
 * Code court d'une salle (« Code de la salle » de l'ancienne app) : 6
 * caractères base32 sans 0, O, 1 ni I, faciles à lire et à dicter. Environ
 * un milliard de codes : la limite de débit de /v1/rooms/rejoindre empêche de
 * les parcourir. Les codes à 6 chiffres des salles importées restent valides.
 */
import { randomBytes } from 'node:crypto';

export const ALPHABET_CODE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const LONGUEUR_CODE = 6;

/** Forme acceptée (codes générés et codes numériques importés), comme en base. */
export const FORME_CODE_SALLE = /^[0-9A-Z]{6}$/;

export function nouveauCodeSalle(): string {
  // 32 symboles : 5 bits par octet aléatoire, sans biais
  return [...randomBytes(LONGUEUR_CODE)].map((o) => ALPHABET_CODE[o & 31]).join('');
}

/** Saisie tolérante : majuscules, sans espaces ni tirets (« abc-def » → « ABCDEF »). */
export function normaliserCodeSalle(saisie: string): string {
  return saisie.replace(/[\s-]/g, '').toUpperCase();
}
