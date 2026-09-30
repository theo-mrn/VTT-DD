import { describe, expect, it, vi } from 'vitest';
import { HttpError } from './middleware/error-handler.js';
import { Uploads, type PutSigner } from './uploads.js';

const log = { error: vi.fn(), info: vi.fn() } as never;

describe('envois', () => {
  const signer: PutSigner = async (s) =>
    `https://r2.test/signe?key=${s.key}&type=${s.contentType}&size=${s.size}`;
  const uploads = new Uploads(signer, 'https://cdn.test/vtt/');

  it('billet : clé dans le dossier de l’usage, type et taille signés, adresse publique', async () => {
    const t = await uploads.ticket(
      { usage: 'portrait', contentType: 'image/webp', size: 1234 },
      'perso-1',
      ['portrait'],
      log,
    );
    expect(t.key).toMatch(/^characters\/perso-1\/[0-9a-f-]+\.webp$/);
    expect(t.url).toContain('size=1234');
    expect(t.headers).toEqual({ 'Content-Type': 'image/webp' });
    expect(t.publicUrl).toBe(`https://cdn.test/vtt/${t.key}`);
    expect(uploads.isOwnFile(t.publicUrl, 'characters', 'perso-1')).toBe(true);
    expect(uploads.isOwnFile(t.publicUrl, 'characters', 'perso-2')).toBe(false);
  });

  it('refus : usage d’une autre route, format, taille, stockage absent', async () => {
    const code = async (p: Promise<unknown>) => {
      try {
        await p;
        return null;
      } catch (e) {
        return e instanceof HttpError ? `${e.status} ${e.code}` : String(e);
      }
    };
    expect(
      await code(
        uploads.ticket(
          { usage: 'avatar', contentType: 'image/png', size: 1 },
          'x',
          ['portrait'],
          log,
        ),
      ),
    ).toBe('422 usage_not_allowed');
    expect(
      await code(
        uploads.ticket(
          { usage: 'portrait', contentType: 'video/mp4', size: 1 },
          'x',
          ['portrait'],
          log,
        ),
      ),
    ).toBe('415 unsupported_media_type');
    expect(
      await code(
        uploads.ticket(
          { usage: 'portrait', contentType: 'image/png', size: 9e9 },
          'x',
          ['portrait'],
          log,
        ),
      ),
    ).toBe('413 file_too_large');
    expect(
      await code(
        new Uploads(undefined, undefined).ticket(
          { usage: 'portrait', contentType: 'image/png', size: 1 },
          'x',
          ['portrait'],
          log,
        ),
      ),
    ).toBe('503 storage_unavailable');
  });
});
