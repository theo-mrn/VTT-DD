import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import type { FirebaseScryptParams } from './firebase-scrypt.js';
import { hashPassword, verifyPassword } from './passwords.js';

const FIREBASE: FirebaseScryptParams = {
  signerKey:
    // Clé d'exemple publiée par Firebase (README de firebase/scrypt), pas un secret
    'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==', // gitleaks:allow
  saltSeparator: 'Bw==',
  rounds: 8,
  memCost: 14,
};
const COMPTE_FIREBASE = {
  algorithm: 'firebase-scrypt' as const,
  hash: 'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==',
  salt: '42xEC+ixf3L2lw==',
};

describe('argon2id', () => {
  it('hashe puis vérifie un mot de passe, sans demander de re-hash', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.algorithm).toBe('argon2id');
    expect(stored.hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(stored, 'correct horse battery staple', undefined)).toEqual({
      ok: true,
      needsRehash: false,
    });
  });

  it('refuse un mauvais mot de passe', async () => {
    const stored = await hashPassword('secret');
    expect(await verifyPassword(stored, 'Secret', undefined)).toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('demande un re-hash quand les paramètres sont plus faibles que la cible', async () => {
    const faible = await hash('secret', { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    expect(
      await verifyPassword({ algorithm: 'argon2id', hash: faible }, 'secret', undefined),
    ).toEqual({
      ok: true,
      needsRehash: true,
    });
  });

  it('refuse un hash illisible sans lever d’erreur', async () => {
    expect(
      await verifyPassword({ algorithm: 'argon2id', hash: 'nimporte-quoi' }, 'x', undefined),
    ).toEqual({
      ok: false,
      needsRehash: false,
    });
  });
});

describe('compte importé de Firebase', () => {
  it('accepte l’ancien mot de passe et demande le passage en argon2id', async () => {
    expect(await verifyPassword(COMPTE_FIREBASE, 'user1password', FIREBASE)).toEqual({
      ok: true,
      needsRehash: true,
    });
  });

  it('refuse un mauvais mot de passe sans demander de re-hash', async () => {
    expect(await verifyPassword(COMPTE_FIREBASE, 'faux', FIREBASE)).toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('refuse de vérifier sans les paramètres du projet Firebase', async () => {
    await expect(verifyPassword(COMPTE_FIREBASE, 'user1password', undefined)).rejects.toThrow(
      /Firebase/,
    );
  });
});
