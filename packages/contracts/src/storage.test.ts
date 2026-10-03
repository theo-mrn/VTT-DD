import { describe, expect, it } from 'vitest';
import { formatBytes, ReserveStorage } from './storage.js';

describe('stockage', () => {
  it('tailles lisibles en base 1024', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(12 * 1024)).toBe('12 ko');
    expect(formatBytes(340 * 1024 ** 2)).toBe('340 Mo');
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1,25 Go');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 Go');
  });

  it('réservation : taille positive, campagne en uuid', () => {
    const ok = {
      campaignId: '0190a8f0-0000-7000-8000-000000000001',
      key: 'characters/x/y.png',
      size: 10,
      usage: 'portrait',
      contentType: 'image/png',
    };
    expect(ReserveStorage.safeParse(ok).success).toBe(true);
    expect(ReserveStorage.safeParse({ ...ok, size: 0 }).success).toBe(false);
  });
});
