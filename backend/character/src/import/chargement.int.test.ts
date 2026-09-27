import { uuidv7 } from '@vtt/contracts';
import { systeme } from '@vtt/systemes';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import { characters, legacyIds, legacyItems, outbox } from '../db/schema.js';
import { chargerPersonnage, SOURCE_LEGACY } from './chargement.js';
import { reprendrePersonnage } from './reprise.js';
import { transformerPersonnage } from './transformer.js';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('import des personnages en base', () => {
  const { db, pool } = createDb(URL ?? '');
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(characters).where(inArray(characters.id, ids));
    await pool.end();
  });

  it('écrit le personnage, son lien legacy et son événement ; un second import l’ignore', async () => {
    const legacyId = `cartes/salleTest/characters/${uuidv7()}`;
    const migre = transformerPersonnage(
      {
        path: legacyId,
        id: legacyId.split('/').at(-1)!,
        data: {
          Nomperso: 'Brom',
          type: 'joueurs',
          Race: 'nain',
          Profile: 'guerrier',
          niveau: 3,
          FOR: 14,
          DEX: 9,
          CON: 16,
          SAG: 12,
          INT: 10,
          CHA: 8,
          PV_Max: 21,
          PV: 15,
        },
      },
      { systemeId: 'dnd-classic', systemes: { 'dnd-classic': systeme('dnd-classic') } },
    );
    const owner = uuidv7();
    const correlation = uuidv7();
    const premier = await chargerPersonnage(db, migre, legacyId, owner, correlation, 'pc');
    expect(premier.statut).toBe('importe');
    ids.push(premier.id);

    const [ligne] = await db.select().from(characters).where(eq(characters.id, premier.id));
    expect(ligne).toMatchObject({
      ownerId: owner,
      nom: 'Brom',
      systemId: 'dnd-classic',
      version: 1,
    });
    const [lien] = await db.select().from(legacyIds).where(eq(legacyIds.legacyId, legacyId));
    expect(lien).toMatchObject({ source: SOURCE_LEGACY, characterId: premier.id });
    const evenements = (await db.select().from(outbox)).filter(
      (o) => (o.envelope as { correlationId?: string }).correlationId === correlation,
    );
    expect(evenements.map((o) => (o.envelope as { type: string }).type)).toEqual([
      'character.created',
    ]);
    await db.delete(outbox).where(
      inArray(
        outbox.id,
        evenements.map((o) => o.id),
      ),
    );

    const second = await chargerPersonnage(db, migre, legacyId, owner, uuidv7(), 'pc');
    expect(second).toEqual({ statut: 'deja-importe', id: premier.id });
  });

  it('trace les objets repris ; la reprise d’un personnage importé ne les duplique pas', async () => {
    const legacyId = `cartes/salleTest/characters/${uuidv7()}`;
    const dnd = systeme('dnd-classic');
    const objet = (id: string, message: string, category: string, quantity = 1) => ({
      path: `Inventaire/salleTest/Brom/${id}`,
      id,
      data: { message, category, quantity },
    });
    const migre = transformerPersonnage(
      {
        path: legacyId,
        id: legacyId.split('/').at(-1)!,
        data: { Nomperso: 'Brom', Race: 'nain', Profile: 'guerrier', niveau: 1 },
      },
      {
        systemeId: 'dnd-classic',
        systemes: { 'dnd-classic': dnd },
        inventaire: [
          objet('a', 'Pain', 'nourriture', 3),
          objet('b', 'Cuillère tordue', 'autre'),
          objet('c', "pièce d'OR", 'bourse', 4),
        ],
      },
    );
    const r = await chargerPersonnage(db, migre, legacyId, uuidv7(), uuidv7(), 'pc');
    ids.push(r.id);
    const traces = await db.select().from(legacyItems).where(eq(legacyItems.characterId, r.id));
    expect(traces.map((t) => t.legacyId).sort()).toEqual(
      ['a', 'b', 'c'].map((x) => `Inventaire/salleTest/Brom/${x}`),
    );
    // Rejouée : tout est déjà repris, rien ne change
    const reprise = await reprendrePersonnage(db, r.id, dnd, migre.objets, uuidv7(), true);
    expect(reprise.statut).toBe('inchange');
    expect(reprise.bilan).toMatchObject({ ajoutes: 0, dejaRepris: 3 });
    const [ligne] = await db.select().from(characters).where(eq(characters.id, r.id));
    expect(ligne!.version).toBe(1);
    expect(
      ligne!.etat.possessions
        .filter((p) => ['pain', 'objet-libre', 'piece-d-or'].includes(p.entree))
        .map((p) => [p.entree, p.quantite ?? 1]),
    ).toEqual([
      ['pain', 3],
      ['objet-libre', 1],
      ['piece-d-or', 4],
    ]);
  });
});
