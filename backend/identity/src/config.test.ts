import { loadConfig } from '@vtt/platform';
import { describe, expect, it } from 'vitest';
import { firebaseParams, IdentityConfig } from './config.js';

const BASE = {
  DATABASE_URL: 'postgres://x@localhost/vtt',
  JWT_ISSUER: 'http://localhost:3001',
  JWT_AUDIENCE: 'vtt-api',
  JWT_PRIVATE_JWKS: '[{"kid":"k"}]',
};

describe('configuration identity', () => {
  it('accepte les paramètres Firebase laissés vides dans le .env', () => {
    const config = loadConfig(IdentityConfig, {
      ...BASE,
      FIREBASE_SCRYPT_SIGNER_KEY: '',
      FIREBASE_SCRYPT_SALT_SEPARATOR: '',
      FIREBASE_SCRYPT_ROUNDS: '',
      FIREBASE_SCRYPT_MEM_COST: '',
    });
    expect(firebaseParams(config)).toBeUndefined();
  });

  it('lit les paramètres Firebase quand ils sont renseignés', () => {
    const config = loadConfig(IdentityConfig, {
      ...BASE,
      FIREBASE_SCRYPT_SIGNER_KEY: 'a2V5',
      FIREBASE_SCRYPT_SALT_SEPARATOR: 'Bw==',
      FIREBASE_SCRYPT_ROUNDS: '8',
      FIREBASE_SCRYPT_MEM_COST: '14',
    });
    expect(firebaseParams(config)).toEqual({
      signerKey: 'a2V5',
      saltSeparator: 'Bw==',
      rounds: 8,
      memCost: 14,
    });
  });

  it('refuse un nombre de rounds invalide', () => {
    expect(() => loadConfig(IdentityConfig, { ...BASE, FIREBASE_SCRYPT_ROUNDS: '0' })).toThrow();
  });

  it('refuse des clés JWT qui ne sont pas un tableau JSON', () => {
    expect(() =>
      loadConfig(IdentityConfig, { ...BASE, JWT_PRIVATE_JWKS: 'pas du json' }),
    ).toThrow();
  });
});
