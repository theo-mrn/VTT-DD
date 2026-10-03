import { describe, expect, it } from 'vitest';
import type { FirestoreDoc } from '../legacy.js';
import { legacyUuid } from '../maps/transform.js';
import { resolveAuthor, transformNotes, type NotesMappings } from './transform.js';

const R = 'ABC123';
const doc = (path: string, data: Record<string, unknown>): FirestoreDoc => ({
  path,
  id: path.split('/').pop()!,
  data,
});
const ts = (iso: string) => ({ $timestamp: iso });

const CAMPAIGN = 'cccccccc-0000-4000-8000-000000000001';
const GM = 'bbbbbbbb-0000-4000-8000-000000000001';
const ALICE = 'bbbbbbbb-0000-4000-8000-000000000002';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000003';
const ARIA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BROM = 'aaaaaaaa-0000-4000-8000-000000000002';
const GHOST = 'aaaaaaaa-0000-4000-8000-000000000003';
const IMPORTED_AT = new Date('2026-01-01T00:00:00Z');

const mappings: NotesMappings = {
  campaignId: CAMPAIGN,
  gmId: GM,
  characters: new Map([
    [`cartes/${R}/characters/aria`, { id: ARIA, engaged: true, ownerId: ALICE, playedBy: ALICE }],
    [`cartes/${R}/characters/brom`, { id: BROM, engaged: true, ownerId: BOB, playedBy: null }],
    [`cartes/${R}/characters/ghost`, { id: GHOST, engaged: false, ownerId: BOB, playedBy: null }],
  ]),
  legacyCharacters: new Map([
    ['aria', { name: 'Aria', type: 'joueurs' }],
    ['brom', { name: 'Brom', type: 'joueurs' }],
    ['ghost', { name: 'Fantôme', type: 'joueurs' }],
    ['twin1', { name: 'Jumeau', type: 'joueurs' }],
    ['twin2', { name: 'Jumeau', type: 'joueurs' }],
  ]),
  accounts: new Map([
    ['uid-gm', GM],
    ['uid-alice', ALICE],
    ['uid-bob', BOB],
  ]),
  users: new Map([
    ['uid-gm', { perso: 'MJ', roomId: R }],
    ['uid-alice', { persoId: 'aria', perso: 'Aria', roomId: R }],
    ['uid-bob', { persoId: 'brom', perso: 'Brom', roomId: R }],
    ['uid-lost', { persoId: 'x', roomId: R }],
  ]),
  importedAt: IMPORTED_AT,
};

describe('auteur d’une clé legacy', () => {
  it('id de personnage, UID, « MJ », ancien chemin par nom', () => {
    expect(resolveAuthor(R, 'aria', mappings)).toEqual({
      ownerId: ALICE,
      characterId: ARIA,
      byId: true,
    });
    // Personnage non engagé : l'auteur est retrouvé, sans personnage
    expect(resolveAuthor(R, 'ghost', mappings)).toMatchObject({ ownerId: BOB, characterId: null });
    expect(resolveAuthor(R, 'uid-gm', mappings)).toEqual({
      ownerId: GM,
      characterId: null,
      byId: true,
    });
    expect(resolveAuthor(R, 'MJ', mappings)).toEqual({
      ownerId: GM,
      characterId: null,
      byId: false,
    });
    expect(resolveAuthor(R, 'Brom', mappings)).toEqual({
      ownerId: BOB,
      characterId: BROM,
      byId: false,
    });
  });

  it('introuvable : compte non migré, homonymes, inconnu', () => {
    expect(resolveAuthor(R, 'uid-lost', mappings)).toBe('compte uid-lost non migré');
    expect(resolveAuthor(R, 'Jumeau', mappings)).toBe('2 personnages portent le nom de la clé');
    expect(resolveAuthor(R, 'Personne', mappings)).toBe('auteur introuvable');
  });
});

describe('notes d’une salle', () => {
  const privateDocs = [
    doc(`Notes/${R}/aria/n1`, {
      title: 'Journal',
      content: '<p>Secret</p>',
      type: 'quest',
      tags: [{ id: 'x', label: 'X' }, { label: 'Y' }, { id: 'x', label: 'Doublon' }],
      questType: 'principale',
      questStatus: 'in-progress',
      subQuests: [
        { id: 1700000000000, title: 'Étape', description: '', status: 'completed' },
        { title: 'Sans id' },
      ],
      createdAt: ts('2025-05-01T10:00:00.000Z'),
      updatedAt: ts('2025-05-02T10:00:00.000Z'),
    }),
    // Même document lu sous l'ancien chemin par nom : ignoré, comme loadNotes
    doc(`Notes/${R}/Aria/n1`, { title: 'Journal' }),
    doc(`Notes/${R}/Aria/n2`, { title: 'Note rapide', content: 'a<br/>b' }),
    doc(`Notes/${R}/MJ/n3`, { title: 'Scénario', type: 'inconnu' }),
    doc(`Notes/${R}/Personne/n4`, { title: 'Perdue', content: 'Contenu perdu' }),
    doc(`Notes/AUTRE/aria/n5`, { title: 'Autre salle' }),
  ];
  const sharedDocs = [
    doc(`SharedNotes/${R}/notes/s1`, {
      title: 'Pour Brom',
      content: 'Partagé',
      createdBy: 'Aria',
      createdByName: 'Aria',
      isShared: true,
      sharedWith: ['brom', 'ghost', 'inconnu'],
      image: 'data:image/png;base64,AAAA',
      race: 'Elfe',
      class: 'Barde',
    }),
    doc(`SharedNotes/${R}/notes/s2`, {
      title: 'Pour tous',
      sharedWith: 'all',
      createdBy: 'uid-gm',
    }),
    doc(`SharedNotes/${R}/notes/s3`, { title: 'Sans auteur' }),
  ];
  const m = transformNotes(R, privateDocs, sharedDocs, mappings);
  const byPath = (path: string) => m.notes.find((n) => n.id === legacyUuid(path));

  it('notes privées : auteur, personnage, champs normalisés', () => {
    expect(m.notes.filter((n) => !n.shared)).toHaveLength(3);
    expect(byPath(`Notes/${R}/aria/n1`)).toEqual({
      id: legacyUuid(`Notes/${R}/aria/n1`),
      campaignId: CAMPAIGN,
      ownerUserId: ALICE,
      characterId: ARIA,
      shared: false,
      sharedWith: null,
      title: 'Journal',
      content: '<p>Secret</p>',
      type: 'quest',
      tags: [
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
      ],
      imageUrl: null,
      race: null,
      class: null,
      region: null,
      itemType: null,
      questType: 'main',
      questStatus: 'in_progress',
      subQuests: [
        { id: '1700000000000', title: 'Étape', description: '', status: 'completed' },
        { id: '2', title: 'Sans id', description: '', status: 'not_started' },
      ],
      createdAt: new Date('2025-05-01T10:00:00.000Z'),
      updatedAt: new Date('2025-05-02T10:00:00.000Z'),
    });
    expect(byPath(`Notes/${R}/Aria/n2`)).toMatchObject({
      ownerUserId: ALICE,
      characterId: ARIA,
      content: 'a<br/>b',
      type: 'other',
      createdAt: IMPORTED_AT,
    });
    expect(byPath(`Notes/${R}/MJ/n3`)).toMatchObject({
      ownerUserId: GM,
      characterId: null,
      type: 'other',
    });
    expect(byPath(`Notes/${R}/Aria/n1`)).toBeUndefined();
    expect(m.skipped).toBe(2);
  });

  it('notes partagées : auteur de createdBy, destinataires engagés, MJ par défaut', () => {
    expect(byPath(`SharedNotes/${R}/notes/s1`)).toMatchObject({
      ownerUserId: ALICE,
      characterId: ARIA,
      shared: true,
      sharedWith: [BROM],
      imageUrl: 'data:image/png;base64,AAAA',
      race: 'Elfe',
      class: 'Barde',
    });
    expect(byPath(`SharedNotes/${R}/notes/s2`)).toMatchObject({
      ownerUserId: GM,
      sharedWith: null,
    });
    expect(byPath(`SharedNotes/${R}/notes/s3`)).toMatchObject({
      ownerUserId: GM,
      sharedWith: null,
    });
  });

  it('avertissements sans titre ni texte de note', () => {
    expect(m.warnings).toEqual([
      `Notes/${R}/Aria/n1 : déjà lue sous un autre chemin du même auteur, ignorée`,
      `Notes/${R}/MJ/n3 : type « inconnu » non reconnu : other`,
      `Notes/${R}/Personne/n4 : auteur introuvable, ignorée`,
      `SharedNotes/${R}/notes/s1 : 2 destinataire(s) non engagé(s) dans la campagne : retiré(s)`,
      `SharedNotes/${R}/notes/s3 : sans auteur : attribuée au MJ`,
    ]);
    for (const w of m.warnings) {
      expect(w).not.toMatch(/Journal|Secret|Perdue|Contenu|Pour Brom|Partagé/);
    }
  });

  it('identifiants stables d’un import à l’autre', () => {
    const again = transformNotes(R, privateDocs, sharedDocs, mappings);
    expect(again.notes.map((n) => n.id)).toEqual(m.notes.map((n) => n.id));
  });
});
