import { describe, expect, it } from 'vitest';
import type { DocFirestore } from './legacy.js';
import { regrouperPersonnages, type Exports } from './regroupement.js';

const doc = (path: string, data: Record<string, unknown>): DocFirestore => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

const exports = (): Exports => ({
  cartes: [
    doc('cartes/salle1/characters/p1', { Nomperso: 'Aldo', type: 'joueurs' }),
    doc('cartes/salle1/characters/p2', { Nomperso: 'Bea', type: 'joueurs' }),
    doc('cartes/salle1/characters/pnj', { Nomperso: 'Gobelin', type: 'pnj' }),
    doc('cartes/salle1/characters/p1/customCompetences/c1', { name: 'Pêche' }),
    doc('cartes/salle1/fog/f1', { x: 1 }),
  ],
  users: [
    doc('users/uidA', { persoId: 'p1', room_id: 'salle1' }),
    doc('users/uidB', {}),
    doc('users/uidB/characters/copieBea', { Nomperso: 'Bea' }),
    doc('users/uidC/characters/orphelin', { Nomperso: 'Zed' }),
  ],
  salles: [
    doc('Salle/salle1', { creatorId: 'uidMJ', gameSystemId: 'gs1' }),
    doc('Salle/salle1/gameSystemOverrides/gs1/content/s2', {
      kind: 'specialization',
      name: 'Assassin',
    }),
  ],
  systemes: [
    doc('gameSystems/gs1', {
      name: 'Star Wars EotE',
      stats: [{ key: 'PV', recoversToZero: true }],
    }),
    doc('gameSystems/gs1/content/s1', { kind: 'specialization', name: 'Pilote' }),
    doc('gameSystems/gs1/content/x', { kind: 'location', name: 'Tatooine' }),
  ],
  inventaire: [
    doc('Inventaire/salle1/Aldo/o1', { message: 'Blaster' }),
    doc('Inventaire/salle1/Bea/o2', { message: 'Corde' }),
  ],
  bonus: [doc('Bonus/salle1/Aldo/b1', { active: true })],
});

describe('regroupement des exports par personnage', () => {
  const r = regrouperPersonnages(exports());
  const par = (id: string) => r.find((x) => x.legacyId.endsWith(id))!;

  it('trouve chaque personnage de salle et les copies orphelines', () => {
    expect(r.map((x) => x.legacyId)).toEqual([
      'cartes/salle1/characters/p1',
      'cartes/salle1/characters/p2',
      'cartes/salle1/characters/pnj',
      'users/uidC/characters/orphelin',
    ]);
  });

  it('désigne le propriétaire : persoId, copie, créateur de la salle, compte', () => {
    expect([par('p1').ownerUid, par('p1').origineProprietaire]).toEqual(['uidA', 'persoId']);
    expect([par('p2').ownerUid, par('p2').origineProprietaire]).toEqual(['uidB', 'copie']);
    expect([par('pnj').ownerUid, par('pnj').origineProprietaire]).toEqual([
      'uidMJ',
      'createur-salle',
    ]);
    expect([par('orphelin').ownerUid, par('orphelin').origineProprietaire]).toEqual([
      'uidC',
      'compte',
    ]);
  });

  it('rattache inventaire, bonus, compétences, spécialisations et système de la salle', () => {
    const a = par('p1');
    expect(a.options.inventaire!.map((d) => d.id)).toEqual(['o1']);
    expect(a.options.bonus!.map((d) => d.id)).toEqual(['b1']);
    expect(a.options.competencesPersonnalisees!.map((d) => d.id)).toEqual(['c1']);
    expect(Object.keys(a.options.specialisations!).sort()).toEqual(['s1', 's2']);
    expect(a.options.statsSalle).toEqual([{ key: 'PV', recoversToZero: true }]);
    expect(a.salle).toEqual({ gameSystemId: 'gs1', nomSysteme: 'Star Wars EotE' });
    expect(par('p2').options.inventaire!.map((d) => d.id)).toEqual(['o2']);
  });

  it('la liste des membres de la salle désigne le joueur du personnage', () => {
    const e = exports();
    e.cartes = [
      ...e.cartes,
      doc('cartes/salle1/characters/p9', { Nomperso: 'Zora', type: 'joueurs' }),
    ];
    e.noms = [
      doc('salles/salle1/Noms/uidZ', { nom: 'Zora' }),
      doc('salles/salle1/Noms/uidMJ', { nom: 'MJ' }),
    ];
    const zora = regrouperPersonnages(e).find((x) => x.legacyId.endsWith('p9'))!;
    expect([zora.ownerUid, zora.origineProprietaire]).toEqual(['uidZ', 'noms']);
  });
});
