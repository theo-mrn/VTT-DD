/**
 * Fiche Noobliés en ligne (page réelle, nom du joueur retiré, deux rangs cochés) : lecture brute,
 * et adresses acceptées pour le téléchargement.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireNooblies } from './nooblies.js';
import { siteDe } from './sites.js';

const URL_FICHE = 'https://nooblieeschroniques.fr/index.php?sheet=exemple';
const page = readFileSync(new URL('./fixtures/nooblies.html', import.meta.url), 'utf8');

describe('fiche Noobliés', () => {
  const l = lireNooblies(page, URL_FICHE)!;
  const champ = (label: string) => l.fields.find((f) => f.label === label)?.value;

  it('nom, portrait et source', () => {
    expect(l.name).toBe('Askel Hendriksen');
    expect(l.portraitUrl).toBe('https://nooblieeschroniques.fr/illu/barbare.png');
    expect(l.source).toEqual({ kind: 'link', site: 'nooblieeschroniques.fr', url: URL_FICHE });
  });

  it('caractéristiques, niveau, PV et valeurs de combat en champs', () => {
    expect(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map(champ)).toEqual([
      '16',
      '10',
      '15',
      '10',
      '13',
      '11',
    ]);
    expect(champ('Niveau')).toBe('1');
    expect(champ('PV')).toBe('14');
    expect(champ('PV max')).toBe('14');
    expect(champ('Défense')).toBe('10');
    expect(champ('Taille')).toBe('1,92 m');
    // Bonus et pièces vides : absents
    expect(champ('Bonus FOR')).toBeUndefined();
    expect(champ('po')).toBeUndefined();
  });

  it('race, profil, voies au dernier rang coché, équipement', () => {
    expect(l.entries.slice(0, 2)).toEqual([
      { name: 'Humain', kind: 'race' },
      { name: 'Barbare', kind: 'profil' },
    ]);
    const voies = l.entries.filter((e) => e.kind === 'voie');
    expect(voies.map((v) => [v.name, v.rank])).toEqual([
      ['Voie de la brute', 2],
      ['Voie de la rage', 0],
      ['Voie du pagne', 0],
      ['Voie du pourfendeur', 0],
      ['Voie de l’humain', 1],
      ['Voie du héros', 0],
    ]);
    expect(voies[0]!.ranks).toEqual([
      'Argument de taille',
      'Tour de force',
      'Attaque brutale (L)',
      'Briseur d’os',
      'Force héroïque',
    ]);
    expect(l.entries.filter((e) => e.kind === 'arme' || e.kind === 'armure')).toEqual([
      { name: 'Masse', kind: 'arme', details: 'DM 1d6' },
      { name: 'Vêtement en tissu', kind: 'armure' },
    ]);
  });

  it('capacité raciale et notes en textes', () => {
    expect(l.texts.map((t) => t.label)).toEqual(['Capacité raciale', 'Notes']);
  });

  it('page sans fiche : rien', () => {
    expect(lireNooblies('<html>404</html>', URL_FICHE)).toBeNull();
  });
});

describe('adresses de fiches', () => {
  it('le site et ses sous-domaines, en https, sans port ni identifiants', () => {
    expect(siteDe(URL_FICHE)?.host).toBe('nooblieeschroniques.fr');
    expect(siteDe('https://www.nooblieeschroniques.fr/x')?.host).toBe('nooblieeschroniques.fr');
    expect(siteDe('http://nooblieeschroniques.fr/x')).toBeUndefined();
    expect(siteDe('https://nooblieeschroniques.fr:8443/x')).toBeUndefined();
    expect(siteDe('https://a:b@nooblieeschroniques.fr/x')).toBeUndefined();
    expect(siteDe('https://evilnooblieeschroniques.fr/x')).toBeUndefined();
    expect(siteDe('https://nooblieeschroniques.fr.evil.com/x')).toBeUndefined();
    expect(siteDe('https://169.254.169.254/latest')).toBeUndefined();
    expect(siteDe('pas une adresse')).toBeUndefined();
  });
});
