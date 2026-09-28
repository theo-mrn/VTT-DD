/**
 * Jeton d'envoi : HMAC-SHA256 (AUDIO_UPLOAD_SECRET) de ce que le service a
 * autorisé à `POST …/assets/uploads`. Rien n'est écrit en base à ce moment :
 * le jeton porte la clé, la taille et le type signés, et expire avec l'URL.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const UploadClaims = z.object({
  assetId: z.uuid(),
  campaignId: z.uuid(),
  key: z.string(),
  size: z.number().int().positive(),
  contentType: z.string(),
  kind: z.enum(['music', 'ambience', 'sfx']),
  /** Expiration (secondes Unix). */
  exp: z.number().int(),
});
export type UploadClaims = z.infer<typeof UploadClaims>;

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function createUploadToken(secret: string, claims: UploadClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

/** Revendications du jeton, ou null s'il est falsifié, illisible ou expiré. */
export function verifyUploadToken(
  secret: string,
  token: string,
  nowMs = Date.now(),
): UploadClaims | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const claims = UploadClaims.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    return claims.exp * 1000 > nowMs ? claims : null;
  } catch {
    return null;
  }
}
