import { describe, expect, it } from 'vitest';
import {
  fetchRemoteImage,
  isPublicAddress,
  RemoteImageError,
  sniffImageType,
} from './remote-image.js';

const reason = async (url: string) => {
  try {
    await fetchRemoteImage(url, { maxBytes: 1024, timeoutMs: 2000 });
    return null;
  } catch (e) {
    return e instanceof RemoteImageError ? e.reason : String(e);
  }
};

describe('import d’une image distante', () => {
  it('adresses publiques seulement', () => {
    for (const a of ['8.8.8.8', '151.101.0.84', '2606:4700::1111'])
      expect(isPublicAddress(a)).toBe(true);
    for (const a of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'pas-une-ip',
    ])
      expect(isPublicAddress(a)).toBe(false);
  });

  it('refuse avant toute connexion : protocole, port, identifiants, IP ou nom locaux', async () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://exemple.fr/a.png',
      'http://127.0.0.1/a.png',
      'http://[::1]/a.png',
      'http://169.254.169.254/latest/meta-data',
      'http://localhost/a.png',
      'http://exemple.fr:22/a.png',
      'http://moi:secret@exemple.fr/a.png',
    ])
      expect(await reason(url), url).toBe('address');
  });

  it('refuse un nom qui se résout en adresse locale (vérifié à la connexion)', async () => {
    // « localhost. » échappe au contrôle du nom, pas à celui de l'adresse résolue
    expect(await reason('http://localhost./a.png')).toBe('address');
  });

  it('format lu dans les premiers octets', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('GIF89a......'))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('\0\0\0\x1cftypavif'))).toBe('image/avif');
    expect(sniffImageType(Buffer.from('<html><body>'))).toBeNull();
  });
});
