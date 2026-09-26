import { describe, expect, it } from 'vitest';
import { preparerSalle, type Correspondances } from './chargement.js';
import type { SalleMigree } from './transformer.js';

const P = (id: string) => `cartes/123456/characters/${id}`;

const migree = (extra: Partial<SalleMigree> = {}): SalleMigree => ({
  code: '123456',
  nom: 'Les Mines',
  description: '',
  systemeId: 'dnd-classic',
  imageUrl: null,
  maxJoueurs: 4,
  publique: false,
  creationPersonnages: true,
  proprietaireUid: 'uidMJ',
  membres: [
    { uid: 'uidMJ', role: 'mj' },
    { uid: 'uidA', role: 'joueur', incarne: P('p1') },
    { uid: 'uidB', role: 'joueur', incarne: P('p2') },
    { uid: 'uidSans', role: 'joueur' },
  ],
  bannis: ['uidBanni', 'uidInconnu'],
  personnages: [
    { legacyId: P('p1'), nom: 'Aldo', camp: 'joueurs' },
    { legacyId: P('p2'), nom: 'Bea', camp: 'joueurs' },
    { legacyId: P('pnj'), nom: 'Gobelin', camp: 'adversaires' },
    { legacyId: P('absent'), nom: 'Oublié', camp: 'joueurs' },
    { legacyId: P('sw'), nom: 'Han', camp: 'joueurs' },
  ],
  sessions: [{ prevueLe: '2026-10-01T18:00:00.000Z' }],
  messages: [
    { auteurUid: 'uidA', texte: 'Salut', createdAt: '2026-09-01T10:00:00.000Z' },
    { auteurUid: 'uidSans', texte: 'Coucou', createdAt: '2026-09-01T11:00:00.000Z' },
    { auteurUid: 'uidSans', texte: 'Re', createdAt: '2026-09-01T12:00:00.000Z' },
  ],
  avertissements: [],
  ...extra,
});

const correspondances: Correspondances = {
  comptes: new Map([
    ['uidMJ', 'u-mj'],
    ['uidA', 'u-a'],
    ['uidB', 'u-b'],
    ['uidBanni', 'u-banni'],
  ]),
  personnages: new Map([
    [P('p1'), { id: 'c-p1', ownerId: 'u-a', systemId: 'dnd-classic' }],
    // Personnage de Bea attribué à un autre compte par l'import des personnages
    [P('p2'), { id: 'c-p2', ownerId: 'u-mj', systemId: 'dnd-classic' }],
    [P('pnj'), { id: 'c-pnj', ownerId: 'u-mj', systemId: 'dnd-classic' }],
    [P('sw'), { id: 'c-sw', ownerId: 'u-a', systemId: 'star-wars-eote' }],
  ]),
};

describe('préparation d’une salle (correspondances des identifiants)', () => {
  const r = preparerSalle(migree(), correspondances, '1.0.0');
  if (r.statut !== 'pret') throw new Error('salle non prête');
  const { salle } = r;

  it('traduit membres et bannis, ignore les comptes non migrés', () => {
    expect(salle.salle).toMatchObject({ ownerId: 'u-mj', code: '123456', systemVersion: '1.0.0' });
    expect(salle.membres).toEqual([
      { userId: 'u-mj', role: 'mj' },
      { userId: 'u-a', role: 'joueur' },
      { userId: 'u-b', role: 'joueur' },
    ]);
    expect(salle.bannis).toEqual(['u-banni']);
    expect(r.avertissements).toEqual(
      expect.arrayContaining([
        'Membre uidSans sans compte migré : ignoré',
        'Banni uidInconnu sans compte migré : ignoré',
      ]),
    );
  });

  it('engage les personnages importés du système de la salle, avec leur incarnation', () => {
    expect(salle.personnages).toEqual([
      { characterId: 'c-p1', ownerId: 'u-a', camp: 'joueurs', incarnePar: 'u-a' },
      { characterId: 'c-p2', ownerId: 'u-mj', camp: 'joueurs', incarnePar: null },
      { characterId: 'c-pnj', ownerId: 'u-mj', camp: 'adversaires', incarnePar: null },
    ]);
    expect(r.avertissements).toEqual(
      expect.arrayContaining([
        `Personnage non importé : « Oublié » (${P('absent')})`,
        `Personnage « Han » (${P('sw')}) du système star-wars-eote, salle dnd-classic : non engagé`,
        `${P('p2')} appartient à un autre compte que uidB : non incarné`,
      ]),
    );
  });

  it('sessions au nom du propriétaire, messages des auteurs migrés', () => {
    expect(salle.sessions).toEqual([{ prevueLe: new Date('2026-10-01T18:00:00.000Z') }]);
    expect(salle.messages.map((m) => [m.auteurId, m.texte])).toEqual([['u-a', 'Salut']]);
    expect(r.avertissements).toContain('2 message(s) de uidSans (sans compte migré) ignoré(s)');
  });

  it('créateur sans compte : un autre MJ reprend la salle, sinon elle est ignorée', () => {
    const sansCreateur: Correspondances = {
      ...correspondances,
      comptes: new Map([...correspondances.comptes].filter(([uid]) => uid !== 'uidMJ')),
    };
    const coMj = migree({
      membres: [
        { uid: 'uidMJ', role: 'mj' },
        { uid: 'uidB', role: 'mj' },
      ],
    });
    const relais = preparerSalle(coMj, sansCreateur, '1.0.0');
    expect(relais.statut === 'pret' && relais.salle.salle.ownerId).toBe('u-b');
    expect(preparerSalle(migree(), sansCreateur, '1.0.0').statut).toBe('sans-compte');
  });
});
