import { loadConfig } from '@vtt/platform';
import { describe, expect, it } from 'vitest';
import { IdentityConfig } from '../../config.js';
import { cleFichier, creerSignataireS3 } from './stockage.js';

const USER = '0190a000-0000-7000-8000-000000000001';

const config = (s3: Record<string, string>) =>
  loadConfig(IdentityConfig, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://inutile',
    JWT_ISSUER: 'https://auth.test.local',
    JWT_AUDIENCE: 'vtt-api',
    JWT_PRIVATE_JWKS: JSON.stringify([{ kty: 'OKP' }]),
    ...s3,
  });

const S3 = {
  S3_ENDPOINT: 'http://s3.test.local:8333',
  S3_BUCKET: 'vtt',
  S3_ACCESS_KEY_ID: 'cle-test',
  S3_SECRET_ACCESS_KEY: 'secret-test',
};

describe('stockage des images', () => {
  it('construit une clé unique dans le dossier de l’utilisateur', () => {
    const a = cleFichier(USER, 'avatar', 'image/jpeg');
    expect(a).toMatch(new RegExp(`^avatars/${USER}/[0-9a-f-]{36}\\.jpg$`));
    expect(cleFichier(USER, 'banner', 'image/webp')).toMatch(/^banners\/.+\.webp$/);
    expect(cleFichier(USER, 'avatar', 'image/jpeg')).not.toBe(a);
  });

  it('n’a pas de signataire sans configuration complète', () => {
    expect(creerSignataireS3(config({}))).toBeUndefined();
    expect(creerSignataireS3(config({ ...S3, S3_BUCKET: '' }))).toBeUndefined();
  });

  it('signe une URL PUT avec le type, la taille et 300 s de validité (sans réseau)', async () => {
    const signer = creerSignataireS3(config(S3))!;
    const url = new URL(
      await signer({
        cle: `avatars/${USER}/fichier.png`,
        contentType: 'image/png',
        taille: 1234,
        expiresIn: 300,
      }),
    );
    expect(url.origin + url.pathname).toBe(
      `http://s3.test.local:8333/vtt/avatars/${USER}/fichier.png`,
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    // Pas de somme de contrôle du corps vide : elle ferait échouer l’envoi réel
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
  });
});
