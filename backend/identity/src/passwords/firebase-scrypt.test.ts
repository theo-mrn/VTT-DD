import { describe, expect, it } from 'vitest';
import {
  firebaseScryptHash,
  verifyFirebaseScrypt,
  type FirebaseScryptParams,
} from './firebase-scrypt.js';

// Exemple publié dans le README de l'implémentation de référence (github.com/firebase/scrypt).
// Si ce test échoue, l'algorithme est faux : aucun compte migré ne pourrait se connecter.
const PARAMS: FirebaseScryptParams = {
  signerKey:
    // Clé d'exemple publiée par Firebase (README de firebase/scrypt), pas un secret
    'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==', // gitleaks:allow
  saltSeparator: 'Bw==',
  rounds: 8,
  memCost: 14,
};
const SEL = '42xEC+ixf3L2lw==';
const HASH =
  'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==';

describe('hash scrypt de Firebase', () => {
  it("reproduit l'exemple de référence", async () => {
    expect(await firebaseScryptHash('user1password', SEL, PARAMS)).toBe(HASH);
  });

  it('accepte le bon mot de passe', async () => {
    expect(await verifyFirebaseScrypt('user1password', HASH, SEL, PARAMS)).toBe(true);
  });

  it('refuse un mauvais mot de passe', async () => {
    expect(await verifyFirebaseScrypt('user1Password', HASH, SEL, PARAMS)).toBe(false);
  });

  it('refuse avec un autre sel', async () => {
    expect(await verifyFirebaseScrypt('user1password', HASH, 'AAAAAAAAAAAAAA==', PARAMS)).toBe(
      false,
    );
  });

  it('refuse un hash tronqué sans lever d’erreur', async () => {
    expect(await verifyFirebaseScrypt('user1password', HASH.slice(0, 20), SEL, PARAMS)).toBe(false);
  });
});
