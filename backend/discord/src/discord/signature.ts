/**
 * Signature des interactions Discord : Ed25519 sur `horodatage + corps brut`, avec la clé
 * publique de l'application (en-têtes x-signature-ed25519 et x-signature-timestamp). Discord
 * exige un 401 pour toute requête mal signée, et teste l'adresse avec de fausses signatures.
 */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/** En-tête DER d'une clé publique Ed25519 brute (SubjectPublicKeyInfo, RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Clé publique de l'application, depuis sa forme hexadécimale du portail. */
export function publicKeyFromHex(hex: string): KeyObject {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(hex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

export function isValidSignature(
  key: KeyObject,
  signature: string | undefined,
  timestamp: string | undefined,
  rawBody: Buffer,
): boolean {
  if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  try {
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]),
      key,
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}
