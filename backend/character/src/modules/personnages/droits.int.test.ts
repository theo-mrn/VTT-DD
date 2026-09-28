/**
 * Droits sur les personnages, décidés par les campagnes de campaign (simulées
 * ici). Un seul personnage actif, pas de possession : engagé, un personnage
 * s'écrit par le membre qui l'incarne et par le MJ, les autres membres (son
 * propriétaire compris) le lisent ; hors campagne et pendant la création, son
 * propriétaire a la main ; suppression réservée au propriétaire ; 404 pour les
 * étrangers.
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

  /** Personnage du propriétaire engagé dans une salle (MJ : mj, joueur : joueur), incarné par personne. */
  async function engage() {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    salles.accorder(p.id, proprietaire.id, { lecture: true, ecriture: false, engage: true });
    salles.accorder(p.id, mj.id, { lecture: true, ecriture: true, engage: true });
    salles.accorder(p.id, joueur.id, { lecture: true, ecriture: false, engage: true });
    return p;
  }

  /** `qui` incarne le personnage : il l'écrit, son propriétaire (s'il n'est pas `qui`) le lit. */
  function incarner(p: { id: string }, qui: Utilisateur, campagne = crypto.randomUUID()) {
    const autres = [proprietaire, joueur].filter((u) => u !== qui);
    salles.accorder(p.id, qui.id, {
      lecture: true,
      ecriture: true,
      engage: true,
      incarne: true,
      campagnes: [campagne],
      incarnateurs: { [campagne]: qui.id },
    });
    for (const u of autres)
      salles.accorder(p.id, u.id, {
        lecture: true,
        ecriture: false,
        engage: true,
        autreIncarnateur: true,
        campagnes: [campagne],
        incarnateurs: { [campagne]: qui.id },
      });
    salles.accorder(p.id, mj.id, {
      lecture: true,
      ecriture: true,
      engage: true,
      autreIncarnateur: true,
      campagnes: [campagne],
      campagnesMj: [campagne],
      incarnateurs: { [campagne]: qui.id },
    });
    return campagne;
  }

  const permissions = async (u: Utilisateur, p: { id: string }) =>
    ((await o.ok(u, 'GET', `/v1/characters/${p.id}`)) as { permissions: unknown }).permissions;

  it('hors campagne, le propriétaire a tous les droits', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const u = `/v1/characters/${p.id}`;
    expect(await permissions(proprietaire, p)).toEqual({ write: true, layout: true });
    const renomme = await o.ok(proprietaire, 'PATCH', u, { version: p.version, nom: 'Thorin II' });
    expect(renomme).toMatchObject({ nom: 'Thorin II', version: p.version + 1 });
    expect((await o.requete(proprietaire, 'DELETE', u)).statusCode).toBe(204);
  });

  it('le joueur qui incarne écrit ; le propriétaire qui ne l’incarne plus lit seulement', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const u = `/v1/characters/${p.id}`;
    incarner(p, joueur);

    expect(await permissions(joueur, p)).toEqual({ write: true, layout: true });
    const soigne = await o.ok(joueur, 'PUT', `${u}/valeurs`, {
      version: p.version,
      valeurs: { PV: Math.max(0, (p.etat.valeurs.PV as number) - 1) },
    });
    expect(soigne.version).toBe(p.version + 1);
    t.des.imposer(12);
    expect((await o.requete(joueur, 'POST', `${u}/actions/initiative`, {})).statusCode).toBe(200);
    // Il écrit en joueur (rôle user), pas en MJ : l'événement n'est pas annoncé à une campagne
    const [evenement] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id} and ${outbox.envelope}->'payload'->>'operation' = 'valeurs'`,
      );
    expect(evenement!.envelope).toMatchObject({
      roomId: null,
      actor: { userId: joueur.id, role: 'user' },
    });

    // Sa propriétaire lit la fiche, sans les droits d'écriture
    expect(await permissions(proprietaire, p)).toEqual({ write: false, layout: false });
    for (const [method, url, payload] of [
      ['PATCH', u, { version: soigne.version, nom: 'Volé' }],
      ['PUT', `${u}/valeurs`, { version: soigne.version, valeurs: { PV: 1 } }],
      ['PUT', `${u}/layout`, { version: soigne.version, layout: null }],
      ['POST', `${u}/repos`, { version: soigne.version }],
      ['POST', `${u}/actions/initiative`, {}],
    ] as const) {
      const res = await o.requete(proprietaire, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    // Suppression : réservée au propriétaire, pas tant qu'un autre l'incarne
    expect((await o.requete(joueur, 'DELETE', u)).statusCode).toBe(403);
    expect((await o.requete(proprietaire, 'DELETE', u)).json()).toMatchObject({
      status: 409,
      code: 'character_played',
    });

    // Elle le reprend : elle écrit à nouveau, le joueur lit seulement
    incarner(p, proprietaire);
    expect(await permissions(proprietaire, p)).toEqual({ write: true, layout: true });
    expect(await permissions(joueur, p)).toEqual({ write: false, layout: false });
    await o.ok(proprietaire, 'PATCH', u, { version: soigne.version, nom: 'Thorin II' });
    expect((await o.requete(joueur, 'POST', `${u}/repos`, { version: 99 })).statusCode).toBe(403);
    expect((await o.requete(proprietaire, 'DELETE', u)).statusCode).toBe(204);
  });

  it('pendant la création, le propriétaire garde la main même engagé', async () => {
    const creation = await o.ok(proprietaire, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: 'Brouillon',
    });
    const u = `/v1/characters/${creation.id}`;
    salles.accorder(creation.id, proprietaire.id, {
      lecture: true,
      ecriture: false,
      engage: true,
    });
    expect(await permissions(proprietaire, creation)).toEqual({ write: true, layout: true });
    const renomme = await o.ok(proprietaire, 'PATCH', u, {
      version: creation.version,
      nom: 'Brouillon II',
    });
    expect(renomme.nom).toBe('Brouillon II');
  });

  it('campaign en panne : le propriétaire d’un personnage engagé lit, ses écritures échouent (503)', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    salles.accorder(p.id, proprietaire.id, { lecture: false, ecriture: false, indisponible: true });
    expect(await permissions(proprietaire, p)).toEqual({ write: false, layout: false });
    const res = await o.requete(proprietaire, 'PATCH', u, { version: p.version, nom: 'X' });
    expect(res.json()).toMatchObject({ status: 503, code: 'campaign_unavailable' });
    expect((await o.requete(proprietaire, 'DELETE', u)).statusCode).toBe(503);
    // Un membre de la table, sans réponse de campaign : 503 plutôt qu'un faux 404
    salles.accorder(p.id, joueur.id, { lecture: false, ecriture: false, indisponible: true });
    expect((await o.requete(joueur, 'GET', u)).statusCode).toBe(503);
  });

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

  it('une écriture du MJ est annoncée dans sa campagne, au MJ et au joueur qui incarne seulement', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const campagne = incarner(p, joueur);
    const u = `/v1/characters/${p.id}`;
    const pv = Math.max(0, (p.etat.valeurs.PV as number) - 1);
    const modifie = await o.ok(mj, 'PUT', `${u}/valeurs`, {
      version: p.version,
      valeurs: { PV: pv },
    });
    await o.ok(joueur, 'PATCH', u, { version: modifie.version, nom: 'Thorin II' });

    const evenements = (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id} and ${outbox.envelope}->>'type' = 'character.updated'`,
        )
        .orderBy(outbox.id)
    ).map((e) => e.envelope as Record<string, unknown>);
    const [parMj, parJoueur] = evenements.slice(-2);
    expect(parMj).toMatchObject({
      roomId: campagne,
      visibility: 'gm_only',
      actor: { userId: mj.id, role: 'gm' },
      payload: { operation: 'valeurs', visibleToUsers: [joueur.id] },
    });
    // Le joueur écrit hors annonce de campagne : l'événement reste le sien
    expect(parJoueur).toMatchObject({ roomId: null, visibility: 'owner' });
    expect(parJoueur!.payload).not.toHaveProperty('visibleToUsers');
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
