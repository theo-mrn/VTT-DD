import { describe, expect, it } from 'vitest';
import {
  AjoutTemps,
  basePublique,
  DemandeEnvoi,
  echapperLike,
  jsonEgal,
  PatchProfil,
  RechercheUtilisateurs,
  SETTINGS_MAX_OCTETS,
  urlImageAcceptee,
} from './validation.js';

const MOI = '0190a000-0000-7000-8000-000000000001';
const AUTRE = '0190a000-0000-7000-8000-000000000002';
const BASE = 'https://cdn.exemple.fr';

describe('urlImageAcceptee', () => {
  it('accepte null et la valeur actuelle, même étrangère au stockage', () => {
    expect(urlImageAcceptee(null, null, BASE, 'avatars', MOI)).toBe(true);
    const ancienne = 'https://firebasestorage.googleapis.com/v0/b/x/o/pp';
    expect(urlImageAcceptee(ancienne, ancienne, BASE, 'avatars', MOI)).toBe(true);
  });

  it('accepte un fichier du dossier de l’utilisateur', () => {
    expect(
      urlImageAcceptee(`${BASE}/avatars/${MOI}/0190a-abc.png`, null, BASE, 'avatars', MOI),
    ).toBe(true);
  });

  it('refuse une URL arbitraire, un autre dossier ou un autre utilisateur', () => {
    const refusees = [
      'https://pirate.exemple/image.png',
      `${BASE}/avatars/${AUTRE}/a.png`,
      `${BASE}/banners/${MOI}/a.png`,
      `${BASE}/avatars/${MOI}/`,
      `${BASE}/avatars/${MOI}/../${AUTRE}/a.png`,
      `${BASE}/avatars/${MOI}/sous/a.png`,
      `${BASE}/avatars/${MOI}/a.png?x=1`,
      `${BASE}.pirate.exemple/avatars/${MOI}/a.png`,
    ];
    for (const url of refusees) {
      expect(urlImageAcceptee(url, null, BASE, 'avatars', MOI), url).toBe(false);
    }
  });

  it('refuse toute nouvelle URL si le stockage n’est pas configuré', () => {
    expect(urlImageAcceptee(`${BASE}/avatars/${MOI}/a.png`, null, null, 'avatars', MOI)).toBe(
      false,
    );
  });

  it('ignore la barre finale de S3_PUBLIC_URL', () => {
    expect(basePublique(`${BASE}/`)).toBe(BASE);
    expect(basePublique(undefined)).toBeNull();
  });
});

describe('echapperLike', () => {
  it('échappe %, _ et la barre oblique inverse', () => {
    expect(echapperLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(echapperLike('Théo')).toBe('Théo');
  });
});

describe('jsonEgal', () => {
  it('ne dépend pas de l’ordre des clés', () => {
    expect(jsonEgal({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(jsonEgal({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEgal({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe('PatchProfil', () => {
  it('nettoie le nom et transforme une bio vide en null', () => {
    expect(PatchProfil.parse({ name: '  Théo  ', bio: '   ' })).toEqual({
      name: 'Théo',
      bio: null,
    });
  });

  it('refuse les valeurs hors limites et les champs inconnus', () => {
    const refus = [
      { name: '   ' },
      { name: 'x'.repeat(65) },
      { bio: 'x'.repeat(2001) },
      { borderType: 'arc-en-ciel' },
      { settings: [] },
      { settings: 'texte' },
      { settings: { gros: 'x'.repeat(SETTINGS_MAX_OCTETS) } },
      { email: 'autre@exemple.fr' },
      { title: 'Légende' },
    ];
    for (const corps of refus) {
      expect(PatchProfil.safeParse(corps).success, JSON.stringify(corps).slice(0, 60)).toBe(false);
    }
  });

  it('accepte chaque bordure de l’ancienne application', () => {
    for (const b of ['none', 'blue', 'magic_double', 'magic_shine_twilight']) {
      expect(PatchProfil.safeParse({ borderType: b }).success, b).toBe(true);
    }
  });
});

describe('autres entrées', () => {
  it('limite les envois à 5 Mo et aux images courantes', () => {
    const ok = { kind: 'avatar', contentType: 'image/png', size: 5 * 1024 * 1024 };
    expect(DemandeEnvoi.safeParse(ok).success).toBe(true);
    expect(DemandeEnvoi.safeParse({ ...ok, size: 5 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(DemandeEnvoi.safeParse({ ...ok, size: 0 }).success).toBe(false);
    expect(DemandeEnvoi.safeParse({ ...ok, contentType: 'image/svg+xml' }).success).toBe(false);
    expect(DemandeEnvoi.safeParse({ ...ok, kind: 'fond' }).success).toBe(false);
  });

  it('borne la recherche et le temps de jeu', () => {
    expect(RechercheUtilisateurs.parse({ search: 'ab' })).toEqual({ search: 'ab', limit: 10 });
    expect(RechercheUtilisateurs.safeParse({ search: ' a ' }).success).toBe(false);
    expect(RechercheUtilisateurs.safeParse({ search: 'ab', limit: '21' }).success).toBe(false);
    expect(AjoutTemps.safeParse({ minutes: 60 }).success).toBe(true);
    for (const minutes of [0, 61, 1.5, '5']) {
      expect(AjoutTemps.safeParse({ minutes }).success, String(minutes)).toBe(false);
    }
  });
});
