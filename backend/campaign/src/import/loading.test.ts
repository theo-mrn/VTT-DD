import { describe, expect, it } from 'vitest';
import { prepareCampaign, type Mappings } from './loading.js';
import type { MigratedCampaign } from './transform.js';

const P = (id: string) => `cartes/123456/characters/${id}`;

const migrated = (extra: Partial<MigratedCampaign> = {}): MigratedCampaign => ({
  code: '123456',
  name: 'Les Mines',
  description: '',
  systemId: 'dnd-classic',
  imageUrl: null,
  isPublic: false,
  characterCreation: true,
  ownerUid: 'uidMJ',
  members: [
    { uid: 'uidMJ', role: 'gm' },
    { uid: 'uidA', role: 'player', plays: P('p1') },
    { uid: 'uidB', role: 'player', plays: P('p2') },
    { uid: 'uidSans', role: 'player' },
  ],
  bans: ['uidBanni', 'uidInconnu'],
  characters: [
    { legacyId: P('p1'), name: 'Aldo', side: 'players' },
    { legacyId: P('p2'), name: 'Bea', side: 'players' },
    { legacyId: P('pnj'), name: 'Gobelin', side: 'enemies' },
    { legacyId: P('absent'), name: 'Oublié', side: 'players' },
    { legacyId: P('sw'), name: 'Han', side: 'players' },
  ],
  sessions: [{ scheduledAt: '2026-10-01T18:00:00.000Z' }],
  messages: [
    { authorUid: 'uidA', body: 'Salut', createdAt: '2026-09-01T10:00:00.000Z' },
    { authorUid: 'uidSans', body: 'Coucou', createdAt: '2026-09-01T11:00:00.000Z' },
    { authorUid: 'uidSans', body: 'Re', createdAt: '2026-09-01T12:00:00.000Z' },
  ],
  warnings: [],
  ...extra,
});

const mappings: Mappings = {
  accounts: new Map([
    ['uidMJ', 'u-mj'],
    ['uidA', 'u-a'],
    ['uidB', 'u-b'],
    ['uidBanni', 'u-banni'],
  ]),
  characters: new Map([
    [P('p1'), { id: 'c-p1', ownerId: 'u-a', systemId: 'dnd-classic' }],
    // Personnage de Bea attribué à un autre compte par l'import des personnages
    [P('p2'), { id: 'c-p2', ownerId: 'u-mj', systemId: 'dnd-classic' }],
    [P('pnj'), { id: 'c-pnj', ownerId: 'u-mj', systemId: 'dnd-classic' }],
    [P('sw'), { id: 'c-sw', ownerId: 'u-a', systemId: 'star-wars-eote' }],
  ]),
};

describe('préparation d’une campagne (correspondances des identifiants)', () => {
  const r = prepareCampaign(migrated(), mappings, '1.0.0');
  if (r.status !== 'ready') throw new Error('campagne non prête');
  const { campaign } = r;

  it('traduit membres et bannis, ignore les comptes non migrés', () => {
    expect(campaign.campaign).toMatchObject({
      ownerId: 'u-mj',
      code: '123456',
      systemVersion: '1.0.0',
    });
    expect(campaign.members).toEqual([
      { userId: 'u-mj', role: 'gm' },
      { userId: 'u-a', role: 'player' },
      { userId: 'u-b', role: 'player' },
    ]);
    expect(campaign.bans).toEqual(['u-banni']);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        'Membre uidSans sans compte migré : ignoré',
        'Banni uidInconnu sans compte migré : ignoré',
      ]),
    );
  });

  it('engage les personnages importés du système de la campagne, avec leur incarnation', () => {
    expect(campaign.characters).toEqual([
      { characterId: 'c-p1', ownerId: 'u-a', side: 'players', playedBy: 'u-a' },
      { characterId: 'c-p2', ownerId: 'u-mj', side: 'players', playedBy: null },
      { characterId: 'c-pnj', ownerId: 'u-mj', side: 'enemies', playedBy: null },
    ]);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        `Personnage non importé : « Oublié » (${P('absent')})`,
        `Personnage « Han » (${P('sw')}) du système star-wars-eote, campagne dnd-classic : non engagé`,
        `${P('p2')} appartient à un autre compte que uidB : non incarné`,
      ]),
    );
  });

  it('sessions au nom du propriétaire, messages des auteurs migrés', () => {
    expect(campaign.sessions).toEqual([{ scheduledAt: new Date('2026-10-01T18:00:00.000Z') }]);
    expect(campaign.messages.map((m) => [m.authorId, m.body])).toEqual([['u-a', 'Salut']]);
    expect(r.warnings).toContain('2 message(s) de uidSans (sans compte migré) ignoré(s)');
  });

  it('créateur sans compte : un autre MJ reprend la campagne, sinon elle est ignorée', () => {
    const withoutCreator: Mappings = {
      ...mappings,
      accounts: new Map([...mappings.accounts].filter(([uid]) => uid !== 'uidMJ')),
    };
    const coGm = migrated({
      members: [
        { uid: 'uidMJ', role: 'gm' },
        { uid: 'uidB', role: 'gm' },
      ],
    });
    const fallback = prepareCampaign(coGm, withoutCreator, '1.0.0');
    expect(fallback.status === 'ready' && fallback.campaign.campaign.ownerId).toBe('u-b');
    expect(prepareCampaign(migrated(), withoutCreator, '1.0.0').status).toBe('no-account');
  });
});
