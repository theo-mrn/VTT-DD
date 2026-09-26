import { describe, expect, it } from 'vitest';
import type { DocFirestore } from './legacy.js';
import { slug } from './legacy.js';
import type { SalleAImporter } from './regroupement.js';
import { systemeSalle, transformerSalle } from './transformer.js';

const doc = <T = Record<string, unknown>>(path: string, data: T): DocFirestore<T> => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

const salle = (extra: Partial<SalleAImporter> = {}, data: Record<string, unknown> = {}) =>
  ({
    code: '123456',
    legacyId: 'Salle/123456',
    doc: doc('Salle/123456', {
      title: 'Les Mines',
      description: 'Une campagne',
      maxPlayers: 5,
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/Salle%2F123456',
      isPublic: true,
      allowCharacterCreation: false,
      creatorId: 'uidMJ',
      bannedUsers: ['uidBanni'],
      gameSystemId: 'dnd-classic',
      ...data,
    }),
    systeme: { gameSystemId: 'dnd-classic' },
    membres: [
      { uid: 'uidMJ', origines: ['createur'], nom: 'MJ' },
      { uid: 'uidA', origines: ['rooms', 'room_id'], persoId: 'p1', nom: 'Aldo' },
      { uid: 'uidB', origines: ['noms'], nom: 'Bea' },
      { uid: 'uidC', origines: ['noms'], nom: 'MJ' },
      { uid: 'uidBanni', origines: ['rooms'] },
    ],
    personnages: [
      doc('cartes/123456/characters/p1', { Nomperso: 'Aldo', type: 'joueurs' }),
      doc('cartes/123456/characters/p2', { Nomperso: 'Bea', type: 'joueurs' }),
      doc('cartes/123456/characters/pnj', { Nomperso: 'Gobelin', type: 'pnj' }),
    ],
    sessions: [
      doc('Salle/123456/sessions/s2', { date: { $timestamp: '2026-11-01T18:00:00.000Z' } }),
      doc('Salle/123456/sessions/s1', { date: { $timestamp: '2026-10-01T18:00:00.000Z' } }),
      doc('Salle/123456/sessions/s3', {}),
    ],
    messages: [
      doc('Salle/123456/chat/m2', {
        uid: 'uidA',
        text: ' Réponse ',
        timestamp: { $timestamp: '2026-09-02T10:00:00.000Z' },
      }),
      doc('Salle/123456/chat/m1', {
        uid: 'uidMJ',
        text: 'Bienvenue',
        timestamp: { $timestamp: '2026-09-01T10:00:00.000Z' },
      }),
      doc('Salle/123456/chat/vide', { uid: 'uidA', text: '' }),
      doc('Salle/123456/chat/long', {
        uid: 'uidB',
        text: 'x'.repeat(1200),
        timestamp: { $timestamp: '2026-09-03T10:00:00.000Z' },
      }),
    ],
    ...extra,
  }) as SalleAImporter;

describe('migration d’une salle', () => {
  it('reprend code, champs de la salle et options', () => {
    const m = transformerSalle(salle());
    expect(m).toMatchObject({
      code: '123456',
      nom: 'Les Mines',
      description: 'Une campagne',
      systemeId: 'dnd-classic',
      maxJoueurs: 5,
      publique: true,
      creationPersonnages: false,
      proprietaireUid: 'uidMJ',
      bannis: ['uidBanni'],
    });
    expect(m.imageUrl).toMatch(/^https:\/\/firebasestorage/);
    expect(m.avertissements).toContain(
      'Image conservée sur Firebase Storage : à recopier avant la fermeture du projet',
    );
  });

  it('rôles : créateur MJ, entré comme MJ co-MJ, les autres joueurs, bannis écartés', () => {
    const m = transformerSalle(salle());
    expect(m.membres.map((x) => [x.uid, x.role])).toEqual([
      ['uidMJ', 'mj'],
      ['uidA', 'joueur'],
      ['uidB', 'joueur'],
      ['uidC', 'mj'],
    ]);
    expect(m.avertissements).toContain('Membre uidC entré comme MJ : importé MJ (co-MJ)');
    expect(m.avertissements).toContain('Membre uidBanni banni : importé comme banni seulement');
  });

  it('personnage incarné par persoId ou par nom ; camps joueurs et adversaires', () => {
    const m = transformerSalle(salle());
    expect(m.membres.find((x) => x.uid === 'uidA')!.incarne).toBe('cartes/123456/characters/p1');
    expect(m.membres.find((x) => x.uid === 'uidB')!.incarne).toBe('cartes/123456/characters/p2');
    expect(m.membres.find((x) => x.uid === 'uidMJ')!.incarne).toBeUndefined();
    expect(m.personnages).toEqual([
      { legacyId: 'cartes/123456/characters/p1', nom: 'Aldo', camp: 'joueurs' },
      { legacyId: 'cartes/123456/characters/p2', nom: 'Bea', camp: 'joueurs' },
      { legacyId: 'cartes/123456/characters/pnj', nom: 'Gobelin', camp: 'adversaires' },
    ]);
  });

  it('un personnage n’est incarné qu’une fois : persoId avant Noms', () => {
    const base = salle();
    const m = transformerSalle({
      ...base,
      membres: [
        { uid: 'uidB', origines: ['noms'], nom: 'Aldo' },
        { uid: 'uidA', origines: ['room_id'], persoId: 'p1' },
      ],
    });
    expect(m.membres.find((x) => x.uid === 'uidA')!.incarne).toBe('cartes/123456/characters/p1');
    expect(m.membres.find((x) => x.uid === 'uidB')!.incarne).toBeUndefined();
    expect(m.avertissements).toContain(
      'cartes/123456/characters/p1 déjà incarné : ignoré pour uidB (Noms)',
    );
  });

  it('sessions et discussion triées par date, textes bornés', () => {
    const m = transformerSalle(salle());
    expect(m.sessions).toEqual([
      { prevueLe: '2026-10-01T18:00:00.000Z' },
      { prevueLe: '2026-11-01T18:00:00.000Z' },
    ]);
    expect(m.avertissements).toContain('Session s3 sans date lisible : ignorée');
    expect(m.messages.map((x) => [x.auteurUid, x.texte.length])).toEqual([
      ['uidMJ', 9],
      ['uidA', 7],
      ['uidB', 1000],
    ]);
    expect(m.avertissements).toContain('1 message(s) tronqué(s) à 1000 caractères');
  });

  it('valeurs hors bornes ou absentes', () => {
    const m = transformerSalle(
      salle({ code: 'abc' }, { title: '', maxPlayers: 80, imageUrl: '', isPublic: 'x' }),
    );
    expect(m).toMatchObject({
      code: null,
      nom: 'Salle abc',
      maxJoueurs: 50,
      imageUrl: null,
      publique: false,
    });
    expect(m.avertissements).toEqual(
      expect.arrayContaining([
        'Code « abc » hors forme : un nouveau code sera tiré',
        'Salle sans titre : nommée « Salle abc »',
        'maxPlayers 80 ramené à 50',
      ]),
    );
    expect(transformerSalle(salle({}, { maxPlayers: undefined })).maxJoueurs).toBe(4);
  });
});

describe('système de la salle', () => {
  const pj = (data: Record<string, unknown>) => doc('cartes/1/characters/p', data);

  it('désigné par la salle', () => {
    expect(systemeSalle({ gameSystemId: 'dnd-classic' }, [])).toEqual({
      id: 'dnd-classic',
      certain: true,
    });
    expect(
      systemeSalle({ gameSystemId: 'x', nomSysteme: "Star Wars : Aux confins de l'Empire" }, []),
    ).toEqual({ id: 'star-wars-eote', certain: true });
    expect(systemeSalle({ gameSystemId: 'y', nomSysteme: 'Les Noobliés' }, [])).toEqual({
      id: 'nooblies',
      certain: true,
    });
  });

  it('à défaut, celui des personnages ; sans système : D&D', () => {
    expect(systemeSalle({}, [pj({ skillRanks: {} }), pj({ career: 'x' })])).toEqual({
      id: 'star-wars-eote',
      certain: true,
    });
    expect(systemeSalle({}, [])).toEqual({ id: 'dnd-classic', certain: true });
    expect(systemeSalle({ gameSystemId: 'custom_1', nomSysteme: 'Mon jeu' }, [])).toEqual({
      id: 'dnd-classic',
      certain: false,
    });
    expect(slug('Élite des Noobliés')).toBe('elite-des-nooblies');
  });
});
