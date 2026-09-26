/**
 * Images de campagne : URL acceptées au PATCH et URL d'envoi présignée (calcul
 * local, sans appel au stockage).
 */
import { describe, expect, it } from 'vitest';
import type { CampaignConfig } from '../config.js';
import { createS3Signer, imageKey, isAcceptedImageUrl, publicBase } from './images.js';

const CAMPAIGN = '01900000-0000-7000-8000-000000000001';
const BASE = 'https://cdn.test.local/vtt';

describe('images de campagne', () => {
  it('clé : campaigns/<campagne>/<uuid>.<extension>, jamais réutilisée', () => {
    const key = imageKey(CAMPAIGN, 'image/jpeg');
    expect(key).toMatch(new RegExp(`^campaigns/${CAMPAIGN}/[0-9a-f-]{36}\\.jpg$`));
    expect(imageKey(CAMPAIGN, 'image/jpeg')).not.toBe(key);
  });

  it('URL acceptée : null, l’actuelle, ou un fichier du dossier de la campagne', () => {
    const current = 'https://firebasestorage.example/ancienne.png';
    expect(isAcceptedImageUrl(null, current, BASE, CAMPAIGN)).toBe(true);
    expect(isAcceptedImageUrl(current, current, BASE, CAMPAIGN)).toBe(true);
    expect(
      isAcceptedImageUrl(`${BASE}/campaigns/${CAMPAIGN}/abc-123.png`, null, BASE, CAMPAIGN),
    ).toBe(true);
    for (const url of [
      'https://ailleurs.example/image.png',
      `${BASE}/avatars/${CAMPAIGN}/abc.png`,
      `${BASE}/campaigns/01900000-0000-7000-8000-000000000002/abc.png`,
      `${BASE}/campaigns/${CAMPAIGN}/../autre/abc.png`,
      `${BASE}/campaigns/${CAMPAIGN}/abc.png?x=1`,
    ]) {
      expect(isAcceptedImageUrl(url, null, BASE, CAMPAIGN), url).toBe(false);
    }
    expect(isAcceptedImageUrl(`${BASE}/campaigns/${CAMPAIGN}/abc.png`, null, null, CAMPAIGN)).toBe(
      false,
    );
    expect(publicBase('http://localhost:8333/vtt-dev//')).toBe('http://localhost:8333/vtt-dev');
  });

  it('signature S3 : type et taille signés, absente sans configuration', async () => {
    const config = {
      S3_ENDPOINT: 'http://localhost:8333',
      S3_REGION: 'auto',
      S3_BUCKET: 'vtt-dev',
      S3_ACCESS_KEY_ID: 'dev',
      S3_SECRET_ACCESS_KEY: 'dev-secret',
    } as CampaignConfig;
    const signer = createS3Signer(config)!;
    const url = new URL(
      await signer({
        key: `campaigns/${CAMPAIGN}/x.png`,
        contentType: 'image/png',
        size: 10,
        expiresIn: 300,
      }),
    );
    expect(url.pathname).toBe(`/vtt-dev/campaigns/${CAMPAIGN}/x.png`);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(createS3Signer({ ...config, S3_BUCKET: undefined })).toBeUndefined();
  });
});
