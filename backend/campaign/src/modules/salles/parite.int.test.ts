/**
 * Parité avec l'ancienne app : code de salle, options (joueurs max, publique,
 * création de fiches), image, campagnes publiques, adhésion par code de salle,
 * salle complète, bannissements.
 */
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox, rooms } from '../../db/schema.js';
import {
  appDeTest,
  outils,
  TEST_DATABASE_URL,
  type Contexte,
  type Utilisateur,
} from '../../test/app-de-test.js';

interface Salle {
  id: string;
  code: string;
  imageUrl: string | null;
  maxJoueurs: number;
  publique: boolean;
  creationPersonnages: boolean;
  joueurs: number;
  complete: boolean;
  role: string | null;
  proprietaire: { id: string; nom: string | null };
  membres: { userId: string; role: string }[] | number;
}

interface Page {
  salles: Salle[];
  page: number;
  parPage: number;
  total: number;
}

describe.skipIf(!TEST_DATABASE_URL)('salles : parité avec l’ancienne app', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let mj: Utilisateur;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    mj = await t.utilisateur('Maître');
    alice = await t.utilisateur('Alice');
    bob = await t.utilisateur('Bob');
  });

  afterEach(async () => {
    await t.fermer();
  });

  const creer = (u: Utilisateur, corps: object = {}) =>
    o.ok<Salle>(u, 'POST', '/v1/rooms', { nom: 'La Table', systemeId: 'dnd-classic', ...corps });
  const rejoindre = (u: Utilisateur, code: string) =>
    o.requete(u, 'POST', '/v1/rooms/rejoindre', { code });
  const types = async (roomId: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${roomId}`)
        .orderBy(outbox.id)
    ).map((e) => e.type);

  it('création : code unique, options par défaut ou choisies, modifiables par le MJ', async () => {
    const defaut = await creer(mj);
    expect(defaut).toMatchObject({
      code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{6}$/),
      imageUrl: null,
      maxJoueurs: 4,
      publique: false,
      creationPersonnages: true,
      joueurs: 0,
      complete: false,
      proprietaire: { id: mj.id, nom: 'Maître' },
    });
    const choisie = await creer(mj, { maxJoueurs: 6, publique: true, creationPersonnages: false });
    expect(choisie).toMatchObject({ maxJoueurs: 6, publique: true, creationPersonnages: false });
    expect(choisie.code).not.toBe(defaut.code);

    for (const corps of [{ maxJoueurs: 0 }, { maxJoueurs: 51 }, { publique: 'oui' }]) {
      const res = await o.requete(mj, 'POST', '/v1/rooms', {
        nom: 'X',
        systemeId: 'dnd-classic',
        ...corps,
      });
      expect(res.statusCode, JSON.stringify(corps)).toBe(400);
    }

    const modifiee = await o.ok<Salle>(mj, 'PATCH', `/v1/rooms/${defaut.id}`, {
      maxJoueurs: 2,
      publique: true,
      creationPersonnages: false,
    });
    expect(modifiee).toMatchObject({ maxJoueurs: 2, publique: true, creationPersonnages: false });
    expect(modifiee.code).toBe(defaut.code);
    expect(await types(defaut.id)).toEqual(['room.created', 'room.updated']);
  });

  it('mes salles : champs de la liste et filtre par rôle', async () => {
    const mienne = await creer(mj, { maxJoueurs: 1 });
    const autre = await o.salle(alice, 'dnd-classic', [mj]);

    const toutes = await o.ok<Salle[]>(mj, 'GET', '/v1/rooms');
    expect(toutes.map((s) => s.id).sort()).toEqual([mienne.id, autre].sort());
    const [mjSeul] = await o.ok<Salle[]>(mj, 'GET', '/v1/rooms?role=mj');
    expect(mjSeul).toMatchObject({ id: mienne.id, role: 'mj', joueurs: 0, complete: false });
    const joueur = await o.ok<Salle[]>(mj, 'GET', '/v1/rooms?role=joueur');
    expect(joueur).toMatchObject([
      { id: autre, role: 'joueur', joueurs: 1, membres: 2, proprietaire: { id: alice.id } },
    ]);
    expect((await o.requete(mj, 'GET', '/v1/rooms?role=roi')).statusCode).toBe(400);
  });

  it('campagnes publiques : privées absentes, recherche, pages, salles complètes', async () => {
    // Nom unique au test : la base est partagée avec les autres tests
    const marque = `Quête-${crypto.randomUUID().slice(0, 8)}`;
    const publique = await creer(mj, { nom: `${marque} du dragon`, publique: true, maxJoueurs: 1 });
    await creer(mj, { nom: `${marque} secrète` });
    const decrite = await creer(bob, {
      nom: 'Autre table',
      description: `Suite de la ${marque}`,
      publique: true,
    });

    const page = await o.ok<Page>(alice, 'GET', `/v1/rooms/publiques?search=${marque}`);
    expect(page).toMatchObject({ page: 1, parPage: 20, total: 2 });
    expect(page.salles.map((s) => s.id).sort()).toEqual([publique.id, decrite.id].sort());
    expect(page.salles.find((s) => s.id === publique.id)).toMatchObject({
      role: null,
      code: publique.code,
      joueurs: 0,
      complete: false,
      proprietaire: { id: mj.id, nom: 'Maître' },
    });

    // Par code, en minuscules ; un joker de LIKE ne remonte pas tout
    const parCode = await o.ok<Page>(
      alice,
      'GET',
      `/v1/rooms/publiques?search=${publique.code.toLowerCase()}`,
    );
    expect(parCode.salles.map((s) => s.id)).toEqual([publique.id]);
    expect((await o.ok<Page>(alice, 'GET', `/v1/rooms/publiques?search=${marque}%25_`)).total).toBe(
      0,
    );

    // Complète une fois le joueur entré ; l'appelant voit son rôle
    await o.ok(alice, 'POST', '/v1/rooms/rejoindre', { code: publique.code });
    const apres = await o.ok<Page>(alice, 'GET', `/v1/rooms/publiques?search=${marque}`);
    expect(apres.salles.find((s) => s.id === publique.id)).toMatchObject({
      role: 'joueur',
      joueurs: 1,
      complete: true,
    });

    // Pagination : page vide au-delà du total, bornes validées
    const loin = await o.ok<Page>(alice, 'GET', `/v1/rooms/publiques?search=${marque}&page=2`);
    expect(loin).toMatchObject({ page: 2, total: 2, salles: [] });
    expect((await o.requete(alice, 'GET', '/v1/rooms/publiques?page=0')).statusCode).toBe(400);
    const anonyme = await t.app.inject({ method: 'GET', url: '/v1/rooms/publiques' });
    expect(anonyme.statusCode).toBe(401);
  });

  it('image : URL présignée pour le MJ, seule une image de la salle est acceptée', async () => {
    const s = await creer(mj);
    await o.ok(mj, 'POST', `/v1/rooms/${s.id}/invitations`, {});
    const id = await o.salle(mj, 'dnd-classic', [alice]);

    const envoi = await o.ok<{ uploadUrl: string; publicUrl: string; expiresIn: number }>(
      mj,
      'POST',
      `/v1/rooms/${id}/image`,
      { contentType: 'image/webp', size: 1234 },
    );
    expect(envoi.publicUrl).toMatch(
      new RegExp(`^https://cdn\\.test\\.local/vtt/rooms/${id}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(envoi.uploadUrl).toContain(envoi.publicUrl.slice('https://cdn.test.local/vtt/'.length));
    expect(envoi.expiresIn).toBe(300);
    expect(t.envois.at(-1)).toMatchObject({ contentType: 'image/webp', taille: 1234 });

    // Joueur : 403 ; non-membre : 404 ; fichier trop gros ou type refusé : 400
    expect(
      (
        await o.requete(alice, 'POST', `/v1/rooms/${id}/image`, {
          contentType: 'image/png',
          size: 10,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await o.requete(bob, 'POST', `/v1/rooms/${id}/image`, {
          contentType: 'image/png',
          size: 10,
        })
      ).statusCode,
    ).toBe(404);
    for (const corps of [
      { contentType: 'image/png', size: 6 * 1024 * 1024 },
      { contentType: 'image/svg+xml', size: 10 },
    ]) {
      expect((await o.requete(mj, 'POST', `/v1/rooms/${id}/image`, corps)).statusCode).toBe(400);
    }

    const avecImage = await o.ok<Salle>(mj, 'PATCH', `/v1/rooms/${id}`, {
      imageUrl: envoi.publicUrl,
    });
    expect(avecImage.imageUrl).toBe(envoi.publicUrl);
    // L'image d'une autre salle, ou une URL arbitraire : refusées
    for (const imageUrl of [
      `https://cdn.test.local/vtt/rooms/${s.id}/a.png`,
      'https://pistage.example/pixel.gif',
    ]) {
      expect((await o.requete(mj, 'PATCH', `/v1/rooms/${id}`, { imageUrl })).json()).toMatchObject({
        status: 400,
        code: 'image_invalide',
      });
    }
    // Reprendre la même URL ou l'effacer reste possible
    expect(
      (await o.requete(mj, 'PATCH', `/v1/rooms/${id}`, { imageUrl: envoi.publicUrl })).statusCode,
    ).toBe(200);
    expect((await o.ok<Salle>(mj, 'PATCH', `/v1/rooms/${id}`, { imageUrl: null })).imageUrl).toBe(
      null,
    );
  });

  it('image : 503 si le stockage n’est pas configuré', async () => {
    const sans = await appDeTest({ S3_PUBLIC_URL: '' });
    try {
      const os = outils(sans);
      const u = await sans.utilisateur();
      const id = await os.salle(u);
      const res = await os.requete(u, 'POST', `/v1/rooms/${id}/image`, {
        contentType: 'image/png',
        size: 10,
      });
      expect(res.json()).toMatchObject({ status: 503, code: 'stockage_indisponible' });
    } finally {
      await sans.fermer();
    }
  });

  it('rejoindre par code de salle : privée ou publique, saisie tolérante, introuvable', async () => {
    const privee = await creer(mj);
    const saisie = `${privee.code.slice(0, 3).toLowerCase()}-${privee.code.slice(3)}`;
    const res = await rejoindre(alice, saisie);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ id: privee.id, role: 'joueur', code: privee.code });
    // Déjà membre : la salle, sans nouvel événement
    expect((await rejoindre(alice, privee.code)).statusCode).toBe(200);
    expect((await rejoindre(mj, privee.code)).json()).toMatchObject({ role: 'mj' });
    expect((await types(privee.id)).filter((x) => x === 'room.member_joined')).toHaveLength(1);

    // Une salle privée reste invisible hors de ses membres
    expect((await o.requete(bob, 'GET', `/v1/rooms/${privee.id}`)).statusCode).toBe(404);
    const [ligne] = await t.db!.select().from(rooms).where(eq(rooms.id, privee.id));
    expect(ligne!.publique).toBe(false);

    for (const code of ['ZZZZZZ', 'ABC', 'n’importe quoi', `inv_${'A'.repeat(27)}`]) {
      expect((await rejoindre(bob, code)).json(), code).toMatchObject({
        status: 404,
        code: 'salle_introuvable',
      });
    }
  });

  it('salle complète : 409 au-delà des joueurs max, par code comme par invitation', async () => {
    const s = await creer(mj, { maxJoueurs: 1 });
    const { code } = await o.ok<{ code: string }>(mj, 'POST', `/v1/rooms/${s.id}/invitations`, {});
    expect((await rejoindre(alice, s.code)).statusCode).toBe(200);
    for (const c of [s.code, code]) {
      expect((await rejoindre(bob, c)).json()).toMatchObject({
        status: 409,
        code: 'salle_complete',
      });
    }
    // L'invitation n'a pas été consommée par le refus
    const detail = await o.ok<Salle>(mj, 'GET', `/v1/rooms/${s.id}`);
    expect(detail).toMatchObject({ joueurs: 1, complete: true });

    // Le MJ agrandit la salle : Bob entre
    await o.ok(mj, 'PATCH', `/v1/rooms/${s.id}`, { maxJoueurs: 2 });
    expect((await rejoindre(bob, code)).statusCode).toBe(200);
  });

  it('deux adhésions simultanées ne dépassent pas les joueurs max', async () => {
    const s = await creer(mj, { maxJoueurs: 1 });
    const statuts = (await Promise.all([rejoindre(alice, s.code), rejoindre(bob, s.code)]))
      .map((r) => r.statusCode)
      .sort();
    expect(statuts).toEqual([200, 409]);
  });

  it('bannir : exclu, ne revient ni par code ni par invitation, jusqu’à la levée', async () => {
    const s = await creer(mj);
    const { code } = await o.ok<{ code: string }>(mj, 'POST', `/v1/rooms/${s.id}/invitations`, {});
    await o.ok(alice, 'POST', '/v1/rooms/rejoindre', { code: s.code });
    await o.ok(bob, 'POST', '/v1/rooms/rejoindre', { code: s.code });

    // Un joueur ne bannit personne, pas même lui-même ; le MJ ne se bannit pas
    expect(
      (await o.requete(bob, 'DELETE', `/v1/rooms/${s.id}/membres/${alice.id}?bannir=true`))
        .statusCode,
    ).toBe(403);
    expect(
      (await o.requete(bob, 'DELETE', `/v1/rooms/${s.id}/membres/${bob.id}?bannir=true`))
        .statusCode,
    ).toBe(403);
    expect(
      (await o.requete(mj, 'DELETE', `/v1/rooms/${s.id}/membres/${mj.id}?bannir=true`)).statusCode,
    ).toBe(400);
    expect((await o.requete(bob, 'GET', `/v1/rooms/${s.id}/bannis`)).statusCode).toBe(403);

    const res = await o.requete(mj, 'DELETE', `/v1/rooms/${s.id}/membres/${alice.id}?bannir=true`);
    expect(res.statusCode).toBe(204);
    for (const c of [s.code, code]) {
      expect((await rejoindre(alice, c)).json()).toMatchObject({ status: 403, code: 'banni' });
    }
    const bannis = await o.ok<{ userId: string; nom: string; banniPar: string }[]>(
      mj,
      'GET',
      `/v1/rooms/${s.id}/bannis`,
    );
    expect(bannis).toEqual([
      {
        userId: alice.id,
        nom: 'Alice',
        avatarUrl: null,
        banniPar: mj.id,
        banniLe: expect.any(String),
      },
    ]);

    // Exclusion simple : Bob peut revenir
    await o.ok(mj, 'DELETE', `/v1/rooms/${s.id}/membres/${bob.id}`);
    expect((await rejoindre(bob, s.code)).statusCode).toBe(200);

    // Levée du bannissement (MJ) : Alice revient
    expect(
      (await o.requete(bob, 'DELETE', `/v1/rooms/${s.id}/bannis/${alice.id}`)).statusCode,
    ).toBe(403);
    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${s.id}/bannis/${alice.id}`)).statusCode).toBe(
      204,
    );
    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${s.id}/bannis/${alice.id}`)).statusCode).toBe(
      404,
    );
    expect((await rejoindre(alice, s.code)).statusCode).toBe(200);

    const evenements = await t
      .db!.select({ type: sql<string>`${outbox.envelope}->>'type'`, envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'roomId' = ${s.id}`)
      .orderBy(outbox.id);
    const depart = evenements.find((e) => e.type === 'room.member_left');
    expect(depart!.envelope).toMatchObject({
      payload: { userId: alice.id, exclu: true, banni: true },
    });
    expect(evenements.find((e) => e.type === 'room.member_unbanned')!.envelope).toMatchObject({
      visibility: 'gm_only',
      payload: { userId: alice.id },
    });
  });
});
