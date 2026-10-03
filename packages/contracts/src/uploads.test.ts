import { describe, expect, it } from 'vitest';
import { checkUpload, UPLOAD_USAGES, FileUploadRequest, uploadMaxBytes } from './uploads.js';

describe('envois', () => {
  it('format et taille par usage', () => {
    expect(checkUpload({ usage: 'portrait', contentType: 'image/webp', size: 1000 })).toBeNull();
    expect(checkUpload({ usage: 'portrait', contentType: 'video/mp4', size: 1000 })?.code).toBe(
      'unsupported_media_type',
    );
    expect(
      checkUpload({ usage: 'portrait', contentType: 'image/png', size: 6 * 1024 * 1024 })?.code,
    ).toBe('file_too_large');
  });

  it('fond de carte : 100 Mo pour une vidéo, 10 Mo pour une image', () => {
    expect(uploadMaxBytes('map-background', 'video/webm')).toBe(100 * 1024 * 1024);
    expect(uploadMaxBytes('map-background', 'image/avif')).toBe(10 * 1024 * 1024);
    expect(
      checkUpload({ usage: 'map-background', contentType: 'image/png', size: 20 * 1024 * 1024 })
        ?.code,
    ).toBe('file_too_large');
  });

  it('demande stricte : usage connu, pas de champ en trop', () => {
    expect(
      FileUploadRequest.safeParse({ usage: 'avatar', contentType: 'image/png', size: 1 }).success,
    ).toBe(true);
    expect(
      FileUploadRequest.safeParse({ usage: 'autre', contentType: 'image/png', size: 1 }).success,
    ).toBe(false);
    expect(
      FileUploadRequest.safeParse({ usage: 'avatar', contentType: 'image/png', size: 1, key: 'x' })
        .success,
    ).toBe(false);
    expect(Object.values(UPLOAD_USAGES).every((u) => u.maxBytes > 0)).toBe(true);
  });
});
