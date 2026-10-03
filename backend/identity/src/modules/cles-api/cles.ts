/**
 * Fabrication et vérification des clés d'API (fonctions pures).
 *
 * Une clé vaut « vtt_ » suivi de 32 octets aléatoires en base64url. Elle n'est
 * montrée qu'une fois, à la création : seul son SHA-256 est stocké. Le préfixe
 * (« vtt_ » + 8 caractères) permet de la reconnaître dans la liste.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PREFIXE_CLE = 'vtt_';

/** Nombre maximal de clés actives (non révoquées) par compte. */
export const CLES_ACTIVES_MAX = 10;

/**
 * Forme acceptée pour une clé présentée : les nouvelles (base64url) et celles
 * importées de l'ancienne app (« vtt_ » + 64 caractères hexadécimaux).
 */
export const FORME_CLE = /^vtt_[A-Za-z0-9_-]{16,200}$/;

export interface CleGeneree {
  cle: string;
  prefixe: string;
  empreinte: Buffer;
}

export function genererCle(): CleGeneree {
  const cle = PREFIXE_CLE + randomBytes(32).toString('base64url');
  return { cle, prefixe: prefixeDe(cle), empreinte: empreinteCle(cle) };
}

export function prefixeDe(cle: string): string {
  return cle.slice(0, PREFIXE_CLE.length + 8);
}

/** SHA-256 de la clé brute (32 octets), seule forme stockée. */
export function empreinteCle(cle: string): Buffer {
  return createHash('sha256').update(cle, 'utf8').digest();
}

/**
 * Compare un secret reçu au secret attendu en temps constant : les deux sont
 * d'abord hachés pour avoir la même longueur, quelle que soit l'entrée.
 */
export function secretsEgaux(recu: string | undefined, attendu: string): boolean {
  if (typeof recu !== 'string') return false;
  const a = createHash('sha256').update(recu, 'utf8').digest();
  const b = createHash('sha256').update(attendu, 'utf8').digest();
  return timingSafeEqual(a, b);
}
