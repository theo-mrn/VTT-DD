import { calculer } from '@vtt/rules';
import { systeme } from '@vtt/systemes';
import { describe, expect, it } from 'vitest';
import type { DocFirestore } from '../legacy.js';
import {
  classify,
  importedId,
  transformActions,
  transformCategory,
  transformNpcTemplate,
  transformObjectTemplate,
  uuidv5,
  type LegacyNpcTemplate,
} from './transform.js';

const systemes = {
  'dnd-classic': systeme('dnd-classic'),
  'star-wars-eote': systeme('star-wars-eote'),
};

const doc = <T>(path: string, data: T): DocFirestore<T> => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

describe('identifiants stables', () => {
  it('UUIDv5 conforme à la RFC, identique d’un import à l’autre', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
    const a = importedId('npc_templates/salle/templates/x');
    expect(a).toBe(importedId('npc_templates/salle/templates/x'));
    expect(a).not.toBe(importedId('npc_templates/salle/templates/y'));
    expect(a[14]).toBe('5');
  });

  it('reconnaît les trois sortes de documents et leur salle', () => {
    expect(classify('npc_templates/abc/templates/1')).toEqual({
      kind: 'npc_template',
      roomCode: 'abc',
    });
    expect(classify('npc_templates/abc/categories/1')).toEqual({
      kind: 'npc_category',
      roomCode: 'abc',
    });
    expect(classify('object_templates/abc/templates/1')).toEqual({
      kind: 'object_template',
      roomCode: 'abc',
    });
    expect(classify('npc_templates/abc')).toBeUndefined();
    expect(classify('sound_templates/abc/templates/1')).toBeUndefined();
  });
});

describe('modèle de PNJ D&D (générateur de rencontres)', () => {
  const categorie = 'npc_templates/salleDD/categories/cat1';
  const gobelin = doc<LegacyNpcTemplate>('npc_templates/salleDD/templates/gob', {
    Nomperso: 'Gobelin',
    categoryId: 'cat1',
    imageURL2: 'https://firebasestorage.googleapis.com/v0/b/x/o/gob.png',
    niveau: 1,
    FOR: 8,
    DEX: 14,
    CON: 10,
    SAG: 8,
    INT: 10,
    CHA: 6,
    PV: 5,
    PV_F: 5,
    PV_Max: 5,
    Defense: 15,
    Defense_F: 15,
    Contact: 1,
    Distance: 3,
    Magie: 0,
    INIT: 14,
    Actions: [{ Nom: 'Cimeterre', Description: '1d6 tranchant', Toucher: 3 }],
  });
  const t = transformNpcTemplate(gobelin, {
    systemId: 'dnd-classic',
    systemes,
    categories: new Set([categorie]),
  });
  const f = calculer(systemes['dnd-classic'], t.etat);

  it('stats migrées comme un personnage ; valeurs dérivées du MJ gardées par un bonus', () => {
    expect(['FOR', 'DEX', 'CON'].map((k) => f.valeur(k))).toEqual([8, 14, 10]);
    expect(
      ['Defense', 'Contact', 'Distance', 'Magie', 'INIT', 'PV_Max', 'PV'].map((k) => f.valeur(k)),
    ).toEqual([15, 1, 3, 0, 14, 5, 5]);
    const bonus = t.etat.bonus.find((b) => b.id === 'valeurs-du-modele')!;
    expect(bonus.effets.map((e) => e.sur === 'attribut' && [e.attribut, e.valeur])).toEqual([
      ['Defense', '3'],
      ['Contact', '1'],
      ['Magie', '-1'],
    ]);
    expect(t.etat.creation).toBe(false);
  });

  it('nom, images, actions et catégorie ; pas d’avertissement de race ou de profil', () => {
    expect(t).toMatchObject({
      id: importedId(gobelin.path),
      legacyId: gobelin.path,
      name: 'Gobelin',
      categoryId: importedId(categorie),
      imageUrl: null,
      tokenUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/gob.png',
      actions: [{ name: 'Cimeterre', description: '1d6 tranchant', toHit: 3 }],
    });
    expect(t.warnings.filter((w) => /Aucun/.test(w))).toEqual([]);
  });

  it('catégorie absente de l’export : modèle sans catégorie, avec un avertissement', () => {
    const r = transformNpcTemplate(gobelin, {
      systemId: 'dnd-classic',
      systemes,
      categories: new Set(),
    });
    expect(r.categoryId).toBeNull();
    expect(r.warnings).toContain(
      'Catégorie supprimée dans l’ancienne app : modèle rangé sans catégorie',
    );
  });
});

describe('modèle de PNJ Star Wars', () => {
  const t = transformNpcTemplate(
    doc<LegacyNpcTemplate>('npc_templates/salleSW/templates/st', {
      Nomperso: 'Stormtrooper',
      niveau: 1,
      vigueur: 3,
      agilite: 3,
      intellect: 2,
      ruse: 2,
      volonte: 3,
      presence: 1,
      PV: 0,
      PV_Max: 5,
      Stress: 0,
      Stress_Max: 4,
      ValeurEncaissement: 5,
      BlessuresCritiques: 0,
      Actions: [],
    }),
    { systemId: 'star-wars-eote', systemes, categories: new Set() },
  );
  const f = calculer(systemes['star-wars-eote'], t.etat);

  it('seuils figés du modèle gardés (PV_Max → seuil de blessure, Stress_Max → seuil de stress)', () => {
    expect([f.valeur('vigueur'), f.valeur('seuilBlessure'), f.valeur('seuilStress')]).toEqual([
      3, 5, 4,
    ]);
    expect(t.warnings.filter((w) => /^Seuil/.test(w))).toEqual([]);
    expect(t.warnings).toContain(
      'PNJ : catégorie (sbire, rival, némésis) à choisir, « personnage joueur » par défaut',
    );
  });
});

describe('catégories, objets et actions', () => {
  it('catégorie : nom, couleur, date de création', () => {
    const c = transformCategory(
      doc('npc_templates/s/categories/c', {
        name: 'Rencontre #1',
        color: '#ef4444',
        createdAt: { $timestamp: '2026-07-18T21:05:09.061000000Z' },
      }),
    );
    expect(c).toMatchObject({ name: 'Rencontre #1', color: '#ef4444', warnings: [] });
    expect(c.createdAt?.toISOString()).toBe('2026-07-18T21:05:09.061Z');
    expect(
      transformCategory(doc('npc_templates/s/categories/d', { color: 'rouge' })),
    ).toMatchObject({
      name: 'Sans nom',
      color: null,
      warnings: ['Couleur « rouge » illisible, retirée'],
    });
  });

  it('objet : décor de carte, sans règles de jeu', () => {
    expect(
      transformObjectTemplate(
        doc('object_templates/s/templates/o', { name: 'Caisse', imageUrl: 'https://x.test/c.png' }),
      ),
    ).toMatchObject({
      name: 'Caisse',
      imageUrl: 'https://x.test/c.png',
      category: null,
      createdAt: null,
    });
  });

  it('actions illisibles ignorées avec un avertissement', () => {
    const warnings: string[] = [];
    expect(transformActions('?', (w) => warnings.push(w))).toEqual([]);
    expect(
      transformActions([null, { Nom: 'Morsure', Toucher: '2' }], (w) => warnings.push(w)),
    ).toEqual([{ name: 'Morsure', description: '', toHit: 2 }]);
    expect(warnings).toEqual(['Actions illisibles, ignorées']);
  });
});
