/**
 * Routes et services des titres sur un vrai PostgreSQL (rôle identity_svc).
 * Le catalogue est partagé : seuls des titres « test-… » créés ici sont supprimés.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox, titles, userTitles } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { importerTitres } from './import.js';
import { debloquerTitre, debloquerTitresParTemps } from './service.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

describe.skipIf(!TEST_DATABASE_URL)('titres par HTTP', () => {
  let t: Contexte;
  const slugsDeTest: string[] = [];
  const slugDeTest = () => {
    const s = `test-${crypto.randomUUID()}`;
    slugsDeTest.push(s);
    return s;
  };
  // Seuil très haut : les tests d'autres modules ne débloquent jamais ces titres
  const MINUTES = 9_000_000 + Math.floor(Math.random() * 100_000);

  beforeAll(async () => {
    t = await appDeTest();
  });

  afterAll(async () => {
    if (slugsDeTest.length) await t.db.delete(titles).where(inArray(titles.slug, slugsDeTest));
    await t.fermer();
  });

  const evenements = (userId: string, type: string) =>
    t.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`,
          sql`${outbox.envelope}->>'type' = ${type}`,
        ),
      );

  it('expose le catalogue amorcé, trié par ordre', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/titles' });
    expect(res.statusCode).toBe(200);
    const liste = res.json() as { slug: string; defaultUnlocked: boolean; condition: unknown }[];
    const slugs = liste.map((x) => x.slug);
    expect(slugs.indexOf('vagabond')).toBeLessThan(slugs.indexOf('mercenaire'));
    expect(liste.find((x) => x.slug === 'vagabond')).toMatchObject({
      label: 'Vagabond',
      description: null,
      condition: null,
      defaultUnlocked: true,
    });
    expect(liste.find((x) => x.slug === 'heros')!.condition).toEqual({ type: 'time', minutes: 60 });
    expect(slugs).toContain('maudit-des-des');
    expect(slugs).toContain('beni-des-dieux');
  });

  it('liste les titres par défaut du joueur, sans date', async () => {
    const j = await t.inscrire();
    const res = await t.app.inject({ method: 'GET', url: '/v1/users/me/titles', headers: j.auth });
    expect(res.statusCode).toBe(200);
    const liste = res.json() as { slug: string; unlockedAt: string | null }[];
    expect(liste.find((x) => x.slug === 'vagabond')).toEqual({
      slug: 'vagabond',
      label: 'Vagabond',
      unlockedAt: null,
    });
    expect(liste.some((x) => x.slug === 'heros')).toBe(false);
    expect((await t.app.inject({ method: 'GET', url: '/v1/users/me/titles' })).statusCode).toBe(
      401,
    );
  });

  it('accepte un titre par défaut, refuse un titre non débloqué, efface avec null', async () => {
    const j = await t.inscrire();
    const choisir = (slug: string | null) =>
      t.app.inject({
        method: 'PUT',
        url: '/v1/users/me/title',
        headers: j.auth,
        payload: { slug },
      });

    const ok = await choisir('rat-de-taverne');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ title: 'Rat de taverne' });
    const profil = await t.app.inject({ method: 'GET', url: '/v1/users/me', headers: j.auth });
    expect(profil.json()).toMatchObject({ title: 'Rat de taverne' });
    expect(await evenements(j.id, 'identity.title_selected')).toHaveLength(1);

    const refuse = await choisir('heros');
    expect(refuse.statusCode).toBe(403);
    expect((await choisir('titre-inexistant')).statusCode).toBe(403);
    expect((await choisir('Pas Un Slug')).statusCode).toBe(400);
    // Le refus n'a rien changé
    expect(
      (await t.app.inject({ method: 'GET', url: '/v1/users/me', headers: j.auth })).json(),
    ).toMatchObject({ title: 'Rat de taverne' });

    const efface = await choisir(null);
    expect(efface.statusCode).toBe(200);
    expect(efface.json()).toEqual({ title: null });
    expect(
      (await t.app.inject({ method: 'GET', url: '/v1/users/me', headers: j.auth })).json(),
    ).toMatchObject({ title: null });
  });

  it('débloque par temps de jeu, une seule fois, puis permet de choisir le titre', async () => {
    const j = await t.inscrire();
    const slug = slugDeTest();
    await t.db.insert(titles).values({
      slug,
      label: `Test ${slug}`,
      condition: { type: 'time', minutes: MINUTES },
      sortOrder: 10_000,
    });

    // Sous le seuil : tous les rangs du catalogue, pas le titre de test
    const rangs = await debloquerTitresParTemps(t.db, j.id, MINUTES - 1);
    expect(rangs).toEqual(expect.arrayContaining(['mercenaire', 'divinite', 'novice-aventurier']));
    expect(rangs).not.toContain(slug);
    expect(await debloquerTitresParTemps(t.db, j.id, 5)).toEqual([]);
    // Seuil atteint : seul le nouveau titre est renvoyé
    expect(await debloquerTitresParTemps(t.db, j.id, MINUTES)).toEqual([slug]);
    expect(await debloquerTitresParTemps(t.db, j.id, MINUTES + 10)).toEqual([]);

    const evts = await evenements(j.id, 'identity.title_unlocked');
    expect(evts).toHaveLength(rangs.length + 1);
    expect(
      evts.some((e) => (e.envelope as { payload: { slug: string } }).payload.slug === slug),
    ).toBe(true);

    const mesTitres = await t.app.inject({
      method: 'GET',
      url: '/v1/users/me/titles',
      headers: j.auth,
    });
    const mien = (mesTitres.json() as { slug: string; unlockedAt: string | null }[]).find(
      (x) => x.slug === slug,
    );
    expect(mien?.unlockedAt).toEqual(expect.any(String));

    const choix = await t.app.inject({
      method: 'PUT',
      url: '/v1/users/me/title',
      headers: j.auth,
      payload: { slug: 'heros' },
    });
    expect(choix.statusCode).toBe(200);
    expect(choix.json()).toEqual({ title: 'Héros' });
  });

  it('débloque un titre précis (dés, défis) de façon idempotente', async () => {
    const j = await t.inscrire();
    expect(await debloquerTitre(t.db, j.id, 'maudit-des-des')).toBe(true);
    expect(await debloquerTitre(t.db, j.id, 'maudit-des-des')).toBe(false);
    expect(await debloquerTitre(t.db, j.id, 'titre-inexistant')).toBe(false);
    expect(await evenements(j.id, 'identity.title_unlocked')).toHaveLength(1);
  });

  it('importe le catalogue et les titres débloqués Firebase, de façon rejouable', async () => {
    const j = await t.inscrire();
    const slug = slugDeTest();
    const entrees = {
      catalogue: [
        {
          path: `titles/${slug}`,
          id: slug,
          data: { id: slug, label: 'Titre importé', order: 99, defaultUnlocked: false },
        },
        // Déjà amorcé depuis le code : laissé tel quel
        { path: 'titles/vagabond', id: 'vagabond', data: { label: 'Autre libellé', order: 0 } },
      ],
      profils: new Map<string, Record<string, unknown>>([
        [
          'uid-joueur',
          {
            titles: {
              [slug]: 'unlocked',
              beni_des_dieux: 'unlocked',
              heros: 'locked',
              titre_disparu: 'unlocked',
            },
          },
        ],
        ['uid-absent', { titles: { vagabond: 'unlocked' } }],
      ]),
      uuidParUid: new Map([['uid-joueur', j.id]]),
    };

    const rapport = await importerTitres(t.db, { correlationId: 'test-import-titres' }, entrees);
    expect(rapport).toMatchObject({
      catalogueImportes: 1,
      catalogueDejaPresents: 1,
      profils: 2,
      comptesAbsents: 1,
      titresImportes: 2,
      titresInconnus: 1,
      erreurs: 0,
    });
    const [vagabond] = await t.db.select().from(titles).where(eq(titles.slug, 'vagabond'));
    expect(vagabond!.label).toBe('Vagabond');

    const lignes = await t.db
      .select({ slug: userTitles.slug })
      .from(userTitles)
      .where(eq(userTitles.userId, j.id));
    expect(lignes.map((l) => l.slug).sort()).toEqual(['beni-des-dieux', slug].sort());

    const rejeu = await importerTitres(t.db, { correlationId: 'test-import-titres' }, entrees);
    expect(rejeu).toMatchObject({ catalogueImportes: 0, titresImportes: 0, titresDejaPresents: 2 });
    expect(await evenements(j.id, 'identity.titles_imported')).toHaveLength(1);
  });
});
