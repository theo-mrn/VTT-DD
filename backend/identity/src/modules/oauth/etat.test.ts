import { describe, expect, it } from 'vitest';
import { emailValide, nomAffichable } from './comptes.js';
import {
  cheminDeRetour,
  defiPkce,
  deriverCleEtat,
  egalesSecretes,
  nouvelEtat,
  ouvrirEtat,
  scellerEtat,
  urlDuFront,
} from './etat.js';

const cle = deriverCleEtat('secret-de-test');

describe('cookie d’état OAuth', () => {
  it('se relit à l’identique', () => {
    const etat = nouvelEtat('google', '/salles');
    expect(ouvrirEtat(cle, scellerEtat(cle, etat))).toEqual({ ok: true, etat });
  });

  it('produit des valeurs aléatoires distinctes', () => {
    const a = nouvelEtat('discord', '/');
    const b = nouvelEtat('discord', '/');
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('refuse un cookie absent, falsifié, signé par une autre clé ou expiré', () => {
    const etat = nouvelEtat('google', '/');
    const valeur = scellerEtat(cle, etat);
    expect(ouvrirEtat(cle, undefined)).toEqual({ ok: false, raison: 'absent' });
    expect(ouvrirEtat(cle, 'sans-point')).toEqual({ ok: false, raison: 'format' });

    const [contenu, signature] = valeur.split('.');
    const modifie = Buffer.from(JSON.stringify({ ...etat, retour: '/admin' })).toString(
      'base64url',
    );
    expect(ouvrirEtat(cle, `${modifie}.${signature}`)).toEqual({ ok: false, raison: 'signature' });
    expect(ouvrirEtat(deriverCleEtat('autre-secret'), valeur)).toEqual({
      ok: false,
      raison: 'signature',
    });
    expect(ouvrirEtat(cle, `${contenu}.`)).toEqual({ ok: false, raison: 'signature' });

    const dans11Minutes = new Date(Date.now() + 11 * 60 * 1000);
    expect(ouvrirEtat(cle, valeur, dans11Minutes)).toEqual({ ok: false, raison: 'expire' });
  });

  it('compare les secrets sans erreur sur des longueurs différentes', () => {
    expect(egalesSecretes('abc', 'abc')).toBe(true);
    expect(egalesSecretes('abc', 'abcd')).toBe(false);
  });

  it('calcule le défi PKCE S256 : base64url sans remplissage du SHA-256', async () => {
    const verifier = nouvelEtat('google', '/').codeVerifier;
    const attendu = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ).toString('base64url');
    expect(defiPkce(verifier)).toBe(attendu);
    expect(defiPkce(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('chemin de retour', () => {
  it('garde un chemin relatif du front', () => {
    expect(cheminDeRetour('/salles/42?onglet=carte#haut')).toBe('/salles/42?onglet=carte#haut');
    expect(cheminDeRetour('/')).toBe('/');
  });

  it.each([
    undefined,
    '',
    'salles',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    ['/a'],
    '/' + 'a'.repeat(3000),
  ])('remplace %j par « / »', (brut) => {
    expect(cheminDeRetour(brut)).toBe('/');
  });

  it('construit l’URL du front sans double barre', () => {
    expect(urlDuFront('http://front.test/', '/x')).toBe('http://front.test/x');
  });
});

describe('données du fournisseur', () => {
  it('borne le nom entre 1 et 64 caractères', () => {
    expect(nomAffichable(null)).toBe('Aventurier');
    expect(nomAffichable('   ')).toBe('Aventurier');
    expect(nomAffichable('  Théo\u0000 le\n\nBarde ')).toBe('Théo le Barde');
    const long = nomAffichable('🐉'.repeat(100));
    expect(Array.from(long)).toHaveLength(64);
  });

  it('écarte une adresse inexploitable', () => {
    expect(emailValide('  joueur@exemple.fr ')).toBe('joueur@exemple.fr');
    expect(emailValide('pas-une-adresse')).toBeNull();
    expect(emailValide(null)).toBeNull();
  });
});
