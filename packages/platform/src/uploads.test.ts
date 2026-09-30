import { describe, expect, it, vi } from 'vitest';
import { HttpError } from './middleware/error-handler.js';
import { RemoteImageError } from './remote-image.js';
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

describe('import d’une image d’un autre site', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const written: string[] = [];
  const uploads = new Uploads(
    undefined,
    'https://cdn.test/vtt',
    300,
    async (o) => void written.push(`${o.key} ${o.contentType} ${o.body.length}`),
    async (url) => {
      if (url.includes('local')) throw new RemoteImageError('address', 'refusée');
      return { body: png, contentType: 'image/png' };
    },
  );

  it('rangée comme un envoi, dans le dossier du propriétaire', async () => {
    const r = await uploads.importFromUrl(
      { usage: 'portrait', url: 'https://i.pinimg.com/a.jpg' },
      'perso-1',
      ['portrait'],
      log,
    );
    expect(r.key).toMatch(/^characters\/perso-1\/[0-9a-f-]+\.png$/);
    expect(r.publicUrl).toBe(`https://cdn.test/vtt/${r.key}`);
    expect(written).toEqual([`${r.key} image/png ${png.length}`]);
  });

  it('refus : adresse, usage d’une autre route', async () => {
    await expect(
      uploads.importFromUrl({ usage: 'portrait', url: 'http://local/x' }, 'p', ['portrait'], log),
    ).rejects.toMatchObject({ status: 422, code: 'address_not_allowed' });
    await expect(
      uploads.importFromUrl({ usage: 'avatar', url: 'https://a.fr/x' }, 'p', ['portrait'], log),
    ).rejects.toMatchObject({ status: 422, code: 'usage_not_allowed' });
  });
});
