/**
 * Droits sur les personnages des autres, décidés par les salles de campaign
 * (simulées ici) : lecture pour les membres de la salle, écriture pour son
 * MJ, suppression réservée au propriétaire, 404 pour les étrangers.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

describe.skipIf(!TEST_DATABASE_URL)('droits des salles sur les personnages', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let proprietaire: Utilisateur;
  let mj: Utilisateur;
  let joueur: Utilisateur;
  let etranger: Utilisateur;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({}, { droits: salles.droits });
    o = outils(t);
    [proprietaire, mj, joueur, etranger] = await Promise.all([
      t.utilisateur(),
      t.utilisateur(),
      t.utilisateur(),
      t.utilisateur(),
    ]);
  });

  afterEach(async () => {
    await t.fermer();
  });

  /** Personnage du propriétaire engagé dans une salle (MJ : mj, joueur : joueur). */
  async function engage() {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    salles.accorder(p.id, mj.id, { lecture: true, ecriture: true });
    salles.accorder(p.id, joueur.id, { lecture: true, ecriture: false });
    return p;
  }

  it('un joueur de la salle lit la fiche mais ne la modifie pas', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    expect(await o.ok(joueur, 'GET', u)).toMatchObject({ id: p.id, nom: 'Thorin' });
    expect((await o.requete(joueur, 'GET', `${u}/creation`)).statusCode).toBe(200);
    expect((await o.requete(joueur, 'GET', `${u}/achats`)).statusCode).toBe(200);
    for (const [method, url, payload] of [
      ['PATCH', u, { version: p.version, nom: 'Volé' }],
      ['PUT', `${u}/valeurs`, { version: p.version, valeurs: { PV: 1 } }],
      ['POST', `${u}/repos`, { version: p.version }],
      ['POST', `${u}/actions/initiative`, {}],
      ['DELETE', u, undefined],
    ] as const) {
      const res = await o.requete(joueur, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    // Sa liste ne contient que ses propres personnages
    expect((await o.requete(joueur, 'GET', '/v1/characters')).json()).toEqual([]);
  });

  it('le MJ de la salle modifie et fait agir le personnage, sans pouvoir le supprimer', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    const renomme = await o.ok(mj, 'PATCH', u, { version: p.version, nom: 'Thorin II' });
    expect(renomme).toMatchObject({ nom: 'Thorin II', ownerId: proprietaire.id });

    t.des.imposer(15);
    const jet = await o.requete(mj, 'POST', `${u}/actions/initiative`, {});
    expect(jet.statusCode).toBe(200);
    expect((jet.json() as { cles: number[] }).cles).toHaveLength(1);

    expect((await o.requete(mj, 'DELETE', u)).statusCode).toBe(403);
    expect(await o.ok(proprietaire, 'GET', u)).toMatchObject({ nom: 'Thorin II' });

    // L'événement garde la trace du MJ (rôle gm), pas du propriétaire
    const [evenement] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id} and ${outbox.envelope}->'payload'->>'operation' = 'profil'`,
      );
    expect(evenement!.envelope).toMatchObject({
      actor: { userId: mj.id, role: 'gm', characterId: p.id },
    });
  });

  it('le MJ applique une attaque de son PNJ au personnage d’un joueur ; le joueur ne le peut pas', async () => {
    const p = await engage();
    const pnj = await o.nainGuerrier(mj, 'Orque');
    salles.accorder(pnj.id, joueur.id, { lecture: true, ecriture: false });

    t.des.imposer(20, 6, 6, 6, 6);
    const res = await o.requete(mj, 'POST', `/v1/characters/${pnj.id}/actions/attaque`, {
      parametres: { arme: 'epee-longue' },
      cibleId: p.id,
      appliquer: true,
    });
    expect(res.statusCode).toBe(200);
    const cible = (res.json() as { cible: { version: number; etat: { valeurs: { PV: number } } } })
      .cible;
    expect(cible.version).toBe(p.version + 1);
    expect(cible.etat.valeurs.PV).toBeLessThan(p.etat.valeurs.PV as number);

    // Le joueur possède son attaquant mais n'a que la lecture sur le PNJ ciblé
    const riposte = await o.requete(joueur, 'POST', `/v1/characters/${p.id}/actions/attaque`, {
      parametres: { arme: 'epee-longue' },
      cibleId: pnj.id,
      appliquer: true,
    });
    expect(riposte.statusCode).toBe(403);
  });

  it('404 conservé pour un étranger à la salle, quelle que soit la route', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    for (const [method, url, payload] of [
      ['GET', u, undefined],
      ['PATCH', u, { version: 1, nom: 'Volé' }],
      ['DELETE', u, undefined],
      ['GET', `${u}/achats`, undefined],
      ['POST', `${u}/actions/initiative`, {}],
    ] as const) {
      const res = await o.requete(etranger, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });
});
