/**
 * Codes d'invitation : 20 octets aléatoires (160 bits) en base64url, préfixés
 * « inv_ ». Seul leur SHA-256 est stocké ; un code aussi long ne se devine pas,
 * un hachage lent est donc inutile, et la recherche se fait par l'empreinte.
 */
import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_CODE_FORMAT = /^inv_[A-Za-z0-9_-]{27}$/;

export function newInvitationCode(): string {
  return `inv_${randomBytes(20).toString('base64url')}`;
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}
