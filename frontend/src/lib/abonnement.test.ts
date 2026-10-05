import { describe, expect, it } from 'vitest';
import { montant, retourSur } from './abonnement';

describe('paiement', () => {
  it('retour après Stripe : chemin du site seulement', () => {
    expect(retourSur('/des?onglet=boutique')).toBe('/des?onglet=boutique');
    for (const brut of [null, '', 'https://evil.test/', '//evil.test/x', '/\\evil.test', 'des'])
      expect(retourSur(brut)).toBe('/profil/abonnement');
    expect(retourSur(null, '/des')).toBe('/des');
  });

  it('montants en euros', () => {
    expect(montant(499).replace(/\s/g, ' ')).toBe('4,99 €');
    expect(montant(4990, 'eur').replace(/\s/g, ' ')).toBe('49,90 €');
  });
});
