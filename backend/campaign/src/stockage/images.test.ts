/**
 * Images de salle : URL acceptées au PATCH et URL d'envoi présignée (calcul
 * local, sans appel au stockage).
 */
import { describe, expect, it } from 'vitest';
import type { CampaignConfig } from '../config.js';
import { basePublique, cleImage, creerSignataireS3, urlImageAcceptee } from './images.js';

const SALLE = '01900000-0000-7000-8000-000000000001';
const BASE = 'https://cdn.test.local/vtt';

describe('images de salle', () => {
  it('clé : rooms/<salle>/<uuid>.<extension>, jamais réutilisée', () => {
    const cle = cleImage(SALLE, 'image/jpeg');
    expect(cle).toMatch(new RegExp(`^rooms/${SALLE}/[0-9a-f-]{36}\\.jpg$`));
    expect(cleImage(SALLE, 'image/jpeg')).not.toBe(cle);
  });

  it('URL acceptée : null, l’actuelle, ou un fichier du dossier de la salle', () => {
    const actuelle = 'https://firebasestorage.example/ancienne.png';
    expect(urlImageAcceptee(null, actuelle, BASE, SALLE)).toBe(true);
    expect(urlImageAcceptee(actuelle, actuelle, BASE, SALLE)).toBe(true);
    expect(urlImageAcceptee(`${BASE}/rooms/${SALLE}/abc-123.png`, null, BASE, SALLE)).toBe(true);
    for (const url of [
      'https://ailleurs.example/image.png',
      `${BASE}/avatars/${SALLE}/abc.png`,
      `${BASE}/rooms/01900000-0000-7000-8000-000000000002/abc.png`,
      `${BASE}/rooms/${SALLE}/../autre/abc.png`,
      `${BASE}/rooms/${SALLE}/abc.png?x=1`,
    ]) {
      expect(urlImageAcceptee(url, null, BASE, SALLE), url).toBe(false);
    }
    expect(urlImageAcceptee(`${BASE}/rooms/${SALLE}/abc.png`, null, null, SALLE)).toBe(false);
    expect(basePublique('http://localhost:8333/vtt-dev//')).toBe('http://localhost:8333/vtt-dev');
  });

  it('signature S3 : type et taille signés, absente sans configuration', async () => {
    const config = {
      S3_ENDPOINT: 'http://localhost:8333',
      S3_REGION: 'auto',
      S3_BUCKET: 'vtt-dev',
      S3_ACCESS_KEY_ID: 'dev',
      S3_SECRET_ACCESS_KEY: 'dev-secret',
    } as CampaignConfig;
    const signer = creerSignataireS3(config)!;
    const url = new URL(
      await signer({
        cle: `rooms/${SALLE}/x.png`,
        contentType: 'image/png',
        taille: 10,
        expiresIn: 300,
      }),
    );
    expect(url.pathname).toBe(`/vtt-dev/rooms/${SALLE}/x.png`);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(creerSignataireS3({ ...config, S3_BUCKET: undefined })).toBeUndefined();
  });
});
