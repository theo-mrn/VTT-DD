/**
 * Import des salles en base : écriture complète, rejeu sans doublon, membre
 * sans compte migré, personnage non importé, code déjà pris.
 */
import { uuidv7 } from '@vtt/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import {
  legacyIds,
  outbox,
  roomBans,
  roomCharacters,
  roomMembers,
  roomMessages,
  rooms,
  roomSessions,
} from '../db/schema.js';
import { chargerSalle, preparerSalle, SOURCE_LEGACY, type Correspondances } from './chargement.js';
import type { DocFirestore } from './legacy.js';
import type { SalleAImporter } from './regroupement.js';
import { transformerSalle } from './transformer.js';

const URL = process.env.TEST_DATABASE_URL;

const doc = (path: string, data: Record<string, unknown>): DocFirestore => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

/** Code à 6 chiffres libre (les salles de test sont supprimées ensuite). */
const codeAuHasard = () => String(100000 + Math.floor(Math.random() * 900000));

function salleLegacy(code: string): SalleAImporter {
  const c = (id: string) => `cartes/${code}/characters/${id}`;
  return {
    code,
    legacyId: `Salle/${code}`,
    doc: doc(`Salle/${code}`, {
      title: 'Les Mines de la Moria',
      maxPlayers: 3,
      isPublic: true,
      creatorId: 'uidMJ',
      bannedUsers: ['uidBanni'],
      gameSystemId: 'dnd-classic',
    }) as SalleAImporter['doc'],
    systeme: { gameSystemId: 'dnd-classic' },
    membres: [
      { uid: 'uidMJ', origines: ['createur'], nom: 'MJ' },
      { uid: 'uidA', origines: ['rooms', 'room_id'], persoId: 'p1' },
      { uid: 'uidSansCompte', origines: ['noms'], nom: 'Bea' },
    ],
    personnages: [
      doc(c('p1'), { Nomperso: 'Aldo', type: 'joueurs' }),
      doc(c('pnj'), { Nomperso: 'Gobelin', type: 'pnj' }),
      doc(c('oublie'), { Nomperso: 'Bea', type: 'joueurs' }),
    ],
    sessions: [doc(`Salle/${code}/sessions/s1`, { date: { $timestamp: '2027-01-01T18:00:00Z' } })],
    messages: [
      doc(`Salle/${code}/chat/m2`, {
        uid: 'uidA',
        text: 'Présent !',
        timestamp: { $timestamp: '2026-09-01T10:05:00.000Z' },
      }),
      doc(`Salle/${code}/chat/m1`, {
        uid: 'uidMJ',
        text: 'Bienvenue',
        timestamp: { $timestamp: '2026-09-01T10:00:00.000Z' },
      }),
      doc(`Salle/${code}/chat/m3`, {
        uid: 'uidSansCompte',
        text: 'Perdu',
        timestamp: { $timestamp: '2026-09-01T10:10:00.000Z' },
      }),
    ],
  } as SalleAImporter;
}

describe.skipIf(!URL)('import des salles en base', () => {
  const { db, pool } = createDb(URL ?? '');
  const salles: string[] = [];
  const correlations: string[] = [];
  afterAll(async () => {
    if (salles.length) await db.delete(rooms).where(inArray(rooms.id, salles));
    const evenements = (await db.select().from(outbox)).filter((o) =>
      correlations.includes((o.envelope as { correlationId?: string }).correlationId ?? ''),
    );
    if (evenements.length)
      await db.delete(outbox).where(
        inArray(
          outbox.id,
          evenements.map((o) => o.id),
        ),
      );
    await pool.end();
  });

  const comptes = { mj: uuidv7(), a: uuidv7(), banni: uuidv7() };
  const persos = { p1: uuidv7(), pnj: uuidv7() };
  const correspondances = (code: string): Correspondances => ({
    comptes: new Map([
      ['uidMJ', comptes.mj],
      ['uidA', comptes.a],
      ['uidBanni', comptes.banni],
    ]),
    personnages: new Map([
      [
        `cartes/${code}/characters/p1`,
        { id: persos.p1, ownerId: comptes.a, systemId: 'dnd-classic' },
      ],
      [
        `cartes/${code}/characters/pnj`,
        { id: persos.pnj, ownerId: comptes.mj, systemId: 'dnd-classic' },
      ],
    ]),
  });

  function preparer(code: string) {
    const prep = preparerSalle(transformerSalle(salleLegacy(code)), correspondances(code), '1.0.0');
    if (prep.statut !== 'pret') throw new Error('salle non prête');
    return prep;
  }

  it('écrit la salle, ses membres, personnages, sessions, messages et son événement', async () => {
    const code = codeAuHasard();
    const prep = preparer(code);
    // Membre sans compte migré, personnage non importé : écartés avec un avertissement
    expect(prep.avertissements).toEqual(
      expect.arrayContaining([
        'Membre uidSansCompte sans compte migré : ignoré',
        `Personnage non importé : « Bea » (cartes/${code}/characters/oublie)`,
        '1 message(s) de uidSansCompte (sans compte migré) ignoré(s)',
      ]),
    );
    const correlation = uuidv7();
    correlations.push(correlation);
    const r = await chargerSalle(db, prep.salle, `Salle/${code}`, correlation);
    expect(r).toMatchObject({ statut: 'importe', code, avertissements: [] });
    salles.push(r.id);

    const [salle] = await db.select().from(rooms).where(eq(rooms.id, r.id));
    expect(salle).toMatchObject({
      nom: 'Les Mines de la Moria',
      code,
      ownerId: comptes.mj,
      systemId: 'dnd-classic',
      maxJoueurs: 3,
      publique: true,
      creationPersonnages: true,
    });
    const membres = await db.select().from(roomMembers).where(eq(roomMembers.roomId, r.id));
    expect(membres.map((m) => [m.userId, m.role]).sort()).toEqual(
      [
        [comptes.mj, 'mj'],
        [comptes.a, 'joueur'],
      ].sort(),
    );
    const bannis = await db.select().from(roomBans).where(eq(roomBans.roomId, r.id));
    expect(bannis).toMatchObject([{ userId: comptes.banni, banniPar: comptes.mj }]);
    const personnages = await db
      .select()
      .from(roomCharacters)
      .where(eq(roomCharacters.roomId, r.id));
    expect(personnages.map((p) => [p.characterId, p.camp, p.incarnePar]).sort()).toEqual(
      [
        [persos.p1, 'joueurs', comptes.a],
        [persos.pnj, 'adversaires', null],
      ].sort(),
    );
    const sessions = await db.select().from(roomSessions).where(eq(roomSessions.roomId, r.id));
    expect(sessions).toMatchObject([
      { prevueLe: new Date('2027-01-01T18:00:00Z'), creePar: comptes.mj },
    ]);
    const messages = await db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.roomId, r.id))
      .orderBy(roomMessages.id);
    expect(messages.map((m) => [m.texte, m.createdAt.toISOString()])).toEqual([
      ['Bienvenue', '2026-09-01T10:00:00.000Z'],
      ['Présent !', '2026-09-01T10:05:00.000Z'],
    ]);
    const [lien] = await db.select().from(legacyIds).where(eq(legacyIds.roomId, r.id));
    expect(lien).toMatchObject({ source: SOURCE_LEGACY, legacyId: `Salle/${code}` });
    const evenements = (await db.select().from(outbox)).filter(
      (o) => (o.envelope as { correlationId?: string }).correlationId === correlation,
    );
    expect(evenements.map((o) => o.envelope)).toMatchObject([
      {
        type: 'room.created',
        roomId: r.id,
        actor: { userId: null, role: 'system' },
        payload: { code, importe: true },
      },
    ]);

    // Rejeu : rien n'est réécrit
    const second = await chargerSalle(db, preparer(code).salle, `Salle/${code}`, uuidv7());
    expect(second).toEqual({ statut: 'deja-importe', id: r.id });
    expect(await db.select().from(rooms).where(eq(rooms.code, code))).toHaveLength(1);
    expect(await db.select().from(roomMessages).where(eq(roomMessages.roomId, r.id))).toHaveLength(
      2,
    );
  });

  it('code déjà pris par une autre salle : un nouveau code est tiré', async () => {
    const code = codeAuHasard();
    const occupante = uuidv7();
    await db.insert(rooms).values({
      id: occupante,
      nom: 'Déjà là',
      systemId: 'dnd-classic',
      systemVersion: '1.0.0',
      ownerId: uuidv7(),
      code,
    });
    salles.push(occupante);
    const correlation = uuidv7();
    correlations.push(correlation);
    const r = await chargerSalle(db, preparer(code).salle, `Salle/${code}`, correlation);
    if (r.statut !== 'importe') throw new Error('salle non importée');
    salles.push(r.id);
    expect(r.code).not.toBe(code);
    expect(r.avertissements).toEqual([`Code ${code} déjà pris : nouveau code ${r.code}`]);
  });
});
