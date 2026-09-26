import { describe, expect, it } from 'vitest';
import type { CampaignToImport } from './grouping.js';
import type { FirestoreDoc } from './legacy.js';
import { slug } from './legacy.js';
import { campaignSystem, transformCampaign } from './transform.js';

const doc = <T = Record<string, unknown>>(path: string, data: T): FirestoreDoc<T> => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

const campaign = (extra: Partial<CampaignToImport> = {}, data: Record<string, unknown> = {}) =>
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
    system: { gameSystemId: 'dnd-classic' },
    members: [
      { uid: 'uidMJ', sources: ['creator'], name: 'MJ' },
      { uid: 'uidA', sources: ['rooms', 'room_id'], persoId: 'p1', name: 'Aldo' },
      { uid: 'uidB', sources: ['names'], name: 'Bea' },
      { uid: 'uidC', sources: ['names'], name: 'MJ' },
      { uid: 'uidBanni', sources: ['rooms'] },
    ],
    characters: [
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
  }) as CampaignToImport;

describe('migration d’une campagne', () => {
  it('reprend code, champs de la campagne et options', () => {
    const m = transformCampaign(campaign());
    expect(m).toMatchObject({
      code: '123456',
      name: 'Les Mines',
      description: 'Une campagne',
      systemId: 'dnd-classic',
      maxPlayers: 5,
      isPublic: true,
      characterCreation: false,
      ownerUid: 'uidMJ',
      bans: ['uidBanni'],
    });
    expect(m.imageUrl).toMatch(/^https:\/\/firebasestorage/);
    expect(m.warnings).toContain(
      'Image conservée sur Firebase Storage : à recopier avant la fermeture du projet',
    );
  });

  it('rôles : créateur seul MJ, entré comme MJ importé joueur, bannis écartés', () => {
    const m = transformCampaign(campaign());
    expect(m.members.map((x) => [x.uid, x.role])).toEqual([
      ['uidMJ', 'gm'],
      ['uidA', 'player'],
      ['uidB', 'player'],
      ['uidC', 'player'],
    ]);
    expect(m.warnings).toContain(
      'Membre uidC entré comme MJ : importé joueur (le créateur peut le promouvoir)',
    );
    expect(m.warnings).toContain('Membre uidBanni banni : importé comme banni seulement');
  });

  it('personnage incarné par persoId ou par nom ; camps joueurs et adversaires', () => {
    const m = transformCampaign(campaign());
    expect(m.members.find((x) => x.uid === 'uidA')!.plays).toBe('cartes/123456/characters/p1');
    expect(m.members.find((x) => x.uid === 'uidB')!.plays).toBe('cartes/123456/characters/p2');
    expect(m.members.find((x) => x.uid === 'uidMJ')!.plays).toBeUndefined();
    expect(m.characters).toEqual([
      { legacyId: 'cartes/123456/characters/p1', name: 'Aldo', side: 'players' },
      { legacyId: 'cartes/123456/characters/p2', name: 'Bea', side: 'players' },
      { legacyId: 'cartes/123456/characters/pnj', name: 'Gobelin', side: 'enemies' },
    ]);
  });

  it('un personnage n’est incarné qu’une fois : persoId avant Noms', () => {
    const base = campaign();
    const m = transformCampaign({
      ...base,
      members: [
        { uid: 'uidB', sources: ['names'], name: 'Aldo' },
        { uid: 'uidA', sources: ['room_id'], persoId: 'p1' },
      ],
    });
    expect(m.members.find((x) => x.uid === 'uidA')!.plays).toBe('cartes/123456/characters/p1');
    expect(m.members.find((x) => x.uid === 'uidB')!.plays).toBeUndefined();
    expect(m.warnings).toContain(
      'cartes/123456/characters/p1 déjà incarné : ignoré pour uidB (Noms)',
    );
  });

  it('sessions et discussion triées par date, textes bornés', () => {
    const m = transformCampaign(campaign());
    expect(m.sessions).toEqual([
      { scheduledAt: '2026-10-01T18:00:00.000Z' },
      { scheduledAt: '2026-11-01T18:00:00.000Z' },
    ]);
    expect(m.warnings).toContain('Session s3 sans date lisible : ignorée');
    expect(m.messages.map((x) => [x.authorUid, x.body.length])).toEqual([
      ['uidMJ', 9],
      ['uidA', 7],
      ['uidB', 1000],
    ]);
    expect(m.warnings).toContain('1 message(s) tronqué(s) à 1000 caractères');
  });

  it('valeurs hors bornes ou absentes', () => {
    const m = transformCampaign(
      campaign({ code: 'abc' }, { title: '', maxPlayers: 80, imageUrl: '', isPublic: 'x' }),
    );
    expect(m).toMatchObject({
      code: null,
      name: 'Campagne abc',
      maxPlayers: 50,
      imageUrl: null,
      isPublic: false,
    });
    expect(m.warnings).toEqual(
      expect.arrayContaining([
        'Code « abc » hors forme : un nouveau code sera tiré',
        'Campagne sans titre : nommée « Campagne abc »',
        'maxPlayers 80 ramené à 50',
      ]),
    );
    expect(transformCampaign(campaign({}, { maxPlayers: undefined })).maxPlayers).toBe(4);
  });
});

describe('système de la campagne', () => {
  const pc = (data: Record<string, unknown>) => doc('cartes/1/characters/p', data);

  it('désigné par la campagne', () => {
    expect(campaignSystem({ gameSystemId: 'dnd-classic' }, [])).toEqual({
      id: 'dnd-classic',
      certain: true,
    });
    expect(
      campaignSystem({ gameSystemId: 'x', systemName: "Star Wars : Aux confins de l'Empire" }, []),
    ).toEqual({ id: 'star-wars-eote', certain: true });
    expect(campaignSystem({ gameSystemId: 'y', systemName: 'Les Noobliés' }, [])).toEqual({
      id: 'nooblies',
      certain: true,
    });
  });

  it('à défaut, celui des personnages ; sans système : D&D', () => {
    expect(campaignSystem({}, [pc({ skillRanks: {} }), pc({ career: 'x' })])).toEqual({
      id: 'star-wars-eote',
      certain: true,
    });
    expect(campaignSystem({}, [])).toEqual({ id: 'dnd-classic', certain: true });
    expect(campaignSystem({ gameSystemId: 'custom_1', systemName: 'Mon jeu' }, [])).toEqual({
      id: 'dnd-classic',
      certain: false,
    });
    expect(slug('Élite des Noobliés')).toBe('elite-des-nooblies');
  });
});
