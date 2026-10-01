/**
 * Purge définitive : ce qui a passé TRASH_DAYS jours dans la corbeille part (ligne, événement,
 * dossier du stockage), les instances de PNJ supprimées tout de suite ; le reste ne bouge pas.
 */
import { memoryObjectStore } from '@vtt/platform';
import { inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters, npcTemplates, objectTemplates, outbox } from '../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../test/app-de-test.js';
import { outils, type Utilisateur } from '../test/outils.js';
import { purge } from './purge.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

describe.skipIf(!TEST_DATABASE_URL)('purge définitive', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let alice: Utilisateur;
  const campagne = crypto.randomUUID();

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    alice = await t.utilisateur();
  });

  afterEach(async () => {
    await t.db!.delete(npcTemplates).where(sql`${npcTemplates.campaignId} = ${campagne}`);
    await t.db!.delete(objectTemplates).where(sql`${objectTemplates.campaignId} = ${campagne}`);
    await t.fermer();
  });

  const creer = async (nom: string) =>
    (
      await o.ok(alice, 'POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom,
      })
    ).id;
  const supprimer = (id: string, jours: number, kind: 'pc' | 'npc' = 'pc') =>
    t
      .db!.update(characters)
      .set({ kind, deletedAt: sql`now() - make_interval(days => ${jours})` })
      .where(inArray(characters.id, [id]));
  const restants = async (ids: string[]) =>
    (await t.db!.select({ id: characters.id }).from(characters).where(inArray(characters.id, ids)))
      .map((r) => r.id)
      .sort();
  const purges = async (ids: string[]) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->>'type' LIKE '%.purged' AND ${outbox.envelope}->'aggregate'->>'id' IN (${sql.join(
            ids.map((i) => sql`${i}`),
            sql`, `,
          )})`,
        )
    ).map((e) => (e.envelope as { aggregate: { id: string } }).aggregate.id);

  it('personnages : expirés et instances de PNJ purgés avec leur dossier, le reste gardé', async () => {
    const [vieux, recent, vivant, pnj] = await Promise.all(
      ['Vieux', 'Récent', 'Vivant', 'Gobelin 1'].map(creer),
    );
    await supprimer(vieux!, 8);
    await supprimer(recent!, 2);
    await supprimer(pnj!, 0, 'npc');
    const { store, objects } = memoryObjectStore({
      [`characters/${vieux}/a.webp`]: new Date(),
      [`characters/${vieux}/b.webp`]: new Date(),
      [`characters/${recent}/c.webp`]: new Date(),
      [`characters/${vivant}/d.webp`]: new Date(),
    });
    const tous = [vieux!, recent!, vivant!, pnj!];

    // Essai : rien ne bouge
    await purge({ db: t.db!, store, ctx: { correlationId: crypto.randomUUID() }, dryRun: true });
    expect(await restants(tous)).toEqual([...tous].sort());

    const report = await purge({ db: t.db!, store, ctx: { correlationId: crypto.randomUUID() } });
    expect(report.characters).toBeGreaterThanOrEqual(2);
    expect(await restants(tous)).toEqual([recent!, vivant!].sort());
    expect((await purges(tous)).sort()).toEqual([vieux!, pnj!].sort());
    expect([...objects.keys()].sort()).toEqual(
      [`characters/${recent}/c.webp`, `characters/${vivant}/d.webp`].sort(),
    );

    // Rejouée : plus rien pour eux
    await purge({ db: t.db!, store, ctx: { correlationId: crypto.randomUUID() } });
    expect(await purges(tous)).toHaveLength(2);
    await t.db!.delete(outbox).where(
      sql`${outbox.envelope}->'aggregate'->>'id' IN (${sql.join(
        tous.map((i) => sql`${i}`),
        sql`, `,
      )})`,
    );
  });

  it('modèles : purgés après TRASH_DAYS jours seulement', async () => {
    const modele = (name: string, jours: number | null) => ({
      id: crypto.randomUUID(),
      campaignId: campagne,
      name,
      deletedAt: jours === null ? null : sql`now() - make_interval(days => ${jours})`,
    });
    const npcs = [modele('Orque', 8), modele('Gobelin', 3), modele('Loup', null)];
    await t.db!.insert(npcTemplates).values(
      npcs.map((n) => ({
        ...n,
        systemId: 'dnd-classic',
        systemVersion: '1',
        type: 'personnage',
        etat: {},
      })) as never,
    );
    const objets = [modele('Coffre', 9), modele('Tonneau', 1)];
    await t.db!.insert(objectTemplates).values(objets as never);

    await purge({ db: t.db!, store: undefined, ctx: { correlationId: crypto.randomUUID() } });
    const npcIds = (
      await t
        .db!.select({ name: npcTemplates.name })
        .from(npcTemplates)
        .where(sql`${npcTemplates.campaignId} = ${campagne}`)
    )
      .map((r) => r.name)
      .sort();
    const objIds = (
      await t
        .db!.select({ name: objectTemplates.name })
        .from(objectTemplates)
        .where(sql`${objectTemplates.campaignId} = ${campagne}`)
    ).map((r) => r.name);
    expect(npcIds).toEqual(['Gobelin', 'Loup']);
    expect(objIds).toEqual(['Tonneau']);
    const ids = [npcs[0]!.id, objets[0]!.id];
    expect((await purges(ids)).sort()).toEqual([...ids].sort());
    await t.db!.delete(outbox).where(sql`${outbox.envelope}->>'roomId' = ${campagne}`);
  });
});
