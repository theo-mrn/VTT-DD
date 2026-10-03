import { describe, expect, it } from 'vitest';
import { sniffAudio } from './sniff.js';
import { createUploadToken, verifyUploadToken, type UploadClaims } from './upload-token.js';

const pad = (b: number[] | string) =>
  Buffer.concat([
    typeof b === 'string' ? Buffer.from(b, 'latin1') : Buffer.from(b),
    Buffer.alloc(16),
  ]);

describe('type réel', () => {
  it('reconnaît les signatures', () => {
    expect(sniffAudio(pad('ID3\x04\x00'))).toBe('mp3');
    expect(sniffAudio(pad([0xff, 0xfb, 0x90, 0x00]))).toBe('mp3');
    expect(sniffAudio(pad([0xff, 0xf1, 0x50, 0x80]))).toBe('aac');
    expect(sniffAudio(pad('\x00\x00\x00\x20ftypM4A '))).toBe('m4a');
    expect(sniffAudio(pad('OggS\x00\x02'))).toBe('ogg');
    expect(sniffAudio(pad('RIFF\x24\x08\x00\x00WAVEfmt '))).toBe('wav');
    expect(sniffAudio(pad('fLaC\x00\x00\x00\x22'))).toBe('flac');
    expect(sniffAudio(pad([0x1a, 0x45, 0xdf, 0xa3]))).toBe('webm');
  });

  it('refuse un fichier renommé (image, texte, AVI)', () => {
    expect(sniffAudio(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull();
    expect(sniffAudio(pad('<html><body>'))).toBeNull();
    expect(sniffAudio(pad('RIFF\x24\x08\x00\x00AVI LIST'))).toBeNull();
    expect(sniffAudio(Buffer.from('ID3'))).toBeNull();
  });
});

describe('jeton d’envoi', () => {
  const secret = 'x'.repeat(32);
  const claims: UploadClaims = {
    assetId: crypto.randomUUID(),
    campaignId: crypto.randomUUID(),
    key: 'audio/incoming/c/a',
    size: 1234,
    contentType: 'audio/mpeg',
    kind: 'music',
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  it('aller-retour', () => {
    expect(verifyUploadToken(secret, createUploadToken(secret, claims))).toEqual(claims);
  });

  it('falsifié, autre secret, expiré, illisible', () => {
    const token = createUploadToken(secret, claims);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, size: 999_999_999 })).toString(
      'base64url',
    );
    expect(verifyUploadToken(secret, `${forged}.${sig}`)).toBeNull();
    expect(verifyUploadToken('y'.repeat(32), token)).toBeNull();
    expect(verifyUploadToken(secret, token, (claims.exp + 1) * 1000)).toBeNull();
    expect(verifyUploadToken(secret, `${payload}`)).toBeNull();
    expect(verifyUploadToken(secret, 'a.b.c')).toBeNull();
  });
});
