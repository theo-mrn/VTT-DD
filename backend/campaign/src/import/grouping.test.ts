import { describe, expect, it } from 'vitest';
import { groupCampaigns, type CampaignExports } from './grouping.js';
import type { FirestoreDoc } from './legacy.js';

const doc = (path: string, data: Record<string, unknown> = {}): FirestoreDoc => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

const exports = (): CampaignExports => ({
  campaigns: [
    doc('Salle/123456', { title: 'Les Mines', creatorId: 'uidMJ', gameSystemId: 'gs1' }),
    doc('Salle/123456/sessions/s1', { date: { $timestamp: '2026-10-01T18:00:00.000Z' } }),
    doc('Salle/123456/chat/m1', { uid: 'uidA', text: 'Salut' }),
    doc('Salle/123456/groupEntities/g1', { name: 'Groupe' }),
    doc('Salle/654321', { title: 'Vide' }),
  ],
  names: [
    doc('salles/123456/Noms/uidA', { nom: 'Aldo' }),
    doc('salles/123456/Noms/uidMJ', { nom: 'MJ' }),
    doc('salles/999999/Noms/uidZ', { nom: 'Zed' }),
  ],
  users: [
    doc('users/uidA', { room_id: '123456', persoId: 'p1', perso: 'Aldo' }),
    doc('users/uidB', { room_id: '123456', perso: 'MJ' }),
    doc('users/uidC', { room_id: '654321', persoId: 'p9' }),
    doc('users/uidA/rooms/123456', { id: '123456' }),
    doc('users/uidD/rooms/123456', { id: '123456' }),
    doc('users/uidD/rooms/888888', { id: '888888' }),
    doc('users/uidD/characters/c1', { Nomperso: 'Copie' }),
  ],
  maps: [
    doc('cartes/123456/characters/p1', { Nomperso: 'Aldo', type: 'joueurs' }),
    doc('cartes/123456/characters/pnj', { Nomperso: 'Gobelin', type: 'pnj' }),
    doc('cartes/123456/characters/p1/customCompetences/c1', { name: 'Pêche' }),
    doc('cartes/123456/fog/f1', { x: 1 }),
    doc('cartes/777777/characters/x', { Nomperso: 'Perdu' }),
  ],
  systems: [
    doc('gameSystems/gs1', { name: 'Star Wars EotE' }),
    doc('gameSystems/gs1/content/x', { kind: 'location' }),
  ],
});

describe('regroupement des exports par campagne', () => {
  const { campaigns, orphans } = groupCampaigns(exports());
  const campaign = (code: string) => campaigns.find((c) => c.code === code)!;

  it('trouve chaque campagne, et les codes sans campagne', () => {
    expect(campaigns.map((c) => c.legacyId)).toEqual(['Salle/123456', 'Salle/654321']);
    expect(orphans).toEqual(['777777', '888888', '999999']);
  });

  it('réunit les membres de toutes les sources, le créateur d’abord', () => {
    const c = campaign('123456');
    expect(c.members).toEqual([
      { uid: 'uidMJ', sources: ['creator', 'names'], name: 'MJ' },
      { uid: 'uidA', sources: ['rooms', 'room_id', 'names'], persoId: 'p1', name: 'Aldo' },
      { uid: 'uidD', sources: ['rooms'] },
      // Pas de Noms : users/{uid}.perso de la campagne active
      { uid: 'uidB', sources: ['room_id'], name: 'MJ' },
    ]);
    expect(campaign('654321').members).toEqual([
      { uid: 'uidC', sources: ['room_id'], persoId: 'p9' },
    ]);
  });

  it('rattache personnages, sessions, discussion et système', () => {
    const c = campaign('123456');
    expect(c.characters.map((p) => p.id)).toEqual(['p1', 'pnj']);
    expect(c.sessions.map((d) => d.id)).toEqual(['s1']);
    expect(c.messages.map((d) => d.id)).toEqual(['m1']);
    expect(c.system).toEqual({ gameSystemId: 'gs1', systemName: 'Star Wars EotE' });
    expect(campaign('654321').system).toEqual({});
  });
});
