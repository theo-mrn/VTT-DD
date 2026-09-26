import { describe, expect, it } from 'vitest';
import type { DocFirestore } from './legacy.js';
import { regrouperSalles, type ExportsSalles } from './regroupement.js';

const doc = (path: string, data: Record<string, unknown> = {}): DocFirestore => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

const exports = (): ExportsSalles => ({
  salles: [
    doc('Salle/123456', { title: 'Les Mines', creatorId: 'uidMJ', gameSystemId: 'gs1' }),
    doc('Salle/123456/sessions/s1', { date: { $timestamp: '2026-10-01T18:00:00.000Z' } }),
    doc('Salle/123456/chat/m1', { uid: 'uidA', text: 'Salut' }),
    doc('Salle/123456/groupEntities/g1', { name: 'Groupe' }),
    doc('Salle/654321', { title: 'Vide' }),
  ],
  noms: [
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
  cartes: [
    doc('cartes/123456/characters/p1', { Nomperso: 'Aldo', type: 'joueurs' }),
    doc('cartes/123456/characters/pnj', { Nomperso: 'Gobelin', type: 'pnj' }),
    doc('cartes/123456/characters/p1/customCompetences/c1', { name: 'Pêche' }),
    doc('cartes/123456/fog/f1', { x: 1 }),
    doc('cartes/777777/characters/x', { Nomperso: 'Perdu' }),
  ],
  systemes: [
    doc('gameSystems/gs1', { name: 'Star Wars EotE' }),
    doc('gameSystems/gs1/content/x', { kind: 'location' }),
  ],
});

describe('regroupement des exports par salle', () => {
  const { salles, orphelines } = regrouperSalles(exports());
  const salle = (code: string) => salles.find((s) => s.code === code)!;

  it('trouve chaque salle, et les codes sans salle', () => {
    expect(salles.map((s) => s.legacyId)).toEqual(['Salle/123456', 'Salle/654321']);
    expect(orphelines).toEqual(['777777', '888888', '999999']);
  });

  it('réunit les membres de toutes les sources, le créateur d’abord', () => {
    const s = salle('123456');
    expect(s.membres).toEqual([
      { uid: 'uidMJ', origines: ['createur', 'noms'], nom: 'MJ' },
      { uid: 'uidA', origines: ['rooms', 'room_id', 'noms'], persoId: 'p1', nom: 'Aldo' },
      { uid: 'uidD', origines: ['rooms'] },
      // Pas de Noms : users/{uid}.perso de la salle active
      { uid: 'uidB', origines: ['room_id'], nom: 'MJ' },
    ]);
    expect(salle('654321').membres).toEqual([
      { uid: 'uidC', origines: ['room_id'], persoId: 'p9' },
    ]);
  });

  it('rattache personnages, sessions, discussion et système', () => {
    const s = salle('123456');
    expect(s.personnages.map((p) => p.id)).toEqual(['p1', 'pnj']);
    expect(s.sessions.map((d) => d.id)).toEqual(['s1']);
    expect(s.messages.map((d) => d.id)).toEqual(['m1']);
    expect(s.systeme).toEqual({ gameSystemId: 'gs1', nomSysteme: 'Star Wars EotE' });
    expect(salle('654321').systeme).toEqual({});
  });
});
